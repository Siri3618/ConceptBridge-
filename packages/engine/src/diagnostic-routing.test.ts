import { describe, expect, it } from 'vitest';
import { curriculum, prerequisiteEdges } from './curriculum.js';
import { selectNextDiagnosticConcept } from './diagnostic-routing.js';

describe('diagnostic routing', () => {
  it.each([6, 7, 8, 9, 10])('keeps all eight diagnostic answers within Class %i', (classLevel) => {
    const concepts = curriculum.filter((concept) => concept.classLevel <= classLevel);
    let current = concepts.find((concept) => concept.classLevel === classLevel)!.slug;
    const path: string[] = [];

    for (let answer = 0; answer < 8; answer += 1) {
      expect(concepts.some((concept) => concept.slug === current)).toBe(true);
      path.push(current);
      if (answer < 7) {
        const next = selectNextDiagnosticConcept(concepts, prerequisiteEdges, classLevel, current, path, true, 'unsure');
        expect(next).toBeDefined();
        current = next!;
      }
    }
    expect(path).toHaveLength(8);
  });

  it('repeats only assigned-grade concepts when a short curriculum is exhausted', () => {
    const concepts = curriculum.filter((concept) => concept.classLevel <= 6);
    const gradeSlugs = concepts.filter((concept) => concept.classLevel === 6).map((concept) => concept.slug);
    const path = [...concepts.map((concept) => concept.slug)];
    const next = selectNextDiagnosticConcept(concepts, prerequisiteEdges, 6, path.at(-1)!, path, true, 'unsure');
    expect(gradeSlugs).toContain(next);
  });

  it('does not route a student into a higher-grade prerequisite', () => {
    const concepts = curriculum.filter((concept) => concept.classLevel <= 6);
    const next = selectNextDiagnosticConcept(concepts, prerequisiteEdges, 6, 'fractions', ['fractions'], false, 'unsure');
    expect(concepts.find((concept) => concept.slug === next)?.classLevel).toBeLessThanOrEqual(6);
  });
});
