import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { CurriculumConflict, expectedCurriculum, planCurriculumInserts, type CurriculumRecords } from './curriculum-insert-only.js';

const emptyRecords = (): CurriculumRecords => ({ concepts: [], misconceptions: [], questions: [], explanations: [], prerequisiteEdges: [] });
describe('insert-only curriculum planning', () => {
  it('plans all missing curriculum records and their references', () => {
    const existing = emptyRecords();
    const expected = expectedCurriculum(existing);
    const plan = planCurriculumInserts(expected, existing);

    expect(plan.counts).toEqual({ concepts: 15, misconceptions: 30, questions: 87, explanations: 30, prerequisiteEdges: 20 });
    const conceptIds = new Set(expected.concepts.map((concept) => String(concept._id)));
    const misconceptionIds = new Set(expected.misconceptions.map((item) => String(item._id)));
    const questionIds = new Set(expected.questions.map((item) => String(item._id)));
    expect(expected.prerequisiteEdges.every((edge) => conceptIds.has(String(edge.prerequisiteId)) && conceptIds.has(String(edge.dependentId)))).toBe(true);
    expect(expected.questions.every((question) => question.options.filter((option: Record<string, unknown>) => option.misconceptionId).every((option: Record<string, unknown>) => misconceptionIds.has(String(option.misconceptionId))))).toBe(true);
    expect(expected.explanations.every((item) => conceptIds.has(String(item.conceptId)) && questionIds.has(String(item.checkQuestionId)))).toBe(true);
  });

  it('plans no inserts when matching records already exist', () => {
    const existing = expectedCurriculum(emptyRecords());
    const expected = expectedCurriculum(existing);
    const plan = planCurriculumInserts(expected, existing);
    expect(Object.values(plan.counts).every((count) => count === 0)).toBe(true);
  });

  it('stops when a matching identity has conflicting content', () => {
    const conflict = expectedCurriculum(emptyRecords());
    conflict.concepts[0]!.name = 'Unexpected concept name';
    expect(() => planCurriculumInserts(expectedCurriculum(conflict), conflict)).toThrow(CurriculumConflict);
  });

  it('stops when existing identities are duplicated', () => {
    const existing = expectedCurriculum(emptyRecords());
    existing.questions.push({ ...existing.questions[0]!, _id: new Types.ObjectId() });
    expect(() => planCurriculumInserts(expectedCurriculum(existing), existing)).toThrow(/existing identity is duplicated/);
  });

  it('stops if the expected source contains duplicate identities', () => {
    const existing = emptyRecords();
    const expected = expectedCurriculum(existing);
    expected.explanations.push({ ...expected.explanations[0]!, _id: new Types.ObjectId() });
    expect(() => planCurriculumInserts(expected, existing)).toThrow(/expected identity is duplicated/);
  });
});
