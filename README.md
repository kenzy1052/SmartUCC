# QuizPocket — Knowledge in Your Pocket

QuizPocket is a controlled online examination and academic assessment platform built for teachers and administrators to author, schedule, assign, monitor, and automatically grade timed objective examinations for students.

> **Current Phase**: **Phase 1 Complete (Backend Architecture, PostgreSQL Schema, RLS, Examination Engine, Analytics, CSV Exports, & Security Test Suite)**.  
> Per the Backend-First implementation plan, the visual iPhone-first frontend will be built in **Phase 2** on top of this verified backend foundation.

---

## Technology Stack

- **Database & Security**: Supabase PostgreSQL, Row Level Security (RLS), PL/pgSQL transactional RPCs, triggers, and partial unique indexes (`database/`).
- **Authentication**: Supabase Auth (email/password with controlled student provisioning and server-verified JWTs).
- **Server-Side Execution**:
  - Supabase PostgreSQL `SECURITY DEFINER` functions (with locked `search_path = public, pg_temp`).
  - Supabase Edge Functions (`supabase/functions/finalize-expired-attempts`).
  - Express + `@supabase/supabase-js` trusted backend router (`server.ts` / `src/backend/`).
- **Automated Testing**: `vitest`, `@electric-sql/pglite` (real compiled PostgreSQL 16 engine executing all SQL migrations and RLS roles), and `supertest`.

---

## Prerequisites

- **Node.js** 20+ and **npm**
- **Supabase CLI** (`npx supabase ...`) when linking or pushing migrations to a local Docker stack or hosted Supabase project
- A **Supabase Project** (required when connecting to live cloud infrastructure)

---

## Installation & Environment Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Create your local `.env` file from the template**:
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables in `.env`** (never commit `.env` to Git):
   - **Public client configuration** (safe for browser use **only** because RLS and least-privilege grants are enforced on every table):
     - `VITE_SUPABASE_URL` — Your Supabase Project URL (`https://<project-ref>.supabase.co`).
     - `VITE_SUPABASE_PUBLISHABLE_KEY` — Your Supabase publishable key (`sb_publishable_...`), **or** `VITE_SUPABASE_ANON_KEY` if your project uses legacy anon keys.
   - **Trusted server-only secrets** (**NEVER** prefix with `VITE_` or place in browser code):
     - `SUPABASE_SERVICE_ROLE_KEY` — Used strictly by the server/Edge Functions for privileged Auth user provisioning and scheduled expiry sweeps.
     - `CRON_SECRET` — High-entropy shared secret authenticating scheduled expiry sweep calls (`openssl rand -hex 32`).

---

## Database setup

All database SQL lives in the `database/` folder as numbered files (01 to 14). Run them **one at a time, in order**, in the Supabase SQL Editor. Do not paste them together as one script: file 12 adds the `lecturer` role and later files use it, and Postgres refuses that inside a single transaction. Full instructions are in `database/README.md`.

### Verifying Schema & RLS Activation
Run in the Supabase SQL Editor:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```
Every table in `public` must show `rowsecurity = true`.

### Creating the Initial Administrator Account
Public registration cannot create administrator accounts. To bootstrap your first teacher/administrator:
1. Create the teacher's user account in **Supabase Dashboard -> Authentication -> Users -> Add User** (copy the generated `UUID`).
2. Run in the **Supabase SQL Editor** (runs with privileged owner permissions):
   ```sql
   SELECT * FROM public.bootstrap_initial_admin(
     '<TEACHER_AUTH_USER_UUID>'::uuid,
     'Teacher Full Name'
   );
   ```

---

## Running Locally & Running Automated Tests

- **Run the automated PostgreSQL + RLS + API test suite** (executes all 6 `.sql` migration files against an isolated real PostgreSQL 16 engine—no cloud credentials required):
  ```bash
  npm test
  ```
- **Run TypeScript verification**:
  ```bash
  npm run lint
  ```
- **Start the local development server** (port `3000`):
  ```bash
  npm run dev
  ```

---

## Safe Deployment Checklist

1. Disable open public email sign-up in **Supabase Dashboard -> Authentication -> Providers -> Email** if you want strictly administrator-created student accounts.
2. Enable the **`pg_cron`** extension in **Supabase Dashboard -> Integrations -> Cron** so `quizpocket-finalize-expired-attempts` runs every minute inside PostgreSQL (or schedule `supabase/functions/finalize-expired-attempts` / `POST /api/internal/cron/finalize-expired-attempts` with `x-cron-secret`).
3. Set `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` only in your server or Supabase Edge Function secrets (`npx supabase secrets set CRON_SECRET=...`).
4. Deploy the repository to Netlify using the included `netlify.toml`. It builds the Vite frontend, publishes `dist/`, packages the Express API as a Netlify Function, and rewrites `/api/*` requests to that function. Deploy from the Git integration or Netlify CLI; uploading only the `dist/` folder does not deploy API functions.
5. In Netlify environment variables, provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the frontend build and API function. Add `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` for the Functions runtime only; never use a `VITE_` prefix for either secret.

### Netlify API deployment

The browser calls same-origin `/api/...` routes. `netlify/functions/api.ts` adapts the existing Express router to a Netlify Function, and the `/api/*` rewrite in `netlify.toml` routes sign-up, login, quiz, and admin requests to it. The function uses the hosted Supabase gateway directly and does not initialize the local PGlite/demo seed path.

---

## Known Limitations (Reported Honestly)

- **Remote Supabase Project Not Connected Yet**: No live `VITE_SUPABASE_URL` or Supabase keys were provided in this workspace, so migrations have **not** been pushed to a remote cloud Supabase instance yet. All SQL migrations, RLS policies, triggers, and RPCs have been executed and verified locally against a real embedded PostgreSQL 16 engine (`PGlite`).
- **Online-First MVP**: Controlled examinations require active server connectivity to start attempts, validate answer saves against server deadlines, and submit scores. Offline practice quizzes and local IndexedDB draft reconciliation are deferred to a later phase.
- **Question Types**: Phase 1 supports single-answer `multiple_choice` and `true_false` objective questions. Manual-grading essay questions and multi-select questions can be added in future migrations without redesigning core tables.
- **In-Memory HTTP Rate Limiting**: `src/backend/middleware/rateLimit.ts` uses per-instance sliding windows suitable for single-node deployments; horizontally scaled deployments should pair this with Supabase Auth rate limits or Redis/Cloud Armor.

## Before launch: load testing

The server limits sign-in guesses per account (not per IP address, because many students share one) and caches a verified login for 30 seconds so answer saves stay fast. Test it against a **staging** Supabase project before real exams:

```
BASE_URL=http://localhost:3000 ADMIN_ID=you@ucc.edu.gh ADMIN_PASSWORD=... \
EXAM_ID=<published test exam id> STUDENTS=200 RAMP_SECONDS=30 npm run load-test
```

Read the comments at the top of `scripts/load-test.mjs` first (it creates test accounts and attempts). A good result: every outcome `ok`, p95 under about 1500 ms, and no 429 or 5xx errors. Repeat at 500 students. Also check Supabase's usage dashboard (database connections, Auth requests) during the run, and confirm your plan's limits cover your exam-day peak.
