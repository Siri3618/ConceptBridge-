import { Types } from 'mongoose';
import { curriculum, prerequisiteEdges, validateAcyclic } from '@conceptbridge/engine';
import { buildExplanationText, buildMisconceptionText, buildQuestionDrafts } from './seed-content.js';

export type CurriculumDocument = Record<string, any> & { _id: Types.ObjectId };
export interface CurriculumRecords {
  concepts: CurriculumDocument[];
  misconceptions: CurriculumDocument[];
  questions: CurriculumDocument[];
  explanations: CurriculumDocument[];
  prerequisiteEdges: CurriculumDocument[];
}
export interface InsertPlan { inserts: CurriculumRecords; counts: Record<keyof CurriculumRecords, number>; }
export class CurriculumConflict extends Error { constructor(message: string) { super(message); this.name = 'CurriculumConflict'; } }

const id = (value: unknown) => String(value);
const slugToConceptId = (concepts: CurriculumDocument[]) => new Map(concepts.map((item) => [item.slug as string, item._id]));
const withoutId = (doc: CurriculumDocument) => Object.fromEntries(Object.entries(doc).filter(([key]) => key !== '_id'));
const identityFor = (kind: keyof CurriculumRecords, doc: CurriculumDocument): string => {
  if (kind === 'concepts' || kind === 'misconceptions') return String(doc.slug);
  if (kind === 'questions') return `${id(doc.conceptId)}|${String(doc.difficulty)}|${String(doc.text?.en)}`;
  if (kind === 'explanations') return `${id(doc.conceptId)}|${String(doc.variant)}`;
  return `${id(doc.prerequisiteId)}|${id(doc.dependentId)}`;
};
const normalize = (value: unknown): unknown => {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, normalize(nested)]));
  return value;
};
function projection(actual: unknown, expected: unknown): unknown {
  if (Array.isArray(expected)) return Array.isArray(actual) ? { length: actual.length, items: expected.map((item, index) => projection(actual[index], item)) } : actual;
  if (expected && typeof expected === 'object' && !(expected instanceof Types.ObjectId) && !(expected instanceof Date)) {
    const actualObject = actual && typeof actual === 'object' ? actual as Record<string, unknown> : {};
    return Object.fromEntries(Object.entries(expected as Record<string, unknown>).filter(([key]) => key !== '_id').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, projection(actualObject[key], value)]));
  }
  return normalize(actual);
}

export function expectedConcepts(existingConcepts: CurriculumDocument[]): CurriculumDocument[] {
  return curriculum.map((concept) => {
    const existing = existingConcepts.find((item) => item.slug === concept.slug);
    return { _id: existing?._id ?? new Types.ObjectId(), ...concept } as CurriculumDocument;
  });
}

export function expectedCurriculum(existing: CurriculumRecords): CurriculumRecords {
  validateAcyclic({ nodes: curriculum.map(({ slug }) => slug), edges: prerequisiteEdges });
  if (curriculum.length !== 15 || new Set(curriculum.map(({ slug }) => slug)).size !== curriculum.length) throw new CurriculumConflict('Curriculum source must contain 15 unique concepts.');
  const conceptSlugs = new Set(curriculum.map(({ slug }) => slug));
  if (prerequisiteEdges.some(({ prerequisite, dependent }) => !conceptSlugs.has(prerequisite) || !conceptSlugs.has(dependent))) throw new CurriculumConflict('Curriculum source contains an edge to an unknown concept.');
  const concepts = expectedConcepts(existing.concepts);
  const conceptIdBySlug = slugToConceptId(concepts);
  const misconceptionSlugs = curriculum.flatMap(({ slug }) => [`${slug}-error-a`, `${slug}-error-b`]);
  const misconceptions = curriculum.flatMap((concept) => [0, 1].map((index) => {
    const slug = `${concept.slug}-error-${index === 0 ? 'a' : 'b'}`;
    const old = existing.misconceptions.find((item) => item.slug === slug);
    return { _id: old?._id ?? new Types.ObjectId(), slug, conceptId: conceptIdBySlug.get(concept.slug)!, text: buildMisconceptionText(concept.slug, index) } as CurriculumDocument;
  }));
  const misconceptionIdBySlug = new Map(misconceptions.map((item) => [item.slug as string, item._id]));
  const questionMap = new Map<string, CurriculumDocument>();
  const firstQuestionIdByConcept = new Map<string, Types.ObjectId>();
  for (const concept of curriculum) {
    const conceptId = conceptIdBySlug.get(concept.slug)!;
    for (const item of buildQuestionDrafts(concept.slug)) {
      const misconceptionA = misconceptionIdBySlug.get(`${concept.slug}-error-a`)!;
      const misconceptionB = misconceptionIdBySlug.get(`${concept.slug}-error-b`)!;
      const candidate = {
        conceptId,
        difficulty: item.difficulty,
        type: 'multiple-choice',
        text: { en: item.english.text, te: item.telugu.text },
        options: [
          { text: { en: item.english.answer, te: item.telugu.answer }, isCorrect: true },
          { text: { en: item.english.wrong[0], te: item.telugu.wrong[0] }, isCorrect: false, misconceptionId: misconceptionA },
          { text: { en: item.english.wrong[1], te: item.telugu.wrong[1] }, isCorrect: false, misconceptionId: misconceptionB },
        ],
        answer: item.english.answer,
        expectedTimeSec: 45 + item.index * 10,
        hints: item.english.hints.map((hint, index) => ({ en: hint, te: item.telugu.hints[index]! })),
      } as Record<string, any>;
      const identity = `${id(conceptId)}|${item.difficulty}|${item.english.text}`;
      const previous = questionMap.get(identity);
      const existingQuestion = existing.questions.find((question) => identityFor('questions', question) === identity);
      const planned = { _id: previous?._id ?? existingQuestion?._id ?? new Types.ObjectId(), ...candidate } as CurriculumDocument;
      questionMap.set(identity, planned); // The existing seed's later duplicate iteration updates the same question.
      if (item.index === 0) firstQuestionIdByConcept.set(concept.slug, planned._id);
    }
  }
  const questions = [...questionMap.values()];
  const explanations = curriculum.flatMap((concept) => {
    const checkQuestionId = firstQuestionIdByConcept.get(concept.slug)!;
    const english = buildQuestionDrafts(concept.slug)[0]!.english;
    const telugu = buildQuestionDrafts(concept.slug)[0]!.telugu;
    return (['step-by-step', 'real-life'] as const).map((variant) => {
      const old = existing.explanations.find((item) => id(item.conceptId) === id(conceptIdBySlug.get(concept.slug)) && item.variant === variant);
      return { _id: old?._id ?? new Types.ObjectId(), conceptId: conceptIdBySlug.get(concept.slug)!, variant, text: buildExplanationText(concept.name, english, telugu, variant), checkQuestionId } as CurriculumDocument;
    });
  });
  const edges = prerequisiteEdges.map(({ prerequisite, dependent }) => {
    const prerequisiteId = conceptIdBySlug.get(prerequisite)!;
    const dependentId = conceptIdBySlug.get(dependent)!;
    const old = existing.prerequisiteEdges.find((item) => id(item.prerequisiteId) === id(prerequisiteId) && id(item.dependentId) === id(dependentId));
    return { _id: old?._id ?? new Types.ObjectId(), prerequisiteId, dependentId } as CurriculumDocument;
  });
  if (misconceptions.length !== misconceptionSlugs.length) throw new CurriculumConflict('Curriculum misconception manifest is incomplete.');
  const conceptIds = new Set(concepts.map((item) => id(item._id)));
  const misconceptionIds = new Set(misconceptions.map((item) => id(item._id)));
  const questionIds = new Set(questions.map((item) => id(item._id)));
  if (concepts.length !== 15 || questions.length === 0 || explanations.length !== 30 || edges.length !== prerequisiteEdges.length
    || misconceptions.some((item) => !conceptIds.has(id(item.conceptId)))
    || questions.some((question) => !conceptIds.has(id(question.conceptId)) || question.options.some((option: Record<string, any>) => option.misconceptionId && !misconceptionIds.has(id(option.misconceptionId))))
    || explanations.some((item) => !conceptIds.has(id(item.conceptId)) || !questionIds.has(id(item.checkQuestionId)))
    || edges.some((edge) => !conceptIds.has(id(edge.prerequisiteId)) || !conceptIds.has(id(edge.dependentId)))) {
    throw new CurriculumConflict('Curriculum source contains missing records or unresolved references.');
  }
  return { concepts, misconceptions, questions, explanations, prerequisiteEdges: edges };
}

export function planCurriculumInserts(expected: CurriculumRecords, existing: CurriculumRecords): InsertPlan {
  const kinds = Object.keys(expected) as Array<keyof CurriculumRecords>;
  const conflicts: string[] = [];
  const inserts = {} as CurriculumRecords;
  for (const kind of kinds) {
    const expectedByIdentity = new Map<string, CurriculumDocument>();
    for (const doc of expected[kind]) {
      const identity = identityFor(kind, doc);
      if (expectedByIdentity.has(identity)) conflicts.push(`${kind} expected identity is duplicated: ${identity}`);
      else expectedByIdentity.set(identity, doc);
    }
    const existingByIdentity = new Map<string, CurriculumDocument>();
    for (const doc of existing[kind]) {
      const identity = identityFor(kind, doc);
      if (existingByIdentity.has(identity)) conflicts.push(`${kind} existing identity is duplicated: ${identity}`);
      else existingByIdentity.set(identity, doc);
    }
    const missing: CurriculumDocument[] = [];
    for (const [identity, doc] of expectedByIdentity) {
      const found = existingByIdentity.get(identity);
      if (!found) { missing.push(doc); continue; }
      if (JSON.stringify(projection(withoutId(found), withoutId(doc))) !== JSON.stringify(projection(withoutId(doc), withoutId(doc)))) conflicts.push(`${kind} existing identity conflicts with curriculum source: ${identity}`);
    }
    inserts[kind] = missing;
  }
  if (conflicts.length) throw new CurriculumConflict([...new Set(conflicts)].join('; '));
  return { inserts, counts: Object.fromEntries(kinds.map((kind) => [kind, inserts[kind].length])) as InsertPlan['counts'] };
}
