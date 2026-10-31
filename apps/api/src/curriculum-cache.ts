import { Concept, PrerequisiteEdge } from './models.js';
import { createAsyncTtlCache } from './async-ttl-cache.js';

const CURRICULUM_CACHE_MS = 60_000;
const loadCurriculum = createAsyncTtlCache(async () => {
  const [concepts, edges] = await Promise.all([
    Concept.find().sort({ classLevel: 1, slug: 1 }).lean(),
    PrerequisiteEdge.find().lean(),
  ]);
  return { concepts, edges };
}, CURRICULUM_CACHE_MS);

/** Cache only shared curriculum metadata; student mastery and activity stay uncached. */
export const getCurriculumSnapshot = loadCurriculum;
