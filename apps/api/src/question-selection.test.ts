import { describe, expect, it } from 'vitest';
import { chooseQuestion } from './question-selection.js';

describe('question selection', () => {
  const questions = Array.from({ length: 6 }, (_, index) => ({ _id: `q${index + 1}`, difficulty: index + 1 }));

  it('uses a near-target difficulty and avoids all question repeats in a session', () => {
    const seen: string[] = [];
    for (let index = 0; index < questions.length; index++) {
      const question = chooseQuestion(questions, 3, seen)!;
      expect(seen).not.toContain(question._id);
      seen.push(question._id);
    }
    expect(new Set(seen).size).toBe(questions.length);
  });

  it('only repeats after the available bank has been exhausted', () => {
    expect(chooseQuestion(questions.slice(1, 3), 3, ['q2', 'q3'])?._id).toBe('q2');
  });
});
