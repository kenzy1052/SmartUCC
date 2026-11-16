-- ============================================================================
-- 00 RESET (OPTIONAL, DESTRUCTIVE) -- run this ONLY if an earlier attempt left the
-- database half-installed and files 01-14 fail with "already exists" errors.
--
-- WARNING: this deletes EVERYTHING in the public schema and ALL user accounts.
-- Use it ONLY on the new, empty CDE Exams Supabase project. NEVER on a project
-- that holds real data.
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_enforce_ucc_email ON auth.users;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job
    WHERE jobname IN ('cde-finalize-expired-attempts', 'quizpocket-finalize-expired-attempts');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

DELETE FROM auth.users;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
