import { api } from './api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, Flame, Lightbulb, LockKeyhole, RotateCcw, Sparkles, Target, Trophy, Wifi, WifiOff } from 'lucide-react';
import { evaluateAdaptiveTest, selectNextDiagnosticConcept, selectStudentRecommendations, type Activity as ActivityType } from '@conceptbridge/engine';
import type { SessionUser } from '@conceptbridge/shared';
import { fetchAndCacheTopicPack, getDashboard, getTopicPack, pendingAnswerCount, prefetchTopicPacks, queueAnswer, queueDiagnosticCompletion, saveDashboard, selectOfflineChallengeQuestion, syncPendingAnswers, type OfflineAnswer } from './offline';
import './student.css';

type Mode = 'diagnostic' | 'learn' | 'solve' | 'test' | 'revise' | 'challenge';
type ConceptItem = { id: string; slug: string; name: string; nameTe?: string; classLevel: number; chapter: string; mastery: number | null; baselineMastery: number | null; confidence: number; nextRevisionAt: string | null };
type Question = { id: string; conceptId: string; difficulty: number; text: { en: string; te?: string }; expectedTimeSec: number; options: Array<{ index: number; text: { en: string; te?: string } }>; hints: Array<{ en: string; te?: string }> };
type Dashboard = { student: { name: string; classLevel: number; board: string }; diagnosticNeeded: boolean; concepts: ConceptItem[]; edges: Array<{ prerequisite: string; dependent: string }>; decision: { activity: Mode; conceptId: string; ruleId: string; reason: { en: string; te: string }; rewindPath: string[]; teacherSet: boolean }; streak: { current: number; longest: number; freezes: number; history: string[] }; daily: { attempts: number; goal: number; revisionsDue: number; openAlerts: number } };
type AnswerResult = { correct: boolean; pending?: boolean; feedback: { en: string; te: string } | null; answer: { en: string; te: string } | string; mastery: number; confidence: number; conceptCheckRequired: boolean; rewindPath: string[]; decision: { activity: ActivityType; conceptId: string; ruleId: string; reason: { en: string; te: string } }; testDecision?: ReturnType<typeof evaluateAdaptiveTest>; streak: { milestone?: number; message: { en: string; te: string } } | null };
type Props = { user: SessionUser; csrf: string; onSignOut: () => void; language: string };
const txt = (value: { en: string; te?: string } | string | undefined, language: string) => typeof value === 'string' ? value : language === 'te' ? value?.te ?? value?.en ?? '' : value?.en ?? '';
const activityLabels: Record<Mode, { en: string; te: string }> = { diagnostic: { en: 'Diagnostic', te: 'నైపుణ్య పరీక్ష' }, learn: { en: 'Learn', te: 'నేర్చుకోండి' }, solve: { en: 'Solve', te: 'సాధన' }, test: { en: 'Test', te: 'పరీక్ష' }, revise: { en: 'Revise', te: 'పునశ్చరణ' }, challenge: { en: 'Challenge', te: 'సవాలు' } };
const modeFromActivity = (activity: string): Mode => ['Learn', 'Solve', 'Test', 'Revise', 'Challenge'].includes(activity) ? activity.toLowerCase() as Mode : 'learn';

export default function StudentLearningApp({ user, csrf, onSignOut, language }: Props) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState<{ conceptId: string; mode: Mode } | null>(null);
  const [showBaseline, setShowBaseline] = useState(false);
  const prefetchStarted = useRef(false);
  const refresh = useCallback(async () => {
    try {
      setError('');
      const response = await api('/student/dashboard');
      if (!response.ok) throw new Error('Could not load your learning map. Please try again.');
      const data = await response.json() as Dashboard;
      setDashboard(data);
      void saveDashboard(user.id, data).catch(() => undefined);
      if (!prefetchStarted.current) {
        prefetchStarted.current = true;
        const targets = new Set<string>(data.concepts.filter((item) => item.classLevel === data.student.classLevel).map((item) => item.slug));
        let changed = true;
        while (changed) {
          changed = false;
          for (const edge of data.edges) if (targets.has(edge.dependent) && !targets.has(edge.prerequisite)) {
            targets.add(edge.prerequisite);
            changed = true;
          }
        }
        void prefetchTopicPacks(user.id, [...targets]);
      }
    }
    catch (e) { const cached = await getDashboard(user.id).catch(() => undefined); if (cached) setDashboard(cached as Dashboard); else setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }, [user.id]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const synced = () => { void refresh(); }; window.addEventListener('cb-offline-attempts-synced', synced); return () => window.removeEventListener('cb-offline-attempts-synced', synced); }, [refresh]);
  const launch = (conceptId: string, mode: Mode) => setActivity({ conceptId, mode });
  const recommendations = useMemo(() => {
    if (!dashboard) return [];
    const selected = selectStudentRecommendations(dashboard.concepts, dashboard.student.classLevel);
    const current = dashboard.concepts.find((item) => item.slug === dashboard.decision.conceptId);
    const next = dashboard.concepts.find((item) => item.slug === selected.continueConcept);
    const revise = dashboard.concepts.find((item) => item.slug === selected.revisionConcept);
    const challenge = dashboard.concepts.find((item) => item.slug === selected.challengeConcept);
    const continueMode: Mode = (next?.mastery ?? 0) < 0.4 ? 'learn' : 'solve';
    const items = [
      ...(current && current.slug !== next?.slug && current.slug !== revise?.slug && current.slug !== challenge?.slug ? [{ title: language === 'te' ? 'ముందుగా దీన్ని బలపరచండి' : 'Fix this first', concept: current, mode: modeFromActivity(dashboard.decision.activity), reason: dashboard.decision.reason, kind: 'fix' as const }] : []),
      { title: language === 'te' ? 'కొనసాగించండి' : 'Continue', concept: next, mode: continueMode, reason: { en: next ? 'Learn the next concept whose prerequisites you are ready for.' : 'You have completed the available concepts for your class. Ask your teacher about the next step.', te: next ? 'మీకు అవసరమైన మునుపటి భావనలు సిద్ధంగా ఉన్నాయి. ఇప్పుడు తర్వాతి భావనను నేర్చుకోండి.' : 'మీ తరగతికి అందుబాటులో ఉన్న భావనలను పూర్తి చేశారు. తదుపరి అడుగు కోసం ఉపాధ్యాయుడిని అడగండి.' }, kind: 'continue' as const },
      ...(revise ? [{ title: language === 'te' ? 'పునశ్చరణ' : 'Revise', concept: revise, mode: 'revise' as Mode, reason: { en: 'A short revisit keeps earlier learning fresh.', te: 'చిన్న పునశ్చరణ మునుపటి అభ్యాసాన్ని తాజాగా ఉంచుతుంది.' }, kind: 'revise' as const }] : []),
      { title: language === 'te' ? 'సవాలు' : 'Challenge', concept: challenge, mode: challenge ? 'challenge' as Mode : 'revise' as Mode, reason: challenge ? { en: 'Try a harder question on an idea you already know well.', te: 'మీకు బాగా తెలిసిన భావనపై కఠినమైన ప్రశ్నను ప్రయత్నించండి.' } : { en: revise ? 'No new challenge is ready yet. A short revision is available while you build mastery.' : 'A challenge appears after you build a strong foundation on a concept.', te: revise ? 'కొత్త సవాలు ఇంకా సిద్ధంగా లేదు. మీ పట్టు పెంచుకునేలోపు చిన్న పునశ్చరణ అందుబాటులో ఉంది.' : 'ఒక భావనపై మంచి పట్టు సాధించిన తర్వాత సవాలు కనిపిస్తుంది.' }, kind: 'challenge' as const },
    ];
    return items;
  }, [dashboard, language]);
  const todayKeys = useMemo(() => recentDays(7), []);
  const ringPct = dashboard ? Math.min(100, Math.round(dashboard.daily.attempts / dashboard.daily.goal * 100)) : 0;
  if (busy) return <section className="student-shell"><OfflineStatus userId={user.id} language={language}/><div className="student-loading"><div className="loading-dot"/><p>{language === 'te' ? 'మీ అభ్యాస స్థలాన్ని సిద్ధం చేస్తున్నాం…' : 'Getting your learning space ready…'}</p><div className="skeleton-line"/><div className="skeleton-line short"/></div></section>;
  if (!dashboard || error) return <section className="student-shell"><OfflineStatus userId={user.id} language={language}/><div className="student-error" role="alert"><CircleHelp/><h2>{language === 'te' ? 'మ్యాప్‌ను తెరవలేకపోయాం' : 'Your map could not load'}</h2><p>{error || 'Try again in a moment.'}</p><button className="primary" onClick={() => { setBusy(true); void refresh(); }}>{language === 'te' ? 'మళ్లీ ప్రయత్నించండి' : 'Try again'}<RotateCcw size={17}/></button></div></section>;
  const concept = dashboard.concepts.find((item) => item.slug === activity?.conceptId);
  if (dashboard.diagnosticNeeded && !activity) return <><OfflineStatus userId={user.id} language={language}/><DiagnosticFlow userId={user.id} dashboard={dashboard} csrf={csrf} language={language} onComplete={() => void refresh()} onSignOut={onSignOut}/></>;
  if (activity && concept) return <ActivityFlow key={`${activity.conceptId}-${activity.mode}`} userId={user.id} concept={concept} mode={activity.mode} csrf={csrf} language={language} edges={dashboard.edges} onBack={() => setActivity(null)} onRefresh={refresh} onOpen={(id, mode) => launch(id, mode)}/>;

  return <section className="student-shell"><OfflineStatus userId={user.id} language={language}/>
    <div className="student-topline"><div><p className="student-kicker">{language === 'te' ? 'మీ అభ్యాసం' : 'YOUR LEARNING SPACE'}</p><h1>{language === 'te' ? `శుభదినం, ${user.name}` : `Good to see you, ${user.name}`}</h1><p>{language === 'te' ? `తరగతి ${dashboard.student.classLevel} · ${dashboard.student.board}` : `Class ${dashboard.student.classLevel} · ${dashboard.student.board} · One step at a time`}</p></div><button className="quiet-button" onClick={onSignOut}><LockKeyhole size={16}/>{language === 'te' ? 'నిష్క్రమించండి' : 'Sign out'}</button></div>
    <div className="student-grid">
      <div className="student-main-column">
        <section className="path-panel">
          <div className="section-heading"><div><p className="student-kicker">{language === 'te' ? 'ఈ రోజు' : 'TODAY’S PATH'}</p><h2>{language === 'te' ? 'తర్వాత ఏం నేర్చుకోవాలి?' : 'A helpful next step'}</h2></div><span className="path-spark"><Sparkles size={18}/></span></div>
          {dashboard.decision.rewindPath.length > 1 && <div className="rewind-banner"><RotateCcw size={17}/><div><b>{language === 'te' ? 'మూల భావనకు తిరిగి వెళ్లండి' : 'Let’s strengthen an earlier idea'}</b><span>{dashboard.decision.rewindPath.map((slug) => dashboard.concepts.find((item) => item.slug === slug)?.name ?? slug).join('  ←  ')}</span></div></div>}
          <div className="path-cards">{recommendations.map((item) => <article className={`path-card path-${item.kind}${item.concept ? '' : ' path-empty'}`} key={item.kind}>
            <div className="path-card-top"><span>{item.title}</span>{item.kind === 'fix' && dashboard.decision.teacherSet && <em className="teacher-badge">{language === 'te' ? 'ఉపాధ్యాయుడు నిర్ణయించారు' : 'Set by teacher'}</em>}</div>
            <h3>{item.concept ? (language === 'te' ? item.concept.nameTe ?? item.concept.name : item.concept.name) : item.kind === 'continue' ? (language === 'te' ? 'తరగతి అభ్యాస మార్గం పూర్తైంది' : 'Class path complete') : (language === 'te' ? 'ముందుగా మీ పునాదిని బలపరచండి' : 'Build your foundation first')}</h3><p>{txt(item.reason, language)}</p>{item.concept && <div className="path-card-bottom"><MasteryRing value={item.concept.mastery ?? 0} language={language}/><button className="path-action" onClick={() => launch(item.concept!.slug, item.mode)}>{language === 'te' ? activityLabels[item.mode].te : activityLabels[item.mode].en}<ArrowRight size={16}/></button></div>}
          </article>)}</div>
        </section>
        <section className="map-panel">
          <div className="section-heading"><div><p className="student-kicker">{language === 'te' ? 'నా మ్యాప్' : 'MY MAP'}</p><h2>{language === 'te' ? 'మీ గణిత ప్రయాణం' : 'Your maths journey'}</h2></div><div className="map-toggle" role="group" aria-label="Map comparison"><button className={!showBaseline ? 'selected' : ''} onClick={() => setShowBaseline(false)}>{language === 'te' ? 'ఇప్పుడు' : 'Now'}</button><button className={showBaseline ? 'selected' : ''} onClick={() => setShowBaseline(true)}>{language === 'te' ? 'మొదట' : 'First check'}</button></div></div>
          {showBaseline && dashboard.concepts.every((item) => item.baselineMastery === null) && <p className="map-note">{language === 'te' ? 'మొదటి పరీక్ష తర్వాత మీ ప్రారంభ మ్యాప్ ఇక్కడ కనిపిస్తుంది.' : 'Your first map appears here after your diagnostic.'}</p>}
          <div className="map-legend"><span><i className="legend-dot green"/>{language === 'te' ? 'బాగా తెలుసు' : 'Feeling good'}</span><span><i className="legend-dot amber"/>{language === 'te' ? 'సాధనలో' : 'In progress'}</span><span><i className="legend-dot red"/>{language === 'te' ? 'సహాయం కావాలి' : 'Needs a hand'}</span></div>
          {[6,7,8,9,10].map((level) => <div className="map-level" key={level}><div className="map-level-label">{language === 'te' ? `తరగతి ${level}` : `CLASS ${level}`}</div><div className="map-nodes">{dashboard.concepts.filter((item) => item.classLevel === level).map((item) => <button className={`map-node ${masteryTone(showBaseline ? item.baselineMastery : item.mastery)}`} key={item.id} onClick={() => launch(item.slug, 'learn')} title={`${language === 'te' ? item.nameTe ?? item.name : item.name} · ${Math.round((showBaseline ? item.baselineMastery ?? 0 : item.mastery ?? 0) * 100)}%`}><span className="status-symbol">{masteryTone(showBaseline ? item.baselineMastery : item.mastery) === 'green' ? '✓' : masteryTone(showBaseline ? item.baselineMastery : item.mastery) === 'red' ? '!' : '·'}</span><span>{language === 'te' ? item.nameTe ?? item.name : item.name}</span><small>{item.mastery === null ? (language === 'te' ? 'పరీక్షించలేదు' : 'Not checked') : `${Math.round((showBaseline ? item.baselineMastery ?? 0 : item.mastery ?? 0) * 100)}%`}</small></button>)}</div></div>)}
        </section>
      </div>
      <aside className="student-side-column">
        <section className="streak-card"><div className="streak-top"><span className="streak-flame"><Flame size={20} fill="currentColor"/></span><span>{language === 'te' ? 'మీ అభ్యాస పరంపర' : 'YOUR LEARNING STREAK'}</span></div><div className="streak-count">{dashboard.streak.current}<small>{language === 'te' ? ' రోజులు' : dashboard.streak.current === 1 ? ' day' : ' days'}</small></div><p>{dashboard.streak.current ? (language === 'te' ? 'చిన్న అభ్యాసం కూడా పెద్ద పురోగతి.' : 'Small steps add up. Keep going!') : (language === 'te' ? 'ఈరోజు చిన్న అభ్యాసంతో ప్రారంభించండి.' : 'One small activity starts your streak.')}</p><div className="week-strip">{todayKeys.map((day) => <div className={dashboard.streak.history.includes(day.key) ? 'week-day complete' : 'week-day'} key={day.key}><span>{day.label}</span><b>{dashboard.streak.history.includes(day.key) ? <Flame size={14} fill="currentColor"/> : '·'}</b></div>)}</div><div className="streak-stats"><span><Trophy size={14}/>{language === 'te' ? 'అత్యధికం' : 'Best'} <b>{dashboard.streak.longest}</b></span><span><Sparkles size={14}/>{language === 'te' ? 'ఫ్రీజ్‌లు' : 'Freezes'} <b>{dashboard.streak.freezes}/2</b></span></div></section>
        <section className="daily-card"><div className="daily-head"><div><p className="student-kicker">{language === 'te' ? 'రోజువారీ లక్ష్యం' : 'DAILY GOAL'}</p><h3>{language === 'te' ? 'మీరు ముందుకు వెళ్తున్నారు' : 'You’re making progress'}</h3></div><div className="daily-ring" style={{ '--progress': `${ringPct}%` } as React.CSSProperties}><span>{ringPct}%</span></div></div><p>{language === 'te' ? `${dashboard.daily.attempts} ప్రశ్నలకు సాధన చేశారు` : `${dashboard.daily.attempts} answers practised today`}</p><div className="daily-track"><i style={{ width: `${ringPct}%` }}/></div><small>{language === 'te' ? 'రోజుకు ఒక మంచి ప్రయత్నం చాలు.' : 'One thoughtful activity is a good daily goal.'}</small></section>
        <section className="encourage-card"><span><Target size={20}/></span><h3>{language === 'te' ? 'మార్కుల పోటీ లేదు' : 'Your pace is the right pace'}</h3><p>{language === 'te' ? 'ప్రతి చిన్న అడుగు మీ గణిత పటిమను పెంచుతుంది.' : 'Every small step builds your maths confidence. No rankings, just your progress.'}</p></section>
      </aside>
    </div>
    <footer className="student-footer">{language === 'te' ? 'గణితం ఒక్కో అడుగుగా నేర్చుకుందాం.' : 'Maths, one clear step at a time.'}</footer>
  </section>;
}

function MasteryRing({ value, language }: { value: number; language: string }) {
  const pct = Math.round(value * 100);
  return <div className={`mastery-ring ${masteryTone(value)}`} style={{ '--progress': `${pct}%` } as React.CSSProperties} aria-label={`${pct}% ${language === 'te' ? 'పట్టు' : 'mastery'}`}><span>{pct}%</span></div>;
}
function OfflineStatus({ userId, language }: { userId: string; language: string }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(0);
  const refreshCount = useCallback(async () => setPending(await pendingAnswerCount(userId).catch(() => 0)), [userId]);
  const sync = useCallback(async () => {
    setOnline(navigator.onLine);
    if (!navigator.onLine) { await refreshCount(); return; }
    setSyncing(true);
    const result = await syncPendingAnswers(userId).catch(() => ({ synced: 0, remaining: pending }));
    setPending(result.remaining);
    setSynced(result.synced);
    setSyncing(false);
    if (result.synced > 0) window.setTimeout(() => setSynced(0), 5000);
  }, [pending, refreshCount, userId]);
  useEffect(() => {
    void refreshCount();
    if (navigator.onLine) void sync();
    const onlineHandler = () => { setOnline(true); void sync(); };
    const offlineHandler = () => setOnline(false);
    const queueHandler = () => { void refreshCount(); };
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    window.addEventListener('cb-offline-queue-change', queueHandler);
    return () => { window.removeEventListener('online', onlineHandler); window.removeEventListener('offline', offlineHandler); window.removeEventListener('cb-offline-queue-change', queueHandler); };
  }, [refreshCount, sync]);
  const label = !online ? (language === 'te' ? 'ఆఫ్‌లైన్ · అభ్యాసం అందుబాటులో ఉంది' : 'Offline · learning is available') : syncing ? (language === 'te' ? 'సమాధానాలను సమకాలీకరిస్తున్నాం…' : 'Syncing answers…') : pending ? (language === 'te' ? `సమకాలీకరణ కోసం ${pending} సమాధానాలు` : `${pending} answers waiting to sync`) : synced ? (language === 'te' ? `${synced} సమాధానాలు సమకాలీకరించబడ్డాయి` : `${synced} answers synced`) : (language === 'te' ? 'ఆన్‌లైన్‌లో ఉంది' : 'Online');
  return <div className={`offline-status ${online ? 'online' : 'offline'}`} role="status" aria-live="polite">{online ? <Wifi size={14}/> : <WifiOff size={14}/>}<span>{label}</span>{online && pending > 0 && !syncing && <button type="button" onClick={() => void sync()}>{language === 'te' ? 'ఇప్పుడే పంపండి' : 'Sync now'}</button>}</div>;
}
function masteryTone(value: number | null): 'green' | 'amber' | 'red' { return value === null || value < 0.4 ? 'red' : value < 0.76 ? 'amber' : 'green'; }
function recentDays(count: number) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(Date.now());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  const today = Date.UTC(Number(value('year')), Number(value('month')) - 1, Number(value('day')));
  return Array.from({ length: count }, (_, index) => { const date = new Date(today + (index - count + 1) * 86_400_000); const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; const label = new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(date).slice(0, 1); return { key, label }; });
}

function DiagnosticFlow({ userId, dashboard, csrf, language, onComplete, onSignOut }: { userId: string; dashboard: Dashboard; csrf: string; language: string; onComplete: () => void; onSignOut: () => void }) {
  const [activityId] = useState(() => crypto.randomUUID());
  const [path, setPath] = useState<string[]>([]);
  const [conceptId, setConceptId] = useState(dashboard.concepts.find((item) => item.classLevel === dashboard.student.classLevel)?.slug ?? dashboard.concepts[0]?.slug ?? '');
  const [question, setQuestion] = useState<Question | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<'sure'|'unsure'|'guess'|null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [completed, setCompleted] = useState(false);
  const [queuedFinish, setQueuedFinish] = useState(false);
  const packAttempt = useRef(0);
  const target = 8;
  const load = useCallback(async (slug: string) => { setBusy(true); setError(''); try { const response = await api(`/student/question?conceptId=${encodeURIComponent(slug)}&activityId=${activityId}&mode=diagnostic`); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not load the diagnostic question.'); setQuestion(data.question); } catch (e) { const pack = await getTopicPack(userId, slug).catch(() => undefined); if (pack?.questions.length) { const source = pack.questions; setQuestion(source[packAttempt.current++ % source.length]!); } else setError(e instanceof Error ? e.message : 'Could not load this question.'); } finally { setStartedAt(Date.now()); setBusy(false); } }, [activityId, userId]);
  useEffect(() => { if (conceptId) void load(conceptId); }, [conceptId, load]);
  const submit = async () => {
    if (!question || selected === null || !confidence) return;
    setBusy(true); setError('');
    const answer: OfflineAnswer = { clientId: crypto.randomUUID(), activityId, questionId: question.id, selectedOption: selected, confidence, hintsUsed: 0, timeMs: Date.now() - startedAt, mode: 'diagnostic', clientTimestamp: new Date().toISOString() };
    try {
      const response = await api('/student/answer', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify(answer) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not save your answer.');
      setResult(data); setPath((previous) => [...previous, conceptId]);
    } catch (e) { if (!navigator.onLine || e instanceof TypeError) { try { await queueAnswer(userId, answer, csrf); setResult({ pending: true, correct: false, feedback: null, answer: '', mastery: 0, confidence: 0, conceptCheckRequired: false, rewindPath: [], decision: { activity: 'Learn', conceptId, ruleId: 'offline-awaiting-sync', reason: { en: 'This answer will be checked when you reconnect.', te: 'ఆన్‌లైన్‌కు వచ్చిన తర్వాత ఈ సమాధానాన్ని తనిఖీ చేస్తాం.' } }, streak: null }); setPath((previous) => [...previous, conceptId]); } catch { setError(language === 'te' ? 'సమాధానాన్ని భద్రపరచలేకపోయాం.' : 'Could not save your answer.'); } } else setError(e instanceof Error ? e.message : 'Could not save your answer.'); } finally { setBusy(false); }
  };
  const next = async () => {
    if (!result) return;
    const answered = path.length;
    if (answered >= 12) { await finish(); return; }
    const nextConcept = selectNextDiagnosticConcept(dashboard.concepts, dashboard.edges, dashboard.student.classLevel, conceptId, path, result.correct, confidence ?? 'unsure');
    if (answered >= target && result.correct && confidence === 'sure') { await finish(); return; }
    if (!nextConcept) { if (answered >= target) await finish(); else setError(language === 'te' ? 'తర్వాతి ప్రశ్న అందుబాటులో లేదు.' : 'No more diagnostic questions are available.'); return; }
    setResult(null); setSelected(null); setConfidence(null); setConceptId(nextConcept);
  };
  const finish = async () => {
    try { const response = await api('/student/diagnostic/complete', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify({ answered: path.length }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Please answer a few more questions.'); setCompleted(true); }
    catch (e) { if (!navigator.onLine || e instanceof TypeError) { await queueDiagnosticCompletion(userId, csrf, path.length); setQueuedFinish(true); } else setError(e instanceof Error ? e.message : 'Please answer a few more questions.'); }
  };
  useEffect(() => { if (completed) onComplete(); }, [completed, onComplete]);
  useEffect(() => { const complete = () => setCompleted(true); window.addEventListener('cb-diagnostic-complete-synced', complete); return () => window.removeEventListener('cb-diagnostic-complete-synced', complete); }, []);
  if (queuedFinish) return <div className="diagnostic-wrap"><div className="complete-card"><div className="complete-mark"><Check size={28}/></div><p className="student-kicker">{language === 'te' ? 'సమాధానాలు సమకాలీకరణ కోసం వేచి ఉన్నాయి' : 'ANSWERS WAITING TO SYNC'}</p><h2>{language === 'te' ? 'ఇంటర్నెట్ వచ్చిన తర్వాత మీ మొదటి మ్యాప్ సిద్ధమవుతుంది.' : 'Your first map will be ready when you reconnect.'}</h2><p>{language === 'te' ? 'మీ సమాధానాలు ఈ పరికరంలో భద్రంగా ఉన్నాయి.' : 'Your answers are safely stored on this device.'}</p><button className="quiet-button" onClick={onSignOut}>{language === 'te' ? 'నిష్క్రమించండి' : 'Sign out'}</button></div></div>;
  if (completed) return <div className="diagnostic-wrap"><div className="complete-card"><div className="complete-mark"><Check size={28}/></div><p className="student-kicker">{language === 'te' ? 'మొదటి మ్యాప్ సిద్ధం' : 'YOUR FIRST MAP IS READY'}</p><h2>{language === 'te' ? 'చక్కగా ప్రారంభించారు!' : 'A strong start!'}</h2><p>{language === 'te' ? 'మీ సమాధానాల ఆధారంగా మీ తదుపరి అభ్యాస మార్గాన్ని సిద్ధం చేశాం.' : 'We’ve used your answers to find a helpful next step. You can explore your map anytime.'}</p><button className="primary" onClick={onComplete}>{language === 'te' ? 'నా మ్యాప్ చూడండి' : 'See my map'}<ArrowRight size={17}/></button></div></div>;
  const current = dashboard.concepts.find((item) => item.slug === conceptId);
  return <div className="diagnostic-wrap"><div className="diagnostic-top"><div><p className="student-kicker">{language === 'te' ? 'మీ మొదటి చిన్న పరీక్ష' : 'YOUR FIRST CHECK-IN'}</p><h1>{language === 'te' ? 'మీకు ఇప్పటికే తెలిసినవి చూద్దాం' : 'Let’s see what you already know'}</h1><p>{language === 'te' ? 'ఇది పరీక్ష కాదు. మీకు ఉపయోగపడే తర్వాతి అడుగును కనుగొనడమే లక్ష్యం.' : 'This isn’t a test or a grade. It helps us find the next useful step.'}</p></div><button className="quiet-button" onClick={onSignOut}><LockKeyhole size={16}/>{language === 'te' ? 'నిష్క్రమించండి' : 'Sign out'}</button></div>
    <div className="diagnostic-progress"><div><span>{language === 'te' ? 'ప్రశ్న' : 'Question'} {Math.min(path.length + (result ? 0 : 1), 12)} / 12</span><span>{language === 'te' ? 'సుమారు 5 నిమిషాలు' : 'About 5 minutes'}</span></div><div className="daily-track"><i style={{ width: `${Math.min(100, path.length / 8 * 100)}%` }}/></div></div>
    <QuestionCard question={question} conceptName={current ? (language === 'te' ? current.nameTe ?? current.name : current.name) : ''} busy={busy} error={error} selected={selected} setSelected={setSelected} confidence={confidence} setConfidence={setConfidence} result={result} submit={submit} next={next} language={language} mode="diagnostic" hintsUsed={0}/>
  </div>;
}

function ActivityFlow({ userId, concept, mode: initialMode, csrf, language, edges, onBack, onRefresh, onOpen }: { userId: string; concept: ConceptItem; mode: Mode; csrf: string; language: string; edges: Dashboard['edges']; onBack: () => void; onRefresh: () => Promise<void>; onOpen: (id: string, mode: Mode) => void }) {
  const [activityId] = useState(() => crypto.randomUUID());
  const mode = initialMode;
  const [explanations, setExplanations] = useState<Array<{ variant: string; text: { en: string; te?: string } }>>([]);
  const [variant, setVariant] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<'sure'|'unsure'|'guess'|null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [testResults, setTestResults] = useState<Array<{ correct: boolean }>>([]);
  const [offlineTestCount, setOfflineTestCount] = useState(0);
  const [testDecision, setTestDecision] = useState<ReturnType<typeof evaluateAdaptiveTest> | null>(null);
  const [solveCount, setSolveCount] = useState(0);
  const [skipCheck, setSkipCheck] = useState(false);
  const [skipCorrect, setSkipCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [streakMessage, setStreakMessage] = useState<{ en: string; te: string } | null>(null);
  const [learnVariantError, setLearnVariantError] = useState(false);
  const [wrongStreak, setWrongStreak] = useState(0);
  const packAttempt = useRef(0);
  const cachedPackRequested = useRef(false);
  const prefetchKey = `${userId}:${activityId}:${concept.slug}:${mode}`;
  const prefetchedQuestion = useRef<{ key: string; expiresAt: number; promise: Promise<Question> } | null>(null);
  useEffect(() => { prefetchedQuestion.current = null; }, [prefetchKey]);
  const requestQuestion = useCallback(async () => {
    const response = await api(`/student/question?conceptId=${encodeURIComponent(concept.slug)}&activityId=${activityId}&mode=${mode}`);
    const data = await response.json();
    if (!response.ok || !data.question) throw new Error(data.error?.message ?? 'Could not load this question.');
    if (data.studentId !== userId || data.concept?.id !== concept.slug || data.activity !== mode || data.activityId !== activityId) throw new Error('The fetched question does not match this activity.');
    return data.question as Question;
  }, [activityId, concept.slug, mode, userId]);
  const loadQuestion = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const next = await requestQuestion();
      setQuestion(next);
      if (!cachedPackRequested.current) { cachedPackRequested.current = true; void fetchAndCacheTopicPack(userId, concept.slug).catch(() => undefined); }
    } catch (e) {
      const pack = await getTopicPack(userId, concept.slug).catch(() => undefined);
      if (pack?.questions.length) {
        if (mode === 'challenge') setQuestion(selectOfflineChallengeQuestion(pack.questions, packAttempt.current++) ?? pack.questions[0]!);
        else { const available = mode === 'test' || mode === 'diagnostic' || mode === 'revise' ? pack.questions.filter((item) => item.difficulty === 3) : pack.questions; const source = available.length ? available : pack.questions; setQuestion(source[packAttempt.current++ % source.length]!); }
      }
      else setError(e instanceof Error ? e.message : (language === 'te' ? 'ఈ ప్రశ్నను తెరవలేకపోయాం.' : 'Could not load this question.'));
    } finally { setStartedAt(Date.now()); setBusy(false); }
  }, [concept.slug, language, mode, requestQuestion, userId]);
  const prefetchNextQuestion = () => {
    const entry = { key: prefetchKey, expiresAt: Date.now() + 30_000, promise: requestQuestion() };
    prefetchedQuestion.current = entry;
    void entry.promise.catch(() => { if (prefetchedQuestion.current === entry) prefetchedQuestion.current = null; });
  };
  const loadNextQuestion = async () => {
    const entry = prefetchedQuestion.current;
    if (!entry || entry.key !== prefetchKey || Date.now() >= entry.expiresAt) {
      prefetchedQuestion.current = null;
      await loadQuestion();
      return;
    }
    setBusy(true); setError('');
    try {
      const next = await entry.promise;
      if (Date.now() >= entry.expiresAt || prefetchedQuestion.current !== entry) throw new Error('The prefetched question expired.');
      prefetchedQuestion.current = null;
      setQuestion(next);
      if (!cachedPackRequested.current) { cachedPackRequested.current = true; void fetchAndCacheTopicPack(userId, concept.slug).catch(() => undefined); }
    } catch {
      if (prefetchedQuestion.current === entry) prefetchedQuestion.current = null;
      await loadQuestion();
    } finally { setStartedAt(Date.now()); setBusy(false); }
  };
  useEffect(() => {
    if (mode === 'learn') {
      void api(`/student/learn/${encodeURIComponent(concept.slug)}`).then((response) => response.json()).then((data) => { setExplanations(data.explanations ?? []); if (!cachedPackRequested.current) { cachedPackRequested.current = true; void fetchAndCacheTopicPack(userId, concept.slug).catch(() => undefined); } }).catch(async () => { const pack = await getTopicPack(userId, concept.slug).catch(() => undefined); if (pack) setExplanations(pack.explanations); else setError(language === 'te' ? 'వివరణను తెరవలేకపోయాం.' : 'Could not load the explanation.'); });
    } else void loadQuestion();
  }, [concept.slug, language, mode, userId, loadQuestion]);
  const submit = async () => {
    if (!question || selected === null || !confidence) return;
    setBusy(true); setError('');
    const answer: OfflineAnswer = { clientId: crypto.randomUUID(), activityId, questionId: question.id, selectedOption: selected, confidence, hintsUsed, timeMs: Date.now() - startedAt, mode, clientTimestamp: new Date().toISOString() };
    try {
      const response = await api('/student/answer', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify(answer) });
      const data: AnswerResult = await response.json(); if (!response.ok) throw new Error((data as any).error?.message ?? 'Could not save your answer.');
      setResult(data);
      if (data.streak?.message) setStreakMessage(data.streak.message);
      setWrongStreak(data.correct ? 0 : (count) => count + 1);
      if (mode === 'solve') setSolveCount((value) => value + 1);
      if ((mode === 'test' || mode === 'revise') && !data.pending) { const collected = [...testResults, { correct: data.correct }]; setTestResults(collected); setTestDecision(data.testDecision ?? evaluateAdaptiveTest(collected)); }
      if (mode === 'learn' && skipCheck && data.correct) setSkipCorrect((count) => count + 1);
      if (mode === 'learn' && !data.correct) setLearnVariantError(true);
      const willContinue = mode === 'test' || mode === 'revise' ? !data.testDecision?.stop
        : mode === 'solve' ? solveCount + 1 < 5
          : mode === 'learn' ? (skipCheck ? data.correct && skipCorrect < 2 : !data.correct)
            : true;
      if (willContinue) prefetchNextQuestion();
    } catch (e) {
      if (!navigator.onLine || e instanceof TypeError) {
        try { await queueAnswer(userId, answer, csrf); if (mode === 'test' || mode === 'revise') setOfflineTestCount((count) => count + 1); setResult({ pending: true, correct: false, feedback: null, answer: '', mastery: concept.mastery ?? 0, confidence: concept.confidence, conceptCheckRequired: false, rewindPath: [], decision: { activity: 'Learn', conceptId: concept.slug, ruleId: 'offline-awaiting-sync', reason: { en: 'This answer will be checked when you reconnect.', te: 'ఆన్‌లైన్‌కు వచ్చిన తర్వాత ఈ సమాధానాన్ని తనిఖీ చేస్తాం.' } }, streak: null }); }
        catch { setError(language === 'te' ? 'సమాధానాన్ని భద్రపరచలేకపోయాం. మళ్లీ ప్రయత్నించండి.' : 'Your answer could not be saved. Please try again.'); }
      } else setError(e instanceof Error ? e.message : 'Could not save your answer.');
    }
    finally { setBusy(false); }
  };
  const nextQuestion = () => { setResult(null); setSelected(null); setConfidence(null); setHintsUsed(0); void loadNextQuestion(); };
  const conceptName = language === 'te' ? concept.nameTe ?? concept.name : concept.name;
  const variantText = explanations[variant] ? txt(explanations[variant]!.text, language) : (language === 'te' ? `${conceptName} భావనను దశలవారీగా పరిశీలిద్దాం.` : `Let’s make ${concept.name.toLowerCase()} easier, one step at a time.`);
  const masteryProgress = result?.mastery ?? concept.mastery ?? 0;
  const nextStep = () => {
    if (mode === 'test' || mode === 'revise') {
      if (result?.pending && offlineTestCount >= 8) { setDone(true); void onRefresh(); return; }
      if (testDecision?.stop) { setDone(true); void onRefresh(); return; }
      nextQuestion(); return;
    }
    if (mode === 'solve') { if (solveCount >= 5) { setDone(true); void onRefresh(); } else nextQuestion(); return; }
    if (mode === 'learn') {
      if (skipCheck) {
        if (!result?.correct) { setSkipCheck(false); setSkipCorrect(0); setResult(null); setSelected(null); setConfidence(null); setVariant(0); return; }
        if (skipCorrect >= 2) { setDone(true); void onRefresh(); return; }
        nextQuestion(); return;
      }
      if (!result?.correct && learnVariantError && variant < 1) { setVariant(1); setLearnVariantError(false); setResult(null); setSelected(null); setConfidence(null); void loadNextQuestion(); return; }
      if (result?.correct) { setDone(true); void onRefresh(); } else nextQuestion();
      return;
    }
    nextQuestion();
  };
  const switchOrRewind = () => {
    if (variant === 0) { setVariant(1); setLearnVariantError(false); setResult(null); setSelected(null); setConfidence(null); }
    else { const prerequisite = edges.find((edge) => edge.dependent === concept.slug); if (prerequisite) { onOpen(prerequisite.prerequisite, 'learn'); return; } setVariant(0); }
  };
  if (done) return <div className="activity-wrap"><OfflineStatus userId={userId} language={language}/><button className="back-button" onClick={onBack}><ArrowLeft size={17}/>{language === 'te' ? 'మ్యాప్‌కు తిరిగి' : 'Back to my map'}</button><div className="complete-card"><div className="complete-mark"><Check size={28}/></div><p className="student-kicker">{result?.pending ? (language === 'te' ? 'సమాధానాలు సమకాలీకరణ కోసం వేచి ఉన్నాయి' : 'ANSWERS WAITING TO SYNC') : mode === 'test' || mode === 'revise' ? (testDecision?.outcome === 'pass' ? 'MASTERY CONFIRMED' : 'NEXT STEP READY') : 'NICE WORK'}</p><h2>{result?.pending ? (language === 'te' ? 'ఆన్‌లైన్‌కు వచ్చిన తర్వాత పరీక్ష పూర్తవుతుంది.' : 'Your check will finish when you reconnect.') : mode === 'test' || mode === 'revise' ? (testDecision?.outcome === 'pass' ? (language === 'te' ? 'మీకు ఈ భావనపై మంచి పట్టు ఉంది!' : 'You’ve got this idea!') : (language === 'te' ? 'మరింత సాధనతో ఇది సులభమవుతుంది.' : 'A little more practice will help.')) : (language === 'te' ? 'చక్కగా సాధన చేశారు!' : 'You showed up and made progress!')}</h2><p>{result?.pending ? (language === 'te' ? 'మీ సమాధానాలు ఈ పరికరంలో భద్రంగా ఉన్నాయి. ఇంటర్నెట్ వచ్చిన వెంటనే తనిఖీకి పంపుతాం.' : 'Your answers are safely stored on this device and will be checked when you’re back online.') : testDecision?.reason ?? (language === 'te' ? 'ప్రతి ప్రయత్నం మీ గణిత పటిమను పెంచుతుంది.' : 'Every thoughtful try helps your maths confidence grow.')}</p>{streakMessage && <div className="streak-toast"><Flame size={18}/>{txt(streakMessage, language)}</div>}<button className="primary" onClick={() => { if (testDecision?.outcome !== 'pass' && mode === 'test' && !result?.pending) onOpen(concept.slug, 'learn'); else onBack(); }}>{result?.pending ? (language === 'te' ? 'నా మ్యాప్ చూడండి' : 'Back to my map') : testDecision?.outcome !== 'pass' && mode === 'test' ? (language === 'te' ? 'నేర్చుకోవడం కొనసాగించండి' : 'Continue learning') : (language === 'te' ? 'నా మ్యాప్ చూడండి' : 'Back to my map')}<ArrowRight size={17}/></button></div></div>;
  return <div className="activity-wrap"><OfflineStatus userId={userId} language={language}/><button className="back-button" onClick={onBack}><ArrowLeft size={17}/>{language === 'te' ? 'నా మ్యాప్' : 'My map'}</button>
    <div className="activity-heading"><div><p className="student-kicker">{language === 'te' ? activityLabels[mode].te : activityLabels[mode].en} · {concept.chapter}</p><h1>{conceptName}</h1><p>{language === 'te' ? `తరగతి ${concept.classLevel}` : `Class ${concept.classLevel}`}</p></div><MasteryRing value={masteryProgress} language={language}/></div>
    {mode === 'learn' && <section className="explanation-card"><div className="explanation-tabs"><button className={variant === 0 ? 'selected' : ''} onClick={() => setVariant(0)}>{language === 'te' ? 'దశలవారీగా' : 'Step by step'}</button><button className={variant === 1 ? 'selected' : ''} onClick={() => setVariant(1)}>{language === 'te' ? 'రోజువారీ ఉదాహరణ' : 'Real-life example'}</button></div><div className="lesson-icon"><BookOpen size={21}/></div><p>{variantText}</p><div className="lesson-actions"><button className="quiet-button" onClick={switchOrRewind}><CircleHelp size={16}/>{language === 'te' ? 'అర్థం కాలేదు' : 'I didn’t get it'}</button><button className="quiet-button" onClick={() => { setSkipCheck(true); setSkipCorrect(0); void loadQuestion(); }}>{language === 'te' ? 'నాకు తెలుసు — పరీక్షించండి' : 'Skip, I know this'}</button></div><button className="primary lesson-start" onClick={() => { setSkipCheck(false); void loadQuestion(); }}>{skipCheck ? (language === 'te' ? '2 ప్రశ్నల పరీక్ష' : 'Start 2-question check') : (language === 'te' ? 'చిన్న ప్రశ్న ప్రయత్నించండి' : 'Try a quick check')}<ArrowRight size={17}/></button></section>}
    {mode === 'solve' && <div className="solve-progress"><span>{language === 'te' ? `సాధన ${Math.min(solveCount + (result ? 0 : 1), 5)} / 5` : `Practice set ${Math.min(solveCount + (result ? 0 : 1), 5)} / 5`}</span><div className="daily-track"><i style={{ width: `${Math.min(solveCount / 5 * 100, 100)}%` }}/></div></div>}
    {mode === 'solve' && wrongStreak >= 2 && <div className="lesson-success"><Lightbulb size={17}/>{language === 'te' ? 'తప్పులు సాధనలో భాగం. ఈ ప్రశ్నలను కొంచెం సులభం చేశాం.' : 'Mistakes are part of learning. We’ll make the next questions a little gentler.'}</div>}
    {(mode === 'test' || mode === 'revise') && <div className="solve-progress"><span>{language === 'te' ? `ప్రశ్నలు ${testResults.length + offlineTestCount + (result ? 0 : 1)} · స్వల్ప పరీక్ష` : `Question ${testResults.length + offlineTestCount + (result ? 0 : 1)} · Short check`}</span><span>{testDecision?.outcome === 'continue' ? (language === 'te' ? 'మరో సమాధానం నిర్ణయాన్ని స్పష్టం చేస్తుంది' : 'Your next answer will help make the call') : ''}</span></div>}
    {mode === 'learn' && result?.correct && <div className="lesson-success"><Check size={17}/>{language === 'te' ? 'సరైన దిశలో ఉన్నారు!' : 'That’s right. You’re building this idea.'}</div>}
    {question && mode !== 'learn' && <QuestionCard question={question} conceptName={conceptName} busy={busy} error={error} selected={selected} setSelected={setSelected} confidence={confidence} setConfidence={setConfidence} result={result} submit={submit} next={nextStep} language={language} mode={mode} hintsUsed={hintsUsed} setHintsUsed={setHintsUsed} nextLabel={mode === 'test' || mode === 'revise' ? (testDecision?.stop ? (language === 'te' ? 'ఫలితాన్ని చూడండి' : 'See result') : undefined) : undefined} />}
    {mode === 'learn' && question && <QuestionCard question={question} conceptName={conceptName} busy={busy} error={error} selected={selected} setSelected={setSelected} confidence={confidence} setConfidence={setConfidence} result={result} submit={submit} next={nextStep} language={language} mode={mode} hintsUsed={hintsUsed} setHintsUsed={setHintsUsed} nextLabel={skipCheck ? `${language === 'te' ? 'తర్వాతి ప్రశ్న' : 'Next check'}${skipCorrect >= 1 ? ' · 2' : ' · 1'}` : undefined} />}
    {(mode === 'test' || mode === 'revise') && testDecision && <div className="test-evidence">{language === 'te' ? `సమాధానాలు: ${testDecision.questionsAsked} · ఆధార సూచిక: ${testDecision.logLikelihoodRatio.toFixed(2)}` : `Answers used: ${testDecision.questionsAsked} · Evidence: ${testDecision.logLikelihoodRatio.toFixed(2)}`}</div>}
  </div>;
}

function QuestionCard({ question, conceptName, busy, error, selected, setSelected, confidence, setConfidence, result, submit, next, language, mode, hintsUsed, setHintsUsed, nextLabel }: { question: Question | null; conceptName: string; busy: boolean; error: string; selected: number | null; setSelected: (value: number | null) => void; confidence: 'sure'|'unsure'|'guess'|null; setConfidence: (value: 'sure'|'unsure'|'guess'|null) => void; result: AnswerResult | null; submit: () => void; next: () => void; language: string; mode: Mode; hintsUsed: number; setHintsUsed?: (value: number) => void; nextLabel?: string }) {
  const hint = question?.hints[hintsUsed];
  return <section className="question-card"><div className="question-card-top"><span><Target size={16}/>{conceptName}</span><span>{mode === 'solve' || mode === 'challenge' ? `Level ${question?.difficulty ?? 1}` : activityLabels[mode][language === 'te' ? 'te' : 'en']}</span></div>
    {question ? <><h2>{txt(question.text, language)}</h2><div className="answer-options">{question.options.map((option) => { const selectedWrong = result && selected === option.index && !result.correct; const selectedRight = result && selected === option.index && result.correct; return <button key={option.index} disabled={Boolean(result) || busy} className={`answer-option ${selected === option.index ? 'selected' : ''} ${selectedRight ? 'right' : ''} ${selectedWrong ? 'wrong' : ''}`} onClick={() => setSelected(option.index)}><span className="option-letter">{String.fromCharCode(65 + option.index)}</span><span>{txt(option.text, language)}</span>{selectedRight && <Check size={18}/>}</button>; })}</div>
      {mode !== 'test' && mode !== 'revise' && setHintsUsed && !result && <div className="hint-area">{hint && hintsUsed > 0 && <div className="hint-reveal"><Lightbulb size={16}/><span>{txt(hint, language)}</span></div>}<button className="hint-button" disabled={busy || hintsUsed >= 3} onClick={() => setHintsUsed(Math.min(hintsUsed + 1, 3))}><Lightbulb size={15}/>{language === 'te' ? `సూచన ${Math.min(hintsUsed + 1, 3)} / 3` : `Hint ${Math.min(hintsUsed + 1, 3)} of 3`}</button></div>}
      {result && <div className={`answer-feedback ${result.pending ? '' : result.correct ? 'positive' : 'negative'}`} role="status">{result.pending ? <><CircleHelp size={17}/><span>{language === 'te' ? 'ఆఫ్‌లైన్‌లో భద్రపరిచాం. ఆన్‌లైన్‌కు వచ్చిన తర్వాత తనిఖీ చేస్తాం.' : 'Saved offline. We’ll check your answer when you reconnect.'}</span></> : result.correct ? <><Check size={17}/><span>{language === 'te' ? 'సరైన సమాధానం!' : 'That’s correct!'}</span></> : <><CircleHelp size={17}/><span>{txt(result.feedback ?? (language === 'te' ? 'మళ్లీ ఆలోచిద్దాం.' : 'Let’s look at this step again.'), language)} <b>{language === 'te' ? 'సమాధానం:' : 'Answer:'} {typeof result.answer === 'string' ? result.answer : txt(result.answer, language)}</b>{result.conceptCheckRequired && <em>{language === 'te' ? 'ఈ దశను కలిసి పరిశీలిద్దాం.' : 'Let’s check this idea together.'}</em>}</span></>}</div>}
      {!result && <div className="confidence-row"><span>{language === 'te' ? 'మీ సమాధానంపై ఎంత నమ్మకం ఉంది?' : 'How sure do you feel?'}</span>{(['sure', 'unsure', 'guess'] as const).map((value) => <button key={value} className={confidence === value ? 'selected' : ''} onClick={() => setConfidence(value)}>{value === 'sure' ? (language === 'te' ? 'నమ్మకం' : 'Sure') : value === 'unsure' ? (language === 'te' ? 'కొంత' : 'Unsure') : (language === 'te' ? 'ఊహ' : 'Guess')}</button>)}</div>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="primary question-submit" disabled={busy || (!result && (selected === null || confidence === null))} onClick={result ? next : submit}>{busy ? (language === 'te' ? 'భద్రపరుస్తున్నాం…' : 'Saving…') : result ? (nextLabel ?? (language === 'te' ? 'కొనసాగించండి' : 'Continue')) : (language === 'te' ? 'సమాధానం తనిఖీ' : 'Check answer')}<ArrowRight size={17}/></button>
    </> : <div className="question-loading"><div className="loading-dot"/><span>{error || (language === 'te' ? 'ప్రశ్నను సిద్ధం చేస్తున్నాం…' : 'Getting your question ready…')}</span></div>}
  </section>;
}







