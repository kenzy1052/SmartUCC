#!/usr/bin/env node
/**
 * CDE Exams load test: simulates many students taking one exam at the same time.
 *
 * RUN THIS AGAINST A STAGING PROJECT, NOT PRODUCTION. It creates test student accounts
 * (loadtest-*@loadtest.ucc.edu.gh) and real exam attempts.
 *
 * Before running:
 *   1. Create a test exam and publish it, with a short duration and enough attempts.
 *   2. Create a test cohort with "auto-enrol new students" on, and assign the exam to it,
 *      so newly created students can see the exam.
 *   3. Start the server (npm start) pointed at the staging Supabase project.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 ADMIN_ID=you@ucc.edu.gh ADMIN_PASSWORD=... \
 *   EXAM_ID=<exam uuid> STUDENTS=200 RAMP_SECONDS=30 node scripts/load-test.mjs
 */
const env = (k, d) => process.env[k] ?? d;
const BASE = env('BASE_URL', 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_ID = env('ADMIN_ID', '');
const ADMIN_PASSWORD = env('ADMIN_PASSWORD', '');
const EXAM_ID = env('EXAM_ID', '');
const STUDENTS = Number(env('STUDENTS', '100'));
const RAMP_SECONDS = Number(env('RAMP_SECONDS', '20'));
const THINK_MS = Number(env('THINK_MS', '1500'));
const SETUP_CONCURRENCY = Number(env('SETUP_CONCURRENCY', '8'));
const RUN = Date.now().toString(36);
const PASSWORD = 'LoadTest#' + RUN;

if (!ADMIN_ID || !ADMIN_PASSWORD || !EXAM_ID) {
  console.error('Set ADMIN_ID, ADMIN_PASSWORD and EXAM_ID (see the comments at the top of this file).');
  process.exit(1);
}

const samples = []; // {label, ms, status}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (max) => Math.floor(Math.random() * max);

async function call(label, method, path, token, body) {
  const t0 = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch {
    status = -1; // network error / timeout
  }
  samples.push({ label, ms: performance.now() - t0, status });
  return { status, json };
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    })
  );
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function student(i) {
  const index = `LT/${RUN.toUpperCase()}/${String(i).padStart(4, '0')}`;
  await sleep(jitter(RAMP_SECONDS * 1000));
  const login = await call('login', 'POST', '/api/auth/login', null, { identifier: index, password: PASSWORD });
  const token = login.json?.data?.access_token;
  if (!token) return 'login_failed';

  const start = await call('start_attempt', 'POST', `/api/student/exams/${EXAM_ID}/attempts`, token);
  const attemptId = start.json?.data?.attempt_id;
  if (!attemptId) return 'start_failed';

  const qs = await call('load_questions', 'GET', `/api/student/attempts/${attemptId}/questions`, token);
  const questions = qs.json?.data?.questions ?? [];
  if (!questions.length) return 'no_questions';

  for (const q of questions) {
    await sleep(THINK_MS / 2 + jitter(THINK_MS));
    const payload = q.options?.length
      ? { question_id: q.id, selected_option_id: q.options[jitter(q.options.length)].id }
      : { question_id: q.id, answer_value: 'Load test answer for question ' + q.id.slice(0, 6) };
    await call('save_answer', 'PUT', `/api/student/attempts/${attemptId}/answers`, token, payload);
  }

  const sub = await call('submit', 'POST', `/api/student/attempts/${attemptId}/submit`, token);
  return sub.status === 200 ? 'ok' : 'submit_failed';
}

(async () => {
  console.log(`Load test ${RUN}: ${STUDENTS} students against ${BASE}`);
  const admin = await call('admin_login', 'POST', '/api/auth/login', null, { identifier: ADMIN_ID, password: ADMIN_PASSWORD });
  const adminToken = admin.json?.data?.access_token;
  if (!adminToken) {
    console.error('Admin sign-in failed:', admin.status, JSON.stringify(admin.json));
    process.exit(1);
  }

  console.log('Creating test students...');
  const ids = Array.from({ length: STUDENTS }, (_, i) => i);
  let created = 0;
  await pool(ids, SETUP_CONCURRENCY, async (i) => {
    const r = await call('create_student', 'POST', '/api/admin/students', adminToken, {
      full_name: `Load Test ${i}`,
      email: `loadtest-${RUN}-${i}@loadtest.ucc.edu.gh`,
      index_number: `LT/${RUN.toUpperCase()}/${String(i).padStart(4, '0')}`,
      password: PASSWORD,
    });
    if (r.status === 201) created++;
  });
  console.log(`Created ${created}/${STUDENTS} students. Starting exam attempts over ${RAMP_SECONDS}s...`);

  const t0 = performance.now();
  const outcomes = {};
  await Promise.all(
    ids.map(async (i) => {
      const o = await student(i).catch(() => 'crashed');
      outcomes[o] = (outcomes[o] ?? 0) + 1;
    })
  );
  const seconds = ((performance.now() - t0) / 1000).toFixed(1);

  console.log(`\nFinished in ${seconds}s. Outcomes:`, outcomes);
  const labels = [...new Set(samples.map((s) => s.label))].filter((l) => l !== 'create_student' && l !== 'admin_login');
  console.log('\nendpoint'.padEnd(18), 'count'.padStart(6), 'p50 ms'.padStart(8), 'p95 ms'.padStart(8), 'p99 ms'.padStart(8), 'errors'.padStart(8));
  const report = {};
  for (const label of labels) {
    const rows = samples.filter((s) => s.label === label);
    const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
    const errors = rows.filter((r) => r.status < 200 || r.status >= 300);
    const by = {};
    for (const e of errors) by[e.status] = (by[e.status] ?? 0) + 1;
    report[label] = { count: rows.length, p50: pct(sorted, 50), p95: pct(sorted, 95), p99: pct(sorted, 99), errors: by };
    console.log(
      label.padEnd(17),
      String(rows.length).padStart(6),
      pct(sorted, 50).toFixed(0).padStart(8),
      pct(sorted, 95).toFixed(0).padStart(8),
      pct(sorted, 99).toFixed(0).padStart(8),
      (errors.length ? JSON.stringify(by) : '0').padStart(8)
    );
  }
  const fs = await import('node:fs');
  const file = `load-test-${RUN}.json`;
  fs.writeFileSync(file, JSON.stringify({ run: RUN, students: STUDENTS, seconds, outcomes, report }, null, 2));
  console.log(`\nReport saved to ${file}`);
  console.log('Good result: every outcome is "ok", p95 under about 1500 ms, and no 429 or 5xx errors.');
})();
