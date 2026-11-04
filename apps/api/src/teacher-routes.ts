import { Router, type NextFunction, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createClassroomSchema } from '@conceptbridge/shared';
import { decideNextActivity, decayMastery, findRootCause, groupByMastery, updateMastery, type KnowledgeGraph } from '@conceptbridge/engine';
import { Alert, Attempt, Classroom, Concept, DecisionLog, MasteryState, PrerequisiteEdge, Question, StreakState, TeacherGroupPlan, TeacherOverride, User, Worksheet } from './models.js';
import { syncProgressSignals } from './progress-signals.js';
import { getCurriculumSnapshot } from './curriculum-cache.js';
import { resolveTeacherStudentClassLevel } from './teacher-class-level.js';
import { classifyAttemptProvenance, countAttemptProvenance } from './attempt-provenance.js';

const router = Router();
const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
const asyncRoute = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res, next).catch(next); };
router.use((req, res, next) => req.session.user?.role === 'teacher' || req.session.user?.role === 'admin' ? next() : fail(res, req.session.user ? 403 : 401, req.session.user ? 'FORBIDDEN' : 'UNAUTHENTICATED', req.session.user ? 'Teacher access only.' : 'Please sign in.'));

async function ownedClass(req: Request, classId: string) {
  const teacherId = req.session.user!.role === 'admin' ? undefined : req.session.user!.id;
  return Classroom.findOne({ _id: classId, ...(teacherId ? { teacherId } : {}) });
}
async function graphForClass() {
  const { concepts, edges } = await getCurriculumSnapshot();
  const slugById = new Map(concepts.map((item) => [String(item._id), item.slug]));
  const graph: KnowledgeGraph = { nodes: concepts.map((item) => item.slug), edges: edges.map((edge) => ({ prerequisite: slugById.get(String(edge.prerequisiteId))!, dependent: slugById.get(String(edge.dependentId))! })).filter((edge) => edge.prerequisite && edge.dependent) };
  return { concepts, edges, graph };
}
function planTemplate(group: string) {
  if (group === 'ready-to-advance') return '10-minute mixed challenge: students solve two unfamiliar problems and explain their strategy to a partner.';
  if (group === 'needs-basics') return '10-minute teacher-led prerequisite mini-lesson: model one worked example, then solve two together.';
  return '10-minute partner practice: solve three questions on the most-missed step and compare reasoning.';
}

function generateClassroomCode() {
  // `CB` + 40 random bits gives a short code accepted by the existing student login schema.
  return `CB${randomBytes(5).toString('hex').toUpperCase()}`;
}

function duplicateKey(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && error.code === 11000 ? error as { keyPattern?: Record<string, number>; keyValue?: Record<string, unknown> } : null;
}

router.post('/classrooms', asyncRoute(async (req, res) => {
  const identity = req.session.user;
  if (identity?.role !== 'teacher') return fail(res, identity ? 403 : 401, identity ? 'FORBIDDEN' : 'UNAUTHENTICATED', identity ? 'Only teachers can create classrooms.' : 'Please sign in.');
  const parsed = createClassroomSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Enter a classroom name, class level from 6 to 10, and a supported board.');

  const teacher = await User.findOne({ _id: identity.id, role: 'teacher', isActive: true }).select('_id').lean();
  if (!teacher) return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in again.');

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateClassroomCode();
    try {
      const classroom = await Classroom.create({ ...parsed.data, code, teacherId: identity.id });
      return res.status(201).json({ classroom: { id: String(classroom._id), name: classroom.name, code: classroom.code, classLevel: classroom.classLevel, board: classroom.board } });
    } catch (error) {
      const duplicate = duplicateKey(error);
      if (!duplicate) throw error;
      if (duplicate.keyPattern?.code || duplicate.keyValue?.code !== undefined) {
        if (attempt < 4) continue;
        return fail(res, 503, 'CLASS_CODE_UNAVAILABLE', 'Could not generate a classroom code. Please try again.');
      }
      return fail(res, 409, 'CLASSROOM_CONFLICT', 'A classroom with this name already exists. Choose a different name.');
    }
  }
  return fail(res, 503, 'CLASS_CODE_UNAVAILABLE', 'Could not generate a classroom code. Please try again.');
}));

router.delete('/classrooms/:classId/students/:studentId', asyncRoute(async (req, res) => {
  const identity = req.session.user;
  if (identity?.role !== 'teacher') return fail(res, identity ? 403 : 401, identity ? 'FORBIDDEN' : 'UNAUTHENTICATED', identity ? 'Only teachers can remove students.' : 'Please sign in.');
  const classId = typeof req.params.classId === 'string' ? req.params.classId : '';
  const studentId = typeof req.params.studentId === 'string' ? req.params.studentId : '';
  if (!/^[a-f\d]{24}$/i.test(classId) || !/^[a-f\d]{24}$/i.test(studentId)) return fail(res, 400, 'VALIDATION_ERROR', 'Check the classroom and student, then try again.');

  const teacher = await User.findOne({ _id: identity.id, role: 'teacher', isActive: true }).select('_id').lean();
  if (!teacher) return fail(res, 401, 'UNAUTHENTICATED', 'Please sign in again.');

  const classroom = await ownedClass(req, classId);
  if (!classroom) return fail(res, 403, 'FORBIDDEN', 'This class is not assigned to your account.');

  const studentFilter = { _id: studentId, classId: classroom._id, role: 'student' };
  const student = await User.findOne(studentFilter).select('isActive').lean();
  if (!student) return fail(res, 404, 'STUDENT_NOT_FOUND', 'That student is not enrolled in this class.');
  if (!student.isActive) return res.json({ removed: true, alreadyInactive: true });

  const result = await User.updateOne({ ...studentFilter, isActive: true }, { $set: { isActive: false } });
  // A concurrent removal is equivalent to this request succeeding. No learning
  // records are changed; only the account's existing access flag is updated.
  if (result.matchedCount === 0) return res.json({ removed: true, alreadyInactive: true });
  return res.json({ removed: true, alreadyInactive: result.modifiedCount === 0 });
}));

router.get('/dashboard', asyncRoute(async (req, res) => {
  const classes = await Classroom.find(req.session.user!.role === 'admin' ? {} : { teacherId: req.session.user!.id }).sort({ classLevel: 1, name: 1 }).lean();
  if (!classes.length) return res.json({ classes: [], classroom: null, concepts: [], students: [], groups: [], misconceptions: [], alerts: [] });
  const requestedId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
  const classroom = requestedId ? classes.find((item) => String(item._id) === requestedId) : classes[0];
  if (!classroom) return fail(res, 404, 'CLASS_NOT_FOUND', 'That class is not assigned to your account.');
  const studentsPromise = User.find({ classId: classroom._id, role: 'student', isActive: true }).sort({ rollNo: 1 }).lean().exec();
  const [students, curriculum, allStates, plans, alerts] = await Promise.all([
    studentsPromise,
    graphForClass(),
    studentsPromise.then((rows) => MasteryState.find({ studentId: { $in: rows.map((student) => student._id) } }).populate('conceptId').lean()),
    TeacherGroupPlan.find({ classId: classroom._id }).lean(),
    Alert.find({ classId: classroom._id, acknowledgedAt: { $exists: false } }).populate('studentId').sort({ createdAt: -1 }).lean(),
  ]);
  const concepts = curriculum.concepts.filter((item) => item.classLevel <= classroom.classLevel);
  const classConceptIds = new Set(concepts.map((item) => String(item._id)));
  const edges = curriculum.edges.filter((edge) => classConceptIds.has(String(edge.prerequisiteId)) && classConceptIds.has(String(edge.dependentId)));
  const statesByStudent = new Map<string, Map<string, number>>();
  for (const row of allStates as any[]) {
    const studentKey = String(row.studentId);
    const map = statesByStudent.get(studentKey) ?? new Map<string, number>();
    if (row.conceptId?.slug) map.set(row.conceptId.slug, row.mastery);
    statesByStudent.set(studentKey, map);
  }
  const dashboardStudents = students.map((student, index) => {
    const values = concepts.map((concept) => statesByStudent.get(String(student._id))?.get(concept.slug) ?? 0);
    const grouping = groupByMastery(values);
    const stateMap = statesByStudent.get(String(student._id)) ?? new Map<string, number>();
    return { id: String(student._id), name: student.name, rollNo: student.rollNo ?? String(index + 1), classLevel: student.classLevel ?? classroom.classLevel, language: student.language, lastActiveAt: student.lastActiveAt ?? null, group: grouping.group, mastery: Object.fromEntries(stateMap), overallMastery: grouping.averageMastery, weakConcepts: grouping.weakConcepts, streak: 0, values: concepts.map((concept) => stateMap.get(concept.slug) ?? null) };
  });
  const classStudentIds = students.map((student) => student._id);
  const conceptSlugById = new Map(concepts.map((concept) => [String(concept._id), concept.slug]));
  const [streaks, misconceptionAttempts] = await Promise.all([
    StreakState.find({ studentId: { $in: classStudentIds } }).lean(),
    Attempt.find({ studentId: { $in: classStudentIds } }).populate('misconceptionId').populate({ path: 'questionId', populate: { path: 'conceptId' } }).lean(),
  ]);
  const streakMap = new Map((streaks as any[]).map((item) => [String(item.studentId), item.current]));
  for (const student of dashboardStudents) student.streak = streakMap.get(student.id) ?? 0;
  const groupNames = ['ready-to-advance', 'on-track', 'needs-basics'] as const;
  const savedPlans = new Map(plans.map((plan) => [plan.group, plan]));
  const groups = groupNames.map((group) => {
    const members = dashboardStudents.filter((student) => student.group === group);
    const saved = savedPlans.get(group);
    return { group, count: members.length, studentIds: members.map((student) => student.id), activity: saved?.activity ?? planTemplate(group), approved: saved?.approved ?? false, updatedAt: (saved as any)?.updatedAt ?? null };
  });
  const activitySources = countAttemptProvenance(misconceptionAttempts as any[]);
  const misconceptionMap = new Map<string, { id: string; text: any; conceptId: string; conceptName: string; students: Set<string>; count: number; activitySources: { real: number; demo: number; unclassified: number } }>();
  for (const attempt of misconceptionAttempts as any[]) {
    const provenance = classifyAttemptProvenance(attempt.provenance);
    const misconception = attempt.misconceptionId;
    if (!misconception) continue;
    const key = String(misconception._id);
    const row = misconceptionMap.get(key) ?? { id: key, text: misconception.text, conceptId: misconception.conceptId?.slug ?? attempt.questionId?.conceptId?.slug ?? '', conceptName: attempt.questionId?.conceptId?.name ?? 'Maths concept', students: new Set<string>(), count: 0, activitySources: { real: 0, demo: 0, unclassified: 0 } };
    row.count++;
    row.activitySources[provenance]++;
    row.students.add(String(attempt.studentId));
    misconceptionMap.set(key, row);
  }
  const misconceptionRows = [...misconceptionMap.values()].map((row) => ({ id: row.id, text: row.text, conceptId: row.conceptId, conceptName: row.conceptName, studentCount: row.students.size, attemptCount: row.count, activitySources: row.activitySources })).sort((a, b) => b.studentCount - a.studentCount);
  for (const row of misconceptionRows) {
    const studentId = [...(misconceptionMap.get(row.id)?.students ?? [])][0];
    const sampleMap = studentId ? statesByStudent.get(studentId) ?? new Map<string, number>() : new Map<string, number>();
    const root = row.conceptId ? findRootCause(row.conceptId, sampleMap, { nodes: concepts.map((item) => item.slug), edges: edges.map((edge) => ({ prerequisite: conceptSlugById.get(String(edge.prerequisiteId))!, dependent: conceptSlugById.get(String(edge.dependentId))! })).filter((edge) => edge.prerequisite && edge.dependent) }) : null;
    (row as typeof row & { likelyRootCause?: string }).likelyRootCause = root?.rootCauseId ?? row.conceptId;
  }
  const apiAlerts = (alerts as any[]).map((alert) => ({ id: String(alert._id), studentId: alert.studentId?._id ? String(alert.studentId._id) : '', studentName: alert.studentId?.name ?? 'Student', type: alert.type, message: alert.message, createdAt: alert.createdAt }));
  return res.json({
    classes: classes.map((item) => ({ id: String(item._id), name: item.name, classLevel: item.classLevel, board: item.board })),
    classroom: { id: String(classroom._id), name: classroom.name, code: classroom.code, classLevel: classroom.classLevel, board: classroom.board },
    concepts: concepts.map((item) => ({ id: String(item._id), slug: item.slug, name: item.name, nameTe: item.nameTe, classLevel: item.classLevel, chapter: item.chapters?.[classroom.board] ?? item.chapters?.CBSE ?? '' })),
    edges: edges.map((edge) => ({ prerequisiteId: String(edge.prerequisiteId), dependentId: String(edge.dependentId) })),
    students: dashboardStudents,
    groups,
    activitySources,
    masteryAttribution: 'cumulative-not-source-attributed',
    misconceptions: misconceptionRows,
    alerts: apiAlerts,
  });
}));

router.get('/students/:studentId', asyncRoute(async (req, res) => {
  const student = await User.findOne({ _id: req.params.studentId, role: 'student' }).lean();
  if (!student) return fail(res, 404, 'STUDENT_NOT_FOUND', 'That student could not be found.');
  const classroom = await ownedClass(req, String(student.classId));
  if (!classroom) return fail(res, 403, 'FORBIDDEN', 'This student is not in one of your classes.');
  const classLevel = resolveTeacherStudentClassLevel(student.classLevel, classroom.classLevel);
  const [concepts, states, attempts, decisions, streak, graphData] = await Promise.all([
    Concept.find({ classLevel: { $lte: classLevel } }).sort({ classLevel: 1 }).lean(),
    MasteryState.find({ studentId: student._id }).populate('conceptId').lean(),
    Attempt.find({ studentId: student._id }).populate({ path: 'questionId', populate: { path: 'conceptId' } }).populate('misconceptionId').sort({ createdAt: -1 }).limit(30).lean(),
    DecisionLog.find({ studentId: student._id }).sort({ createdAt: -1 }).limit(30).lean(),
    StreakState.findOne({ studentId: student._id }).lean(),
    graphForClass(),
  ]);
  const stateBySlug = new Map((states as any[]).filter((row) => row.conceptId?.slug).map((row) => [row.conceptId.slug, row]));
  const masteryMap = new Map([...stateBySlug.entries()].map(([slug, row]) => [slug, row.mastery]));
  const latestFailed = (attempts as any[]).find((item) => !item.correct && item.questionId?.conceptId?.slug);
  const rewind = latestFailed ? findRootCause(latestFailed.questionId.conceptId.slug, masteryMap, graphData.graph) : null;
  return res.json({
    student: { id: String(student._id), name: student.name, rollNo: student.rollNo, classLevel, language: student.language, lastActiveAt: student.lastActiveAt ?? null },
    concepts: concepts.map((concept) => { const state = stateBySlug.get(concept.slug); return { id: String(concept._id), slug: concept.slug, name: concept.name, nameTe: concept.nameTe, classLevel: concept.classLevel, mastery: state?.mastery ?? null, baselineMastery: state?.baselineMastery ?? null, confidence: state?.confidence ?? 0, nextRevisionAt: state?.nextRevisionAt ?? null }; }),
    rewind: rewind ? { ...rewind, names: rewind.path.map((slug) => concepts.find((item) => item.slug === slug)?.name ?? slug) } : null,
    misconceptions: (attempts as any[]).filter((item) => item.misconceptionId).map((item) => ({ text: item.misconceptionId.text, concept: item.questionId?.conceptId?.name, date: item.createdAt })),
    attempts: (attempts as any[]).map((item) => ({ id: String(item._id), concept: item.questionId?.conceptId?.name ?? 'Maths', question: item.questionId?.text, correct: item.correct, confidence: item.confidence, hintsUsed: item.hintsUsed, misconception: item.misconceptionId?.text ?? null, mode: item.mode, provenance: item.provenance === 'real' || item.provenance === 'demo' ? item.provenance : 'unclassified', date: item.createdAt })),
    decisions,
    streak: streak ?? { current: 0, longest: 0, freezes: 0, history: [] },
  });
}));

router.post('/group-plans', asyncRoute(async (req, res) => {
  const parsed = z.object({ classId: z.string().regex(/^[a-f\d]{24}$/i), group: z.enum(['ready-to-advance', 'on-track', 'needs-basics']), activity: z.string().trim().min(8).max(500), approved: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Check the group plan and try again.');
  if (!await ownedClass(req, parsed.data.classId)) return fail(res, 403, 'FORBIDDEN', 'This class is not assigned to your account.');
  const plan = await TeacherGroupPlan.findOneAndUpdate({ classId: parsed.data.classId, group: parsed.data.group }, { $set: { ...parsed.data, teacherId: req.session.user!.id, updatedBy: req.session.user!.id } }, { upsert: true, new: true, runValidators: true });
  return res.json({ plan: { group: plan.group, activity: plan.activity, approved: plan.approved, updatedAt: (plan as any).updatedAt } });
}));

router.post('/overrides', asyncRoute(async (req, res) => {
  const parsed = z.object({ classId: z.string().regex(/^[a-f\d]{24}$/i), conceptId: z.string().min(1), target: z.enum(['student', 'class', 'group']), studentId: z.string().regex(/^[a-f\d]{24}$/i).optional(), group: z.enum(['ready-to-advance', 'on-track', 'needs-basics']).optional(), action: z.enum(['assign', 'lock', 'skip']), activity: z.enum(['Learn', 'Solve', 'Test', 'Revise', 'Challenge']).optional() }).superRefine((data, ctx) => {
    if (data.target === 'student' && !data.studentId) ctx.addIssue({ code: 'custom', message: 'Select a student.', path: ['studentId'] });
    if (data.target === 'group' && !data.group) ctx.addIssue({ code: 'custom', message: 'Select a group.', path: ['group'] });
    if (data.action !== 'skip' && !data.activity) ctx.addIssue({ code: 'custom', message: 'Select an activity.', path: ['activity'] });
  }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Choose a target, concept and teacher action.');
  if (!await ownedClass(req, parsed.data.classId)) return fail(res, 403, 'FORBIDDEN', 'This class is not assigned to your account.');
  const concept = await Concept.findOne({ slug: parsed.data.conceptId }).lean();
  if (!concept) return fail(res, 404, 'CONCEPT_NOT_FOUND', 'That concept could not be found.');
  if (parsed.data.target === 'student' && !await User.exists({ _id: parsed.data.studentId, classId: parsed.data.classId, role: 'student' })) return fail(res, 403, 'FORBIDDEN', 'This student is not in the selected class.');
  const target = parsed.data.target;
  const filter = { teacherId: req.session.user!.id, classId: parsed.data.classId, conceptId: concept._id, ...(target === 'student' ? { studentId: parsed.data.studentId } : { studentId: { $exists: false } }), ...(target === 'group' ? { group: parsed.data.group } : target === 'class' ? { group: { $exists: false } } : {}) };
  const override = await TeacherOverride.findOneAndUpdate(filter, { $set: { teacherId: req.session.user!.id, classId: parsed.data.classId, conceptId: concept._id, action: parsed.data.action, ...(target === 'student' ? { studentId: parsed.data.studentId, group: undefined } : target === 'group' ? { group: parsed.data.group, studentId: undefined } : { group: undefined, studentId: undefined }), ...(parsed.data.activity ? { activity: parsed.data.activity } : {}), isActive: true } }, { upsert: true, new: true, runValidators: true });
  return res.json({ override: { id: String(override._id), action: override.action, activity: override.activity, conceptId: concept.slug } });
}));

router.post('/worksheets', asyncRoute(async (req, res) => {
  const parsed = z.object({ classId: z.string().regex(/^[a-f\d]{24}$/i), group: z.enum(['ready-to-advance', 'on-track', 'needs-basics']).optional(), conceptIds: z.array(z.string().min(1).max(100)).min(1).max(2), language: z.enum(['en', 'te']) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Choose a class, one or two concepts, and a worksheet language.');
  const classroom = await ownedClass(req, parsed.data.classId);
  if (!classroom) return fail(res, 403, 'FORBIDDEN', 'This class is not assigned to your account.');
  const concepts = await Concept.find({ slug: { $in: parsed.data.conceptIds }, classLevel: { $lte: classroom.classLevel } }).sort({ classLevel: 1 }).lean();
  if (concepts.length !== new Set(parsed.data.conceptIds).size) return fail(res, 404, 'CONCEPT_NOT_FOUND', 'One or more concepts could not be found.');
  const questions: any[] = [];
  for (const concept of concepts) {
    const conceptQuestions = await Question.find({ conceptId: concept._id }).sort({ difficulty: 1 }).limit(5).lean();
    questions.push(...conceptQuestions.filter((_question, index) => index === 0 || index === 2 || index === 4));
  }
  if (!questions.length) return fail(res, 404, 'CONTENT_MISSING', 'There are no questions for the selected concepts yet.');
  const worksheet = await Worksheet.create({ teacherId: req.session.user!.id, classId: classroom._id, group: parsed.data.group, conceptIds: concepts.map((item) => item._id), questionIds: questions.map((item) => item._id), language: parsed.data.language });
  const qrPayload = JSON.stringify({ v: 1, worksheetId: String(worksheet._id), classId: String(classroom._id), group: worksheet.group ?? null });
  return res.status(201).json({ worksheet: { id: String(worksheet._id), classId: String(classroom._id), className: classroom.name, classCode: classroom.code, classLevel: classroom.classLevel, board: classroom.board, group: worksheet.group ?? null, language: worksheet.language, qrPayload }, questions: questions.map((question) => ({ id: String(question._id), conceptId: String(question.conceptId), conceptName: concepts.find((item) => String(item._id) === String(question.conceptId))?.name ?? '', conceptNameTe: concepts.find((item) => String(item._id) === String(question.conceptId))?.nameTe ?? '', difficulty: question.difficulty, text: question.text, options: question.options.map((option: any, index: number) => ({ index, text: option.text })), correctIndex: question.options.findIndex((option: any) => option.isCorrect), answer: question.options.find((option: any) => option.isCorrect)?.text ?? { en: question.answer, te: question.answer } })) });
}));

router.get('/worksheets/:worksheetId', asyncRoute(async (req, res) => {
  const worksheet = await Worksheet.findById(req.params.worksheetId).populate('classId').populate('conceptIds').lean() as any;
  if (!worksheet) return fail(res, 404, 'WORKSHEET_NOT_FOUND', 'That worksheet could not be found.');
  if (!await ownedClass(req, String(worksheet.classId?._id ?? worksheet.classId))) return fail(res, 403, 'FORBIDDEN', 'This worksheet is not from one of your classes.');
  const questions = await Question.find({ _id: { $in: worksheet.questionIds } }).lean();
  questions.sort((a, b) => worksheet.questionIds.findIndex((id: any) => String(id) === String(a._id)) - worksheet.questionIds.findIndex((id: any) => String(id) === String(b._id)));
  return res.json({ worksheet: { id: String(worksheet._id), classId: String(worksheet.classId._id), className: worksheet.classId.name, classCode: worksheet.classId.code, classLevel: worksheet.classId.classLevel, board: worksheet.classId.board, group: worksheet.group ?? null, language: worksheet.language, qrPayload: JSON.stringify({ v: 1, worksheetId: String(worksheet._id), classId: String(worksheet.classId._id), group: worksheet.group ?? null }) }, questions: questions.map((question: any) => ({ id: String(question._id), conceptId: String(question.conceptId), conceptName: worksheet.conceptIds.find((item: any) => String(item._id) === String(question.conceptId))?.name ?? '', conceptNameTe: worksheet.conceptIds.find((item: any) => String(item._id) === String(question.conceptId))?.nameTe ?? '', difficulty: question.difficulty, text: question.text, options: question.options.map((option: any, index: number) => ({ index, text: option.text })), correctIndex: question.options.findIndex((option: any) => option.isCorrect), answer: question.options.find((option: any) => option.isCorrect)?.text ?? { en: question.answer, te: question.answer } })) });
}));

router.post('/worksheets/:worksheetId/reviewed-answers', asyncRoute(async (req, res) => {
  const parsed = z.object({ studentId: z.string().regex(/^[a-f\d]{24}$/i), answers: z.array(z.object({ clientId: z.string().uuid(), questionId: z.string().regex(/^[a-f\d]{24}$/i), selectedOption: z.number().int().min(0).max(5) })).min(1).max(30) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Review the student and marked answers before saving.');
  const worksheet = await Worksheet.findById(req.params.worksheetId).lean();
  if (!worksheet) return fail(res, 404, 'WORKSHEET_NOT_FOUND', 'That worksheet could not be found.');
  if (!await ownedClass(req, String(worksheet.classId))) return fail(res, 403, 'FORBIDDEN', 'This worksheet is not from one of your classes.');
  const student = await User.findOne({ _id: parsed.data.studentId, classId: worksheet.classId, role: 'student', isActive: true }).lean();
  if (!student) return fail(res, 403, 'FORBIDDEN', 'Choose a student from this worksheet’s class.');
  const questionIds = new Set(worksheet.questionIds.map(String));
  const questions = await Question.find({ _id: { $in: parsed.data.answers.map((answer) => answer.questionId) } }).lean() as any[];
  const questionsById = new Map(questions.map((question) => [String(question._id), question]));
  const saved: Array<{ clientId: string; questionId: string; correct: boolean; mastery: number }> = [];
  const previousMasteryByConcept = new Map<string, number | undefined>();
  for (const answer of parsed.data.answers) {
    if (!questionIds.has(answer.questionId)) return fail(res, 400, 'QUESTION_NOT_IN_WORKSHEET', 'An answer does not belong to this worksheet.');
    const duplicate = await Attempt.findOne({ studentId: student._id, clientId: answer.clientId }).lean();
    if (duplicate) { saved.push({ clientId: answer.clientId, questionId: answer.questionId, correct: duplicate.correct, mastery: 0 }); continue; }
    const question = questionsById.get(answer.questionId);
    const selected = question?.options[answer.selectedOption];
    if (!question || !selected) return fail(res, 400, 'INVALID_ANSWER', 'An answer choice is not valid for this worksheet.');
    const concept = await Concept.findById(question.conceptId).lean();
    if (!concept) return fail(res, 404, 'CONCEPT_NOT_FOUND', 'A worksheet concept could not be found.');
    const correct = selected.isCorrect === true;
    const now = Date.now();
    const old = await MasteryState.findOne({ studentId: student._id, conceptId: concept._id }).lean();
    if (!previousMasteryByConcept.has(String(concept._id))) previousMasteryByConcept.set(String(concept._id), old?.mastery);
    const expectedTimeSec = question.expectedTimeSec ?? 60;
    const updated = updateMastery(decayMastery({ mastery: old?.mastery ?? 0, confidence: old?.confidence ?? 0, ...(old?.lastUpdated ? { lastUpdated: old.lastUpdated.getTime() } : {}) }, now), { correct, hintsUsed: 0, responseTimeMs: expectedTimeSec * 1000, expectedTimeSec, selfConfidence: 'unsure' }, now);
    await Attempt.create({ clientId: answer.clientId, activityId: String(worksheet._id), studentId: student._id, questionId: question._id, correct, hintsUsed: 0, timeMs: expectedTimeSec * 1000, confidence: 'unsure', ...(selected.misconceptionId ? { misconceptionId: selected.misconceptionId } : {}), mode: 'worksheet-scan', clientTimestamp: new Date(now), provenance: 'real' });
    await MasteryState.findOneAndUpdate({ studentId: student._id, conceptId: concept._id }, { $set: { mastery: updated.estimate.mastery, confidence: updated.estimate.confidence, lastUpdated: new Date(now), ...(old?.baselineMastery === undefined ? { baselineMastery: updated.estimate.mastery } : {}) } }, { upsert: true, new: true, runValidators: true });
    const decision = decideNextActivity({ conceptId: concept.slug, mastery: updated.estimate.mastery, confidence: updated.estimate.confidence });
    await DecisionLog.create({ studentId: student._id, conceptId: concept._id, activity: decision.activity, ruleId: decision.ruleId, reason: decision.reason, inputs: { ...decision.inputs, source: 'worksheet-scan', worksheetId: String(worksheet._id) } });
    saved.push({ clientId: answer.clientId, questionId: answer.questionId, correct, mastery: updated.estimate.mastery });
  }
  if (previousMasteryByConcept.size) await syncProgressSignals(String(student._id), String(worksheet.classId), [...previousMasteryByConcept].map(([conceptId, previousMastery]) => ({ conceptId, previousMastery })), new Date());
  return res.json({ saved });
}));

router.post('/alerts/:alertId/acknowledge', asyncRoute(async (req, res) => {
  const alert = await Alert.findById(req.params.alertId).lean();
  if (!alert) return fail(res, 404, 'ALERT_NOT_FOUND', 'That alert has already been cleared.');
  if (!await ownedClass(req, String(alert.classId))) return fail(res, 403, 'FORBIDDEN', 'This alert is not from one of your classes.');
  await Alert.updateOne({ _id: alert._id }, { $set: { acknowledgedAt: new Date() } });
  return res.json({ acknowledged: true });
}));

export { router as teacherRouter };
