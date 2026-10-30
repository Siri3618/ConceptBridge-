import { curriculum, prerequisiteEdges, validateAcyclic } from '@conceptbridge/engine';
import { Concept, PrerequisiteEdge } from './models.js';

/** Idempotently persists the curriculum and prerequisite edges after validating the static seed DAG. */
export async function seedKnowledgeGraph(): Promise<void> {
  const graph = { nodes: curriculum.map((concept) => concept.slug), edges: prerequisiteEdges };
  validateAcyclic(graph);
  for (const concept of curriculum) {
    await Concept.findOneAndUpdate({ slug: concept.slug }, {
      slug: concept.slug,
      name: concept.name,
      nameTe: concept.nameTe,
      classLevel: concept.classLevel,
      chapters: concept.chapters,
      tags: concept.tags,
    }, { upsert: true, new: true, runValidators: true });
  }
  const concepts = await Concept.find({ slug: { $in: graph.nodes } }).select('_id slug').lean();
  const idBySlug = new Map(concepts.map((concept) => [concept.slug, concept._id]));
  const docs = prerequisiteEdges.map(({ prerequisite, dependent }) => {
    const prerequisiteId = idBySlug.get(prerequisite);
    const dependentId = idBySlug.get(dependent);
    if (!prerequisiteId || !dependentId) throw new Error(`Could not resolve seeded edge ${prerequisite} -> ${dependent}`);
    return { prerequisiteId, dependentId };
  });
  await PrerequisiteEdge.bulkWrite(docs.map((doc) => ({ updateOne: { filter: doc, update: { $setOnInsert: doc }, upsert: true } })));
}
