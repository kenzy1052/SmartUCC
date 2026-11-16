import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { LocalPostgresBackendGateway } from '../../src/backend/db/localPostgresGateway.ts';
import { createBackendApiRouter } from '../../src/backend/app.ts';

describe('14 — Rate limits protect accounts without blocking a shared IP address', () => {
  let gateway: LocalPostgresBackendGateway;
  let app: express.Express;

  beforeAll(async () => {
    gateway = await LocalPostgresBackendGateway.create({ seedDemoData: true });
    app = express();
    app.use('/api', createBackendApiRouter({ gateway, cronSecret: 'c' }));
  });

  afterAll(async () => {
    await gateway?.close();
  });

  it('lets many different students sign in from one IP address in the same minute', async () => {
    for (let i = 0; i < 40; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '41.66.0.10')
        .send({ identifier: `student${i}@stu.ucc.edu.gh`, password: 'wrong-password' });
      expect(res.status).toBe(401);
    }
  });

  it('stops repeated guesses against one account, even if the IP address changes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .send({ identifier: 'PS/CSC/22/0001', password: 'guess' + i });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);

    // A different account is unaffected.
    await request(app).post('/api/auth/login').send({ identifier: 'PS/CSC/22/0002', password: 'x' }).expect(401);
  });
});
