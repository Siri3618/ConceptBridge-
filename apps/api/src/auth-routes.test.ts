import { beforeEach, describe, expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({
  created: [] as any[],
  createError: undefined as any,
  loginUser: undefined as any,
  otherClassStudent: undefined as any,
  classroom: { id: 'class-10', _id: 'class-10', code: 'DEMO10', classLevel: 10, board: 'CBSE' } as any,
  student: undefined as any,
  existsResult: { _id: 'teacher-1' } as any,
  reset() {
    this.created = []; this.createError = undefined; this.loginUser = undefined; this.otherClassStudent = undefined;
    this.student = undefined; this.classroom = { id: 'class-10', _id: 'class-10', code: 'DEMO10', classLevel: 10, board: 'CBSE' }; this.existsResult = { _id: 'teacher-1' };
  },
}));

vi.mock('./models.js', () => ({
  User: {
    create: vi.fn(async (values: any) => {
      if (harness.createError) throw harness.createError;
      if (values.role === 'student' && harness.created.some((existing: any) => existing.role === 'student' && String(existing.classId) === String(values.classId) && existing.rollNo === values.rollNo)) throw Object.assign(new Error('duplicate key'), { code: 11000, keyPattern: { classId: 1, rollNo: 1 } });
      harness.created.push(values);
      const id = values.role === 'student' ? `student-${values.rollNo}` : 'teacher-1';
      return { id, _id: id, ...values };
    }),
    findOne: vi.fn((filter: any) => {
      if (filter.role?.$in) return Promise.resolve(harness.loginUser);
      if (filter.role === 'student' && filter.classId) {
        const registered = harness.created.find((row: any) => row.role === 'student' && String(row.classId) === String(filter.classId) && row.rollNo === filter.rollNo);
        return Promise.resolve(registered ? { id: `student-${registered.rollNo}`, _id: `student-${registered.rollNo}`, ...registered } : harness.student);
      }
      if (filter.role === 'student') return Promise.resolve(harness.student);
      return Promise.resolve(null);
    }),
    exists: vi.fn(async (filter: any) => filter?.role === 'student' ? harness.otherClassStudent : harness.existsResult),
  },
  Classroom: { findOne: vi.fn(async () => harness.classroom) },
}));
vi.mock('argon2', () => ({ default: { hash: vi.fn(async (value: string) => `argon2:${value}`), verify: vi.fn(async () => true) } }));
import { authRouter } from './auth-routes.js';
import { User } from './models.js';

async function callRoute(path: string, body: any) {
  const route = (authRouter as any).stack.find((layer: any) => layer.route?.path === path)?.route;
  if (!route) throw new Error(`Missing auth route ${path}`);
  const handle = route.stack.at(-1).handle;
  const session: any = { regenerate: (callback: (error?: Error | null) => void) => callback(null), save: (callback: (error?: Error | null) => void) => callback(null) };
  return new Promise<{ status: number; body: any; session: any }>((resolve) => {
    const req: any = { body, params: {}, query: {}, headers: {}, method: 'POST', url: path, originalUrl: path, baseUrl: '/api/auth', session };
    const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { resolve({ status: this.statusCode, body: value, session }); return this; } };
    const next = (error?: unknown) => resolve({ status: error && typeof error === 'object' && 'status' in error ? Number((error as any).status) : 500, body: { error }, session });
    handle(req, res, next);
  });
}

describe('teacher registration and login', () => {
  beforeEach(() => { harness.reset(); vi.clearAllMocks(); });

  it('registers a teacher with a hashed password and starts an authenticated session immediately', async () => {
    const result = await callRoute('/teacher/register', { name: 'New Teacher', email: ' New.Teacher@Example.com ', password: 'StrongTeacher2026!' });
    expect(result.status).toBe(201);
    expect(harness.created[0]).toMatchObject({ role: 'teacher', name: 'New Teacher', email: 'new.teacher@example.com', passwordHash: 'argon2:StrongTeacher2026!', isActive: true });
    expect(harness.created[0]).not.toHaveProperty('emailVerificationRequired');
    expect(harness.created[0]).not.toHaveProperty('emailVerificationTokens');
    expect(result.session.user).toMatchObject({ id: 'teacher-1', role: 'teacher', name: 'New Teacher' });
    expect(result.body.user).toMatchObject({ id: 'teacher-1', role: 'teacher', name: 'New Teacher' });
    expect(result.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects invalid registration data before creating an account', async () => {
    const result = await callRoute('/teacher/register', { name: 'T', email: 'bad-email', password: 'weakpassword' });
    expect(result.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('handles a duplicate email race without exposing database details', async () => {
    harness.createError = Object.assign(new Error('duplicate key'), { code: 11000 });
    const result = await callRoute('/teacher/register', { name: 'New Teacher', email: 'taken@example.com', password: 'StrongTeacher2026!' });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('REGISTRATION_CONFLICT');
    expect(JSON.stringify(result.body)).not.toContain('duplicate key');
  });

  it('allows a newly registered teacher to log in without verification metadata', async () => {
    harness.loginUser = { id: 'teacher-1', role: 'teacher', name: 'New Teacher', email: 'new.teacher@example.com', passwordHash: 'argon2:StrongTeacher2026!', language: 'en', board: 'CBSE' };
    const registration = await callRoute('/teacher/register', { name: 'New Teacher', email: 'new.teacher@example.com', password: 'StrongTeacher2026!' });
    const result = await callRoute('/teacher', { email: 'new.teacher@example.com', password: 'StrongTeacher2026!' });
    expect(registration.status).toBe(201);
    expect(result.status).toBe(200);
    expect(result.session.user).toMatchObject({ id: 'teacher-1', role: 'teacher', name: 'New Teacher' });
  });

  it('allows a legacy teacher flagged as awaiting verification to log in', async () => {
    harness.loginUser = { id: 'legacy', role: 'teacher', name: 'Legacy Teacher', emailVerificationRequired: true, passwordHash: 'hash', language: 'en', board: 'CBSE' };
    const result = await callRoute('/teacher', { email: 'pending@example.com', password: 'StrongTeacher2026!' });
    expect(result.status).toBe(200);
    expect(result.session.user).toMatchObject({ id: 'legacy', role: 'teacher' });
  });

  it.each([
    { role: 'teacher', name: 'Demo Teacher', email: 'teacher@conceptbridge.demo' },
    { role: 'admin', name: 'Administrator', email: 'admin@example.com' },
  ])('keeps existing $role accounts without verification metadata able to sign in', async ({ role, name, email }) => {
    harness.loginUser = { id: 'existing', role, name, email, passwordHash: 'hash', language: 'en', board: 'CBSE' };
    const result = await callRoute('/teacher', { email, password: 'LearnMath2026!' });
    expect(result.status).toBe(200);
    expect(result.session.user).toMatchObject({ id: 'existing', role, name });
  });

  it('keeps DEMO10 student authentication unchanged', async () => {
    harness.student = { id: 'student-10-01', name: 'Student 01', pinHash: 'pin-hash', language: 'en' };
    const result = await callRoute('/student', { classCode: 'DEMO10', rollNo: '01', pin: '1001' });
    expect(result.status).toBe(200);
    expect(result.session.user).toMatchObject({ id: 'student-10-01', role: 'student', classId: 'class-10', classLevel: 10 });
  });

  it('rejects student login when the account has been deactivated', async () => {
    harness.student = undefined;
    const result = await callRoute('/student', { classCode: 'DEMO10', rollNo: '01', pin: '1001' });
    expect(result.status).toBe(401);
    expect(User.findOne).toHaveBeenCalledWith({ classId: 'class-10', rollNo: '01', role: 'student', isActive: true });
    expect(result.session.user).toBeUndefined();
  });

});

describe('student self-registration and classroom enrollment', () => {
  beforeEach(() => { harness.reset(); vi.clearAllMocks(); });

  const registration = { classCode: ' demo10 ', name: 'Asha Rao', rollNo: ' 01 ', pin: '4826', confirmPin: '4826' };

  it('creates an Argon2-hashed student account linked to the resolved classroom only', async () => {
    const result = await callRoute('/student/register', { ...registration, role: 'teacher', classId: 'attacker-class', teacherId: 'attacker-teacher', pinHash: 'attacker-hash', emailVerificationRequired: true });
    expect(result.status).toBe(201);
    expect(harness.created[0]).toMatchObject({ role: 'student', name: 'Asha Rao', rollNo: '01', classId: 'class-10', classLevel: 10, board: 'CBSE', language: 'en', isActive: true, pinHash: 'argon2:4826' });
    expect(harness.created[0]).not.toHaveProperty('pin');
    expect(harness.created[0]).not.toHaveProperty('confirmPin');
    expect(harness.created[0]).not.toHaveProperty('emailVerificationRequired');
    expect(result.body.student).toEqual({ id: 'student-01', name: 'Asha Rao', rollNo: '01', classCode: 'DEMO10', classLevel: 10, board: 'CBSE' });
    expect(JSON.stringify(result.body)).not.toContain('argon2:4826');
    expect(JSON.stringify(result.body)).not.toContain('4826');
  });

  it('rejects an unknown classroom code before creating an account', async () => {
    harness.classroom = null;
    const result = await callRoute('/student/register', registration);
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('INVALID_CLASS_CODE');
    expect(User.create).not.toHaveBeenCalled();
  });

  it.each([
    { ...registration, name: 'A' },
    { ...registration, rollNo: '   ' },
    { ...registration, pin: '4826', confirmPin: '4827' },
    { ...registration, pin: '1234', confirmPin: '1234' },
  ])('rejects invalid student registration data', async (body) => {
    const result = await callRoute('/student/register', body);
    expect(result.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate roll numbers without overwriting the existing student', async () => {
    harness.createError = Object.assign(new Error('duplicate key'), { code: 11000, keyPattern: { classId: 1, rollNo: 1 } });
    const result = await callRoute('/student/register', registration);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('ROLL_NUMBER_TAKEN');
    expect(result.body.error.message).not.toContain('duplicate key');
  });

  it('handles concurrent repeat registration through the classroom roll-number unique index', async () => {
    const [first, second] = await Promise.all([callRoute('/student/register', registration), callRoute('/student/register', registration)]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(harness.created.filter((row: any) => row.role === 'student')).toHaveLength(1);
  });

  it('does not create a duplicate identity or transfer a student already enrolled elsewhere', async () => {
    harness.otherClassStudent = { _id: 'existing-student' };
    const result = await callRoute('/student/register', registration);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('STUDENT_ALREADY_ENROLLED');
    expect(User.exists).toHaveBeenCalledWith(expect.objectContaining({ role: 'student', classId: { $ne: 'class-10' }, rollNo: '01' }));
    expect(User.create).not.toHaveBeenCalled();
  });

  it('allows the newly registered student to log in with the chosen classroom code, roll number, and PIN', async () => {
    const registered = await callRoute('/student/register', registration);
    const login = await callRoute('/student', { classCode: 'DEMO10', rollNo: '01', pin: '4826' });
    expect(registered.status).toBe(201);
    expect(login.status).toBe(200);
    expect(login.session.user).toMatchObject({ id: 'student-01', role: 'student', classId: 'class-10', classLevel: 10 });
  });
});
