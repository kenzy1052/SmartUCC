# QuizPocket Security Architecture (`SECURITY.md`)

Security in QuizPocket is enforced at the **PostgreSQL database and trusted server layers**, never delegated to browser JavaScript, CSS visibility, or local storage.

---

## 1. Authentication & Controlled Account Provisioning

- **Password Storage**: Handled exclusively by Supabase Auth (`auth.users`). Application tables never store passwords or tokens.
- **Registration**: Students and staff register with a UCC email (ending in `ucc.edu.gh`) and an index number. Email confirmation is required (`enable_confirmations = true`), so an address must be proven before the account can sign in. Administrators can also create student accounts through `/api/admin/students`, which requires the same UCC email and index number.
- **UCC email rule in the database**: the trigger `trg_enforce_ucc_email` on `auth.users` rejects any address that does not end in `ucc.edu.gh`, however the account is created (API, dashboard or script).
- **Sign-in**: with an index number or UCC email plus password. Index numbers are resolved to an email on the server through a service-role-only function.
- **Defense in Depth**:
  - `handle_new_auth_user()` ignores any client-supplied `raw_user_meta_data.role` or `is_admin` flags and always assigns `role = 'student'`. Only an administrator can promote a user to lecturer.
  - Newly created students still see **zero** examinations unless explicitly assigned directly or through an active `class_memberships` enrollment.
- **Non-Enumerating Password Recovery**: `POST /api/auth/password-reset` returns an identical `200 OK` message whether or not an email address is registered, preventing account enumeration.

---

## 2. Role Assignment & Privilege-Escalation Prevention

- **Source of Truth**: Roles (`student`, `lecturer`, `admin`) and `account_status` (`active`, `suspended`, `pending_approval`) live in `public.profiles` and are verified on every request via `SECURITY DEFINER` helpers (`public.is_active_admin()`, `public.is_active_student()`).
- **Initial Admin Bootstrap**: Only `service_role` or the database owner can execute `public.bootstrap_initial_admin(uuid, text)`. No admin emails or passwords are built into the production code path. The local demo database (used only when Supabase is not configured, and refused in production) seeds demo accounts for development.
- **Multi-Layer Self-Promotion Guards**:
  1. **SQL Column Grants**: `authenticated` is granted `UPDATE (full_name)` only on `public.profiles`—not `role` or `account_status`.
  2. **Trigger Enforcement**: `trg_protect_profile_sensitive_fields` rejects any non-admin / non-service-role attempt to insert `role <> 'student'` or mutate `role`, `account_status`, `institution_id`, `student_identifier`, or `email`.
  3. **API Input Rejection**: `PATCH /api/me` explicitly rejects payloads containing `role` or `account_status` with `403 FORBIDDEN_PROFILE_MODIFICATION`.
- **Immediate Suspension Enforcement**: Both `is_active_admin()` and `is_active_student()` require `account_status = 'active'`. Suspending an account immediately revokes database RLS and API access even before an existing JWT expires.

---

## 3. Secret Management

| Variable | Classification | Permitted Location |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Public configuration | Browser & Backend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_ANON_KEY` | Public RLS-gated key | Browser & Backend |
| `SUPABASE_SERVICE_ROLE_KEY` | **CRITICAL SECRET** (bypasses RLS) | Trusted server / Edge Function secrets **ONLY** |
| `CRON_SECRET` | **SECRET** | Trusted server / Edge Function / Scheduler secrets **ONLY** |

`loadBackendEnv()` (`src/backend/config/env.ts`) scans `process.env` at startup and throws a fatal error if a `SERVICE_ROLE`, `SECRET`, or `sb_secret_` credential is accidentally placed in any `VITE_*` variable.

---

## 4. `SECURITY DEFINER` & RLS Hardening

- **Non-Recursive Role Checks**: `is_active_admin()`, `is_active_student()`, and `current_institution_id()` query `public.profiles` inside minimal `SECURITY DEFINER` SQL functions so RLS policies never trigger infinite recursion.
- **Fixed `search_path`**: Every `SECURITY DEFINER` function declares `SET search_path = public, pg_temp` to prevent schema-shadowing attacks.
- **Least-Privilege Function Grants**: Internal grading and audit helpers (`internal_finalize_attempt`, `internal_write_audit_log`) revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`.
- **Untrusted Client Inputs Ignored**: `student_id`, `role`, `started_at`, `deadline_at`, `submitted_at`, `marks_obtained`, `percentage`, and `passed` are never accepted from student requests; all are derived from `auth.uid()`, database configuration, and `public.utc_now()`.

---

## 5. Abuse & Injection Protections

- **Parameterized Queries**: All SQL functions and client calls use typed parameters; zero dynamic string-concatenated SQL is executed on user input.
- **CSV Formula Injection**: Both `public.sanitize_csv_text(text)` in PostgreSQL and `sanitizeCsvCell()` in `src/backend/utils/csv.ts` prefix leading `=`, `+`, `-`, `@`, `\t`, and `\r` characters (including whitespace-padded variants) with `'` so exported spreadsheets cannot trigger formula execution.
- **Rate Limiting**: `createRateLimiter()` enforces sliding-window request caps on `/api/auth/login`, `/api/auth/password-reset`, and `/api/student/exams/:examId/attempts`.
- **HTTP Cache Isolation**: All `/api/*` responses set `Cache-Control: no-store, no-cache, must-revalidate, private` and `X-Content-Type-Options: nosniff` so exam questions and results are not persisted in shared browser caches.

---

## 6. Compromised Credential Rotation Procedure

If `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, or database passwords are ever accidentally committed or exposed:

1. **Rotate Immediately in Supabase**:
   - Navigate to **Supabase Dashboard -> Project Settings -> API Keys** and generate a new secret/service-role key, then revoke the exposed key immediately.
   - If the database password was exposed, rotate it under **Project Settings -> Database -> Reset database password**.
   - Generate a new `CRON_SECRET` (`openssl rand -hex 32`) and update both the scheduler and server/Edge Function secrets.
2. **Update Runtime Secrets**:
   - Update your server environment variables and run `npx supabase secrets set ...` for Edge Functions.
3. **Purge Secret from Git History**:
   - Removing a secret in a new commit does **not** erase it from prior commits. Rewrite repository history using `git filter-repo` or `BFG Repo-Cleaner`:
     ```bash
     git filter-repo --invert-paths --path .env
     git push --force --all
     ```
   - Contact GitHub Support if cached pull requests or forks still reference the leaked commit SHA.
4. **Audit Recent Activity**:
   - Inspect `public.audit_logs` and Supabase Auth logs for unauthorized account creations, role changes, or exports during the exposure window.
