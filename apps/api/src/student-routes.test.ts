import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const store: any = { attempts: [], decisions: [], masteryUpdates: [], streakUpdates: [], studentClassLevel: 10, questionClassLevel: 10, mastery: 0.2, failProgressOnce: false, progressCalls: 0 };
  const query = (resolveValue: () => unknown) => {
    const result: any = {
      session: vi.fn(() => result), lean: vi.fn(() => result), select: vi.fn(() => result), sort: vi.fn(() => result), populate: vi.fn(() => result),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(resolveValue).then(resolve, reject),
    };
    return result;
  };
  const question = () => ({ _id: '507f1f77bcf86cd799439011', conceptId: 'concept-1', expectedTimeSec: 60, answer: '4', options: [{ isCorrect: true, text: { en: '4', te: '4' } }, { isCorrect: false, text: { en: '5', te: '5' }, misconceptionId: 'misconception-1' }] });
  const reset = () => {
    store.attempts = []; store.decisions = []; store.masteryUpdates = []; store.streakUpdates = [];
    store.studentClassLevel = 10; store.questionClassLevel = 10; store.mastery = 0.2; store.failProgressOnce = false; store.progressCalls = 0;
  };
  const Attempt: any = {
    db: { transaction: vi.fn(async (work: (session: object) => Promise<unknown>) => {
      const snapshot = { attempts: [...store.attempts], decisions: [...store.decisions], masteryUpdates: [...store.masteryUpdates], streakUpdates: [...store.streakUpdates], mastery: store.mastery };
      try { return await work({ transaction: true }); }
      catch (error) { Object.assign(store, snapshot); throw error; }
    }) },
    findOne: vi.fn((filter: any) => query(() => store.attempts.find((row: any) => row.studentId === filter.studentId && row.clientId === filter.clientId) ?? null)),
    find: vi.fn(() => query(() => [])),
    countDocuments: vi.fn((filter: any) => query(() => filter?.createdAt ? 0 : store.attempts.length)),
    create: vi.fn(async (rows: any[]) => {
      const created = rows.map((row, index) => ({ ...row, _id: `attempt-${store.attempts.length + index + 1}` }));
      store.attempts.push(...created);
      return created;
    }),
    updateOne: vi.fn(async (filter: any, update: any) => {
      const row = store.attempts.find((item: any) => item._id === filter._id);
      if (row) Object.assign(row, update.$set);
      return { acknowledged: true };
    }),
  };
  const Concept: any = {
    findById: vi.fn(() => query(() => ({ _id: 'concept-1', slug: 'fractions', classLevel: store.questionClassLevel, name: 'Fractions', nameTe: 'భిన్నాలు' }))),
    find: vi.fn(() => query(() => [])),
  };
  const models = {
    Attempt,
    Question: { findById: vi.fn(() => query(() => question())) },
    Concept,
    MasteryState: {
    findOne: vi.fn(() => query(() => ({ mastery: store.mastery, confidence: 0.5, baselineMastery: 0.1 }))),
      findOneAndUpdate: vi.fn(async (_filter: unknown, update: any) => { store.masteryUpdates.push(update.$set); store.mastery = update.$set.mastery; return update.$set; }),
      updateOne: vi.fn(async () => ({ acknowledged: true })),
      find: vi.fn(() => query(() => [])),
    },
    Misconception: { findById: vi.fn(() => query(() => null)) },
    Explanation: {},
    DecisionLog: { create: vi.fn(async (rows: any[]) => { store.decisions.push(...rows); return rows; }) },
    StreakState: {
      findOne: vi.fn(() => query(() => ({ current: 0, longest: 0, freezes: 0, history: [] }))),
      findOneAndUpdate: vi.fn(async (_filter: unknown, update: any) => { store.streakUpdates.push(update.$set); return update.$set; }),
    },
    Alert: { countDocuments: vi.fn(() => query(() => 0)) },
    TeacherOverride: { find: vi.fn(() => query(() => [])) },
    PrerequisiteEdge: {},
  };
  return { store, reset, models };
});

vi.mock('./models.js', () => harness.models);
vi.mock('./progress-signals.js', () => ({ syncProgressSignals: vi.fn(async () => {
  harness.store.progressCalls++;
  if (harness.store.failProgressOnce) { harness.store.failProgressOnce = false; throw new Error('temporary progress write failure'); }
}) }));

import { studentRouter } from './student-routes.js';
import { syncProgressSignals } from './progress-signals.js';

const payload = {
  clientId: '11111111-1111-4111-8111-111111111111', activityId: '22222222-2222-4222-8222-222222222222',
  questionId: '507f1f77bcf86cd799439011', selectedOption: 0, confidence: 'unsure', hintsUsed: 1,
  timeMs: 30_000, mode: 'learn', clientTimestamp: new Date().toISOString(),
};

async function submit(body = payload) {
  const stack = (studentRouter as any).stack as any[];
  const roleLayer = stack.find((layer) => !layer.route);
  const answerLayer = stack.find((layer) => layer.route?.path === '/answer');
  if (!roleLayer || !answerLayer) throw new Error('Could not find student answer route middleware.');
  return new Promise<{ status: number; body: any }>((resolve) => {
    const req: any = { body, params: {}, query: {}, headers: {}, method: 'POST', url: '/answer', originalUrl: '/answer', baseUrl: '', session: { user: { id: 'student-1', role: 'student', classId: 'class-1', classLevel: harness.store.studentClassLevel, name: 'Student', language: 'en', board: 'CBSE' } } };
    const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { resolve({ status: this.statusCode, body: value }); return this; } };
    const next = (error?: unknown) => resolve({ status: error && typeof error === 'object' && 'status' in error ? Number((error as any).status) : 500, body: { error } });
    roleLayer.handle(req, res, () => answerLayer.route.stack[0].handle(req, res, next));
  });
}

describe('student answer authorization and atomic persistence', () => {
  beforeEach(() => harness.reset());
  afterEach(() => vi.clearAllMocks());

  it('accepts a Class 10 question for a Class 10 student and persists progress', async () => {
    harness.store.questionClassLevel = 10;
    const response = await submit();
    const result = response.body;
    expect(response.status).toBe(200);
    expect(result).toMatchObject({ correct: true, mastery: expect.any(Number), answer: { en: '4' } });
    expect(harness.store.attempts).toHaveLength(1);
    expect(harness.store.attempts[0].answerResult.mastery).toBe(result.mastery);
    expect(harness.store.masteryUpdates).toHaveLength(1);
    expect(harness.store.decisions).toHaveLength(1);
    expect(harness.store.streakUpdates).toHaveLength(1);
    expect(syncProgressSignals).toHaveBeenCalledWith('student-1', 'class-1', [{ conceptId: 'concept-1', previousMastery: 0.2 }], expect.any(Date), { transaction: true });
  });

  it('assigns real provenance on the server even when the client submits demo provenance', async () => {
    const response = await submit({ ...payload, provenance: 'demo' });
    expect(response.status).toBe(200);
    expect(harness.store.attempts).toHaveLength(1);
    expect(harness.store.attempts[0].provenance).toBe('real');
  });

  it('rejects questions mapped above the authenticated student class level before writing', async () => {
    harness.store.studentClassLevel = 8;
    harness.store.questionClassLevel = 9;
    const response = await submit();
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'CLASS_LEVEL_MISMATCH' } });
    expect(harness.store.attempts).toHaveLength(0);
    expect(harness.store.masteryUpdates).toHaveLength(0);
    expect(syncProgressSignals).not.toHaveBeenCalled();
  });

  it('returns the stored response on duplicate client IDs without repeating effects', async () => {
    const first = await submit();
    const original = first.body;
    const duplicate = await submit();
    const duplicateResult = duplicate.body;
    expect(duplicate.status).toBe(200);
    expect(duplicateResult).toMatchObject({ ...original, duplicate: true });
    expect(harness.store.attempts).toHaveLength(1);
    expect(harness.store.masteryUpdates).toHaveLength(1);
    expect(harness.store.decisions).toHaveLength(1);
    expect(syncProgressSignals).toHaveBeenCalledTimes(1);
  });

  it('rolls back a failed downstream write so the same answer can be safely retried', async () => {
    harness.store.failProgressOnce = true;
    const failed = await submit();
    expect(failed.status).toBe(500);
    expect(harness.store.attempts).toHaveLength(0);
    expect(harness.store.masteryUpdates).toHaveLength(0);
    expect(harness.store.decisions).toHaveLength(0);

    const retry = await submit();
    expect(retry.status).toBe(200);
    expect(harness.store.attempts).toHaveLength(1);
    expect(harness.store.masteryUpdates).toHaveLength(1);
    expect(harness.store.decisions).toHaveLength(1);
    expect(syncProgressSignals).toHaveBeenCalledTimes(2);
  });
});
