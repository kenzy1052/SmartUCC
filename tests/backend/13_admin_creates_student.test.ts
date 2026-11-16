import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { LocalPostgresBackendGateway } from '../../src/backend/db/localPostgresGateway.ts';
import { createBackendApiRouter } from '../../src/backend/app.ts';

describe('13 — Admin-created student accounts need a real UCC email and index number', () => {
  let gateway: LocalPostgresBackendGateway;
  let app: express.Express;
  let admin: string;

  beforeAll(async () => {
    gateway = await LocalPostgresBackendGateway.create({ seedDemoData: true });
    app = express();
    app.use(
      '/api',
      createBackendApiRouter({ gateway, cronSecret: 'c', authRateLimitMax: 100, attemptRateLimitMax: 100 })
    );
    admin = (await request(app).post('/api/auth/login').send({ identifier: 'kenzy', password: 'kenzy1052' }).expect(200))
      .body.data.access_token;
  });

  afterAll(async () => {
    await gateway?.close();
  });

  const valid = {
    full_name: 'Efua Mensah',
    email: 'efua.mensah@stu.ucc.edu.gh',
    index_number: 'ps/its/23/0007',
    password: 'Welcome2026x',
  };
  const post = (body: object, token = admin) =>
    request(app).post('/api/admin/students').set('Authorization', `Bearer ${token}`).send(body);

  it('rejects missing or non-UCC email, bad index number and short passwords', async () => {
    expect((await post({ ...valid, email: '' }).expect(422)).body.error.code).toBe('UCC_EMAIL_REQUIRED');
    expect((await post({ ...valid, email: 'efua@gmail.com' }).expect(422)).body.error.code).toBe('UCC_EMAIL_REQUIRED');
    expect((await post({ ...valid, index_number: '' }).expect(422)).body.error.code).toBe('INDEX_NUMBER_INVALID');
    await post({ ...valid, password: 'short' }).expect(422);
    await post({ ...valid, full_name: '' }).expect(422);
  });

  it('creates the student, who then signs in by index number or email', async () => {
    const created = await post(valid).expect(201);
    expect(created.body.data.email).toBe('efua.mensah@stu.ucc.edu.gh');
    expect(created.body.data.student_identifier).toBe('PS/ITS/23/0007');

    await request(app).post('/api/auth/login').send({ identifier: 'ps/its/23/0007', password: valid.password }).expect(200);
    await request(app).post('/api/auth/login').send({ identifier: valid.email, password: valid.password }).expect(200);
  });

  it('refuses duplicates, and a student cannot create accounts', async () => {
    await post(valid).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    await post({ ...valid, email: 'another@ucc.edu.gh' }).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));

    const student = (
      await request(app).post('/api/auth/login').send({ identifier: valid.email, password: valid.password }).expect(200)
    ).body.data.access_token;
    await post({ ...valid, email: 'x@ucc.edu.gh', index_number: 'PS/ITS/23/0099' }, student).expect(403);
  });
});
