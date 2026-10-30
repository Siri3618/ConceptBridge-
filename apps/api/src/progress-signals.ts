import { groupByMastery } from '@conceptbridge/engine';
import { Alert, Concept, MasteryState, User } from './models.js';

/** Keep teacher-facing activity and check-in signals in sync with accepted student work. */
export async function syncProgressSignals(studentId: string, classId: string, changes: Array<{ conceptId: string; previousMastery?: number }>, now: Date) {
  await User.updateOne({ _id: studentId }, { $set: { lastActiveAt: now } });
  await Alert.updateMany({ studentId, type: 'inactivity', acknowledgedAt: { $exists: false } }, { $set: { acknowledgedAt: now } });

  const [concepts, states, student] = await Promise.all([
    Concept.find().select('_id').lean(),
    MasteryState.find({ studentId }).select('conceptId mastery').lean(),
    User.findById(studentId).select('name classLevel').lean(),
  ]);
  const availableConcepts = concepts.filter((concept) => concept.classLevel <= (student?.classLevel ?? 6));
  const masteryByConcept = new Map(states.map((state) => [String(state.conceptId), state.mastery]));
  const currentGroup = groupByMastery(availableConcepts.map((concept) => masteryByConcept.get(String(concept._id)) ?? 0)).group;
  const priorMasteryByConcept = new Map(changes.map((change) => [change.conceptId, change.previousMastery ?? 0]));
  const priorValues = availableConcepts.map((concept) => priorMasteryByConcept.has(String(concept._id)) ? priorMasteryByConcept.get(String(concept._id))! : masteryByConcept.get(String(concept._id)) ?? 0);
  const previousGroup = groupByMastery(priorValues).group;

  if (currentGroup !== 'needs-basics') {
    await Alert.updateMany({ studentId, type: 'needs-basics', acknowledgedAt: { $exists: false } }, { $set: { acknowledgedAt: now } });
  } else if (previousGroup !== 'needs-basics') {
    const openAlert = await Alert.findOne({ studentId, type: 'needs-basics', acknowledgedAt: { $exists: false } }).lean();
    if (!openAlert) {
      const name = student?.name ?? 'Student';
      await Alert.create({ classId, studentId, type: 'needs-basics', message: { en: `${name} may benefit from a short prerequisite review.`, te: `${name}కు మునుపటి భావనపై చిన్న పునశ్చరణ ఉపయోగపడవచ్చు.` } });
    }
  }
}
