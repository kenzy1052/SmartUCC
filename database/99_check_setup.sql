-- ============================================================================
-- File 99: Check the installation. Run after file 14. Every row must say OK.
-- ============================================================================
SELECT check_name, CASE WHEN passed THEN 'OK' ELSE 'MISSING' END AS result
FROM (
  VALUES
    ('14 tables created',
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') = 14),
    ('row level security on every table',
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity) = 0),
    ('institution row exists',
      (SELECT count(*) FROM public.institutions) = 1),
    ('lecturer role exists',
      EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'user_role' AND e.enumlabel = 'lecturer')),
    ('UCC email rule installed',
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_ucc_email')),
    ('profile created on sign-up',
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created')),
    ('sign-in lookup function',
      to_regprocedure('public.service_resolve_login_email(text)') IS NOT NULL),
    ('first-admin function',
      to_regprocedure('public.bootstrap_initial_admin(uuid,text)') IS NOT NULL),
    ('start or resume attempt',
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'student_start_or_resume_attempt')),
    ('marking queue',
      to_regprocedure('public.admin_list_marking_queue(uuid)') IS NOT NULL),
    ('role management',
      to_regprocedure('public.admin_set_user_role(uuid,text)') IS NOT NULL),
    ('no demo exams present',
      (SELECT count(*) FROM public.exams) = 0)
) AS c(check_name, passed);
