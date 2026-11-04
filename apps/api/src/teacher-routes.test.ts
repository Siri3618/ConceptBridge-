import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  teacher: {} as any,
  created: [] as any[],
  duplicateCodeCount: 0,
  duplicateName: false,
  dashboardClasses: [] as any[],
  roster: [] as any[],
  ownerClass: { _id: '507f1f77bcf86cd799439013', teacherId: '507f1f77bcf86cd799439012' } as any,
  targetStudent: { isActive: true } as any,
  updateResult: { matchedCount: 1, modifiedCount: 1 } as any,
  reset() { this.teacher = {}; this.created = []; this.duplicateCodeCount = 0; this.duplicateName = false; this.dashboardClasses = []; this.roster = []; this.ownerClass = { _id: '507f1f77bcf86cd799439013', teacherId: '507f1f77bcf86cd799439012' }; this.targetStudent = { isActive: true }; this.updateResult = { matchedCount: 1, modifiedCount: 1 }; },
}));

vi.mock('./models.js', () => {
  const query = (value: unknown) => {
    const result: any = { sort: () => result, lean: () => result, populate: () => result, select: () => result, exec: async () => value, then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(value).then(resolve, reject) };
    return result;
  };
  const empty = { find: vi.fn(() => query([])), findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), deleteOne: vi.fn(), deleteMany: vi.fn(), countDocuments: vi.fn(), create: vi.fn() };
  return {
    Alert: empty, Attempt: empty, Concept: empty, DecisionLog: empty, MasteryState: empty, PrerequisiteEdge: empty,
    Question: empty, StreakState: empty, TeacherGroupPlan: empty, TeacherOverride: empty, Worksheet: empty,
    User: { ...empty, find: vi.fn((filter: any) => query(filter.role === 'student' ? harness.roster : [])), findOne: vi.fn((filter: any) => ({ select: () => ({ lean: async () => filter.role === 'teacher' ? harness.teacher : harness.targetStudent }) })), updateOne: vi.fn(async () => harness.updateResult) },
    Classroom: {
      ...empty,
      find: vi.fn(() => query(harness.dashboardClasses)),
      findOne: vi.fn(async () => harness.ownerClass),
      create: vi.fn(async (record: any) => {
        harness.created.push(record);
        if (harness.duplicateCodeCount > 0) { harness.duplicateCodeCount--; throw Object.assign(new Error('duplicate code'), { code: 11000, keyPattern: { code: 1 } }); }
        if (harness.duplicateName) throw Object.assign(new Error('duplicate class name'), { code: 11000, keyPattern: { teacherId: 1, name: 1 } });
        return { _id: '507f1f77bcf86cd799439011', ...record };
      }),
    },
  };
});
vi.mock('./curriculum-cache.js', () => ({ getCurriculumSnapshot: vi.fn(async () => ({ concepts: [], edges: [] })) }));
vi.mock('./progress-signals.js', () => ({ syncProgressSignals: vi.fn(async () => undefined) }));

import { teacherRouter } from './teacher-routes.js';
import { Attempt, Classroom, DecisionLog, MasteryState, StreakState, User } from './models.js';

async function createClassroom(user: any, body: any) {
  const layers = (teacherRouter as any).stack as any[];
  const roleMiddleware = layers.find((layer) => !layer.route)?.handle;
  const route = layers.find((layer) => layer.route?.path === '/classrooms')?.route;
  if (!roleMiddleware || !route) throw new Error('Missing teacher classroom route or role middleware.');
  return new Promise<{ status: number; body: any }>((resolve) => {
    const req: any = { body, params: {}, query: {}, headers: {}, method: 'POST', url: '/classrooms', originalUrl: '/classrooms', baseUrl: '/api/teacher', session: { user } };
    const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { resolve({ status: this.statusCode, body: value }); return this; } };
    const next = (error?: unknown) => resolve({ status: 500, body: { error } });
    roleMiddleware(req, res, () => route.stack[0].handle(req, res, next));
  });
}

async function loadDashboard(user: any) {
  const layers = (teacherRouter as any).stack as any[];
  const roleMiddleware = layers.find((layer) => !layer.route)?.handle;
  const route = layers.find((layer) => layer.route?.path === '/dashboard')?.route;
  if (!roleMiddleware || !route) throw new Error('Missing teacher dashboard route or role middleware.');
  return new Promise<{ status: number; body: any }>((resolve) => {
    const req: any = { body: {}, params: {}, query: {}, headers: {}, method: 'GET', url: '/dashboard', originalUrl: '/dashboard', baseUrl: '/api/teacher', session: { user } };
    const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { resolve({ status: this.statusCode, body: value }); return this; } };
    const next = (error?: unknown) => resolve({ status: 500, body: { error } });
    roleMiddleware(req, res, () => route.stack[0].handle(req, res, next));
  });
}

async function removeStudent(user: any, classId = '507f1f77bcf86cd799439013', studentId = '507f1f77bcf86cd799439014') {
  const layers = (teacherRouter as any).stack as any[];
  const roleMiddleware = layers.find((layer) => !layer.route)?.handle;
  const route = layers.find((layer) => layer.route?.path === '/classrooms/:classId/students/:studentId')?.route;
  if (!roleMiddleware || !route) throw new Error('Missing teacher student-removal route or role middleware.');
  return new Promise<{ status: number; body: any }>((resolve) => {
    const req: any = { body: {}, params: { classId, studentId }, query: {}, headers: {}, method: 'DELETE', url: `/classrooms/${classId}/students/${studentId}`, originalUrl: `/classrooms/${classId}/students/${studentId}`, baseUrl: '/api/teacher', session: { user } };
    const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { resolve({ status: this.statusCode, body: value }); return this; } };
    const next = (error?: unknown) => resolve({ status: 500, body: { error } });
    roleMiddleware(req, res, () => route.stack[0].handle(req, res, next));
  });
}

describe('teacher classroom creation', () => {
  beforeEach(() => { harness.reset(); vi.clearAllMocks(); });

  const teacher = { id: '507f1f77bcf86cd799439012', role: 'teacher', name: 'Verified Teacher', language: 'en', board: 'CBSE' };
  const validInput = { name: 'Class 8 Mathematics', classLevel: 8, board: 'TELANGANA_SCERT' };

  it('creates a classroom owned by the authenticated session teacher with a persistent uppercase code', async () => {
    const result = await createClassroom(teacher, { ...validInput, teacherId: 'attacker-controlled-id' });
    expect(result.status).toBe(201);
    expect(result.body.classroom).toMatchObject({ id: '507f1f77bcf86cd799439011', name: validInput.name, classLevel: 8, board: 'TELANGANA_SCERT' });
    expect(result.body.classroom.code).toMatch(/^CB[A-F0-9]{10}$/);
    expect(harness.created[0]).toMatchObject({ ...validInput, teacherId: teacher.id, code: result.body.classroom.code });
    expect(harness.created[0].teacherId).not.toBe('attacker-controlled-id');
    expect(User.findOne).toHaveBeenCalledWith({ _id: teacher.id, role: 'teacher', isActive: true });
  });

  it.each([
    [{ name: 'X', classLevel: 8, board: 'CBSE' }],
    [{ name: 'Valid name', classLevel: 11, board: 'CBSE' }],
    [{ name: 'Valid name', classLevel: 8, board: 'Unsupported' }],
  ])('rejects invalid classroom input', async (body) => {
    const result = await createClassroom(teacher, body);
    expect(result.status).toBe(400);
    expect(Classroom.create).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated and non-teacher requests', async () => {
    expect((await createClassroom(undefined, validInput)).status).toBe(401);
    expect((await createClassroom({ id: 'admin-1', role: 'admin' }, validInput)).status).toBe(403);
    expect(Classroom.create).not.toHaveBeenCalled();
  });

  it('allows an active teacher without email verification metadata to create a classroom', async () => {
    harness.teacher = {};
    const result = await createClassroom(teacher, validInput);
    expect(result.status).toBe(201);
    expect(harness.created[0].teacherId).toBe(teacher.id);
  });

  it('retries a globally duplicate code with a new generated code', async () => {
    harness.duplicateCodeCount = 1;
    const result = await createClassroom(teacher, validInput);
    expect(result.status).toBe(201);
    expect(harness.created).toHaveLength(2);
    expect(harness.created[0].code).not.toBe(harness.created[1].code);
    expect(harness.created[1].code).toBe(result.body.classroom.code);
  });

  it('returns a safe conflict for a duplicate classroom name without retrying it as a code collision', async () => {
    harness.duplicateName = true;
    const result = await createClassroom(teacher, validInput);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CLASSROOM_CONFLICT');
    expect(harness.created).toHaveLength(1);
  });

  it('includes an active student enrolled through the existing classId relationship in the class roster', async () => {
    harness.dashboardClasses = [{ _id: 'class-10', name: 'Class 10', code: 'DEMO10', classLevel: 10, board: 'CBSE' }];
    harness.roster = [{ _id: 'new-student', name: 'Asha Rao', rollNo: '01', classId: 'class-10', classLevel: 10, language: 'en', isActive: true }];
    const result = await loadDashboard(teacher);
    expect(result.status).toBe(200);
    expect(result.body.students).toHaveLength(1);
    expect(result.body.students[0]).toMatchObject({ id: 'new-student', name: 'Asha Rao', rollNo: '01', classLevel: 10 });
    expect(User.find).toHaveBeenCalledWith({ classId: 'class-10', role: 'student', isActive: true });
  });
});

describe('teacher student removal', () => {
  beforeEach(() => { harness.reset(); vi.clearAllMocks(); });
  const teacher = { id: '507f1f77bcf86cd799439012', role: 'teacher', name: 'Verified Teacher', language: 'en', board: 'CBSE' };

  it('deactivates an enrolled student through the owning teacher and preserves all learning history', async () => {
    const result = await removeStudent(teacher);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ removed: true, alreadyInactive: false });
    expect(User.updateOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439014', classId: '507f1f77bcf86cd799439013', role: 'student', isActive: true }, { $set: { isActive: false } });
    for (const model of [Attempt, MasteryState, StreakState, DecisionLog]) {
      expect(model.updateOne).not.toHaveBeenCalled();
      expect(model.deleteOne).not.toHaveBeenCalled();
      expect(model.deleteMany).not.toHaveBeenCalled();
    }
  });

  it('rejects unauthenticated and non-teacher requests', async () => {
    expect((await removeStudent(undefined)).status).toBe(401);
    expect((await removeStudent({ id: 'admin-1', role: 'admin' })).status).toBe(403);
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('allows an active teacher without email verification metadata to remove an enrolled student', async () => {
    harness.teacher = {};
    const result = await removeStudent(teacher);
    expect(result.status).toBe(200);
    expect(Classroom.findOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439013', teacherId: teacher.id });
  });

  it('rejects a classroom not owned by the requester', async () => {
    harness.ownerClass = null;
    const result = await removeStudent(teacher);
    expect(result.status).toBe(403);
    expect(Classroom.findOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439013', teacherId: teacher.id });
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a student enrolled in another classroom', async () => {
    harness.targetStudent = null;
    const result = await removeStudent(teacher);
    expect(result.status).toBe(404);
    expect(User.findOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439014', classId: '507f1f77bcf86cd799439013', role: 'student' });
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a non-student target', async () => {
    harness.targetStudent = null;
    const result = await removeStudent(teacher, '507f1f77bcf86cd799439013', '507f1f77bcf86cd799439015');
    expect(result.status).toBe(404);
    expect(User.findOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439015', classId: '507f1f77bcf86cd799439013', role: 'student' });
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('returns a safe success for repeated removal', async () => {
    harness.targetStudent = { isActive: false };
    const result = await removeStudent(teacher);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ removed: true, alreadyInactive: true });
    expect(User.updateOne).not.toHaveBeenCalled();
  });
});
