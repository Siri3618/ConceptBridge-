import { curriculum, prerequisiteEdges } from './curriculum.js';
import { topologicalOrder, type KnowledgeGraph } from './graph.js';

export interface RecommendationProgress {
  slug: string;
  classLevel: number;
  mastery: number | null;
  nextRevisionAt?: string | Date | null;
}

export interface StudentRecommendations {
  continueConcept?: string;
  challengeConcept?: string;
  revisionConcept?: string;
}

const COMPLETED_MASTERY = 0.8;
const CHALLENGE_MASTERY = 0.8;
const PREREQUISITE_MASTERY = 0.65;

/** Choose curriculum-aware learning next steps using only the student's own progress. */
export function selectStudentRecommendations(
  concepts: readonly RecommendationProgress[],
  classLevel: number,
  now = Date.now(),
): StudentRecommendations {
  const visible = new Map(concepts
    .filter((concept) => concept.classLevel <= classLevel)
    .map((concept) => [concept.slug, concept]));
  const nodes = curriculum.filter((concept) => visible.has(concept.slug)).map((concept) => concept.slug);
  const allowed = new Set(nodes);
  const edges = prerequisiteEdges.filter((edge) => allowed.has(edge.prerequisite) && allowed.has(edge.dependent));
  const graph: KnowledgeGraph = { nodes, edges };
  const order = topologicalOrder(graph);
  const score = (slug: string) => visible.get(slug)?.mastery ?? 0;
  const prereqsByConcept = new Map<string, string[]>();
  for (const edge of edges) prereqsByConcept.set(edge.dependent, [...(prereqsByConcept.get(edge.dependent) ?? []), edge.prerequisite]);

  const revisionConcept = order.find((slug) => {
    const dueAt = visible.get(slug)?.nextRevisionAt;
    return dueAt != null && new Date(dueAt).getTime() <= now;
  });
  const continueConcept = order.find((slug) => slug !== revisionConcept && score(slug) < COMPLETED_MASTERY
    && (prereqsByConcept.get(slug) ?? []).every((prerequisite) => score(prerequisite) >= PREREQUISITE_MASTERY));
  const challengeConcept = [...order].reverse().find((slug) => slug !== continueConcept
    && slug !== revisionConcept
    && score(slug) >= CHALLENGE_MASTERY);

  return { continueConcept, challengeConcept, revisionConcept };
}
