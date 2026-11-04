import { describe, expect, it } from 'vitest';
import { adminCreateTeacherSchema, createClassroomSchema, registerTeacherSchema, studentLoginSchema, studentRegistrationSchema, teacherLoginSchema } from './index';

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

  it('normalizes registration emails and enforces the registration password policy', () => {
    expect(registerTeacherSchema.parse({ name: 'Teacher One', email: ' Teacher@Example.School ', password: 'StrongTeacher2026!' }).email).toBe('teacher@example.school');
    expect(registerTeacherSchema.safeParse({ name: 'Teacher One', email: 'teacher@example.school', password: 'weakpassword' }).success).toBe(false);
    expect(teacherLoginSchema.parse({ email: ' TEACHER@EXAMPLE.SCHOOL ', password: 'LearnMath2026!' }).email).toBe('teacher@example.school');
  });

  it('validates classroom creation levels, names, and boards', () => {
    expect(createClassroomSchema.parse({ name: 'Class 6', classLevel: '6', board: 'CBSE' })).toMatchObject({ name: 'Class 6', classLevel: 6, board: 'CBSE' });
    expect(createClassroomSchema.safeParse({ name: 'X', classLevel: 5, board: 'CBSE' }).success).toBe(false);
    expect(createClassroomSchema.safeParse({ name: 'Class 6', classLevel: 6, board: 'OTHER' }).success).toBe(false);
  });

  it('normalizes and validates student registration without student contact fields', () => {
    const parsed = studentRegistrationSchema.parse({ classCode: ' demo10 ', name: ' Asha Rao ', rollNo: ' 01 ', pin: '4826', confirmPin: '4826' });
    expect(parsed).toMatchObject({ classCode: 'DEMO10', name: 'Asha Rao', rollNo: '01' });
    expect(studentRegistrationSchema.safeParse({ classCode: 'DEMO10', name: 'A', rollNo: '', pin: '4826', confirmPin: '4826' }).success).toBe(false);
    expect(studentRegistrationSchema.safeParse({ classCode: 'DEMO10', name: 'Asha', rollNo: '01', pin: '4826', confirmPin: '4827' }).success).toBe(false);
    expect(studentRegistrationSchema.safeParse({ classCode: 'DEMO10', name: 'Asha', rollNo: '01', pin: '1111', confirmPin: '1111' }).success).toBe(false);
    expect(studentRegistrationSchema.safeParse({ classCode: 'DEMO10', name: 'Asha', rollNo: '01', pin: '1234', confirmPin: '1234' }).success).toBe(false);
  });
});
