export type SelectableQuestion = { _id: unknown; difficulty: number };

export function targetQuestionDifficulty(mode: 'diagnostic' | 'learn' | 'solve' | 'test' | 'revise' | 'challenge', mastery: number): number {
  if (mode === 'challenge') return 5;
  if (mode === 'diagnostic' || mode === 'test' || mode === 'revise') return 3;
  return Math.max(1, Math.min(5, Math.floor(mastery * 5) + 1));
}

/** Prefer the target difficulty, avoid recently/previously used items, and only retry intentionally after exhausting a session's bank. */
export function chooseQuestion<T extends SelectableQuestion>(questions: T[], targetDifficulty: number, seenIds: Iterable<unknown>): T | undefined {
  if (!questions.length) return undefined;
  const seen = new Set([...seenIds].map(String));
  const targetPool = questions.filter((question) => Math.abs(question.difficulty - targetDifficulty) <= 1);
  const difficultyPool = targetPool.length ? targetPool : questions;
  return difficultyPool.find((question) => !seen.has(String(question._id)))
    ?? questions.find((question) => !seen.has(String(question._id)))
    ?? difficultyPool[0];
}
