export const DECISION_RULES = [
  { id: 'teacher-override', priority: 1, summary: 'Use the teacher-selected activity and concept first.' },
  { id: 'revision-due', priority: 2, summary: 'Revisit mastered concepts when their scheduled review is due.' },
  { id: 'root-cause-rewind', priority: 3, summary: 'Start at the recorded weak prerequisite after a failed concept.' },
  { id: 'learn-low-mastery', priority: 4, summary: 'Build understanding when mastery is below the learn threshold.' },
  { id: 'learn-after-errors', priority: 5, summary: 'Switch to an explanation after repeated recent errors.' },
  { id: 'solve-practice', priority: 6, summary: 'Practise with questions while mastery is developing.' },
  { id: 'test-confirmation', priority: 7, summary: 'Check whether a developing concept is ready to confirm.' },
  { id: 'challenge-mastery', priority: 8, summary: 'Extend learning after mastery is established.' },
] as const;
