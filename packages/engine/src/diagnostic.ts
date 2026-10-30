import { curriculum, prerequisiteEdges } from './curriculum.js';
import { ENGINE_CONFIG } from './config.js';
import { getPrerequisites, type KnowledgeGraph } from './graph.js';

export interface DiagnosticAnswer { conceptId: string; correct: boolean; confidence: 'sure' | 'unsure' | 'guess' }
export interface DiagnosticResult { path: string[]; mastery: Record<string, number>; confidence: Record<string, number>; inferred: string[]; stoppedBy: 'all-estimates-confident' | 'max-questions' }
const defaultGraph: KnowledgeGraph = { nodes: curriculum.map(({ slug }) => slug), edges: prerequisiteEdges };

/** Builds a deterministic adaptive probe sequence from simulated/collected answer evidence. */
export function runDiagnostic(
  classLevel: number,
  answer: (conceptId: string, questionIndex: number) => DiagnosticAnswer,
  options: { maxQuestions?: number; concepts?: typeof curriculum; graph?: KnowledgeGraph } = {},
): DiagnosticResult {
  const concepts = options.concepts ?? curriculum;
  const graph = options.graph ?? defaultGraph;
  const maxQuestions = Math.min(12, Math.max(1, options.maxQuestions ?? ENGINE_CONFIG.diagnostic.maxQuestions));
  const path: string[] = [];
  const mastery: Record<string, number> = {};
  const confidence: Record<string, number> = {};
  const inferred = new Set<string>();
  let pendingPrerequisites: string[] = [];
  const classConcepts = concepts.filter((item) => item.classLevel === classLevel);
  if (!classConcepts.length) throw new Error(`No diagnostic concepts configured for Class ${classLevel}`);
  let current = classConcepts[0]!.slug;
  let stoppedBy: DiagnosticResult['stoppedBy'] = 'max-questions';
  for (let i = 0; i < maxQuestions; i++) {
    if (!current || path.filter((id) => id === current).length > 0) {
      const nextUnprobed = classConcepts.find((item) => !path.includes(item.slug));
      const inferredToProbe = [...inferred].find((id) => !path.includes(id));
      if (!nextUnprobed && !inferredToProbe && path.length >= ENGINE_CONFIG.diagnostic.minimumQuestions) { stoppedBy = 'all-estimates-confident'; break; }
      current = nextUnprobed?.slug ?? inferredToProbe ?? classConcepts[path.length % classConcepts.length]!.slug;
    }
    const response = answer(current, i);
    if (response.conceptId !== current) throw new Error(`Diagnostic answer ${i + 1} is for ${response.conceptId}; expected ${current}`);
    path.push(current);
    inferred.delete(current);
    const isConfident = response.confidence === 'sure';
    mastery[current] = response.correct ? (isConfident ? 0.9 : 0.72) : 0.2;
    confidence[current] = isConfident ? 0.8 : 0.45;
    if (!response.correct) {
      const prereqs = getPrerequisites(current, graph).filter((id) => !path.includes(id));
      if (prereqs.length) {
        pendingPrerequisites = [...prereqs.slice(1), ...pendingPrerequisites.filter((id) => !prereqs.includes(id))];
        current = prereqs[0]!;
      }
      else current = classConcepts.find((item) => !path.includes(item.slug))?.slug ?? '';
    } else if (isConfident) {
      for (const prerequisite of getPrerequisites(current, graph)) {
        if (mastery[prerequisite] === undefined) { mastery[prerequisite] = 0.72; confidence[prerequisite] = ENGINE_CONFIG.diagnostic.inferredConfidence; inferred.add(prerequisite); }
      }
      current = pendingPrerequisites.shift()
        ?? concepts.find((item) => item.classLevel > classLevel && !path.includes(item.slug))?.slug
        ?? classConcepts.find((item) => !path.includes(item.slug))?.slug ?? '';
    } else current = classConcepts.find((item) => !path.includes(item.slug))?.slug ?? '';
  }
  if (path.length < maxQuestions && path.length >= ENGINE_CONFIG.diagnostic.minimumQuestions && !classConcepts.some((item) => !path.includes(item.slug))) stoppedBy = 'all-estimates-confident';
  return { path, mastery, confidence, inferred: [...inferred], stoppedBy };
}
