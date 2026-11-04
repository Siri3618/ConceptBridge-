export type AttemptProvenance = 'real' | 'demo' | 'unclassified';
export type ActivitySourceCounts = Record<AttemptProvenance, number>;

/** Missing provenance is intentionally left unknown; legacy records are never inferred from IDs or accounts. */
export function classifyAttemptProvenance(value: unknown): AttemptProvenance {
  return value === 'real' || value === 'demo' ? value : 'unclassified';
}

export function countAttemptProvenance(attempts: Array<{ provenance?: unknown }>): ActivitySourceCounts {
  return attempts.reduce<ActivitySourceCounts>((counts, attempt) => {
    counts[classifyAttemptProvenance(attempt.provenance)]++;
    return counts;
  }, { real: 0, demo: 0, unclassified: 0 });
}
