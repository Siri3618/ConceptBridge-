import { z } from 'zod';

export const roleSchema = z.enum(['student', 'teacher', 'admin']);
export const languageSchema = z.enum(['en', 'te']).default('en');
export const boardSchema = z.enum(['CBSE', 'TELANGANA_SCERT']).default('CBSE');

export const teacherLoginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});
const classroomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,12}$/);
export const studentLoginSchema = z.object({
  classCode: classroomCodeSchema,
  rollNo: z.string().trim().min(1).max(20),
  pin: z.string().regex(/^\d{4,8}$/),
});
const studentPinSchema = z.string().regex(/^\d{4,8}$/).refine((pin) => {
  const digits = [...pin].map(Number);
  const repeated = digits.every((digit) => digit === digits[0]);
  const ascending = digits.slice(1).every((digit, index) => digit === (digits[index]! + 1) % 10);
  const descending = digits.slice(1).every((digit, index) => digit === (digits[index]! + 9) % 10);
  return !repeated && !ascending && !descending;
}, 'Choose a PIN that is not repeated or sequential.');
export const studentRegistrationSchema = z.object({
  classCode: classroomCodeSchema,
  name: z.string().trim().min(2).max(100),
  rollNo: z.string().trim().min(1).max(20),
  pin: studentPinSchema,
  confirmPin: z.string().max(8),
}).superRefine((data, context) => {
  if (data.pin !== data.confirmPin) context.addIssue({ code: 'custom', path: ['confirmPin'], message: 'PIN confirmation does not match.' });
});
const strongTeacherPasswordSchema = z.string().min(12).max(128)
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/[0-9]/, 'Include a number.')
  .regex(/[^A-Za-z0-9]/, 'Include a symbol.');
export const registerTeacherSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: strongTeacherPasswordSchema,
});
export const createClassroomSchema = z.object({
  name: z.string().trim().min(2).max(80),
  classLevel: z.coerce.number().int().min(6).max(10),
  board: z.enum(['CBSE', 'TELANGANA_SCERT']).default('CBSE'),
});
export const adminCreateTeacherSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  language: z.enum(['en', 'te']).default('en'),
  board: z.enum(['CBSE', 'TELANGANA_SCERT']).default('CBSE'),
});
export const userSchema = z.object({
  id: z.string(), role: roleSchema, name: z.string(), language: languageSchema,
  board: boardSchema.optional(), classLevel: z.number().int().min(6).max(10).optional(),
});
export const apiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export const studentAnswerSchema = z.object({
  clientId: z.string().uuid(), activityId: z.string().uuid(), questionId: z.string().regex(/^[a-f\d]{24}$/i), selectedOption: z.number().int().min(0).max(5),
  confidence: z.enum(['sure', 'unsure', 'guess']), hintsUsed: z.number().int().min(0).max(3), timeMs: z.number().int().min(0).max(3_600_000),
  mode: z.enum(['diagnostic', 'learn', 'solve', 'test', 'revise', 'challenge']),
  clientTimestamp: z.string().datetime().optional(),
});
export const diagnosticCompleteSchema = z.object({ answered: z.number().int().min(8).max(12) });
export type Role = z.infer<typeof roleSchema>;
export type Language = z.infer<typeof languageSchema>;
export type Board = z.infer<typeof boardSchema>;
export type SessionUser = z.infer<typeof userSchema>;
export type TeacherLoginInput = z.infer<typeof teacherLoginSchema>;
export type StudentLoginInput = z.infer<typeof studentLoginSchema>;
