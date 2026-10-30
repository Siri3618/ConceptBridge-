import { describe, expect, it } from 'vitest';
import { demoStudentName, demoStudentNames } from './demo-students.js';

describe('demo student identities', () => {
  it('provides one unique name for each of the 40 demo rolls', () => {
    expect(demoStudentNames).toHaveLength(40);
    expect(new Set(demoStudentNames).size).toBe(40);
    expect(Array.from({ length: 40 }, (_, i) => demoStudentName(String(i + 1)))).toEqual([...demoStudentNames]);
  });

  it('does not assign an identity to invalid rolls', () => {
    expect(demoStudentName('00')).toBeUndefined();
    expect(demoStudentName('41')).toBeUndefined();
  });
});
