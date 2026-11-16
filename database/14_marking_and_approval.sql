-- RUN THIS FILE ON ITS OWN in the Supabase SQL Editor (File 14 of 14), after the files before it.
-- ============================================================================
-- File 14: Lecturer marking queue and result approval
--
--  * A written answer is a short_answer question with no rubric: it scores 0 until
--    a lecturer marks it (existing behaviour of internal_finalize_attempt).
--  * Students do not see a result while any of their written answers is unmarked,
--    or, if the exam requires approval, until a lecturer approves it.
-- ============================================================================

ALTER TABLE public.result_items
  ADD COLUMN IF NOT EXISTS graded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS graded_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer_comment text NULL;

ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS require_marking_approval boolean NOT NULL DEFAULT false;

-- True when a question has no usable rubric, so only a lecturer can mark it.
CREATE OR REPLACE FUNCTION public.is_manual_written_question(p_type public.question_type, p_rubric jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_type = 'short_answer' AND (
    p_rubric IS NULL
    OR jsonb_typeof(p_rubric) NOT IN ('array', 'object')
    OR (jsonb_typeof(p_rubric) = 'array' AND jsonb_array_length(p_rubric) = 0)
    OR (jsonb_typeof(p_rubric) = 'object'
        AND jsonb_array_length(COALESCE(p_rubric -> 'groups', '[]'::jsonb)) = 0)
  );
$$;

-- Student-facing visibility: release policy AND nothing awaiting marking or approval.
CREATE OR REPLACE FUNCTION public.is_result_released_for_exam(p_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams e
    WHERE e.id = p_exam_id
      AND (
        e.results_released_manually = true
        OR e.result_release_policy = 'immediate'
        OR (
          e.result_release_policy = 'after_window'
          AND e.scheduled_end_at IS NOT NULL
          AND public.utc_now() >= e.scheduled_end_at
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.results r
    JOIN public.exams e2 ON e2.id = r.exam_id
    WHERE r.exam_id = p_exam_id
      AND r.student_id = auth.uid()
      AND (
        (e2.require_marking_approval AND r.approved_at IS NULL)
        OR EXISTS (
          SELECT 1
          FROM public.result_items ri
          JOIN public.exam_questions q ON q.id = ri.question_id
          WHERE ri.result_id = r.id
            AND ri.graded_at IS NULL
            AND public.is_manual_written_question(q.question_type, q.rubric_keywords)
            AND btrim(COALESCE(ri.submitted_text, '')) <> ''
        )
      )
  );
$$;

-- Marking queue: every written answer still waiting for a lecturer.
CREATE OR REPLACE FUNCTION public.admin_list_marking_queue(p_exam_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY: Lecturer or administrator privileges required.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.submitted_at, t.display_order)
    FROM (
      SELECT
        r.id AS result_id,
        q.id AS question_id,
        e.id AS exam_id,
        e.title AS exam_title,
        p.id AS student_id,
        p.full_name AS student_name,
        p.student_identifier,
        q.question_text,
        q.display_order,
        ri.max_marks,
        ri.submitted_text,
        ri.expected_answer AS marking_guide,
        a.submitted_at
      FROM public.result_items ri
      JOIN public.results r ON r.id = ri.result_id
      JOIN public.exams e ON e.id = ri.exam_id
      JOIN public.exam_questions q ON q.id = ri.question_id
      JOIN public.profiles p ON p.id = r.student_id
      JOIN public.exam_attempts a ON a.id = r.attempt_id
      WHERE e.institution_id = public.current_institution_id()
        AND (p_exam_id IS NULL OR e.id = p_exam_id)
        AND ri.graded_at IS NULL
        AND public.is_manual_written_question(q.question_type, q.rubric_keywords)
        AND btrim(COALESCE(ri.submitted_text, '')) <> ''
    ) t
  ), '[]'::jsonb);
END;
$$;

-- Per-exam marking and approval progress.
CREATE OR REPLACE FUNCTION public.admin_marking_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY: Lecturer or administrator privileges required.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.title)
    FROM (
      SELECT
        e.id AS exam_id,
        e.title,
        e.require_marking_approval,
        (SELECT COUNT(*) FROM public.results r WHERE r.exam_id = e.id) AS results_total,
        (SELECT COUNT(*) FROM public.results r WHERE r.exam_id = e.id AND r.approved_at IS NOT NULL) AS results_approved,
        (
          SELECT COUNT(*)
          FROM public.result_items ri
          JOIN public.exam_questions q ON q.id = ri.question_id
          WHERE ri.exam_id = e.id
            AND ri.graded_at IS NULL
            AND public.is_manual_written_question(q.question_type, q.rubric_keywords)
            AND btrim(COALESCE(ri.submitted_text, '')) <> ''
        ) AS pending_items
      FROM public.exams e
      WHERE e.institution_id = public.current_institution_id()
        AND e.status <> 'archived'
    ) t
    WHERE t.results_total > 0
  ), '[]'::jsonb);
END;
$$;

-- Mark one written answer (0..max marks) with an optional comment for the student.
CREATE OR REPLACE FUNCTION public.admin_mark_written_answer(
  p_result_id uuid,
  p_question_id uuid,
  p_marks_awarded numeric,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
  v_res public.results%ROWTYPE;
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY: Lecturer or administrator privileges required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_res FROM public.admin_grade_result_item(
    p_result_id, p_question_id, p_marks_awarded, COALESCE(v_comment, 'Marked by lecturer')
  );

  UPDATE public.result_items
  SET graded_at = public.utc_now(),
      graded_by = auth.uid(),
      reviewer_comment = v_comment
  WHERE result_id = p_result_id AND question_id = p_question_id;

  RETURN jsonb_build_object(
    'result_id', v_res.id,
    'marks_obtained', v_res.marks_obtained,
    'percentage', v_res.percentage,
    'passed', v_res.passed
  );
END;
$$;

-- Approve results so students can see them. Refuses while written answers are unmarked.
CREATE OR REPLACE FUNCTION public.admin_approve_exam_results(p_exam_id uuid, p_result_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
  v_approved integer := 0;
  v_held integer := 0;
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY: Lecturer or administrator privileges required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_exam FROM public.exams
  WHERE id = p_exam_id AND institution_id = public.current_institution_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Exam not found.' USING ERRCODE = 'P0002';
  END IF;

  WITH pending AS (
    SELECT DISTINCT ri.result_id
    FROM public.result_items ri
    JOIN public.exam_questions q ON q.id = ri.question_id
    WHERE ri.exam_id = p_exam_id
      AND ri.graded_at IS NULL
      AND public.is_manual_written_question(q.question_type, q.rubric_keywords)
      AND btrim(COALESCE(ri.submitted_text, '')) <> ''
  ), upd AS (
    UPDATE public.results r
    SET approved_at = public.utc_now(), approved_by = auth.uid()
    WHERE r.exam_id = p_exam_id
      AND r.approved_at IS NULL
      AND (p_result_id IS NULL OR r.id = p_result_id)
      AND r.id NOT IN (SELECT result_id FROM pending)
    RETURNING r.id
  )
  SELECT COUNT(*) INTO v_approved FROM upd;

  SELECT COUNT(DISTINCT ri.result_id) INTO v_held
  FROM public.result_items ri
  JOIN public.exam_questions q ON q.id = ri.question_id
  WHERE ri.exam_id = p_exam_id
    AND ri.graded_at IS NULL
    AND public.is_manual_written_question(q.question_type, q.rubric_keywords)
    AND btrim(COALESCE(ri.submitted_text, '')) <> ''
    AND (p_result_id IS NULL OR ri.result_id = p_result_id);

  PERFORM public.internal_write_audit_log(
    v_exam.institution_id, auth.uid(), 'admin', 'results.approved', 'exam', p_exam_id,
    jsonb_build_object('approved', v_approved, 'held_for_marking', v_held, 'single_result', p_result_id)
  );

  RETURN jsonb_build_object('approved', v_approved, 'held_for_marking', v_held);
END;
$$;

-- Per-exam switch: require lecturer approval before students see marks.
CREATE OR REPLACE FUNCTION public.admin_set_exam_marking_approval(p_exam_id uuid, p_required boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inst uuid;
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'FORBIDDEN_STAFF_ONLY: Lecturer or administrator privileges required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.exams
  SET require_marking_approval = COALESCE(p_required, false)
  WHERE id = p_exam_id AND institution_id = public.current_institution_id()
  RETURNING institution_id INTO v_inst;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Exam not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.internal_write_audit_log(
    v_inst, auth.uid(), 'admin', 'exam.marking_approval_changed', 'exam', p_exam_id,
    jsonb_build_object('required', COALESCE(p_required, false))
  );

  RETURN jsonb_build_object('exam_id', p_exam_id, 'require_marking_approval', COALESCE(p_required, false));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_marking_queue(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_marking_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_written_answer(uuid, uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_approve_exam_results(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_exam_marking_approval(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_marking_queue(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_marking_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_written_answer(uuid, uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_approve_exam_results(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_exam_marking_approval(uuid, boolean) TO authenticated, service_role;

-- Any manual change to an item's marks (including the older grading route) counts as marked.
CREATE OR REPLACE FUNCTION public.stamp_manual_grading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.marks_awarded IS DISTINCT FROM OLD.marks_awarded AND public.is_active_staff() THEN
    NEW.graded_at := public.utc_now();
    NEW.graded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_manual_grading ON public.result_items;
CREATE TRIGGER trg_stamp_manual_grading
  BEFORE UPDATE OF marks_awarded ON public.result_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_manual_grading();

-- Students see the lecturer's comment in their answer review.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND CASE WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid) ELSE '' END ~ 'REVIEW_NOT_PERMITTED'
      AND CASE WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid) ELSE '' END LIKE '%''marks_awarded'', ri.marks_awarded,%'
  LOOP
    EXECUTE replace(
      pg_get_functiondef(r.oid),
      '''marks_awarded'', ri.marks_awarded,',
      '''marks_awarded'', ri.marks_awarded, ''reviewer_comment'', ri.reviewer_comment,'
    );
  END LOOP;
END
$$;
