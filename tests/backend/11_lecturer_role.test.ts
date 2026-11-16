import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalPostgresBackendGateway } from '../../src/backend/db/localPostgresGateway.ts';

type Db = { query: (sql: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, any>> }> };

describe('11 — Lecturer role permissions are enforced by the database', () => {
  let gateway: LocalPostgresBackendGateway;
  let db: Db;
  const ids: Record<string, string> = {};

  async function asUser<T = Record<string, any>>(uid: string, sql: string, params: unknown[] = []) {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid]);
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await db.query(`SET ROLE authenticated`);
    try {
      return (await db.query(sql, params)).rows as T[];
    } finally {
      await db.query(`RESET ROLE`);
    }
  }

  beforeAll(async () => {
    gateway = await LocalPostgresBackendGateway.create({ seedDemoData: false });
    db = (gateway as unknown as { db: Db }).db;
    for (const [key, email, idx] of [
      ['admin', 'admin@ucc.edu.gh', null],
      ['lect', 'lect@ucc.edu.gh', null],
      ['stud', 'stud@stu.ucc.edu.gh', 'PS/CSC/22/0100'],
    ] as const) {
      const r = await db.query(
        `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
         VALUES ($1, 'x', $2::jsonb) RETURNING id`,
        [email, JSON.stringify({ full_name: key, ...(idx ? { index_number: idx } : {}) })]
      );
      ids[key] = r.rows[0].id;
    }
    await db.query(`SELECT set_config('quizpocket.trusted_context','on',false)`);
    await db.query(`UPDATE public.profiles SET role='admin' WHERE id=$1`, [ids.admin]);
  });

  afterAll(async () => {
    await gateway?.close();
  });

  it('only an admin can promote a student to lecturer, and never themselves', async () => {
    await expect(asUser(ids.stud, `SELECT public.admin_set_user_role($1::uuid,'lecturer')`, [ids.stud])).rejects.toThrow(/FORBIDDEN_ADMIN_ONLY/);
    await expect(asUser(ids.admin, `SELECT public.admin_set_user_role($1::uuid,'lecturer')`, [ids.admin])).rejects.toThrow(/own role/);
    await asUser(ids.admin, `SELECT public.admin_set_user_role($1::uuid,'lecturer')`, [ids.lect]);
    const r = await db.query(`SELECT role::text AS role FROM public.profiles WHERE id=$1`, [ids.lect]);
    expect(r.rows[0].role).toBe('lecturer');
  });

  it('lecturers can create exams but cannot manage users, classes or read the audit log', async () => {
    const exam = await asUser(ids.lect, `SELECT id FROM public.admin_create_exam('Quiz 1')`);
    expect(exam).toHaveLength(1);

    await expect(asUser(ids.lect, `SELECT public.admin_set_user_role($1::uuid,'student')`, [ids.stud])).rejects.toThrow(/FORBIDDEN_ADMIN_ONLY/);
    await expect(asUser(ids.lect, `SELECT public.admin_create_class('Cohort','x')`)).rejects.toThrow();
    const audit = await asUser(ids.lect, `SELECT id FROM public.audit_logs`);
    expect(audit).toHaveLength(0);
    const adminAudit = await asUser(ids.admin, `SELECT actor_role FROM public.audit_logs WHERE event_type='user.role_changed'`);
    expect(adminAudit.length).toBeGreaterThan(0);
  });

  it('lecturers cannot edit profiles directly, and students gain nothing', async () => {
    await expect(asUser(ids.lect, `UPDATE public.profiles SET role='admin' WHERE id=$1`, [ids.lect])).rejects.toThrow();
    const rows = await asUser(ids.stud, `SELECT id FROM public.profiles`);
    expect(rows).toHaveLength(1);
  });
});
