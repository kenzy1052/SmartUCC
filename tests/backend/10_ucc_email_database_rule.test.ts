import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalPostgresBackendGateway } from '../../src/backend/db/localPostgresGateway.ts';

describe('10 — UCC email rule is enforced by the database itself', () => {
  let gateway: LocalPostgresBackendGateway;

  beforeAll(async () => {
    gateway = await LocalPostgresBackendGateway.create({ seedDemoData: false });
  });

  afterAll(async () => {
    await gateway?.close();
  });

  it('rejects non-UCC emails even when the API is bypassed', async () => {
    const db = (gateway as unknown as { db: { query: (sql: string, p?: unknown[]) => Promise<unknown> } }).db;
    for (const bad of ['someone@gmail.com', 'a@ucc.edu.gh.evil.com', 'a@notucc.edu.gh', '@ucc.edu.gh']) {
      await expect(
        db.query(`INSERT INTO auth.users (email, encrypted_password) VALUES ($1, 'x')`, [bad])
      ).rejects.toThrow(/UCC_EMAIL_REQUIRED/);
    }
  });

  it('accepts ucc.edu.gh and subdomains, and stores the index number on the profile', async () => {
    const db = (gateway as unknown as {
      db: { query: (sql: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, string>> }> };
    }).db;
    await db.query(
      `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
       VALUES ('lecturer@ucc.edu.gh', 'x', '{"full_name":"Dr Mensah"}'::jsonb),
              ('student@stu.ucc.edu.gh', 'x', '{"full_name":"Ama Owusu","index_number":"PS/ITS/21/0042"}'::jsonb)`
    );
    const res = await db.query(
      `SELECT email, student_identifier, role FROM public.profiles WHERE email IN ('lecturer@ucc.edu.gh','student@stu.ucc.edu.gh') ORDER BY email`
    );
    expect(res.rows).toHaveLength(2);
    expect(res.rows[1].student_identifier).toBe('PS/ITS/21/0042');
    expect(res.rows.every((r) => r.role === 'student')).toBe(true);
  });
});
