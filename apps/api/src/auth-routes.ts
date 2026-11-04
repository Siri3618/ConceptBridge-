import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import argon2 from 'argon2';
import { registerTeacherSchema, studentLoginSchema, studentRegistrationSchema, teacherLoginSchema } from '@conceptbridge/shared';
import { Classroom, User } from './models.js';

const router = Router();
const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
const asyncRoute = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res, next).catch(next); };
const registrationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many registration attempts. Please try again later.' } } });
const studentRegistrationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many student registration attempts. Please try again later.' } } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please wait and try again.' } } });
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.post('/teacher/register', registrationLimiter, asyncRoute(async (req, res) => {
  const parsed = registerTeacherSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Enter a name, valid email, and a strong password.');
  let user: any;
  try {
    user = await User.create({
      role: 'teacher', name: parsed.data.name, email: parsed.data.email,
      passwordHash: await argon2.hash(parsed.data.password),
      language: 'en', board: 'CBSE', isActive: true,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return fail(res, 409, 'REGISTRATION_CONFLICT', 'Could not create this account. Sign in or use a different email address.');
    throw error;
  }
  req.session.regenerate((error) => {
    if (error) return fail(res, 500, 'SESSION_ERROR', 'Could not start your session.');
    const sessionUser = { id: user.id, role: 'teacher' as const, name: user.name, language: user.language, board: user.board };
    req.session.user = sessionUser;
    req.session.save((saveError) => saveError
      ? fail(res, 500, 'SESSION_ERROR', 'Could not save your session.')
      : res.status(201).json({ user: publicUser(sessionUser) }));
  });
}));

router.post('/student/register', studentRegistrationLimiter, asyncRoute(async (req, res) => {
  const parsed = studentRegistrationSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Enter a valid classroom code, name, roll number, and matching 4–8 digit PINs.');
  const classroom = await Classroom.findOne({ code: parsed.data.classCode });
  if (!classroom) return fail(res, 404, 'INVALID_CLASS_CODE', 'That classroom code was not found. Check the code and try again.');

  // With no student email/phone, exact name + roll is the available duplicate identity signal across rooms.
  const possibleExistingStudent = await User.exists({
    role: 'student', classId: { $ne: classroom._id }, rollNo: parsed.data.rollNo,
    name: { $regex: `^${escapeRegex(parsed.data.name)}$`, $options: 'i' },
  });
  if (possibleExistingStudent) return fail(res, 409, 'STUDENT_ALREADY_ENROLLED', 'A student with this name and roll number is already enrolled in another classroom. Ask the teacher to confirm your enrollment.');

  try {
    const student = await User.create({
      role: 'student', name: parsed.data.name, rollNo: parsed.data.rollNo,
      classId: classroom._id, classLevel: classroom.classLevel, board: classroom.board,
      language: 'en', isActive: true, pinHash: await argon2.hash(parsed.data.pin),
    });
    return res.status(201).json({ student: { id: String(student._id), name: student.name, rollNo: student.rollNo, classCode: classroom.code, classLevel: classroom.classLevel, board: classroom.board } });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) return fail(res, 409, 'ROLL_NUMBER_TAKEN', 'That roll number is already registered in this classroom. Use your existing login or contact your teacher.');
    throw error;
  }
}));

router.post('/teacher', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = teacherLoginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Enter a valid email and password.');
  const user = await User.findOne({ email: parsed.data.email, role: { $in: ['teacher', 'admin'] }, isActive: true });
  if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, parsed.data.password))) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  req.session.regenerate((error) => {
    if (error) return fail(res, 500, 'SESSION_ERROR', 'Could not start your session.');
    const sessionUser = { id: user.id, role: user.role as 'teacher' | 'admin', name: user.name, language: user.language, board: user.board };
    req.session.user = sessionUser;
    req.session.save((saveError) => saveError ? fail(res, 500, 'SESSION_ERROR', 'Could not save your session.') : res.json({ user: publicUser(sessionUser) }));
  });
}));

router.post('/student', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = studentLoginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Check the class code, roll number and PIN.');
  const classroom = await Classroom.findOne({ code: parsed.data.classCode });
  if (!classroom) return fail(res, 401, 'INVALID_CREDENTIALS', 'Class code, roll number or PIN is incorrect.');
  const user = await User.findOne({ classId: classroom._id, rollNo: parsed.data.rollNo, role: 'student', isActive: true });
  if (!user?.pinHash || !(await argon2.verify(user.pinHash, parsed.data.pin))) return fail(res, 401, 'INVALID_CREDENTIALS', 'Class code, roll number or PIN is incorrect.');
  req.session.regenerate((error) => {
    if (error) return fail(res, 500, 'SESSION_ERROR', 'Could not start your session.');
    const sessionUser = { id: user.id, role: 'student' as const, name: user.name, classId: classroom.id, classLevel: classroom.classLevel, language: user.language, board: classroom.board };
    req.session.user = sessionUser;
    req.session.save((saveError) => saveError ? fail(res, 500, 'SESSION_ERROR', 'Could not save your session.') : res.json({ user: publicUser(sessionUser) }));
  });
}));

function publicUser(user: NonNullable<Request['session']['user']>) {
  return { id: user.id, role: user.role, name: user.name, language: user.language, board: user.board, ...('classLevel' in user && user.classLevel ? { classLevel: user.classLevel } : {}) };
}

export { router as authRouter };
