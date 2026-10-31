import { apiUrl } from './api';
import { openDB, type DBSchema } from 'idb';

export type OfflineAnswer = {
  clientId: string;
  activityId: string;
  questionId: string;
  selectedOption: number;
  confidence: 'sure' | 'unsure' | 'guess';
  hintsUsed: number;
  timeMs: number;
  mode: string;
  clientTimestamp: string;
};
export type CachedQuestion = {
  id: string;
  conceptId: string;
  difficulty: number;
  text: { en: string; te?: string };
  expectedTimeSec: number;
  options: Array<{ index: number; text: { en: string; te?: string } }>;
  hints: Array<{ en: string; te?: string }>;
};
export type CachedTopicPack = {
  key: string;
  userId: string;
  conceptId: string;
  savedAt: number;
  questions: CachedQuestion[];
  explanations: Array<{ variant: string; text: { en: string; te?: string } }>;
};
const TOPIC_PACK_FRESH_MS = 24 * 60 * 60 * 1000;
interface OfflineDB extends DBSchema {
  dashboards: { key: string; value: { userId: string; savedAt: number; data: unknown } };
  topicPacks: { key: string; value: CachedTopicPack };
  attempts: { key: string; value: { answer: OfflineAnswer; csrf: string; userId: string; queuedAt: number } };
  diagnosticCompletions: { key: string; value: { userId: string; csrf: string; answered: number; queuedAt: number } };
}

let dbPromise: ReturnType<typeof openDB<OfflineDB>> | undefined;
function getDB() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  dbPromise ??= openDB<OfflineDB>('conceptbridge-offline', 1, {
    upgrade(db) {
      db.createObjectStore('dashboards', { keyPath: 'userId' });
      db.createObjectStore('topicPacks', { keyPath: 'key' });
      db.createObjectStore('attempts', { keyPath: 'answer.clientId' });
      db.createObjectStore('diagnosticCompletions', { keyPath: 'userId' });
    },
  });
  return dbPromise;
}

export async function saveDashboard(userId: string, data: unknown): Promise<void> {
  const db = await getDB();
  await db.put('dashboards', { userId, savedAt: Date.now(), data });
}

export async function getDashboard(userId: string): Promise<unknown | undefined> {
  return (await getDB()).get('dashboards', userId).then((row) => row?.data);
}

export async function saveTopicPack(userId: string, conceptId: string, pack: Omit<CachedTopicPack, 'key' | 'userId' | 'conceptId' | 'savedAt'>): Promise<void> {
  await (await getDB()).put('topicPacks', { key: `${userId}:${conceptId}`, userId, conceptId, savedAt: Date.now(), ...pack });
}

export async function getTopicPack(userId: string, conceptId: string): Promise<CachedTopicPack | undefined> {
  return (await getDB()).get('topicPacks', `${userId}:${conceptId}`);
}

export function selectOfflineChallengeQuestion(questions: CachedQuestion[], attemptIndex: number): CachedQuestion | undefined {
  if (!questions.length) return undefined;
  const closestDistance = Math.min(...questions.map((question) => Math.abs(question.difficulty - 5)));
  const closestQuestions = questions.filter((question) => Math.abs(question.difficulty - 5) === closestDistance);
  const index = ((Math.floor(attemptIndex) % closestQuestions.length) + closestQuestions.length) % closestQuestions.length;
  return closestQuestions[index];
}

export async function queueAnswer(userId: string, answer: OfflineAnswer, csrf: string): Promise<void> {
  await (await getDB()).put('attempts', { userId, answer, csrf, queuedAt: Date.now() });
  window.dispatchEvent(new Event('cb-offline-queue-change'));
}

export async function pendingAnswerCount(userId: string): Promise<number> {
  const db = await getDB();
  const rows = await db.getAll('attempts');
  return rows.filter((row) => row.userId === userId).length + (await db.get('diagnosticCompletions', userId) ? 1 : 0);
}

export async function queueDiagnosticCompletion(userId: string, csrf: string, answered: number): Promise<void> {
  await (await getDB()).put('diagnosticCompletions', { userId, csrf, answered, queuedAt: Date.now() });
  window.dispatchEvent(new Event('cb-offline-queue-change'));
}

export async function syncPendingAnswers(userId: string): Promise<{ synced: number; remaining: number }> {
  if (!navigator.onLine) return { synced: 0, remaining: await pendingAnswerCount(userId) };
  const db = await getDB();
  const rows = (await db.getAll('attempts')).filter((row) => row.userId === userId).sort((a, b) => a.queuedAt - b.queuedAt);
  let synced = 0;
  for (const row of rows) {
    try {
      const response = await fetch(apiUrl('/student/answer'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': row.csrf },
        body: JSON.stringify(row.answer),
      });
      if (response.status === 401 || response.status === 403) break;
      if (!response.ok) break;
      await db.delete('attempts', row.answer.clientId);
      synced++;
    } catch {
      break;
    }
  }
  const diagnostic = await db.get('diagnosticCompletions', userId);
  if (diagnostic && (await pendingAnswerCount(userId)) === 1) {
    try {
      const response = await fetch(apiUrl('/student/diagnostic/complete'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': diagnostic.csrf }, body: JSON.stringify({ answered: diagnostic.answered }) });
      if (response.ok) { await db.delete('diagnosticCompletions', userId); window.dispatchEvent(new Event('cb-diagnostic-complete-synced')); }
    } catch { /* Keep completion queued for the next online sync. */ }
  }
  const remaining = await pendingAnswerCount(userId);
  window.dispatchEvent(new Event('cb-offline-queue-change'));
  if (synced > 0) window.dispatchEvent(new Event('cb-offline-attempts-synced'));
  return { synced, remaining };
}

export async function fetchAndCacheTopicPack(userId: string, conceptId: string): Promise<CachedTopicPack> {
  const cached = await getTopicPack(userId, conceptId).catch(() => undefined);
  const cachedAge = cached ? Date.now() - cached.savedAt : Number.POSITIVE_INFINITY;
  if (cached && cachedAge >= 0 && cachedAge < TOPIC_PACK_FRESH_MS) return cached;
  const response = await fetch(apiUrl(`/student/topic-pack/${encodeURIComponent(conceptId)}`), { credentials: 'include' });
  if (!response.ok) throw new Error('This topic could not be saved for offline learning.');
  const pack = await response.json() as Omit<CachedTopicPack, 'key' | 'userId' | 'conceptId' | 'savedAt'>;
  await saveTopicPack(userId, conceptId, pack);
  return { key: `${userId}:${conceptId}`, userId, conceptId, savedAt: Date.now(), ...pack };
}

/** Warm offline content in a small background queue, skipping packs fetched within the last day. */
export async function prefetchTopicPacks(userId: string, conceptIds: string[], concurrency = 2): Promise<void> {
  const uniqueIds = [...new Set(conceptIds)];
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), uniqueIds.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < uniqueIds.length) {
      const conceptId = uniqueIds[nextIndex++];
      if (conceptId) await fetchAndCacheTopicPack(userId, conceptId).catch(() => undefined);
    }
  }));
}



