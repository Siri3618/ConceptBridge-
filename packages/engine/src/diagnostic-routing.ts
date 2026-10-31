import type { GraphEdge } from './graph.js';

export interface DiagnosticRouteConcept { slug: string; classLevel: number }

/** Keep every diagnostic probe within the student's class while allowing short curricula to reach 8 answers. */
export function selectNextDiagnosticConcept(
  concepts: readonly DiagnosticRouteConcept[],
  edges: readonly GraphEdge[],
  classLevel: number,
  currentConcept: string,
  answeredPath: readonly string[],
  correct: boolean,
  confidence: 'sure' | 'unsure' | 'guess',
): string | undefined {
  const available = concepts.filter((concept) => concept.classLevel <= classLevel);
  const allowed = new Set(available.map((concept) => concept.slug));
  const path = new Set(answeredPath);
  const atLevel = available.filter((concept) => concept.classLevel === classLevel);
  const unaskedAtLevel = atLevel.find((concept) => !path.has(concept.slug));
  let next: string | undefined;

  if (!correct) next = edges.find((edge) => edge.dependent === currentConcept && allowed.has(edge.prerequisite) && !path.has(edge.prerequisite))?.prerequisite;
  if (!next && confidence === 'sure') next = unaskedAtLevel?.slug;
  if (!next) next = unaskedAtLevel?.slug ?? available.find((concept) => !path.has(concept.slug))?.slug;
  if (next) return next;
  if (!atLevel.length) return undefined;
  return atLevel[answeredPath.length % atLevel.length]?.slug;
}
