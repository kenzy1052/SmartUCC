import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { LocalPostgresBackendGateway } from '../../src/backend/db/localPostgresGateway.ts';
import { createBackendApiRouter } from '../../src/backend/app.ts';

describe('12 — Written answers, marking queue and result approval', () => {
  let gateway: LocalPostgresBackendGateway;
  let app: express.Express;

  beforeAll(async () => {
    gateway = await LocalPostgresBackendGateway.create({ seedDemoData: true });
    app = express();
    app.use(
      '/api',
      createBackendApiRouter({ gateway, cronSecret: 'c', authRateLimitMax: 100, attemptRateLimitMax: 100 })
    );
  });

  afterAll(async () => {
    await gateway?.close();
  });

  const login = async (identifier: string, password: string) =>
    (await request(app).post('/api/auth/login').send({ identifier, password }).expect(200)).body.data
      .access_token as string;

  it('holds a result until written answers are marked and approved, then releases it', async () => {
    const admin = await login('kenzy', 'kenzy1052');
    const student = await login('marcus.rivera@ucc.edu.gh', 'QuizPocket#Student2');

    const exams = await request(app).get('/api/student/exams').set('Authorization', `Bearer ${student}`).expect(200);
    const exam = exams.body.data.find((e: { title: string }) => e.title === 'HIM 101: Software System');

    await request(app)
      .put(`/api/admin/exams/${exam.id}/marking-approval`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ required: true })
      .expect(200);

    const start = await request(app)
      .post(`/api/student/exams/${exam.id}/attempts`)
      .set('Authorization', `Bearer ${student}`)
      .expect(200);
    const attemptId = start.body.data.attempt_id as string;
    const qs = await request(app)
      .get(`/api/student/attempts/${attemptId}/questions`)
      .set('Authorization', `Bearer ${student}`)
      .expect(200);
    const written = qs.body.data.questions.find((q: { question_type: string }) => q.question_type === 'short_answer');
    await request(app)
      .put(`/api/student/attempts/${attemptId}/answers`)
      .set('Authorization', `Bearer ${student}`)
      .send({ question_id: written.id, answer_value: 'Software is a set of instructions that tells hardware what to do.' })
      .expect(200);
    const submit = await request(app)
      .post(`/api/student/attempts/${attemptId}/submit`)
      .set('Authorization', `Bearer ${student}`)
      .expect(200);
    expect(submit.body.data.result_released).toBe(false);
    const queue = await request(app)
      .get(`/api/admin/marking/queue?exam_id=${exam.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const resultId = (
      queue.body.data as Array<{ result_id: string; question_id: string; student_name: string }>
    ).find((i) => i.question_id === written.id && i.student_name === 'Marcus Rivera')!.result_id;

    // Approval is refused while a written answer is unmarked.
    const early = await request(app)
      .post(`/api/admin/exams/${exam.id}/approve-results`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ result_id: resultId })
      .expect(200);
    expect(early.body.data.approved).toBe(0);
    expect(early.body.data.held_for_marking).toBe(1);

    const summary = await request(app).get('/api/admin/marking/summary').set('Authorization', `Bearer ${admin}`).expect(200);
    expect(summary.body.data.find((s: { exam_id: string }) => s.exam_id === exam.id).pending_items).toBeGreaterThan(0);

    // Marks above the maximum are rejected.
    await request(app)
      .post(`/api/admin/results/${resultId}/items/${written.id}/mark`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ marks_awarded: 99 })
      .expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));

    await request(app)
      .post(`/api/admin/results/${resultId}/items/${written.id}/mark`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ marks_awarded: 3, comment: 'Clear and correct.' })
      .expect(200);

    // Marked but not yet approved: still hidden because the exam requires approval.
    await request(app)
      .get(`/api/student/attempts/${attemptId}/review`)
      .set('Authorization', `Bearer ${student}`)
      .expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));

    const approved = await request(app)
      .post(`/api/admin/exams/${exam.id}/approve-results`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ result_id: resultId })
      .expect(200);
    expect(approved.body.data.approved).toBe(1);

    const review = await request(app)
      .get(`/api/student/attempts/${attemptId}/review`)
      .set('Authorization', `Bearer ${student}`)
      .expect(200);
    const reviewed = review.body.data.questions.find((q: { question_id: string }) => q.question_id === written.id);
    expect(reviewed.reviewer_comment).toBe('Clear and correct.');
  });

  it('keeps students out of the marking and approval routes', async () => {
    const student = await login('marcus.rivera@ucc.edu.gh', 'QuizPocket#Student2');
    for (const [method, path] of [
      ['get', '/api/admin/marking/queue'],
      ['get', '/api/admin/marking/summary'],
    ] as const) {
      await request(app)[method](path).set('Authorization', `Bearer ${student}`).expect(403);
    }
  });
});
