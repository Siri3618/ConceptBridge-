import { describe, expect, it } from 'vitest';
import { adminCreateTeacherSchema, studentLoginSchema, teacherLoginSchema } from './index';

describe('shared auth validation', () => {
  it('normalizes a shared-device class code', () => {
    expect(studentLoginSchema.parse({ classCode: 'demo10', rollNo: '01', pin: '1001' }).classCode).toBe('DEMO10');
  });
  it('rejects malformed student PINs and teacher email addresses', () => {
    expect(studentLoginSchema.safeParse({ classCode: 'DEMO10', rollNo: '01', pin: '1x' }).success).toBe(false);
    expect(teacherLoginSchema.safeParse({ email: 'not-an-email', password: 'password123' }).success).toBe(false);
  });
  it('requires a long initial password for admin-created teachers', () => {
    expect(adminCreateTeacherSchema.safeParse({ name: 'Teacher One', email: 'teacher@example.school', password: 'shortpass' }).success).toBe(false);
    expect(adminCreateTeacherSchema.parse({ name: 'Teacher One', email: 'teacher@example.school', password: 'long-password-123' }).board).toBe('CBSE');
  });
});
