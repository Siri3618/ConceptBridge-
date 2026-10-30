export interface GraphEdge { prerequisite: string; dependent: string }
export interface KnowledgeGraph { nodes: string[]; edges: GraphEdge[] }
export interface RootCause { rootCauseId: string; path: string[]; reason: string }

function adjacency(graph: KnowledgeGraph, reverse = false): Map<string, string[]> {
  const map = new Map(graph.nodes.map((id) => [id, [] as string[]]));
  for (const edge of graph.edges) {
    const from = reverse ? edge.dependent : edge.prerequisite;
    const to = reverse ? edge.prerequisite : edge.dependent;
    if (!map.has(from) || !map.has(to)) throw new Error(`Graph edge references unknown concept: ${from} -> ${to}`);
    map.get(from)!.push(to);
  }
  return map;
}

export function topologicalOrder(graph: KnowledgeGraph): string[] {
  const next = adjacency(graph);
  const indegree = new Map(graph.nodes.map((id) => [id, 0]));
  for (const edge of graph.edges) indegree.set(edge.dependent, (indegree.get(edge.dependent) ?? 0) + 1);
  const ready = graph.nodes.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  for (let i = 0; i < ready.length; i++) {
    const current = ready[i]!;
    order.push(current);
    for (const dependent of next.get(current) ?? []) {
      const remaining = indegree.get(dependent)! - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }
  if (order.length !== graph.nodes.length) {
    const cyclic = graph.nodes.filter((id) => (indegree.get(id) ?? 0) > 0);
    throw new Error(`Knowledge graph contains a cycle involving: ${cyclic.join(', ')}`);
  }
  return order;
}

export function validateAcyclic(graph: KnowledgeGraph): true {
  topologicalOrder(graph);
  return true;
}

/** Returns unique prerequisite concepts, nearest first. A depth of 1 returns direct prerequisites. */
export function getPrerequisites(conceptId: string, graph: KnowledgeGraph, depth = Number.POSITIVE_INFINITY): string[] {
  if (!graph.nodes.includes(conceptId)) throw new Error(`Unknown concept: ${conceptId}`);
  if (depth <= 0) return [];
  const prior = adjacency(graph, true);
  const seen = new Set<string>([conceptId]);
  const result: string[] = [];
  let frontier = [conceptId];
  let level = 0;
  while (frontier.length && level < depth) {
    const following: string[] = [];
    for (const current of frontier) for (const prerequisite of prior.get(current) ?? []) {
      if (!seen.has(prerequisite)) { seen.add(prerequisite); result.push(prerequisite); following.push(prerequisite); }
    }
    frontier = following;
    level++;
  }
  return result;
}

/** Returns unique dependent concepts, nearest first. A depth of 1 returns direct dependents. */
export function getDependents(conceptId: string, graph: KnowledgeGraph, depth = Number.POSITIVE_INFINITY): string[] {
  if (!graph.nodes.includes(conceptId)) throw new Error(`Unknown concept: ${conceptId}`);
  if (depth <= 0) return [];
  const next = adjacency(graph);
  const seen = new Set<string>([conceptId]);
  const result: string[] = [];
  let frontier = [conceptId];
  let level = 0;
  while (frontier.length && level < depth) {
    const following: string[] = [];
    for (const current of frontier) for (const dependent of next.get(current) ?? []) {
      if (!seen.has(dependent)) { seen.add(dependent); result.push(dependent); following.push(dependent); }
    }
    frontier = following;
    level++;
  }
  return result;
}

/**
 * Walk backward from a failed concept and choose the most foundational weak prerequisite.
 * Only concepts with a recorded mastery estimate are considered; mastery below 0.6 is weak.
 * When multiple weak nodes are equally distant, the
 * lexically earlier concept id wins. The returned path is ordered failed concept -> root cause.
 */
export function findRootCause(failedConcept: string, masteryMap: ReadonlyMap<string, number>, graph: KnowledgeGraph, weakThreshold = ENGINE_CONFIG.mastery.weakPrerequisite): RootCause {
  if (!graph.nodes.includes(failedConcept)) throw new Error(`Unknown concept: ${failedConcept}`);
  const prior = adjacency(graph, true);
  const queue: Array<{ id: string; distance: number; path: string[] }> = [{ id: failedConcept, distance: 0, path: [failedConcept] }];
  const visited = new Set<string>([failedConcept]);
  const weak: Array<{ id: string; distance: number; path: string[] }> = [];
  while (queue.length) {
    const current = queue.shift()!;
    for (const prerequisite of prior.get(current.id) ?? []) {
      if (visited.has(prerequisite)) continue;
      visited.add(prerequisite);
      const path = [...current.path, prerequisite];
      const candidate = { id: prerequisite, distance: current.distance + 1, path };
      const mastery = masteryMap.get(prerequisite);
      if (mastery !== undefined && mastery < weakThreshold) weak.push(candidate);
      queue.push(candidate);
    }
  }
  if (!weak.length) return { rootCauseId: failedConcept, path: [failedConcept], reason: 'No weak prerequisite was found; work on the failed concept.' };
  weak.sort((a, b) => b.distance - a.distance || a.id.localeCompare(b.id));
  const chosen = weak[0]!;
  return { rootCauseId: chosen.id, path: chosen.path, reason: `A prerequisite has mastery below ${weakThreshold}; start with the deepest weak prerequisite.` };
}
import { ENGINE_CONFIG } from './config.js';
