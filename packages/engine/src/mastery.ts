import { ENGINE_CONFIG } from './config.js';

export type AnswerConfidence = 'sure' | 'unsure' | 'guess';
export interface MasteryEstimate { mastery: number; confidence: number; lastUpdated?: number }
export interface MasteryEvidence {
  correct: boolean;
  hintsUsed: number;
  responseTimeMs: number;
  expectedTimeSec: number;
  selfConfidence: AnswerConfidence;
}
export interface MasteryUpdate { estimate: MasteryEstimate; masteryDelta: number; hintMultiplier: number; responseMultiplier: number; conceptCheckRequired: boolean }
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Transparent weighted update: delta = learningRate × (target − mastery) × hintMultiplier ×
 * responseMultiplier. Correct targets are 1.0 (sure), 0.88 (unsure), or 0.68 (guess); an
 * incorrect answer targets 0. A sure-wrong answer is treated as a confident misconception and
 * gets zero mastery change while requesting a concept check. Hints reduce the change by 18%
 * each, with a 46% floor. Very fast/slow answers have smaller influence. Estimate confidence
 * increases with evidence and is kept separate from mastery.
 */
export function updateMastery(current: MasteryEstimate, evidence: MasteryEvidence, now: number): MasteryUpdate {
  const hintsUsed = Math.max(0, Math.min(3, Math.floor(evidence.hintsUsed)));
  const hintMultiplier = Math.max(ENGINE_CONFIG.mastery.minimumHintMultiplier, 1 - hintsUsed * ENGINE_CONFIG.mastery.hintPenaltyPerHint);
  const ratio = evidence.responseTimeMs / Math.max(1, evidence.expectedTimeSec * 1000);
  const responseMultiplier = ratio < ENGINE_CONFIG.mastery.fastResponseRatio
    ? ENGINE_CONFIG.mastery.fastResponseMultiplier
    : ratio > ENGINE_CONFIG.mastery.slowResponseRatio ? ENGINE_CONFIG.mastery.slowResponseMultiplier : 1;
  const conceptCheckRequired = !evidence.correct && evidence.selfConfidence === 'sure';
  const target = !evidence.correct ? 0 : evidence.selfConfidence === 'guess' ? ENGINE_CONFIG.mastery.guessCorrectTarget : evidence.selfConfidence === 'unsure' ? ENGINE_CONFIG.mastery.unsureCorrectTarget : 1;
  const masteryDelta = conceptCheckRequired ? 0 : ENGINE_CONFIG.mastery.learningRate * (target - clamp01(current.mastery)) * hintMultiplier * responseMultiplier;
  const evidenceWeight = evidence.selfConfidence === 'guess' ? 0.5 : evidence.selfConfidence === 'unsure' ? 0.8 : 1;
  const confidence = clamp01(current.confidence + ENGINE_CONFIG.mastery.confidenceGain * evidenceWeight * (conceptCheckRequired ? 1 : responseMultiplier));
  return { estimate: { mastery: clamp01(current.mastery + masteryDelta), confidence, lastUpdated: now }, masteryDelta, hintMultiplier, responseMultiplier, conceptCheckRequired };
}

/** Exponential time decay toward uncertainty (0.5), with a 90-day half-life by default. */
export function decayMastery(estimate: MasteryEstimate, now: number): MasteryEstimate {
  if (estimate.lastUpdated === undefined || now <= estimate.lastUpdated) return { ...estimate };
  const days = (now - estimate.lastUpdated) / 86_400_000;
  const retained = Math.pow(0.5, days / ENGINE_CONFIG.mastery.decayHalfLifeDays);
  return { ...estimate, mastery: clamp01(0.5 + (estimate.mastery - 0.5) * retained), confidence: clamp01(estimate.confidence * retained), lastUpdated: now };
}
