import { describe, expect, it } from 'vitest';
import { curriculum, prerequisiteEdges } from './curriculum';
import { findRootCause, getDependents, getPrerequisites, topologicalOrder, validateAcyclic, type KnowledgeGraph } from './graph';

const graph: KnowledgeGraph = { nodes: curriculum.map(({ slug }) => slug), edges: prerequisiteEdges };

describe('seed knowledge graph', () => {
  it('contains the 15 requested concepts and is acyclic', () => {
    expect(curriculum).toHaveLength(15);
    expect(validateAcyclic(graph)).toBe(true);
    const order = topologicalOrder(graph);
    for (const edge of graph.edges) expect(order.indexOf(edge.prerequisite)).toBeLessThan(order.indexOf(edge.dependent));
  });
  it('traverses prerequisite and dependent chains without duplicates', () => {
    expect(getPrerequisites('quadratic-equations', graph, 1)).toEqual(['factorisation', 'polynomials']);
    expect(getPrerequisites('quadratic-equations', graph)).toContain('integers-sign-rules');
    expect(getDependents('triangles-similarity', graph)).toEqual(['basic-trigonometry']);
  });
  it('finds the deepest weak root cause and gives the rewind path', () => {
    const result = findRootCause('linear-equations', new Map([['algebraic-expressions', 0.2], ['integers-sign-rules', 0.1]]), graph);
    expect(result.rootCauseId).toBe('integers-sign-rules');
    expect(result.path).toEqual(['linear-equations', 'algebraic-expressions', 'integers-sign-rules']);
  });
  it('rejects a cycle with the concepts involved', () => {
    expect(() => topologicalOrder({ nodes: ['a', 'b'], edges: [{ prerequisite: 'a', dependent: 'b' }, { prerequisite: 'b', dependent: 'a' }] })).toThrow(/cycle/i);
  });
});
