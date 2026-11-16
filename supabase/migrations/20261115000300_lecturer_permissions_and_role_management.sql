-- ============================================================================
-- Migration 0013: Lecturer permissions and admin-controlled role management
--
--   admin    : everything, including users, classes, student accounts, audit logs.
--   lecturer : exams, questions, assignments, marking, results, monitoring, reports.
--   student  : unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'lecturer')
      AND p.account_status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated, service_role;

-- 1) Exam-engine RPCs: open to staff, except the ones that manage people and classes.
DO $$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname NOT IN (
        'is_active_admin',
        'is_active_staff',
        'protect_profile_sensitive_fields',
        'admin_configure_student_profile',
        'admin_create_class',
        'admin_set_class_membership'
      )
      AND p.prokind = 'f'
      AND CASE WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid) ELSE '' END ~ 'is_active_admin\(\)'
  LOOP
    v_def := regexp_replace(
      pg_get_functiondef(r.oid),
      '(public\.)?is_active_admin\(\)',
      'public.is_active_staff()',
      'g'
    );
    EXECUTE v_def;
  END LOOP;
END
$$;

-- 2) Row Level Security: staff may manage exam content and read results.
DO $$
DECLARE
  r record;
  v_sql text;
BEGIN
  FOR r IN
    SELECT policyname, tablename, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'exams', 'exam_questions', 'question_options', 'exam_assignments',
        'exam_attempts', 'student_answers', 'results', 'result_items'
      )
      AND (COALESCE(qual, '') ~ 'is_active_admin' OR COALESCE(with_check, '') ~ 'is_active_admin')
  LOOP
    v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual IS NOT NULL THEN
      v_sql := v_sql || ' USING (' || regexp_replace(r.qual, '(public\.)?is_active_admin\(\)', 'public.is_active_staff()', 'g') || ')';
    END IF;
    IF r.with_check IS NOT NULL THEN
      v_sql := v_sql || ' WITH CHECK (' || regexp_replace(r.with_check, '(public\.)?is_active_admin\(\)', 'public.is_active_staff()', 'g') || ')';
    END IF;
    EXECUTE v_sql;
  END LOOP;
END
$$;

-- Staff can read (but not change) profiles, classes and memberships to assign and mark exams.
DROP POLICY IF EXISTS profiles_select_staff ON public.profiles;
CREATE POLICY profiles_select_staff
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_active_staff() AND institution_id = public.current_institution_id());

DROP POLICY IF EXISTS classes_select_staff ON public.classes;
CREATE POLICY classes_select_staff
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (public.is_active_staff() AND institution_id = public.current_institution_id());

DROP POLICY IF EXISTS class_memberships_select_staff ON public.class_memberships;
CREATE POLICY class_memberships_select_staff
  ON public.class_memberships
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_staff()
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = class_memberships.class_id
        AND c.institution_id = public.current_institution_id()
    )
  );

-- 3) Audit log records the real actor role (lecturer actions are no longer labelled admin).
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_role_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_role_check
  CHECK (actor_role IN ('admin', 'lecturer', 'student', 'system'));

CREATE OR REPLACE FUNCTION public.internal_write_audit_log(
  p_institution_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_log_id uuid;
  v_role text := p_actor_role;
BEGIN
  IF p_actor_role = 'admin' AND p_actor_id IS NOT NULL THEN
    SELECT CASE WHEN p.role::text = 'lecturer' THEN 'lecturer' ELSE p_actor_role END
    INTO v_role
    FROM public.profiles p
    WHERE p.id = p_actor_id;
    v_role := COALESCE(v_role, p_actor_role);
  END IF;

  INSERT INTO public.audit_logs (
    institution_id, actor_id, actor_role, event_type, entity_type, entity_id, metadata, created_at
  )
  VALUES (
    COALESCE(p_institution_id, '00000000-0000-0000-0000-000000000001'),
    p_actor_id, v_role, p_event_type, p_entity_type, p_entity_id,
    COALESCE(p_metadata, '{}'::jsonb), public.utc_now()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- 4) Admin-only role management.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_ONLY: Administrator privileges required.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(u) ORDER BY u.role, u.full_name)
    FROM (
      SELECT p.id, p.full_name, p.email, p.student_identifier, p.role::text AS role,
             p.account_status::text AS account_status, p.created_at
      FROM public.profiles p
      WHERE p.institution_id = public.current_institution_id()
    ) u
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_ONLY: Administrator privileges required.' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('student', 'lecturer') THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Role must be student or lecturer.' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: You cannot change your own role.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.profiles
  WHERE id = p_user_id AND institution_id = public.current_institution_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: User not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.role::text = 'admin' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Administrator roles cannot be changed here.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('quizpocket.trusted_context', 'on', true);
  UPDATE public.profiles SET role = p_role::public.user_role WHERE id = p_user_id;

  IF p_role = 'lecturer' THEN
    DELETE FROM public.class_memberships WHERE student_id = p_user_id;
  END IF;

  PERFORM public.internal_write_audit_log(
    v_target.institution_id, v_actor, 'admin', 'user.role_changed', 'profile', p_user_id,
    jsonb_build_object('from', v_target.role::text, 'to', p_role)
  );

  RETURN (
    SELECT to_jsonb(u) FROM (
      SELECT p.id, p.full_name, p.email, p.student_identifier, p.role::text AS role,
             p.account_status::text AS account_status, p.created_at
      FROM public.profiles p WHERE p.id = p_user_id
    ) u
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated, service_role;
