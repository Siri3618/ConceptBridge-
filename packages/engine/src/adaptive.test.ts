import { describe, expect, it } from 'vitest';
import { evaluateAdaptiveTest } from './adaptive-test.js';
import { runDiagnostic } from './diagnostic.js';
import { decideNextActivity, listDecisionRules } from './decisions.js';
import { groupByMastery } from './grouping.js';
import { decayMastery, updateMastery } from './mastery.js';
import { applyRevisionResult, scheduleRevisions } from './revision.js';
import { earnStreakFreeze, recordStreakActivity, type StreakState } from './streak.js';

describe('mastery updates', () => {
  const base = { mastery: 0.4, confidence: 0.2, lastUpdated: 1_000 };
  const evidence = { correct: true, hintsUsed: 0, responseTimeMs: 30_000, expectedTimeSec: 60, selfConfidence: 'sure' as const };
  it('uses reproducible weighted evidence and penalizes hints', () => {
    const noHint = updateMastery(base, evidence, 2_000);
    const hinted = updateMastery(base, { ...evidence, hintsUsed: 3 }, 2_000);
    expect(noHint.estimate.mastery).toBeGreaterThan(hinted.estimate.mastery);
    expect(hinted.hintMultiplier).toBe(0.46);
    expect(noHint.estimate.lastUpdated).toBe(2_000);
  });
  it('gives reduced credit for a correct guess and no mastery credit for sure-wrong', () => {
    const guess = updateMastery(base, { ...evidence, selfConfidence: 'guess' }, 2_000);
    expect(guess.estimate.mastery).toBeLessThan(updateMastery(base, evidence, 2_000).estimate.mastery);
    const sureWrong = updateMastery(base, { ...evidence, correct: false }, 2_000);
    expect(sureWrong.estimate.mastery).toBe(base.mastery);
    expect(sureWrong.conceptCheckRequired).toBe(true);
  });
  it('decays mastery toward uncertainty over time', () => {
    const decayed = decayMastery({ mastery: 1, confidence: 0.8, lastUpdated: 0 }, 90 * 86_400_000);
    expect(decayed.mastery).toBeCloseTo(0.75);
    expect(decayed.confidence).toBeCloseTo(0.4);
  });
});

describe('adaptive diagnostic', () => {
  it('rewinds on a miss, moves ahead on confident correct answers and infers prerequisite evidence', () => {
    const result = runDiagnostic(10, (conceptId, questionIndex) => ({ conceptId, correct: questionIndex !== 0, confidence: 'sure' }), { maxQuestions: 4 });
    expect(result.path).toEqual(['quadratic-equations', 'factorisation', 'polynomials', 'algebraic-expressions']);
    expect(result.inferred).toContain('exponents');
    expect(result.confidence.exponents).toBeLessThan(0.5);
    expect(result.stoppedBy).toBe('max-questions');
  });
  it('keeps the standard diagnostic between 8 and 12 questions', () => {
    const result = runDiagnostic(10, (conceptId, questionIndex) => ({ conceptId, correct: questionIndex > 0, confidence: 'sure' }));
    expect(result.path.length).toBeGreaterThanOrEqual(8);
    expect(result.path.length).toBeLessThanOrEqual(12);
  });
});

describe('explainable decisions', () => {
  it('applies teacher overrides before all engine rules', () => {
    const decision = decideNextActivity({ conceptId: 'fractions', mastery: 0.1, confidence: 0.9, revisionDue: true, teacherOverride: { activity: 'Challenge', conceptId: 'decimals-percentages' } });
    expect(decision).toMatchObject({ activity: 'Challenge', conceptId: 'decimals-percentages', ruleId: 'teacher-override' });
    expect(decision.reason.en).toMatch(/teacher/i);
    expect(decision.reason.te.length).toBeGreaterThan(0);
    expect(listDecisionRules().map((rule) => rule.id)).toContain('root-cause-rewind');
  });
  it('chooses a prerequisite rewind and then practice or test by mastery', () => {
    expect(decideNextActivity({ conceptId: 'linear-equations', mastery: 0.9, confidence: 0.8, rewindTargetId: 'integers-sign-rules' }).conceptId).toBe('integers-sign-rules');
    expect(decideNextActivity({ conceptId: 'fractions', mastery: 0.6, confidence: 0.8 }).activity).toBe('Solve');
    expect(decideNextActivity({ conceptId: 'fractions', mastery: 0.85, confidence: 0.8 }).activity).toBe('Test');
  });
});

describe('early stopping and spaced revision', () => {
  it('keeps a minimum sample and stops early when evidence is decisive', () => {
    expect(evaluateAdaptiveTest([{ correct: true }, { correct: true }]).outcome).toBe('continue');
    expect(evaluateAdaptiveTest(Array.from({ length: 8 }, () => ({ correct: true }))).outcome).toBe('pass');
    expect(evaluateAdaptiveTest(Array.from({ length: 3 }, () => ({ correct: false }))).outcome).toBe('fail');
  });
  it('schedules reviews at 3 and 7 days and lowers forgotten mastery', () => {
    expect(scheduleRevisions(100)).toEqual([100 + 3 * 86_400_000, 100 + 7 * 86_400_000]);
    expect(applyRevisionResult(0.9, false)).toBeCloseTo(0.75);
  });
});

describe('streaks and class grouping', () => {
  it('counts an engaged day once, handles India local dates and awards milestones', () => {
    const empty: StreakState = { current: 0, longest: 0, freezes: 0, history: [] };
    const first = recordStreakActivity(empty, Date.parse('2026-01-01T19:00:00Z'));
    expect(first.state.lastActiveDate).toBe('2026-01-02');
    const duplicate = recordStreakActivity(first.state, Date.parse('2026-01-01T20:00:00Z'));
    expect(duplicate.counted).toBe(false);
    let state = first.state;
    let latest: ReturnType<typeof recordStreakActivity> | undefined;
    for (let day = 1; day <= 2; day++) { latest = recordStreakActivity(state, Date.parse(`2026-01-0${day + 2}T12:00:00+05:30`)); state = latest.state; }
    expect(state.current).toBe(3);
    expect(latest?.milestone).toBe(3);
  });
  it('uses freezes for a missed weekday and caps earned freezes at two', () => {
    const state: StreakState = { current: 4, longest: 4, freezes: 1, lastActiveDate: '2026-01-05', history: ['2026-01-05'] };
    const afterMissedDay = recordStreakActivity(state, Date.parse('2026-01-07T12:00:00+05:30'));
    expect(afterMissedDay.state.current).toBe(5);
    expect(afterMissedDay.state.freezes).toBe(0);
    expect(earnStreakFreeze(earnStreakFreeze({ ...state, freezes: 1 })).freezes).toBe(2);
    const weekend = recordStreakActivity({ ...state, freezes: 0, lastActiveDate: '2026-01-09', history: ['2026-01-09'] }, Date.parse('2026-01-11T12:00:00+05:30'));
    expect(weekend.state.current).toBe(5);
  });
  it('groups students with documented mastery cutoffs', () => {
    expect(groupByMastery([0.82, 0.9]).group).toBe('ready-to-advance');
    expect(groupByMastery([0.2, 0.4]).group).toBe('needs-basics');
    expect(groupByMastery([0.5, 0.7]).group).toBe('on-track');
  });
});
