import { describe, expect, it } from 'vitest';
import { classifyAttemptProvenance, countAttemptProvenance } from './attempt-provenance.js';

describe('attempt provenance reporting', () => {
  it('keeps historical attempts without provenance explicitly unclassified', () => {
    expect(classifyAttemptProvenance(undefined)).toBe('unclassified');
    expect(countAttemptProvenance([{ provenance: 'real' }, { provenance: 'demo' }, {}, { provenance: null }]))
      .toEqual({ real: 1, demo: 1, unclassified: 2 });
  });
});
