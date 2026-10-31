import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { diagnosticCompleteSchema, studentAnswerSchema } from '@conceptbridge/shared';
import { decideNextActivity, decayMastery, earnStreakFreeze, evaluateAdaptiveTest, findRootCause, getPrerequisites, groupByMastery, recordStreakActivity, scheduleRevisions, updateMastery, type Activity, type KnowledgeGraph } from '@conceptbridge/engine';
import { Alert, Attempt, Concept, DecisionLog, Explanation, MasteryState, Misconception, Question, StreakState, TeacherOverride, User } from './models.js';
import { syncProgressSignals } from './progress-signals.js';
import { chooseQuestion, targetQuestionDifficulty } from './question-selection.js';
import { getCurriculumSnapshot } from './curriculum-cache.js';

const router = Router();
const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
const asyncRoute = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res, next).catch(next); };
router.use((req, res, next) => req.session.user?.role === 'student' ? next() : fail(res, req.session.user ? 403 : 401, req.session.user ? 'FORBIDDEN' : 'UNAUTHENTICATED', req.session.user ? 'Student access only.' : 'Please sign in.'));

async function getGraph(): Promise<{ graph: KnowledgeGraph; concepts: Array<Record<string, unknown>>; masteryBySlug: Map<string, number> }> {
  const { concepts, edges } = await getCurriculumSnapshot();
  const slugById = new Map(concepts.map((concept) => [String(concept._id), concept.slug]));
  const graphEdges = edges.map((edge) => ({ prerequisite: slugById.get(String(edge.prerequisiteId))!, dependent: slugById.get(String(edge.dependentId))! })).filter((edge) => edge.prerequisite && edge.dependent);
  return { graph: { nodes: concepts.map((concept) => concept.slug), edges: graphEdges }, concepts, masteryBySlug: new Map() };
}
function publicQuestion(question: Record<string, any>) {
  return { id: String(question._id), conceptId: String(question.conceptId), difficulty: question.difficulty, text: question.text, expectedTimeSec: question.expectedTimeSec, options: question.options.map((option: any, index: number) => ({ index, text: option.text })), hints: question.hints };
}
const toEngineEstimate = (state?: { mastery?: number; confidence?: number; lastUpdated?: Date | null }) => ({ mastery: state?.mastery ?? 0, confidence: state?.confidence ?? 0, ...(state?.lastUpdated ? { lastUpdated: state.lastUpdated.getTime() } : {}) });
const streakInput = (streak: any) => streak ? { current: streak.current, longest: streak.longest, freezes: streak.freezes, ...(streak.lastActiveDate ? { lastActiveDate: streak.lastActiveDate } : {}), history: streak.history ?? [] } : { current: 0, longest: 0, freezes: 0, history: [] as string[] };
const startOfIndiaDay = (timestamp: number) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00+05:30`);
};

router.get('/dashboard', asyncRoute(async (req, res) => {
  const studentId = req.session.user!.id;
  const [student, masteryDocs, graphData, streak, todayAttempts, recentWrong, openAlerts] = await Promise.all([
    User.findById(studentId).lean(),
    MasteryState.find({ studentId }).populate('conceptId').lean(),
    getGraph(),
    StreakState.findOne({ studentId }).lean(),
    Attempt.countDocuments({ studentId, createdAt: { $gte: startOfIndiaDay(Date.now()) } }),
    Attempt.findOne({ studentId, correct: false }).populate({ path: 'questionId', populate: { path: 'conceptId' } }).sort({ createdAt: -1 }).lean(),
    Alert.countDocuments({ studentId, acknowledgedAt: { $exists: false } }),
  ]);
  const masteryBySlug = new Map<string, number>();
  const stateBySlug = new Map<string, any>();
  for (const state of masteryDocs as any[]) {
    const slug = state.conceptId?.slug;
    if (slug) {
      const decayed = decayMastery(toEngineEstimate(state), Date.now());
      masteryBySlug.set(slug, decayed.mastery);
      stateBySlug.set(slug, { ...state, mastery: decayed.mastery, confidence: decayed.confidence });
    }
  }
  const classLevel = req.session.user!.classLevel ?? 6;
  const availableConcepts = (graphData.concepts as any[]).filter((concept) => concept.classLevel <= classLevel);
  const availableSlugs = new Set(availableConcepts.map((concept) => concept.slug));
  const conceptItems = availableConcepts.map((concept) => {
    const state = stateBySlug.get(concept.slug);
    return { id: String(concept._id), slug: concept.slug, name: concept.name, nameTe: concept.nameTe, classLevel: concept.classLevel, chapter: concept.chapters?.[req.session.user!.board] ?? concept.chapters?.CBSE ?? '', mastery: state?.mastery ?? null, baselineMastery: state?.baselineMastery ?? null, confidence: state?.confidence ?? 0, nextRevisionAt: state?.nextRevisionAt ?? null };
  });
  const latestFailedSlug = (recentWrong as any)?.questionId?.conceptId?.slug as string | undefined;
  let rewind: { rootCauseId: string; path: string[]; reason: string } | undefined;
  if (latestFailedSlug) rewind = findRootCause(latestFailedSlug, masteryBySlug, graphData.graph);
  const studentGroup = groupByMastery(conceptItems.map((item) => item.mastery ?? 0)).group;
  const overrides = req.session.user!.classId ? await TeacherOverride.find({ isActive: true, $or: [
    { studentId },
    { classId: req.session.user!.classId, studentId: { $exists: false }, group: studentGroup },
    { classId: req.session.user!.classId, studentId: { $exists: false }, group: { $exists: false } },
  ] }).populate('conceptId').sort({ createdAt: -1 }).lean() as any[] : [];
  const nextRevision = conceptItems.find((item) => item.nextRevisionAt && new Date(item.nextRevisionAt).getTime() <= Date.now());
  let recommendationConcept = rewind?.rootCauseId ?? nextRevision?.slug ?? conceptItems.find((item) => item.classLevel === classLevel && (item.mastery ?? 0) < 0.8)?.slug ?? conceptItems[0]?.slug ?? '';
  let relevantOverride = overrides.find((item) => item.studentId && String(item.studentId) === studentId)
    ?? overrides.find((item) => item.group === studentGroup)
    ?? overrides.find((item) => !item.group && !item.studentId);
  if (relevantOverride?.action === 'skip' && relevantOverride.conceptId?.slug !== recommendationConcept) relevantOverride = undefined;
  if (relevantOverride && ['assign', 'lock'].includes(relevantOverride.action) && relevantOverride.conceptId?.slug) recommendationConcept = relevantOverride.conceptId.slug;
  if (relevantOverride?.action === 'skip' && relevantOverride.conceptId?.slug === recommendationConcept) {
    recommendationConcept = conceptItems.find((item) => item.classLevel >= classLevel && item.slug !== recommendationConcept && (item.mastery ?? 0) < 0.8)?.slug ?? recommendationConcept;
  }
  const recommendationState = stateBySlug.get(recommendationConcept);
  const forcedActivity = ['Learn', 'Solve', 'Test', 'Revise', 'Challenge'].includes(relevantOverride?.activity ?? '') ? relevantOverride?.activity as Activity : undefined;
  const decision = decideNextActivity({
    conceptId: recommendationConcept,
    mastery: recommendationState?.mastery ?? 0,
    confidence: recommendationState?.confidence ?? 0,
    ...(nextRevision ? { revisionDue: true } : {}),
    ...(rewind && rewind.rootCauseId !== latestFailedSlug ? { rewindTargetId: rewind.rootCauseId } : {}),
    ...(relevantOverride && forcedActivity && relevantOverride.action !== 'skip' ? { teacherOverride: { activity: forcedActivity, conceptId: recommendationConcept, locked: relevantOverride.action === 'lock' } } : {}),
  });
  const revisionCount = conceptItems.filter((item) => item.nextRevisionAt && new Date(item.nextRevisionAt).getTime() <= Date.now()).length;
  return res.json({
    student: { name: student?.name ?? req.session.user!.name, classLevel, board: req.session.user!.board },
    diagnosticNeeded: !student?.diagnosticCompletedAt,
    concepts: conceptItems,
    edges: graphData.graph.edges.filter((edge) => availableSlugs.has(edge.prerequisite) && availableSlugs.has(edge.dependent)),
    decision: { ...decision, rewindPath: rewind?.path ?? [], teacherSet: Boolean(relevantOverride) },
    streak: streak ?? { current: 0, longest: 0, freezes: 0, history: [] },
    daily: { attempts: todayAttempts, goal: 5, revisionsDue: revisionCount, openAlerts },
  });
}));

router.get('/question', asyncRoute(async (req, res) => {
  const query = z.object({ conceptId: z.string().min(1), activityId: z.string().uuid().optional(), mode: z.enum(['diagnostic', 'learn', 'solve', 'test', 'revise', 'challenge']).default('solve') }).safeParse(req.query);
  if (!query.success) return fail(res, 400, 'VALIDATION_ERROR', 'Choose a valid concept and activity.');
  const concept = await Concept.findOne({ slug: query.data.conceptId }).lean();
  if (!concept) return fail(res, 404, 'NOT_FOUND', 'We could not find that concept.');
  if (concept.classLevel > (req.session.user!.classLevel ?? 6)) return fail(res, 403, 'CLASS_LEVEL_MISMATCH', 'This concept is above your current class.');
  const [mastery, questions, seenInActivity] = await Promise.all([
    MasteryState.findOne({ studentId: req.session.user!.id, conceptId: concept._id }).lean(),
    Question.find({ conceptId: concept._id }).sort({ difficulty: 1, _id: 1 }).lean(),
    query.data.activityId
      ? Attempt.find({ studentId: req.session.user!.id, activityId: query.data.activityId, mode: query.data.mode }).distinct('questionId')
      : Promise.resolve([]),
  ]);
  if (!questions.length) return fail(res, 404, 'CONTENT_MISSING', 'Questions for this concept are not available yet.');
  const difficulty = targetQuestionDifficulty(query.data.mode, mastery?.mastery ?? 0);
  const seenRecently = await Attempt.find({ studentId: req.session.user!.id, questionId: { $in: questions.map((question) => question._id) }, mode: query.data.mode }).sort({ createdAt: -1 }).limit(4).distinct('questionId');
  const question = chooseQuestion(questions, difficulty, [...seenInActivity, ...seenRecently])!;
  return res.json({ question: publicQuestion(question), concept: { id: concept.slug, name: concept.name, nameTe: concept.nameTe }, activity: query.data.mode, activityId: query.data.activityId ?? null, studentId: req.session.user!.id });
}));

router.get('/learn/:conceptId', asyncRoute(async (req, res) => {
  const concept = await Concept.findOne({ slug: req.params.conceptId }).lean();
  if (!concept) return fail(res, 404, 'NOT_FOUND', 'We could not find that concept.');
  if (concept.classLevel > (req.session.user!.classLevel ?? 6)) return fail(res, 403, 'CLASS_LEVEL_MISMATCH', 'This concept is above your current class.');
  const explanations = await Explanation.find({ conceptId: concept._id }).lean();
  explanations.sort((a, b) => (a.variant === 'step-by-step' ? 0 : 1) - (b.variant === 'step-by-step' ? 0 : 1));
  if (explanations.length < 2) return fail(res, 404, 'CONTENT_MISSING', 'Learning explanations are not available yet.');
  return res.json({ concept: { id: concept.slug, name: concept.name, nameTe: concept.nameTe }, explanations: explanations.map((item) => ({ variant: item.variant, text: item.text })) });
}));

router.get('/topic-pack/:conceptId', asyncRoute(async (req, res) => {
  const concept = await Concept.findOne({ slug: req.params.conceptId }).lean();
  if (!concept) return fail(res, 404, 'NOT_FOUND', 'We could not find that concept.');
  if (concept.classLevel > (req.session.user!.classLevel ?? 6)) return fail(res, 403, 'CLASS_LEVEL_MISMATCH', 'This concept is above your current class.');
  const [questions, explanations] = await Promise.all([
    Question.find({ conceptId: concept._id }).sort({ difficulty: 1, _id: 1 }).lean(),
    Explanation.find({ conceptId: concept._id }).lean(),
  ]);
  if (!questions.length || explanations.length < 2) return fail(res, 404, 'CONTENT_MISSING', 'This topic pack is not ready yet.');
  explanations.sort((a, b) => (a.variant === 'step-by-step' ? 0 : 1) - (b.variant === 'step-by-step' ? 0 : 1));
  return res.json({ conceptId: concept.slug, questions: questions.map(publicQuestion), explanations: explanations.map((item) => ({ variant: item.variant, text: item.text })) });
}));

router.post('/answer', asyncRoute(async (req, res) => {
  const parsed = studentAnswerSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Check your answer and try again.');
  const studentId = req.session.user!.id;
  const duplicate = await Attempt.findOne({ studentId, clientId: parsed.data.clientId }).lean();
  if (duplicate) return res.json({ correct: duplicate.correct, duplicate: true, feedback: duplicate.correct ? { en: 'That answer is already saved.', te: 'ఈ సమాధానం ఇప్పటికే భద్రపరచబడింది.' } : null });
  const question = await Question.findById(parsed.data.questionId).lean();
  if (!question) return fail(res, 404, 'NOT_FOUND', 'That question is no longer available.');
  const selected = question.options[parsed.data.selectedOption];
  if (!selected) return fail(res, 400, 'VALIDATION_ERROR', 'Choose one of the answer options.');
  const concept = await Concept.findById(question.conceptId).lean();
  if (!concept) return fail(res, 404, 'NOT_FOUND', 'We could not find the concept for that question.');
  const correct = selected.isCorrect === true;
  const now = Date.now();
  const clientTime = parsed.data.clientTimestamp ? Date.parse(parsed.data.clientTimestamp) : now;
  if (!Number.isFinite(clientTime) || clientTime > now + 5 * 60_000 || clientTime < now - 7 * 86_400_000) return fail(res, 400, 'INVALID_ACTIVITY_TIME', 'This activity timestamp is outside the allowed offline sync window.');
  const activityTime = Math.min(now, clientTime);
  const oldState = await MasteryState.findOne({ studentId, conceptId: concept._id }).lean();
  const updated = updateMastery(decayMastery(toEngineEstimate(oldState ?? undefined), now), { correct, hintsUsed: parsed.data.hintsUsed, responseTimeMs: parsed.data.timeMs, expectedTimeSec: question.expectedTimeSec ?? 60, selfConfidence: parsed.data.confidence }, now);
  const feedback = !correct && selected.misconceptionId ? await Misconception.findById(selected.misconceptionId).lean() : null;
  await Attempt.create({ clientId: parsed.data.clientId, activityId: parsed.data.activityId, studentId, questionId: question._id, correct, hintsUsed: parsed.data.hintsUsed, timeMs: parsed.data.timeMs, confidence: parsed.data.confidence, misconceptionId: selected.misconceptionId, mode: parsed.data.mode, clientTimestamp: new Date(activityTime) });
  let testDecision: ReturnType<typeof evaluateAdaptiveTest> | undefined;
  if (parsed.data.mode === 'test' || parsed.data.mode === 'revise') {
    const sessionAttempts = await Attempt.find({ studentId, activityId: parsed.data.activityId, mode: parsed.data.mode }).sort({ createdAt: 1 }).select('correct').lean();
    testDecision = evaluateAdaptiveTest(sessionAttempts.map((item) => ({ correct: item.correct })));
  }
  const setValues: Record<string, unknown> = { mastery: updated.estimate.mastery, confidence: updated.estimate.confidence, lastUpdated: new Date(now) };
  if (parsed.data.mode === 'test' && testDecision?.outcome === 'pass') setValues.nextRevisionAt = new Date(scheduleRevisions(now)[0]);
  if (parsed.data.mode === 'revise' && testDecision?.stop) setValues.nextRevisionAt = testDecision.outcome === 'pass' ? new Date(scheduleRevisions(now)[1]) : null;
  if (parsed.data.mode === 'diagnostic' && oldState?.baselineMastery === undefined) setValues.baselineMastery = updated.estimate.mastery;
  await MasteryState.findOneAndUpdate({ studentId, conceptId: concept._id }, { $set: setValues }, { upsert: true, new: true, runValidators: true });

  if (parsed.data.mode === 'diagnostic' && correct && parsed.data.confidence === 'sure') {
    const { graph } = await getGraph();
    const prereqSlugs = getPrerequisites(concept.slug, graph);
    const prereqConcepts = await Concept.find({ slug: { $in: prereqSlugs } }).select('_id slug').lean();
    for (const prerequisite of prereqConcepts) {
      await MasteryState.updateOne({ studentId, conceptId: prerequisite._id }, { $setOnInsert: { studentId, conceptId: prerequisite._id, mastery: 0.72, baselineMastery: 0.72, confidence: 0.25, lastUpdated: new Date(now) } }, { upsert: true });
    }
  }
  if (req.session.user!.classId) await syncProgressSignals(studentId, req.session.user!.classId, [{ conceptId: String(concept._id), previousMastery: oldState?.mastery }], new Date(now));

  let rewindPath: string[] = [];
  let rootCauseId: string | undefined;
  if (!correct) {
    const { graph, concepts } = await getGraph();
    const masteryDocs = await MasteryState.find({ studentId }).populate('conceptId').lean() as any[];
    const masteryMap = new Map(masteryDocs.filter((item) => item.conceptId?.slug).map((item) => [item.conceptId.slug, item.mastery]));
    masteryMap.set(concept.slug, updated.estimate.mastery);
    const result = findRootCause(concept.slug, masteryMap, graph);
    rewindPath = result.path;
    rootCauseId = result.rootCauseId;
  }
  const decision = decideNextActivity({ conceptId: concept.slug, mastery: updated.estimate.mastery, confidence: updated.estimate.confidence, ...(rootCauseId && rootCauseId !== concept.slug ? { rewindTargetId: rootCauseId } : {}), ...(parsed.data.mode === 'revise' ? { revisionDue: true } : {}) });
  await DecisionLog.create({ studentId, conceptId: concept._id, activity: decision.activity, ruleId: decision.ruleId, reason: decision.reason, inputs: decision.inputs });

  let streakUpdate: unknown;
  if (parsed.data.mode !== 'diagnostic' && updated.estimate.mastery >= 0.8 && (oldState?.mastery ?? 0) < 0.8) {
    const existingStreak = await StreakState.findOne({ studentId }).lean();
    const earned = earnStreakFreeze(streakInput(existingStreak));
    await StreakState.findOneAndUpdate({ studentId }, { $set: { freezes: earned.freezes } }, { upsert: true, new: true });
  }
  if ((parsed.data.mode === 'learn' && correct) || ((parsed.data.mode === 'test' || parsed.data.mode === 'revise') && testDecision?.stop)) {
    const streak = await StreakState.findOne({ studentId }).lean();
    const value = recordStreakActivity(streakInput(streak), activityTime);
    await StreakState.findOneAndUpdate({ studentId }, { $set: value.state }, { upsert: true, new: true });
    streakUpdate = value;
  } else if (parsed.data.mode === 'solve') {
    const solveCount = await Attempt.countDocuments({ studentId, activityId: parsed.data.activityId, mode: 'solve', createdAt: { $gte: startOfIndiaDay(now) } });
    if (solveCount >= 5) {
      const streak = await StreakState.findOne({ studentId }).lean();
      const value = recordStreakActivity(streakInput(streak), activityTime);
      await StreakState.findOneAndUpdate({ studentId }, { $set: value.state }, { upsert: true, new: true });
      streakUpdate = value;
    }
  }
  const correctOption = question.options.find((option: any) => option.isCorrect);
  return res.json({ correct, feedback: feedback?.text ?? null, answer: correctOption?.text ?? { en: question.answer, te: question.answer }, mastery: updated.estimate.mastery, confidence: updated.estimate.confidence, conceptCheckRequired: updated.conceptCheckRequired, rewindPath, decision, testDecision, streak: streakUpdate });
}));

router.post('/diagnostic/complete', asyncRoute(async (req, res) => {
  const parsed = diagnosticCompleteSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Complete 8 to 12 diagnostic questions first.');
  const count = await Attempt.countDocuments({ studentId: req.session.user!.id, mode: 'diagnostic' });
  if (count < 8) return fail(res, 400, 'DIAGNOSTIC_INCOMPLETE', 'Answer at least 8 diagnostic questions before continuing.');
  await User.updateOne({ _id: req.session.user!.id }, { $set: { diagnosticCompletedAt: new Date() } });
  return res.json({ complete: true, answered: count });
}));

export { router as studentRouter };
