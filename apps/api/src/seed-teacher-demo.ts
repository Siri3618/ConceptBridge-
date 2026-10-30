import { curriculum, groupByMastery } from '@conceptbridge/engine';
import { Alert, Attempt, Concept, MasteryState, Question, StreakState, User } from './models.js';

const DAY = 86_400_000;
const pct = (value: number) => Math.max(0.05, Math.min(0.98, value));

/** Adds deterministic, varied classroom data so teacher views are useful immediately after seeding. */
export async function seedTeacherDemoData(classId: string, classLevel = 10): Promise<void> {
  const students = await User.find({ classId, role: 'student' }).sort({ rollNo: 1 });
  const availableCurriculum = curriculum.filter((item) => item.classLevel <= classLevel);
  const concepts = await Concept.find({ slug: { $in: availableCurriculum.map(({ slug }) => slug) } }).select('_id slug').lean();
  const conceptIdBySlug = new Map(concepts.map((item) => [item.slug, item._id]));
  const questions = await Question.find({ conceptId: { $in: concepts.map((item) => item._id) } }).lean();
  const questionsByConcept = new Map<string, typeof questions>();
  for (const concept of concepts) questionsByConcept.set(concept.slug, questions.filter((question) => String(question.conceptId) === String(concept._id)));
  const now = Date.now();

  for (const [index, student] of students.entries()) {
    const roll = student.rollNo ?? String(index + 1).padStart(2, '0');
    const profile = index < 10 ? 'ready' : index < 25 ? 'on-track' : 'basics';
    const masteryValues: number[] = [];
    for (const [conceptIndex, concept] of availableCurriculum.entries()) {
      let base = profile === 'ready' ? 0.76 : profile === 'on-track' ? 0.48 : 0.24;
      base += ((index * 13 + conceptIndex * 7) % 17) / 100;
      if (concept.slug === 'integers-sign-rules' && index < 14) base = Math.min(base, 0.31 + (index % 3) / 100);
      if (concept.slug === 'fractions' && index >= 27 && index % 2 === 0) base = Math.min(base, 0.35);
      if (concept.slug === 'algebraic-expressions' && index >= 20 && index % 3 !== 0) base = Math.min(base, 0.38);
      if (concept.classLevel > 8 && index < 10) base = Math.min(0.95, base + 0.08);
      const mastery = pct(base);
      masteryValues.push(mastery);
      const conceptId = conceptIdBySlug.get(concept.slug);
      if (!conceptId) continue;
      const due = mastery >= 0.8 && index % 4 === 0 && conceptIndex % 3 === 0;
      const lastUpdated = new Date(now - ((index * 3 + conceptIndex) % 21) * DAY);
      await MasteryState.findOneAndUpdate({ studentId: student._id, conceptId }, { $setOnInsert: {
        studentId: student._id, conceptId, mastery,
        baselineMastery: pct(mastery - (((index + conceptIndex) % 4) * 0.035)),
        confidence: 0.46 + ((index + conceptIndex) % 6) * 0.08,
        lastUpdated,
        ...(due ? { nextRevisionAt: new Date(now - DAY) } : { nextRevisionAt: mastery >= 0.8 ? new Date(now + (3 + conceptIndex % 5) * DAY) : null }),
      } }, { upsert: true, new: true });
    }
    const group = groupByMastery(masteryValues).group;
    const daysInactive = index >= 36 ? 10 + index - 36 : index % 9 === 0 ? 4 : 0;
    await User.updateOne({ _id: student._id, lastActiveAt: { $exists: false } }, { $set: { diagnosticCompletedAt: new Date(now - 30 * DAY), lastActiveAt: new Date(now - daysInactive * DAY) } });

    const attemptTargets = ['fractions', 'integers-sign-rules', 'linear-equations', 'ratio-proportion', 'polynomials', 'quadratic-equations'].filter((slug) => availableCurriculum.some((concept) => concept.slug === slug));
    for (let attemptIndex = 0; attemptIndex < attemptTargets.length; attemptIndex++) {
      const slug = attemptTargets[(attemptIndex + index) % attemptTargets.length]!;
      const pool = questionsByConcept.get(slug) ?? [];
      if (!pool.length) continue;
      const question = pool[(index * 3 + attemptIndex) % pool.length]!;
      const correct = (index + attemptIndex) % 4 !== 0;
      const wrongOption = question.options.find((option) => !option.isCorrect);
      await Attempt.findOneAndUpdate({ studentId: student._id, clientId: `demo-${roll}-${attemptIndex}` }, { $set: {
        studentId: student._id, clientId: `demo-${roll}-${attemptIndex}`, activityId: `demo-session-${roll}-${attemptIndex}`,
        questionId: question._id, correct, hintsUsed: (index + attemptIndex) % 4,
        timeMs: (45 + (index * 7 + attemptIndex * 11) % 95) * 1000,
        confidence: index % 5 === 0 ? 'guess' : index % 3 === 0 ? 'unsure' : 'sure',
        ...(correct ? {} : { misconceptionId: wrongOption?.misconceptionId }), mode: attemptIndex % 3 === 0 ? 'test' : 'solve',
        clientTimestamp: new Date(now - ((index + attemptIndex) % 12) * DAY),
      } }, { upsert: true, new: true });
    }

    if (index < 14 && availableCurriculum.some((concept) => concept.slug === 'integers-sign-rules')) {
      const integerQuestions = questionsByConcept.get('integers-sign-rules') ?? [];
      const signQuestion = integerQuestions.find((question) => question.text?.en?.includes('(-3) × (-2)'));
      const misconceptionOption = signQuestion?.options.find((option) => option.text?.en === '-6');
      if (signQuestion && misconceptionOption) await Attempt.findOneAndUpdate({ studentId: student._id, clientId: `demo-${roll}-negative-times-negative` }, { $set: {
        studentId: student._id, clientId: `demo-${roll}-negative-times-negative`, activityId: `demo-sign-session-${roll}`,
        questionId: signQuestion._id, correct: false, hintsUsed: 1, timeMs: 52_000, confidence: 'sure', misconceptionId: misconceptionOption.misconceptionId,
        mode: 'diagnostic', clientTimestamp: new Date(now - (index % 6) * DAY),
      } }, { upsert: true, new: true });
    }

    const activeDays = Math.max(1, Math.min(14, index >= 36 ? 2 : (index * 3) % 15));
    const history = Array.from({ length: activeDays }, (_, offset) => new Date(now - (daysInactive + offset) * DAY).toISOString().slice(0, 10));
    const lastActiveDate = new Date(now - daysInactive * DAY).toISOString().slice(0, 10);
    await StreakState.findOneAndUpdate({ studentId: student._id }, { $setOnInsert: {
      studentId: student._id, current: daysInactive > 1 ? 0 : activeDays, longest: Math.max(activeDays + (index % 7), activeDays),
      freezes: index % 5 === 0 ? 2 : index % 3 === 0 ? 1 : 0, lastActiveDate, history,
    } }, { upsert: true, new: true });

    if (daysInactive >= 7) await Alert.findOneAndUpdate({ studentId: student._id, type: 'inactivity' }, { $setOnInsert: { classId, studentId: student._id, type: 'inactivity', message: { en: `${student.name} has not practised in ${daysInactive} days. A friendly check-in may help.`, te: `${student.name} ${daysInactive} రోజులుగా సాధన చేయలేదు. స్నేహపూర్వకంగా అడిగి చూడండి.` } } }, { upsert: true, new: true });
    if (group === 'needs-basics' && index % 4 === 1) await Alert.findOneAndUpdate({ studentId: student._id, type: 'needs-basics' }, { $setOnInsert: { classId, studentId: student._id, type: 'needs-basics', message: { en: `${student.name} may benefit from a short prerequisite review.`, te: `${student.name}కు మునుపటి భావనపై చిన్న పునశ్చరణ ఉపయోగపడవచ్చు.` } } }, { upsert: true, new: true });
  }
}
