import './load-env.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import session, { type SessionData } from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import csrf from 'csurf';
import argon2 from 'argon2';
import { studentLoginSchema, teacherLoginSchema } from '@conceptbridge/shared';
import { Classroom, User } from './models.js';
import { studentRouter } from './student-routes.js';
import { teacherRouter } from './teacher-routes.js';
import { adminRouter } from './admin-routes.js';

declare module 'express-session' { interface SessionData { user?: { id: string; role: 'student' | 'teacher' | 'admin'; name: string; classId?: string; classLevel?: number; language: 'en' | 'te'; board: 'CBSE' | 'TELANGANA_SCERT' }; csrfSecret?: string } }
const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
if (isProduction && !process.env.MONGODB_URI) throw new Error('MONGODB_URI is required in production');
if (isProduction && !process.env.WEB_ORIGIN) throw new Error('WEB_ORIGIN is required in production');
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
app.use(express.json({ limit: '32kb' }));
const sessionCookieOptions = { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' as const : 'lax' as const, ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}) };
const sessionStore = process.env.NODE_ENV === 'test' ? undefined : MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: 'sessions', ttl: 60 * 60 * 8 });
app.use(session({ name: 'conceptbridge.sid', secret: sessionSecret, resave: false, saveUninitialized: false, ...(sessionStore ? { store: sessionStore } : {}), cookie: { ...sessionCookieOptions, maxAge: 8 * 60 * 60 * 1000 } }));
app.use((req, res, next) => {
  const identity = req.session.user;
  if (!identity) return next();
  void User.exists({ _id: identity.id, role: identity.role, isActive: true }).then((active) => {
    if (active) return next();
    req.session.destroy((error) => {
      res.clearCookie('conceptbridge.sid', sessionCookieOptions);
      if (error) return next(error);
      return fail(res, 401, 'ACCOUNT_INACTIVE', 'This account is no longer active. Please contact your administrator.');
    });
  }).catch(next);
});
const csrfProtection = csrf();
app.use((req, res, next) => req.path === '/api/health' || req.path === '/api/auth/csrf' ? next() : csrfProtection(req, res, next));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please wait and try again.' } } });
const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
const asyncRoute = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res, next).catch(next); };
const requireAuth = (req: Request, res: Response, next: NextFunction) => req.session.user ? next() : fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
const requireRole = (...roles: NonNullable<SessionData['user']>['role'][]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.user) return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
  return roles.includes(req.session.user.role) ? next() : fail(res, 403, 'FORBIDDEN', 'You do not have access to this area.');
};

app.get('/api/health', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  return res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable', database: ready ? 'connected' : 'disconnected' });
});
app.get('/api/auth/csrf', csrfProtection, (req, res) => res.json({ csrfToken: req.csrfToken(), user: req.session.user ? publicUser(req.session.user) : null }));
app.post('/api/auth/teacher', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = teacherLoginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Enter a valid email and password.');
  const user = await User.findOne({ email: parsed.data.email, role: { $in: ['teacher', 'admin'] }, isActive: true });
  if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, parsed.data.password))) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  req.session.regenerate((error) => { if (error) return fail(res, 500, 'SESSION_ERROR', 'Could not start your session.'); const sessionUser = { id: user.id, role: user.role as 'teacher' | 'admin', name: user.name, language: user.language, board: user.board }; req.session.user = sessionUser; req.session.save((saveError) => saveError ? fail(res, 500, 'SESSION_ERROR', 'Could not save your session.') : res.json({ user: publicUser(sessionUser) })); });
}));
app.post('/api/auth/student', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = studentLoginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Check the class code, roll number and PIN.');
  const classroom = await Classroom.findOne({ code: parsed.data.classCode });
  if (!classroom) return fail(res, 401, 'INVALID_CREDENTIALS', 'Class code, roll number or PIN is incorrect.');
  const user = await User.findOne({ classId: classroom._id, rollNo: parsed.data.rollNo, role: 'student', isActive: true });
  if (!user?.pinHash || !(await argon2.verify(user.pinHash, parsed.data.pin))) return fail(res, 401, 'INVALID_CREDENTIALS', 'Class code, roll number or PIN is incorrect.');
  req.session.regenerate((error) => { if (error) return fail(res, 500, 'SESSION_ERROR', 'Could not start your session.'); const sessionUser = { id: user.id, role: 'student' as const, name: user.name, classId: classroom.id, classLevel: classroom.classLevel, language: user.language, board: classroom.board }; req.session.user = sessionUser; req.session.save((saveError) => saveError ? fail(res, 500, 'SESSION_ERROR', 'Could not save your session.') : res.json({ user: publicUser(sessionUser) })); });
}));
app.get('/api/auth/me', (req, res) => req.session.user ? res.json({ user: publicUser(req.session.user) }) : fail(res, 401, 'UNAUTHENTICATED', 'Please sign in.'));
app.delete('/api/auth/session', (req, res) => { req.session.destroy(() => { res.clearCookie('conceptbridge.sid', sessionCookieOptions); res.status(204).end(); }); });
app.get('/api/classes', requireAuth, requireRole('teacher', 'admin'), asyncRoute(async (req, res) => {
  const teacherId = req.session.user!.role === 'admin' ? undefined : req.session.user!.id;
  const classes = await Classroom.find(teacherId ? { teacherId } : {}).select('name code classLevel board').lean();
  return res.json({ classes: classes.map(item => ({ id: String(item._id), name: item.name, code: item.code, classLevel: item.classLevel, board: item.board })) });
}));
app.use('/api/student', studentRouter);
app.use('/api/teacher', teacherRouter);
app.use('/api/admin', adminRouter);

function publicUser(user: NonNullable<SessionData['user']>) { return { id: user.id, role: user.role, name: user.name, language: user.language, board: user.board, ...(user.classLevel ? { classLevel: user.classLevel } : {}) }; }
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => { if (err && typeof err === 'object' && 'code' in err && err.code === 'EBADCSRFTOKEN') return fail(res, 403, 'CSRF_INVALID', 'Refresh the page and try again.'); console.error(err); return fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.'); });

const port = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'test') mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/conceptbridge').then(() => app.listen(port, () => console.log(`ConceptBridge API listening on ${port}`))).catch((error) => { console.error('MongoDB connection failed', error); process.exit(1); });
export { app };
