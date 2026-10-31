import { describe, expect, it } from 'vitest';
import { resolveTeacherStudentClassLevel } from './teacher-class-level.js';

describe('teacher student class level', () => {
  it.each([6, 7, 8, 9, 10])('preserves an assigned Class %i level', (classLevel) => {
    expect(resolveTeacherStudentClassLevel(classLevel, 6)).toBe(classLevel);
  });

  it('uses the owned classroom level when a legacy student has no class level', () => {
    expect(resolveTeacherStudentClassLevel(undefined, 10)).toBe(10);
    expect(resolveTeacherStudentClassLevel(null, 8)).toBe(8);
  });
});
