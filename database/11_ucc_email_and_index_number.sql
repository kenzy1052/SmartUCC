-- RUN THIS FILE ON ITS OWN in the Supabase SQL Editor (File 11 of 14), after the files before it.
-- ============================================================================
-- File 11: UCC email restriction + index-number sign-in
-- Project: CDE Exams — UCC College of Distance Education
--
--  * Only addresses ending in ucc.edu.gh (including subdomains such as
--    stu.ucc.edu.gh) may exist in auth.users. Enforced by a trigger, so it
--    holds no matter how the account is created (API, dashboard, script).
--  * Registration stores the index number in profiles.student_identifier.
--  * Sign-in lookup: an identifier containing "@" is matched as an email;
--    anything else is matched as an index number. Names and usernames are no
--    longer valid sign-in identifiers.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_ucc_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(btrim(COALESCE(p_email, ''))) ~ '^[a-z0-9._%+-]+@([a-z0-9-]+\.)*ucc\.edu\.gh$';
$$;

CREATE OR REPLACE FUNCTION public.enforce_ucc_email_on_auth_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_ucc_email(NEW.email) THEN
    RAISE EXCEPTION 'UCC_EMAIL_REQUIRED: Only University of Cape Coast email addresses (ending in ucc.edu.gh) can be registered.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ucc_email ON auth.users;
CREATE TRIGGER trg_enforce_ucc_email
  BEFORE INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ucc_email_on_auth_users();

-- Profile creation on sign-up: capture index number and full name from metadata.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_index text;
  v_full_name text;
  v_inst uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM set_config('quizpocket.trusted_context', 'on', true);

  v_index := NULLIF(btrim(NEW.raw_user_meta_data ->> 'index_number'), '');
  v_full_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (
    id, institution_id, email, username, full_name,
    student_identifier, role, account_status
  )
  VALUES (
    NEW.id,
    v_inst,
    lower(btrim(NEW.email)),
    left(COALESCE(v_index, lower(btrim(NEW.email))), 80),
    left(v_full_name, 200),
    left(v_index, 64),
    'student',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Cohorts flagged for automatic enrolment receive new student accounts.
  INSERT INTO public.class_memberships (class_id, student_id, membership_status)
  SELECT c.id, NEW.id, 'active'
  FROM public.classes c
  WHERE c.institution_id = v_inst
    AND c.auto_enroll_new_students = true
  ON CONFLICT (class_id, student_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Sign-in lookup (service role only; used by the trusted server, never the browser).
CREATE OR REPLACE FUNCTION public.service_resolve_login_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ident text := lower(btrim(COALESCE(p_identifier, '')));
  v_email text;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN_SERVICE_ROLE_ONLY: Login resolution requires service_role privileges.'
      USING ERRCODE = '42501';
  END IF;

  IF v_ident = '' THEN
    RETURN NULL;
  END IF;

  IF position('@' in v_ident) > 0 THEN
    SELECT p.email INTO v_email
    FROM public.profiles p
    WHERE lower(btrim(p.email)) = v_ident
    LIMIT 1;
  ELSE
    SELECT p.email INTO v_email
    FROM public.profiles p
    WHERE lower(btrim(COALESCE(p.student_identifier, ''))) = v_ident
    LIMIT 1;
  END IF;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.service_resolve_login_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_resolve_login_email(text) TO service_role;

-- Duplicate checks for friendly registration errors (service role only).
CREATE OR REPLACE FUNCTION public.service_registration_conflicts(p_email text, p_index_number text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN_SERVICE_ROLE_ONLY: Registration checks require service_role privileges.'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'email_taken', EXISTS (
      SELECT 1 FROM public.profiles p WHERE lower(btrim(p.email)) = lower(btrim(p_email))
    ),
    'index_number_taken', EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE lower(btrim(COALESCE(p.student_identifier, ''))) = lower(btrim(p_index_number))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_registration_conflicts(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_registration_conflicts(text, text) TO service_role;
