import { describe, expect, it } from 'vitest';
import { selectStudentRecommendations, type RecommendationProgress } from './recommendations.js';

const progress = (values: Record<string, number | null>, classLevel = 10): RecommendationProgress[] =>
  Object.entries(values).map(([slug, mastery]) => ({ slug, classLevel: slug === 'whole-numbers-place-value' || slug === 'fractions' ? 6 : 10, mastery }));

describe('student recommendations', () => {
  it('starts a student with no progress at the earliest available prerequisite', () => {
    const result = selectStudentRecommendations(progress({ 'whole-numbers-place-value': null, fractions: null }, 6), 6);
    expect(result).toMatchObject({ continueConcept: 'whole-numbers-place-value' });
    expect(result.challengeConcept).toBeUndefined();
  });

  it('continues to an unlocked concept after prior concepts are completed', () => {
    const result = selectStudentRecommendations(progress({ 'whole-numbers-place-value': 0.9, fractions: null }, 6), 6);
    expect(result.continueConcept).toBe('fractions');
    expect(result.challengeConcept).toBe('whole-numbers-place-value');
  });

  it('selects a prepared challenge distinct from Continue and honors due revision', () => {
    const result = selectStudentRecommendations([
      { slug: 'whole-numbers-place-value', classLevel: 6, mastery: 0.95 },
      { slug: 'fractions', classLevel: 6, mastery: 0.72 },
      { slug: 'decimals-percentages', classLevel: 7, mastery: 0.92, nextRevisionAt: '2026-01-01T00:00:00.000Z' },
      { slug: 'integers-sign-rules', classLevel: 7, mastery: 0.91 },
    ], 7, Date.parse('2026-02-01T00:00:00.000Z'));
    expect(result.continueConcept).toBe('fractions');
    expect(result.revisionConcept).toBe('decimals-percentages');
    expect(result.challengeConcept).toBe('integers-sign-rules');
    expect(result.challengeConcept).not.toBe(result.continueConcept);
  });

  it('keeps a due revision separate from Continue and Challenge', () => {
    const result = selectStudentRecommendations([
      { slug: 'whole-numbers-place-value', classLevel: 6, mastery: 0.7, nextRevisionAt: '2026-01-01T00:00:00.000Z' },
      { slug: 'fractions', classLevel: 6, mastery: 0.7 },
    ], 6, Date.parse('2026-02-01T00:00:00.000Z'));
    expect(result.revisionConcept).toBe('whole-numbers-place-value');
    expect(result.continueConcept).toBe('fractions');
    expect(new Set([result.continueConcept, result.challengeConcept, result.revisionConcept].filter(Boolean)).size).toBe(2);
  });

  it('does not duplicate a sole due concept between Continue and Revise', () => {
    const result = selectStudentRecommendations([
      { slug: 'whole-numbers-place-value', classLevel: 6, mastery: 0.4, nextRevisionAt: '2026-01-01T00:00:00.000Z' },
    ], 6, Date.parse('2026-02-01T00:00:00.000Z'));
    expect(result).toMatchObject({ revisionConcept: 'whole-numbers-place-value' });
    expect(result.continueConcept).toBeUndefined();
    expect(result.challengeConcept).toBeUndefined();
  });

  it('blocks concepts whose prerequisites are not yet sufficiently mastered', () => {
    const result = selectStudentRecommendations([
      { slug: 'whole-numbers-place-value', classLevel: 6, mastery: 0.5 },
      { slug: 'fractions', classLevel: 6, mastery: 0.9 },
      { slug: 'decimals-percentages', classLevel: 7, mastery: null },
    ], 7);
    expect(result.continueConcept).toBe('whole-numbers-place-value');
    expect(result.challengeConcept).toBe('fractions');
  });

  it("does not recommend content above the student's class level", () => {
    const result = selectStudentRecommendations([
      { slug: 'whole-numbers-place-value', classLevel: 6, mastery: 0.9 },
      { slug: 'fractions', classLevel: 6, mastery: 0.9 },
      { slug: 'quadratic-equations', classLevel: 10, mastery: 1 },
    ], 6);
    expect(result.continueConcept).toBeUndefined();
    expect(result.challengeConcept).toBe('fractions');
  });
});
