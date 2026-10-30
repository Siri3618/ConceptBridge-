import { Router, type NextFunction, type Request, type Response } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { adminCreateTeacherSchema } from '@conceptbridge/shared';
import { Classroom, Concept, Explanation, Question, User } from './models.js';

export const adminRouter = Router();
const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
const asyncRoute = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res, next).catch(next); };

adminRouter.use((req, res, next) => req.session.user?.role === 'admin'
  ? next()
  : fail(res, req.session.user ? 403 : 401, req.session.user ? 'FORBIDDEN' : 'UNAUTHENTICATED', 'Administrator access only.'));

adminRouter.get('/overview', asyncRoute(async (_req, res) => {
  const [teachers, teacherCount, activeTeacherCount, classCount, studentCount, concepts] = await Promise.all([
    User.find({ role: 'teacher' }).select('name email board language isActive').sort({ name: 1 }).lean(),
    User.countDocuments({ role: 'teacher' }),
    User.countDocuments({ role: 'teacher', isActive: true }),
    Classroom.countDocuments(),
    User.countDocuments({ role: 'student', isActive: true }),
    Concept.find().sort({ classLevel: 1, name: 1 }).lean(),
  ]);
  const conceptIds = concepts.map((concept) => concept._id);
  const [questionCounts, explanationCounts] = await Promise.all([
    Question.aggregate([{ $match: { conceptId: { $in: conceptIds } } }, { $group: { _id: '$conceptId', count: { $sum: 1 } } }]),
    Explanation.aggregate([{ $match: { conceptId: { $in: conceptIds } } }, { $group: { _id: '$conceptId', count: { $sum: 1 } } }]),
  ]);
  const countMap = (rows: Array<{ _id: unknown; count: number }>) => new Map(rows.map((row) => [String(row._id), row.count]));
  const questionsByConcept = countMap(questionCounts);
  const explanationsByConcept = countMap(explanationCounts);
  return res.json({
    metrics: { teachers: teacherCount, activeTeachers: activeTeacherCount, classes: classCount, students: studentCount },
    teachers: teachers.map((teacher) => ({ id: String(teacher._id), name: teacher.name, email: teacher.email, board: teacher.board, language: teacher.language, active: teacher.isActive })),
    concepts: concepts.map((concept) => ({ id: String(concept._id), name: concept.name, nameTe: concept.nameTe, classLevel: concept.classLevel, chapters: concept.chapters, questions: questionsByConcept.get(String(concept._id)) ?? 0, explanations: explanationsByConcept.get(String(concept._id)) ?? 0 })),
  });
}));

adminRouter.post('/teachers', asyncRoute(async (req, res) => {
  const parsed = adminCreateTeacherSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Enter a teacher name, valid email, and password of at least 12 characters.');
  const email = parsed.data.email.toLowerCase();
  if (await User.exists({ email })) return fail(res, 409, 'EMAIL_IN_USE', 'An account with this email already exists.');
  const teacher = await User.create({ role: 'teacher', name: parsed.data.name, email, passwordHash: await argon2.hash(parsed.data.password), board: parsed.data.board, language: parsed.data.language, isActive: true });
  return res.status(201).json({ teacher: { id: String(teacher._id), name: teacher.name, email: teacher.email, board: teacher.board, language: teacher.language, active: teacher.isActive } });
}));

adminRouter.patch('/teachers/:teacherId/status', asyncRoute(async (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Choose whether the teacher account should be active.');
  const teacherId = typeof req.params.teacherId === 'string' ? req.params.teacherId : req.params.teacherId[0] ?? '';
  if (!/^[a-f\d]{24}$/i.test(teacherId)) return fail(res, 404, 'TEACHER_NOT_FOUND', 'That teacher account could not be found.');
  if (teacherId === req.session.user!.id && !parsed.data.active) return fail(res, 400, 'SELF_DEACTIVATION', 'You cannot deactivate your own administrator account.');
  const teacher = await User.findOneAndUpdate({ _id: teacherId, role: 'teacher' }, { $set: { isActive: parsed.data.active } }, { new: true }).select('name email isActive').lean();
  if (!teacher) return fail(res, 404, 'TEACHER_NOT_FOUND', 'That teacher account could not be found.');
  return res.json({ teacher: { id: String(teacher._id), name: teacher.name, email: teacher.email, active: teacher.isActive } });
}));

