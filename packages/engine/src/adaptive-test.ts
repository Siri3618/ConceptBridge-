import { ENGINE_CONFIG } from './config.js';
export interface TestResult { correct: boolean }
export interface TestDecision { stop: boolean; outcome: 'pass' | 'fail' | 'continue'; questionsAsked: number; logLikelihoodRatio: number; reason: string }

/** Sequential probability ratio test: H1 is mastery >= 0.8; H0 is mastery <= 0.5. */
export function evaluateAdaptiveTest(results: readonly TestResult[], options: { minimumQuestions?: number; maximumQuestions?: number; passProbability?: number; failProbability?: number; falsePassRate?: number; falseFailRate?: number } = {}): TestDecision {
  const min = options.minimumQuestions ?? ENGINE_CONFIG.test.minimumQuestions;
  const max = options.maximumQuestions ?? ENGINE_CONFIG.test.maximumQuestions;
  const p1 = options.passProbability ?? ENGINE_CONFIG.test.passProbability;
  const p0 = options.failProbability ?? ENGINE_CONFIG.test.failProbability;
  const alpha = options.falsePassRate ?? ENGINE_CONFIG.test.falsePassRate;
  const beta = options.falseFailRate ?? ENGINE_CONFIG.test.falseFailRate;
  const sample = results.slice(0, max);
  const llr = sample.reduce((sum, item) => sum + Math.log(item.correct ? p1 / p0 : (1 - p1) / (1 - p0)), 0);
  const upper = Math.log((1 - beta) / alpha);
  const lower = Math.log(beta / (1 - alpha));
  if (sample.length < min) return { stop: false, outcome: 'continue', questionsAsked: sample.length, logLikelihoodRatio: llr, reason: `Collect at least ${min} answers before deciding.` };
  if (llr >= upper) return { stop: true, outcome: 'pass', questionsAsked: sample.length, logLikelihoodRatio: llr, reason: 'Evidence is strong enough to confirm mastery.' };
  if (llr <= lower) return { stop: true, outcome: 'fail', questionsAsked: sample.length, logLikelihoodRatio: llr, reason: 'Evidence shows this concept needs more support.' };
  if (sample.length >= max) return { stop: true, outcome: llr >= 0 ? 'pass' : 'fail', questionsAsked: sample.length, logLikelihoodRatio: llr, reason: 'The maximum number of questions was reached; use the stronger evidence direction.' };
  return { stop: false, outcome: 'continue', questionsAsked: sample.length, logLikelihoodRatio: llr, reason: 'One more answer will make the decision clearer.' };
}
