import './load-env.js';
import mongoose, { type Model } from 'mongoose';
import { curriculum, prerequisiteEdges } from '@conceptbridge/engine';
import { Concept, Explanation, Misconception, PrerequisiteEdge, Question } from './models.js';
import { expectedConcepts, expectedCurriculum, planCurriculumInserts, type CurriculumDocument, type CurriculumRecords } from './curriculum-insert-only.js';

const args = process.argv.slice(2);
if (args.some((arg) => !['--apply', '--dry-run'].includes(arg)) || (args.includes('--apply') && args.includes('--dry-run')) || new Set(args).size !== args.length) {
  throw new Error('Use no arguments or --dry-run to inspect; use --apply to insert missing curriculum records.');
}
const apply = args.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is not configured; no database connection was attempted.');

const conceptSlugs = curriculum.map(({ slug }) => slug);
const misconceptionSlugs = curriculum.flatMap(({ slug }) => [`${slug}-error-a`, `${slug}-error-b`]);
const asRecords = (value: Record<string, unknown>[]): CurriculumDocument[] => value as CurriculumDocument[];

async function run() {
  let connected = false;
  try {
    await mongoose.connect(uri!, { autoIndex: false });
    connected = true;
    const concepts = asRecords(await Concept.find({ slug: { $in: conceptSlugs } }).lean() as unknown as Record<string, unknown>[]);
    const expectedConceptSet = expectedConcepts(concepts);
    const conceptIds = expectedConceptSet.map(({ _id }) => _id);
    const sourceEdgeIds = prerequisiteEdges.flatMap(({ prerequisite, dependent }) => [
      expectedConceptSet.find((concept) => concept.slug === prerequisite)!._id,
      expectedConceptSet.find((concept) => concept.slug === dependent)!._id,
    ]);
    const [misconceptions, questions, explanations, edges] = await Promise.all([
      Misconception.find({ slug: { $in: misconceptionSlugs } }).lean(),
      Question.find({ conceptId: { $in: conceptIds } }).lean(),
      Explanation.find({ conceptId: { $in: conceptIds } }).lean(),
      PrerequisiteEdge.find({ prerequisiteId: { $in: sourceEdgeIds }, dependentId: { $in: sourceEdgeIds } }).lean(),
    ]);
    const existing: CurriculumRecords = {
      concepts,
      misconceptions: asRecords(misconceptions as unknown as Record<string, unknown>[]),
      questions: asRecords(questions as unknown as Record<string, unknown>[]),
      explanations: asRecords(explanations as unknown as Record<string, unknown>[]),
      prerequisiteEdges: asRecords(edges as unknown as Record<string, unknown>[]),
    };
    const expected = expectedCurriculum(existing);
    const plan = planCurriculumInserts(expected, existing);
    const total = Object.values(plan.counts).reduce((sum, count) => sum + count, 0);
    console.log(`${apply ? 'Apply preflight passed' : 'Dry run complete'}: concepts=${plan.counts.concepts}, misconceptions=${plan.counts.misconceptions}, questions=${plan.counts.questions}, explanations=${plan.counts.explanations}, prerequisiteedges=${plan.counts.prerequisiteEdges}.`);
    if (!apply) {
      console.log('No database records were written. Add --apply to insert only these missing curriculum records.');
      return;
    }
    if (total === 0) {
      console.log('Curriculum is already complete; no records were inserted.');
      return;
    }
    const createdAt = new Date();
    const insertOnly = async (model: Model<any>, docs: CurriculumDocument[], filter: (doc: CurriculumDocument) => Record<string, unknown>) => {
      for (const doc of docs) await model.updateOne(filter(doc), { $setOnInsert: { ...doc, createdAt, updatedAt: createdAt } }, { upsert: true, timestamps: false });
    };
    await insertOnly(Concept, plan.inserts.concepts, (doc) => ({ slug: doc.slug }));
    await insertOnly(Misconception, plan.inserts.misconceptions, (doc) => ({ slug: doc.slug }));
    await insertOnly(Question, plan.inserts.questions, (doc) => ({ conceptId: doc.conceptId, difficulty: doc.difficulty, 'text.en': doc.text.en }));
    await insertOnly(Explanation, plan.inserts.explanations, (doc) => ({ conceptId: doc.conceptId, variant: doc.variant }));
    await insertOnly(PrerequisiteEdge, plan.inserts.prerequisiteEdges, (doc) => ({ prerequisiteId: doc.prerequisiteId, dependentId: doc.dependentId }));
    console.log('Missing curriculum records inserted. Existing records were preserved; no non-curriculum collections were accessed for writes.');
  } finally {
    if (connected) await mongoose.disconnect();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Production curriculum seeding failed.';
  console.error(message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[MongoDB URI redacted]')
    .replace(/\b(username|user|password|passwd|pwd)=([^&\s]+)/gi, '$1=[REDACTED]'));
  process.exitCode = 1;
});
