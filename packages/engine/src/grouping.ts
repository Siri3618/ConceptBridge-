import { ENGINE_CONFIG } from './config.js';
export type StudentGroup = 'ready-to-advance' | 'on-track' | 'needs-basics';
export interface GroupingResult { group: StudentGroup; averageMastery: number; weakConcepts: number; suggestedActivity: string }
export function groupByMastery(masteryValues: readonly number[]): GroupingResult {
  const averageMastery = masteryValues.length ? masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length : 0;
  const weakConcepts = masteryValues.filter((value) => value < ENGINE_CONFIG.grouping.basicsBelow).length;
  const group: StudentGroup = averageMastery >= ENGINE_CONFIG.grouping.readyAt && weakConcepts <= ENGINE_CONFIG.grouping.maximumWeakConceptsForReady
    ? 'ready-to-advance'
    : averageMastery < ENGINE_CONFIG.grouping.basicsBelow ? 'needs-basics' : 'on-track';
  const suggestedActivity = group === 'ready-to-advance' ? '10-minute mixed challenge with explain-your-thinking pairs'
    : group === 'needs-basics' ? '10-minute teacher-led prerequisite mini-lesson with worked examples'
    : '10-minute partner practice on the most-missed step';
  return { group, averageMastery, weakConcepts, suggestedActivity };
}
