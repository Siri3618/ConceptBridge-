import { describe, expect, it } from 'vitest';
import { selectOfflineChallengeQuestion, type CachedQuestion } from './offline';

const question = (id: string, difficulty: number): CachedQuestion => ({
  id, conceptId: 'sample', difficulty, text: { en: id }, expectedTimeSec: 60,
  options: [], hints: [],
});

describe('offline Challenge question selection', () => {
  it('prefers difficulty 5 and cycles through equally difficult cached questions', () => {
    const questions = [question('easy', 1), question('near', 4), question('hard-a', 5), question('hard-b', 5)];
    expect(selectOfflineChallengeQuestion(questions, 0)?.id).toBe('hard-a');
    expect(selectOfflineChallengeQuestion(questions, 1)?.id).toBe('hard-b');
  });

  it('falls back to the closest available difficulty when difficulty 5 is absent', () => {
    const questions = [question('easy', 1), question('near-a', 4), question('near-b', 4), question('middle', 3)];
    expect(selectOfflineChallengeQuestion(questions, 0)?.id).toBe('near-a');
    expect(selectOfflineChallengeQuestion(questions, 1)?.id).toBe('near-b');
  });

  it('returns no question for an empty cached pack', () => {
    expect(selectOfflineChallengeQuestion([], 0)).toBeUndefined();
  });
});
