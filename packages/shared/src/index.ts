import { z } from 'zod';

export const roleSchema = z.enum(['student', 'teacher', 'admin']);
export const languageSchema = z.enum(['en', 'te']).default('en');
export const boardSchema = z.enum(['CBSE', 'TELANGANA_SCERT']).default('CBSE');

export const teacherLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});
export const studentLoginSchema = z.object({
  classCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,12}$/),
  rollNo: z.string().trim().min(1).max(20),
  pin: z.string().regex(/^\d{4,8}$/),
});
export const registerTeacherSchema = teacherLoginSchema.extend({
  name: z.string().trim().min(2).max(100),
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
