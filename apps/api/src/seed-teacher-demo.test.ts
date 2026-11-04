import { beforeEach, describe, expect, it, vi } from 'vitest';
import { curriculum } from '@conceptbridge/engine';

const harness = vi.hoisted(() => {
  const student = { _id: 'student-1', classId: 'class-1', rollNo: '01', name: 'Demo Student', lastActiveAt: new Date() };
  const concepts: any[] = [];
  const questions: any[] = [];
  const attemptWrites: Array<{ filter: any; update: any }> = [];
  const reset = () => { attemptWrites.length = 0; };
  return { student, concepts, questions, attemptWrites, reset };
});

vi.mock('./models.js', () => ({
  User: {
    find: vi.fn(() => ({ sort: async () => [harness.student] })),
    updateOne: vi.fn(async () => ({ acknowledged: true })),
  },
  Concept: { find: vi.fn(() => ({ select: () => ({ lean: async () => harness.concepts }) })) },
  Question: { find: vi.fn(() => ({ lean: async () => harness.questions })) },
  MasteryState: { findOneAndUpdate: vi.fn(async () => ({})) },
  Attempt: { findOneAndUpdate: vi.fn(async (filter: any, update: any) => { harness.attemptWrites.push({ filter, update }); return {}; }) },
  StreakState: { findOneAndUpdate: vi.fn(async () => ({})) },
  Alert: { findOneAndUpdate: vi.fn(async () => ({})) },
}));

import { seedTeacherDemoData } from './seed-teacher-demo.js';

describe('teacher demo activity provenance', () => {
  beforeEach(() => {
    harness.reset();
    harness.concepts.splice(0, harness.concepts.length, ...curriculum.map((item, index) => ({ _id: `concept-${index}`, slug: item.slug })));
    harness.questions.splice(0, harness.questions.length, ...harness.concepts.map((concept, index) => ({ _id: `question-${index}`, conceptId: concept._id, text: { en: `Question ${index}` }, options: [{ isCorrect: true }, { isCorrect: false }] })));
  });

  it('marks newly inserted seed attempts as demo without relabeling existing attempts', async () => {
    await seedTeacherDemoData('class-1');
    expect(harness.attemptWrites.length).toBeGreaterThan(0);
    for (const { update } of harness.attemptWrites) {
      expect(update.$setOnInsert.provenance).toBe('demo');
      expect(update.$set.provenance).toBeUndefined();
    }
  });
});
