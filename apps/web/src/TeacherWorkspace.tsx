import { api } from './api';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, Bell, BookOpen, Check, ChevronDown, ClipboardCheck, Copy, Flame, Lightbulb, Plus, Printer, RefreshCw, ScanLine, Search, Trash2, Users, X } from 'lucide-react';
import { createClassroomSchema, type SessionUser } from '@conceptbridge/shared';
import './teacher.css';

const WorksheetBuilder = lazy(() => import('./WorksheetStudio'));
const WorksheetScanner = lazy(() => import('./WorksheetScanner'));
import './teacher.css';

type GroupName = 'ready-to-advance' | 'on-track' | 'needs-basics';
type Student = { id: string; name: string; rollNo: string; classLevel: number; language: string; lastActiveAt: string | null; group: GroupName; mastery: Record<string, number>; overallMastery: number; weakConcepts: number; streak: number; values: Array<number | null> };
type Concept = { id: string; slug: string; name: string; nameTe?: string; classLevel: number; chapter: string };
type ActivitySources = { real: number; demo: number; unclassified: number };
type TeacherDashboard = { classes: Array<{ id: string; name: string; classLevel: number; board: string }>; classroom: { id: string; name: string; code: string; classLevel: number; board: string } | null; concepts: Concept[]; students: Student[]; groups: Array<{ group: GroupName; count: number; studentIds: string[]; activity: string; approved: boolean; updatedAt: string | null }>; activitySources?: ActivitySources; masteryAttribution?: string; misconceptions: Array<{ id: string; text: { en: string; te: string }; conceptId: string; conceptName: string; likelyRootCause?: string; studentCount: number; attemptCount: number; activitySources?: ActivitySources }>; alerts: Array<{ id: string; studentId: string; studentName: string; type: string; message: { en: string; te: string } }>; };
type StudentDetails = { student: { id: string; name: string; rollNo: string; classLevel: number; language: string; lastActiveAt: string | null }; concepts: Array<{ id: string; slug: string; name: string; nameTe?: string; classLevel: number; mastery: number | null; baselineMastery: number | null; confidence: number; nextRevisionAt: string | null }>; rewind: { path: string[]; names: string[]; reason: string } | null; misconceptions: Array<{ text: { en: string; te: string }; concept: string; date: string }>; attempts: Array<{ id: string; concept: string; question: { en: string; te?: string }; correct: boolean; confidence: string; hintsUsed: number; misconception: { en: string; te: string } | null; mode: string; provenance: 'real' | 'demo' | 'unclassified'; date: string }>; decisions: Array<{ activity: string; ruleId: string; reason: { en: string; te: string }; inputs: Record<string, unknown>; createdAt: string }>; streak: { current: number; longest: number; freezes: number; history: string[] } };
type Props = { user: SessionUser; csrf: string; onSignOut: () => void; language: string };
const groupText: Record<GroupName, { en: string; te: string }> = { 'ready-to-advance': { en: 'Ready to advance', te: 'ముందుకు సిద్ధం' }, 'on-track': { en: 'On track', te: 'సరైన దారిలో' }, 'needs-basics': { en: 'Needs basics', te: 'ప్రాథమికాలు అవసరం' } };
const localized = (value: { en: string; te: string } | undefined, language: string) => value ? (language === 'te' ? value.te : value.en) : '';
const conceptLabel = (concept: { name: string; nameTe?: string }, language: string) => language === 'te' ? concept.nameTe ?? concept.name : concept.name;
const ui = (language: string, en: string, te: string) => language === 'te' ? te : en;
const pct = (n: number | null | undefined) => n === null || n === undefined ? null : Math.round(n * 100);

export default function TeacherWorkspace({ user, csrf, onSignOut, language }: Props) {
  const [dashboard, setDashboard] = useState<TeacherDashboard | null>(null);
  const [classId, setClassId] = useState('');
  const [classLevelFilter, setClassLevelFilter] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [masteryFilter, setMasteryFilter] = useState('all');
  const [studentSort, setStudentSort] = useState('roll');
  const [detail, setDetail] = useState<StudentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classroomActionError, setClassroomActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [worksheetTool, setWorksheetTool] = useState<'create' | 'scan' | null>(null);
  const [classroomFormOpen, setClassroomFormOpen] = useState(false);
  const [creatingClassroom, setCreatingClassroom] = useState(false);
  const [removingStudentId, setRemovingStudentId] = useState('');
  const classIdRef = useRef(classId);
  classIdRef.current = classId;
  const refresh = useCallback(async (requestedClass?: string) => {
    const selectedClass = requestedClass ?? classIdRef.current;
    setLoading(true); setError('');
    try { const query = selectedClass ? `?classId=${encodeURIComponent(selectedClass)}` : ''; const response = await api(`/teacher/dashboard${query}`); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not load your class.'); setDashboard(data); if (data.classroom?.id && selectedClass !== data.classroom.id) setClassId(data.classroom.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh('');
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refreshWhenVisible); window.removeEventListener('focus', refreshWhenVisible); };
  }, [refresh]);
  const openStudent = async (studentId: string) => {
    setLoading(true); setError('');
    try { const response = await api(`/teacher/students/${studentId}`); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not open this student.'); setDetail(data); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open this student.'); }
    finally { setLoading(false); }
  };
  const acknowledge = async (id: string) => {
    try { const response = await api(`/teacher/alerts/${id}/acknowledge`, { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: '{}' }); if (!response.ok) throw new Error('Could not dismiss that alert.'); setNotice('Alert acknowledged.'); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not dismiss the alert.'); }
  };
  const savePlan = async (group: GroupName, activity: string, approved: boolean) => {
    if (!dashboard?.classroom) return;
    const response = await api('/teacher/group-plans', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify({ classId: dashboard.classroom.id, group, activity, approved }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not save the group plan.');
    setNotice(approved ? 'Tomorrow’s group activity approved.' : 'Group activity updated.'); await refresh();
  };
  const saveOverride = async (values: { conceptId: string; action: 'assign'|'lock'|'skip'; activity?: string }) => {
    if (!dashboard?.classroom || !detail) return;
    const response = await api('/teacher/overrides', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify({ classId: dashboard.classroom.id, target: 'student', studentId: detail.student.id, ...values }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not save the teacher instruction.');
    setNotice('Teacher instruction saved.'); await refresh(); await openStudent(detail.student.id);
  };
  const saveGroupOverride = async (group: GroupName, values: { conceptId: string; action: 'assign'|'lock'|'skip'; activity?: string }) => {
    if (!dashboard?.classroom) return;
    const response = await api('/teacher/overrides', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify({ classId: dashboard.classroom.id, target: 'group', group, ...values }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not save the group instruction.');
    setNotice(`Teacher instruction saved for ${groupText[group].en}.`); await refresh();
  };
  const createClassroom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = createClassroomSchema.safeParse({ name: form.get('name'), classLevel: form.get('classLevel'), board: form.get('board') });
    if (!parsed.success) { setClassroomActionError(ui(language, 'Enter a classroom name and choose a class from 6 to 10.', 'తరగతి పేరు నమోదు చేసి 6 నుంచి 10 మధ్య తరగతిని ఎంచుకోండి.')); return; }
    setCreatingClassroom(true); setClassroomActionError(''); setNotice('');
    try {
      const response = await api('/teacher/classrooms', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify(parsed.data) });
      const data = await response.json();
      if (!response.ok || !data.classroom?.id) throw new Error(data.error?.message ?? ui(language, 'Could not create the classroom. Please try again.', 'తరగతిని సృష్టించలేకపోయాం. మళ్లీ ప్రయత్నించండి.'));
      setClassId(data.classroom.id); setClassroomFormOpen(false); setNotice(ui(language, 'Classroom created. Share its code with your students.', 'తరగతి సృష్టించబడింది. కోడ్‌ను విద్యార్థులతో పంచుకోండి.'));
      await refresh(data.classroom.id);
    } catch (cause) { setClassroomActionError(cause instanceof Error ? cause.message : ui(language, 'Could not create the classroom. Please try again.', 'తరగతిని సృష్టించలేకపోయాం. మళ్లీ ప్రయత్నించండి.')); }
    finally { setCreatingClassroom(false); }
  };
  const copyClassroomCode = async () => {
    if (!dashboard?.classroom) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(dashboard.classroom.code);
      setNotice(ui(language, 'Classroom code copied.', 'తరగతి కోడ్ కాపీ అయింది.')); setClassroomActionError('');
    } catch { setClassroomActionError(ui(language, 'Could not copy the code. Select and copy it manually.', 'కోడ్‌ను కాపీ చేయలేకపోయాం. దయచేసి ఎంచుకుని కాపీ చేయండి.')); }
  };
  const removeStudent = async (student: Student) => {
    if (!dashboard?.classroom || removingStudentId) return;
    const confirmed = window.confirm(ui(language,
      `Remove ${student.name} from this classroom? Their access will be disabled, but their learning history will be preserved.`,
      `${student.name}ను ఈ తరగతి నుంచి తొలగించాలా? వారి ప్రవేశం నిలిపివేయబడుతుంది, కానీ అభ్యాస చరిత్ర భద్రంగా ఉంటుంది.`));
    if (!confirmed) return;
    setRemovingStudentId(student.id); setClassroomActionError(''); setNotice('');
    try {
      const response = await api(`/teacher/classrooms/${encodeURIComponent(dashboard.classroom.id)}/students/${encodeURIComponent(student.id)}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrf } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? ui(language, 'Could not remove this student. Please try again.', 'ఈ విద్యార్థిని తొలగించలేకపోయాం. మళ్లీ ప్రయత్నించండి.'));
      setClassroomActionError('');
      setNotice(ui(language, `${student.name} was removed. Their learning history is preserved.`, `${student.name} తొలగించబడ్డారు. వారి అభ్యాస చరిత్ర భద్రంగా ఉంది.`));
      await refresh(dashboard.classroom.id);
    } catch (cause) {
      setClassroomActionError(cause instanceof Error ? cause.message : ui(language, 'Could not remove this student. Please try again.', 'ఈ విద్యార్థిని తొలగించలేకపోయాం. మళ్లీ ప్రయత్నించండి.'));
    } finally { setRemovingStudentId(''); }
  };
  const classroomForm = classroomFormOpen && <form className="classroom-create-form" onSubmit={(event) => void createClassroom(event)}>
    <label>{ui(language, 'Classroom name', 'తరగతి పేరు')}<input name="name" required minLength={2} maxLength={80} placeholder={ui(language, 'e.g. Class 8 Mathematics', 'ఉదా. 8వ తరగతి గణితం')}/></label>
    <label>{ui(language, 'Class level', 'తరగతి స్థాయి')}<select name="classLevel" defaultValue="6">{[6, 7, 8, 9, 10].map((level) => <option key={level} value={level}>{ui(language, 'Class', 'తరగతి')} {level}</option>)}</select></label>
    <label>{ui(language, 'Board', 'బోర్డు')}<select name="board" defaultValue="CBSE"><option value="CBSE">CBSE</option><option value="TELANGANA_SCERT">Telangana SCERT</option></select></label>
    <div className="classroom-form-actions"><button className="primary" type="submit" disabled={creatingClassroom}>{creatingClassroom ? ui(language, 'Creating…', 'సృష్టిస్తున్నాం…') : ui(language, 'Create Classroom', 'తరగతిని సృష్టించండి')}<Plus size={16}/></button><button className="quiet-button" type="button" disabled={creatingClassroom} onClick={() => { setClassroomFormOpen(false); setClassroomActionError(''); }}>{ui(language, 'Cancel', 'రద్దు')}</button></div>
  </form>;
  const selectedStudents = (dashboard?.students.filter((student) => {
    const matchesLevel = classLevelFilter === 'all' || student.classLevel === Number(classLevelFilter);
    const matchesSearch = `${student.name} ${student.rollNo}`.toLocaleLowerCase().includes(studentSearch.trim().toLocaleLowerCase());
    const matchesMastery = masteryFilter === 'all' || student.group === masteryFilter;
    return matchesLevel && matchesSearch && matchesMastery;
  }) ?? []).sort((a, b) => studentSort === 'name' ? a.name.localeCompare(b.name) : studentSort === 'status' ? a.group.localeCompare(b.group) || a.name.localeCompare(b.name) : a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
  const activeCount = dashboard?.students.filter((student) => student.lastActiveAt && Date.now() - new Date(student.lastActiveAt).getTime() < 3 * 86_400_000).length ?? 0;
  const avgMastery = dashboard?.students.length ? Math.round(dashboard.students.reduce((sum, item) => sum + item.overallMastery, 0) / dashboard.students.length * 100) : 0;

  if (worksheetTool && dashboard?.classroom) return <section className="teacher-shell"><Suspense fallback={<div className="teacher-loading"><div className="loading-dot"/><p>{ui(language, 'Loading worksheet tools…', 'వర్క్‌షీట్ సాధనాలను తెరుస్తున్నాం…')}</p></div>}>{worksheetTool === 'create' ? <WorksheetBuilder classId={dashboard.classroom.id} classroom={dashboard.classroom} concepts={dashboard.concepts} csrf={csrf} language={language} onBack={() => setWorksheetTool(null)}/> : <WorksheetScanner classId={dashboard.classroom.id} csrf={csrf} language={language} onBack={() => setWorksheetTool(null)}/>}</Suspense></section>;
  if (loading && !dashboard && !detail) return <section className="teacher-shell"><div className="teacher-loading"><div className="loading-dot"/><p>{ui(language, 'Opening your classroom…', 'మీ తరగతిని తెరుస్తున్నాం…')}</p><div className="skeleton-line"/><div className="skeleton-line short"/></div></section>;
  if (detail) return <section className="teacher-shell"><TeacherDetail detail={detail} concepts={dashboard?.concepts ?? []} classId={dashboard?.classroom?.id ?? ''} language={language} onBack={() => setDetail(null)} onSaveOverride={saveOverride}/>{error && <p className="teacher-error" role="alert">{error}</p>}</section>;
  if (dashboard && !dashboard.classroom && dashboard.classes.length === 0) return <section className="teacher-shell"><header className="teacher-header"><div><p className="teacher-kicker">{ui(language, 'TEACHER WORKSPACE', 'ఉపాధ్యాయ వేదిక')} · {user.name.toUpperCase()}</p><h1>{ui(language, 'Create your first classroom', 'మీ మొదటి తరగతిని సృష్టించండి')}</h1><p>{ui(language, 'A classroom gives students a code to use with their roll number and PIN.', 'విద్యార్థులు తమ రోల్ నంబర్, పిన్‌తో ఉపయోగించే కోడ్‌ను తరగతి ద్వారా పొందుతారు.')}</p></div><button className="primary" onClick={() => setClassroomFormOpen(true)}><Plus size={16}/>{ui(language, 'Create Classroom', 'తరగతిని సృష్టించండి')}</button></header>{classroomForm}{classroomActionError && <p className="teacher-error" role="alert">{classroomActionError}</p>}{notice && <p className="teacher-notice" role="status">{notice}</p>}</section>;
  if (!dashboard || error) return <section className="teacher-shell"><div className="teacher-loading"><AlertTriangle/><h2>{ui(language, 'Classroom unavailable', 'తరగతి అందుబాటులో లేదు')}</h2><p>{error || ui(language, 'No class is assigned to this account yet.', 'ఈ ఖాతాకు ఇంకా తరగతి కేటాయించలేదు.')}</p><button className="primary" onClick={() => void refresh('')}>{ui(language, 'Try again', 'మళ్లీ ప్రయత్నించండి')}<RefreshCw size={16}/></button></div></section>;

  return <section className="teacher-shell">
    <header className="teacher-header"><div><p className="teacher-kicker">{ui(language, 'TEACHER WORKSPACE', 'ఉపాధ్యాయ వేదిక')} · {user.name.toUpperCase()}</p><h1>{dashboard.classroom?.name ?? ui(language, 'Your classroom', 'మీ తరగతి')}</h1><div className="classroom-code-display"><span>{ui(language, 'Class code', 'తరగతి కోడ్')}</span><strong>{dashboard.classroom?.code}</strong><button className="quiet-button" onClick={() => void copyClassroomCode()}><Copy size={14}/>{ui(language, 'Copy code', 'కోడ్ కాపీ చేయండి')}</button></div><p>{ui(language, 'Class', 'తరగతి')} {dashboard.classroom?.classLevel} · {dashboard.classroom?.board === 'TELANGANA_SCERT' ? 'Telangana SCERT' : dashboard.classroom?.board}</p></div><div className="teacher-header-actions"><label className="class-select"><span>{ui(language, 'Class', 'తరగతి')}</span><select value={classId} onChange={(event) => { setClassId(event.target.value); setDetail(null); void refresh(event.target.value); }}>{dashboard.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15}/></label><button className="primary classroom-create-button" onClick={() => { setClassroomFormOpen((open) => !open); setClassroomActionError(''); }} aria-expanded={classroomFormOpen}><Plus size={15}/>{ui(language, 'Create Classroom', 'తరగతిని సృష్టించండి')}</button><button className="quiet-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>{ui(language, 'Refresh data', 'డేటాను రిఫ్రెష్ చేయండి')}</button><button className="quiet-button" onClick={() => setWorksheetTool('create')}><Printer size={15}/>{ui(language, 'Print worksheet', 'వర్క్‌షీట్ ముద్రించండి')}</button><button className="quiet-button" onClick={() => setWorksheetTool('scan')}><ScanLine size={15}/>{ui(language, 'Scan worksheet', 'వర్క్‌షీట్ స్కాన్ చేయండి')}</button><button className="quiet-button" onClick={onSignOut}>{ui(language, 'Sign out', 'నిష్క్రమించండి')}</button></div></header>
    {classroomForm}{classroomActionError && <p className="teacher-error" role="alert">{classroomActionError}</p>}
    {notice && <div className="teacher-notice"><Check size={15}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14}/></button></div>}
    {error && <p className="teacher-error" role="alert">{error}</p>}
    <div className="teacher-metrics"><Metric icon={<Users size={17}/>} label={ui(language, 'Students', 'విద్యార్థులు')} value={String(dashboard.students.length)} detail={ui(language, 'in this class', 'ఈ తరగతిలో')}/><Metric icon={<Activity size={17}/>} label={ui(language, 'Active recently', 'ఇటీవల అభ్యసించారు')} value={`${activeCount}/${dashboard.students.length}`} detail={ui(language, 'in the last 3 days', 'గత 3 రోజుల్లో')}/><Metric icon={<BookOpen size={17}/>} label={ui(language, 'Average mastery', 'సగటు పట్టు')} value={`${avgMastery}%`} detail={ui(language, 'across concepts', 'అన్ని భావనల్లో')}/><Metric icon={<Bell size={17}/>} label={ui(language, 'Needs attention', 'శ్రద్ధ అవసరం')} value={String(dashboard.alerts.length)} detail={ui(language, 'open alerts', 'పరిష్కరించని హెచ్చరికలు')}/></div>
    <div className="teacher-top-grid">
      <section className="teacher-panel heatmap-panel"><div className="teacher-panel-head"><div><p className="teacher-kicker">{ui(language, 'CLASS HEATMAP', 'తరగతి పట్టు పటం')}</p><h2>{ui(language, 'Where students are in the concept map', 'భావనల పటంలో విద్యార్థుల ప్రస్తుత స్థితి')}</h2></div><label className="filter-select">{ui(language, 'Level', 'స్థాయి')} <select value={classLevelFilter} onChange={(event) => setClassLevelFilter(event.target.value)}><option value="all">{ui(language, 'All', 'అన్నీ')}</option>{[6,7,8,9,10].map((level) => <option key={level} value={level}>{ui(language, 'Class', 'తరగతి')} {level}</option>)}</select></label></div>
        <div className="student-filters"><label className="student-search"><Search size={16}/><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder={ui(language, 'Search name or roll number', 'పేరు లేదా రోల్ నంబర్ వెతకండి')} aria-label={ui(language, 'Search students by name or roll number', 'పేరు లేదా రోల్ నంబర్‌తో విద్యార్థులను వెతకండి')}/></label><label>{ui(language, 'Mastery', 'పట్టు')} <select value={masteryFilter} onChange={(event) => setMasteryFilter(event.target.value)}><option value="all">{ui(language, 'All statuses', 'అన్ని స్థితులు')}</option><option value="ready-to-advance">{groupText['ready-to-advance'][language === 'te' ? 'te' : 'en']}</option><option value="on-track">{groupText['on-track'][language === 'te' ? 'te' : 'en']}</option><option value="needs-basics">{groupText['needs-basics'][language === 'te' ? 'te' : 'en']}</option></select></label><label>{ui(language, 'Sort by', 'క్రమం')} <select value={studentSort} onChange={(event) => setStudentSort(event.target.value)}><option value="roll">{ui(language, 'Roll number', 'రోల్ నంబర్')}</option><option value="name">{ui(language, 'Student name', 'విద్యార్థి పేరు')}</option><option value="status">{ui(language, 'Learning status', 'అభ్యాస స్థితి')}</option></select></label></div>
        <div className="heatmap-legend"><span><i className="heat green"/>{ui(language, 'Strong', 'మంచి పట్టు')}</span><span><i className="heat amber"/>{ui(language, 'Developing', 'అభివృద్ధిలో ఉంది')}</span><span><i className="heat red"/>{ui(language, 'Needs basics', 'ప్రాథమిక సాధన అవసరం')}</span><span><i className="heat none"/>{ui(language, 'Not checked', 'పరీక్షించలేదు')}</span></div>
        <div className="heatmap-scroll"><table className="heatmap"><thead><tr><th className="student-sticky">{ui(language, 'Student', 'విద్యార్థి')}</th>{dashboard.concepts.filter((concept) => classLevelFilter === 'all' || concept.classLevel === Number(classLevelFilter)).map((concept) => <th key={concept.id} title={`${concept.name} · Class ${concept.classLevel}`}><span>{conceptLabel(concept, language)}</span><small>{language === 'te' ? 'త' : 'C'}{concept.classLevel}</small></th>)}</tr></thead><tbody>{selectedStudents.map((student) => <tr key={student.id}><th className="student-sticky"><button onClick={() => void openStudent(student.id)}><span>{student.rollNo}</span>{student.name}<small className={`group-pill ${student.group}`}>{groupText[student.group][language === 'te' ? 'te' : 'en']}</small></button><button type="button" className="student-remove-action" aria-label={ui(language, `Remove ${student.name}`, `${student.name}ను తొలగించండి`)} title={ui(language, 'Disable student access; preserve learning history', 'విద్యార్థి ప్రవేశాన్ని నిలిపి అభ్యాస చరిత్రను భద్రపరచండి')} disabled={Boolean(removingStudentId)} onClick={() => void removeStudent(student)}>{removingStudentId === student.id ? ui(language, 'Removing…', 'తొలగిస్తున్నాం…') : <><Trash2 size={12}/>{ui(language, 'Remove', 'తొలగించండి')}</>}</button></th>{dashboard.concepts.filter((concept) => classLevelFilter === 'all' || concept.classLevel === Number(classLevelFilter)).map((concept) => { const value = student.mastery[concept.slug]; const tone = value === undefined ? 'none' : value >= 0.76 ? 'green' : value >= 0.4 ? 'amber' : 'red'; return <td key={concept.slug}><button aria-label={`${student.name}, ${concept.name}: ${value === undefined ? 'not checked' : `${Math.round(value * 100)} percent`}`} title={`${concept.name}: ${value === undefined ? 'Not checked' : `${Math.round(value * 100)}%`} · ${student.name} · Roll ${student.rollNo}`} className={`heat-cell ${tone}`} onClick={() => void openStudent(student.id)}>{value === undefined ? '·' : value >= 0.76 ? '✓' : value >= 0.4 ? '◐' : '!'}</button></td>; })}</tr>)}</tbody></table>{selectedStudents.length === 0 && <EmptyState text={ui(language, 'No students match these filters.', 'ఈ ఫిల్టర్‌లకు సరిపోయే విద్యార్థులు లేరు.')}/>}</div>
        <p className="table-hint">{ui(language, 'Select a student or concept cell to open their learning history.', 'విద్యార్థి లేదా భావన సెల్‌ను ఎంచుకుని వారి అభ్యాస చరిత్రను చూడండి.')}</p>
      </section>
      <section className="teacher-panel"><div className="teacher-panel-head"><div><p className="teacher-kicker">{ui(language, 'COMMON GAPS', 'సాధారణ అభ్యాస లోటులు')}</p><h2>{ui(language, 'What the class may need', 'తరగతికి ఉపయోగపడే సాధన')}</h2></div><Lightbulb size={20}/></div>{dashboard.activitySources && <p className="table-hint">{ui(language, 'Attempts — real:', 'ప్రయత్నాలు — వాస్తవం:')} {dashboard.activitySources.real} · {ui(language, 'demo:', 'డెమో:')} {dashboard.activitySources.demo} · {ui(language, 'unclassified:', 'వర్గీకరించనివి:')} {dashboard.activitySources.unclassified}. {ui(language, 'Mastery is cumulative and is not attributed by source.', 'పట్టు మొత్తం అభ్యాసాన్ని కలిపి చూపుతుంది; మూలం ప్రకారం వేరు చేయదు.')}</p>}{dashboard.misconceptions.length ? <div className="misconception-list">{dashboard.misconceptions.slice(0,5).map((item) => <article className="misconception-card" key={item.id}><strong>{item.studentCount} {ui(language, 'of', 'మంది / మొత్తం')} {dashboard.students.length}</strong><p>{localized(item.text, language)}</p><span>{conceptLabel(dashboard.concepts.find((concept) => concept.slug === item.conceptId) ?? { name: item.conceptName }, language)} · {item.attemptCount} {ui(language, 'attempts', 'ప్రయత్నాలు')}</span>{item.activitySources && <small>{ui(language, 'Real / demo / unclassified attempts:', 'వాస్తవం / డెమో / వర్గీకరించని ప్రయత్నాలు:')} {item.activitySources.real} / {item.activitySources.demo} / {item.activitySources.unclassified}</small>}<small>{ui(language, 'Likely root-cause concept:', 'సంభావ్య మూల కారణ భావన:')} {conceptLabel(dashboard.concepts.find((concept) => concept.slug === item.likelyRootCause) ?? { name: item.conceptName }, language)}</small></article>)}</div> : <EmptyState text={ui(language, 'No shared misconception patterns yet. Keep collecting student answers.', 'సాధారణ అపోహలు ఇంకా కనిపించలేదు.')}/>}</section>
    </div>
    <div className="teacher-bottom-grid">
      <section className="teacher-panel"><div className="teacher-panel-head"><div><p className="teacher-kicker">{ui(language, 'TEACHER GROUPS', 'ఉపాధ్యాయుల సమూహాలు')}</p><h2>{ui(language, 'Tomorrow’s 10-minute activity', 'రేపటి 10 నిమిషాల కార్యాచరణ')}</h2></div><ClipboardCheck size={20}/></div><div className="group-plan-list">{dashboard.groups.map((group) => <div className="group-plan-block" key={group.group}><GroupPlanEditor plan={group} language={language} onSave={savePlan}/><GroupOverrideEditor group={group.group} concepts={dashboard.concepts} language={language} onSave={saveGroupOverride}/></div>)}</div></section>
      <section className="teacher-panel"><div className="teacher-panel-head"><div><p className="teacher-kicker">{ui(language, 'ALERT INBOX', 'హెచ్చరికలు')}</p><h2>{ui(language, 'Students who may need a check-in', 'ఆప్యాయంగా పలకరించాల్సిన విద్యార్థులు')}</h2></div><Bell size={20}/></div>{dashboard.alerts.length ? <div className="alert-list">{dashboard.alerts.map((alert) => <article className="alert-card" key={alert.id}><span className="alert-mark"><AlertTriangle size={17}/></span><div><b>{alert.studentName}</b><p>{localized(alert.message, language)}</p><small>{alert.type.replaceAll('-', ' ')}</small></div><button className="small-action" onClick={() => void acknowledge(alert.id)}>{ui(language, 'Acknowledge', 'గమనించాను')}</button></article>)}</div> : <EmptyState text={ui(language, 'No open alerts. Your class is on track for now.', 'తెరిచి ఉన్న హెచ్చరికలు లేవు. మీ తరగతి ప్రస్తుతం సరైన దారిలో ఉంది.')}/>}</section>
    </div>
    <footer className="teacher-footer">{ui(language, 'You support each learner. The learning engine only suggests a next step.', 'ప్రతి విద్యార్థికి మీరు తోడుగా ఉంటారు. అభ్యాస వ్యవస్థ తదుపరి అడుగును మాత్రమే సూచిస్తుంది.')}</footer>
  </section>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <article className="teacher-metric"><span>{icon}</span><div><small>{label}</small><b>{value}</b><em>{detail}</em></div></article>; }
function EmptyState({ text }: { text: string }) { return <div className="teacher-empty"><Check size={18}/><p>{text}</p></div>; }
function GroupPlanEditor({ plan, language, onSave }: { plan: TeacherDashboard['groups'][number]; language: string; onSave: (group: GroupName, activity: string, approved: boolean) => Promise<void> }) {
  const [activity, setActivity] = useState(plan.activity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setActivity(plan.activity); }, [plan.activity]);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await onSave(plan.group, activity, true); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this plan.'); } finally { setBusy(false); } };
  return <form className={`group-plan ${plan.group}`} onSubmit={submit}><div className="group-plan-title"><div><b>{localized(groupText[plan.group], language)}</b><span>{plan.count} {ui(language, 'students', 'విద్యార్థులు')}</span></div>{plan.approved && <span className="approved-pill"><Check size={12}/>{ui(language, 'Approved', 'ఆమోదించారు')}</span>}</div><textarea value={activity} onChange={(event) => setActivity(event.target.value)} rows={3} aria-label={`${localized(groupText[plan.group], language)} ${ui(language, 'activity', 'కార్యాచరణ')}`}/>{error && <p className="teacher-error">{error}</p>}<button className="small-action" type="submit" disabled={busy || !plan.count}>{busy ? ui(language, 'Saving…', 'భద్రపరుస్తున్నాం…') : plan.approved ? ui(language, 'Update plan', 'ప్రణాళికను మార్చండి') : ui(language, 'Approve for tomorrow', 'రేపటి కోసం ఆమోదించండి')}</button></form>;
}

function GroupOverrideEditor({ group, concepts, language, onSave }: { group: GroupName; concepts: Concept[]; language: string; onSave: (group: GroupName, values: { conceptId: string; action: 'assign'|'lock'|'skip'; activity?: string }) => Promise<void> }) {
  const [conceptId, setConceptId] = useState(concepts[0]?.slug ?? '');
  const [action, setAction] = useState<'assign'|'lock'|'skip'>('assign');
  const [activity, setActivity] = useState('Learn');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => { setBusy(true); setError(''); try { await onSave(group, { conceptId, action, ...(action === 'skip' ? {} : { activity }) }); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this group instruction.'); } finally { setBusy(false); } };
  return <div className="group-override"><b>{ui(language, 'Set a concept for this group', 'ఈ సమూహానికి భావనను ఎంచుకోండి')}</b><div className="group-override-fields"><select aria-label={`${group} concept`} value={conceptId} onChange={(event) => setConceptId(event.target.value)}>{concepts.map((concept) => <option key={concept.slug} value={concept.slug}>{conceptLabel(concept, language)}</option>)}</select><select aria-label={`${group} instruction`} value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option value="assign">{ui(language, 'Assign', 'కేటాయించండి')}</option><option value="lock">{ui(language, 'Lock', 'నిర్దేశించండి')}</option><option value="skip">{ui(language, 'Skip', 'వదిలేయండి')}</option></select>{action !== 'skip' && <select aria-label={`${group} activity`} value={activity} onChange={(event) => setActivity(event.target.value)}>{['Learn','Solve','Test','Revise','Challenge'].map((item) => <option key={item}>{language === 'te' ? ({ Learn: 'నేర్చుకోండి', Solve: 'సాధన', Test: 'పరీక్ష', Revise: 'పునశ్చరణ', Challenge: 'సవాలు' } as Record<string,string>)[item] : item}</option>)}</select>}</div>{error && <p className="teacher-error">{error}</p>}<button className="small-action" onClick={() => void submit()} disabled={busy || concepts.length === 0}>{busy ? ui(language, 'Saving…', 'భద్రపరుస్తున్నాం…') : ui(language, 'Save group instruction', 'సమూహ సూచనను భద్రపరచండి')}</button></div>;
}

function TeacherDetail({ detail, concepts, classId, language, onBack, onSaveOverride }: { detail: StudentDetails; concepts: Concept[]; classId: string; language: string; onBack: () => void; onSaveOverride: (values: { conceptId: string; action: 'assign'|'lock'|'skip'; activity?: string }) => Promise<void> }) {
  const [conceptId, setConceptId] = useState(detail.concepts.find((item) => (item.mastery ?? 0) < 0.6)?.slug ?? detail.concepts[0]?.slug ?? '');
  const [action, setAction] = useState<'assign'|'lock'|'skip'>('assign');
  const [activity, setActivity] = useState('Learn');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const override = async () => { setBusy(true); setError(''); try { await onSaveOverride({ conceptId, action, ...(action === 'skip' ? {} : { activity }) }); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this instruction.'); } finally { setBusy(false); } };
  const daysInactive = detail.student.lastActiveAt ? Math.max(0, Math.floor((Date.now() - new Date(detail.student.lastActiveAt).getTime()) / 86_400_000)) : null;
  return <div className="teacher-detail"><button className="back-button" onClick={onBack}><ArrowLeft size={16}/>Back to class</button><header className="detail-header"><div><p className="teacher-kicker">STUDENT DRILL-DOWN · ROLL {detail.student.rollNo}</p><h1>{detail.student.name}</h1><p>Class {detail.student.classLevel} · {detail.student.language === 'te' ? 'Telugu' : 'English'} · {daysInactive === null ? 'No recent activity recorded' : daysInactive === 0 ? 'Active today' : `Last active ${daysInactive} days ago`}</p></div><div className="detail-streak"><Flame size={18}/><b>{detail.streak.current}</b><span>streak · best {detail.streak.longest}</span></div></header>
    {detail.rewind && detail.rewind.path.length > 1 && <section className="rewind-banner teacher-rewind"><RefreshCw size={16}/><div><b>Suggested rewind path</b><span>{detail.rewind.names.join('  ←  ')}</span></div></section>}
    <div className="detail-grid"><section className="teacher-panel"><div className="teacher-panel-head"><div><p className="teacher-kicker">{ui(language, 'CONCEPT MAP', 'భావనల పటం')}</p><h2>{ui(language, 'Mastery and first-check comparison', 'మొదటి పరీక్షతో ప్రస్తుత పట్టు పోలిక')}</h2></div></div><p className="table-hint">{ui(language, 'Mastery is cumulative; attempts without provenance remain unclassified and are not assigned to either source.', 'పట్టు మొత్తం అభ్యాసాన్ని కలిపి చూపుతుంది; మూల సమాచారం లేని ప్రయత్నాలు వర్గీకరించబడవు.')}</p><div className="detail-map">{detail.concepts.map((concept) => { const value = concept.mastery; const base = concept.baselineMastery; const color = value === null ? 'none' : value >= 0.76 ? 'green' : value >= 0.4 ? 'amber' : 'red'; return <div className="detail-concept" key={concept.slug}><span>{ui(language, 'Class', 'తరగతి')} {concept.classLevel}</span><b>{conceptLabel(concept, language)}</b><div className="detail-bars"><i className="baseline" style={{ width: `${pct(base) ?? 0}%` }}/><i className={color} style={{ width: `${pct(value) ?? 0}%` }}/></div><small>{pct(base) ?? '—'}% → {pct(value) ?? '—'}%</small></div>; })}</div><div className="detail-legend"><span><i/>{ui(language, 'First check', 'మొదటి పరీక్ష')}</span><span><i/>{ui(language, 'Now', 'ప్రస్తుతం')}</span></div></section>
    <section className="teacher-panel override-panel"><div className="teacher-panel-head"><div><p className="teacher-kicker">{ui(language, 'TEACHER CONTROL', 'ఉపాధ్యాయ నియంత్రణ')}</p><h2>{ui(language, 'Set this student’s next step', 'ఈ విద్యార్థి తదుపరి అడుగును ఎంచుకోండి')}</h2></div></div><label>{ui(language, 'Concept', 'భావన')}<select value={conceptId} onChange={(event) => setConceptId(event.target.value)}>{concepts.map((item) => <option key={item.slug} value={item.slug}>{conceptLabel(item, language)}</option>)}</select></label><label>{ui(language, 'Instruction', 'సూచన')}<select value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option value="assign">{ui(language, 'Assign activity', 'కార్యాచరణ కేటాయించండి')}</option><option value="lock">{ui(language, 'Lock to activity', 'ఈ కార్యాచరణను నిర్దేశించండి')}</option><option value="skip">{ui(language, 'Skip this concept', 'ఈ భావనను వదిలేయండి')}</option></select></label>{action !== 'skip' && <label>{ui(language, 'Activity', 'కార్యాచరణ')}<select value={activity} onChange={(event) => setActivity(event.target.value)}>{['Learn','Solve','Test','Revise','Challenge'].map((item) => <option key={item}>{language === 'te' ? ({ Learn: 'నేర్చుకోండి', Solve: 'సాధన', Test: 'పరీక్ష', Revise: 'పునశ్చరణ', Challenge: 'సవాలు' } as Record<string,string>)[item] : item}</option>)}</select></label>}<button className="primary" disabled={busy || !classId} onClick={() => void override()}>{busy ? ui(language, 'Saving…', 'భద్రపరుస్తున్నాం…') : ui(language, 'Save instruction', 'సూచనను భద్రపరచండి')}<ArrowRight size={16}/></button>{error && <p className="teacher-error" role="alert">{error}</p>}<p className="control-note">{ui(language, 'The student sees a “Set by teacher” badge beside this recommendation.', 'ఈ సిఫార్సు పక్కన విద్యార్థికి “ఉపాధ్యాయుడు నిర్దేశించారు” గుర్తు కనిపిస్తుంది.')}</p></section></div>
    <div className="detail-grid"><section className="teacher-panel"><div className="teacher-panel-head"><div><p className="teacher-kicker">{ui(language, 'RECENT ATTEMPTS', 'ఇటీవలి ప్రయత్నాలు')}</p><h2>{ui(language, 'How the student is working', 'విద్యార్థి అభ్యాస విధానం')}</h2></div></div>{detail.attempts.length ? <div className="attempt-list">{detail.attempts.map((attempt) => <article key={attempt.id} className="attempt-row"><span className={attempt.correct ? 'attempt-mark correct' : 'attempt-mark incorrect'}>{attempt.correct ? <Check size={14}/> : <X size={14}/>}</span><div><b>{attempt.concept}</b><p>{attempt.question?.[language === 'te' ? 'te' : 'en'] ?? attempt.question?.en}</p>{attempt.misconception && <small>{localized(attempt.misconception, language)}</small>}</div><span className="attempt-meta">{attempt.hintsUsed} {ui(language, 'hints', 'సూచనలు')} · {ui(language, attempt.confidence, ({ sure: 'నమ్మకం', unsure: 'కొంత నమ్మకం', guess: 'ఊహ' } as Record<string,string>)[attempt.confidence] ?? attempt.confidence)} · {attempt.provenance === 'real' ? ui(language, 'Real activity', 'వాస్తవ అభ్యాసం') : attempt.provenance === 'demo' ? ui(language, 'Demo activity', 'డెమో అభ్యాసం') : ui(language, 'Unclassified history', 'వర్గీకరించని చరిత్ర')}</span></article>)}</div> : <EmptyState text={ui(language, 'No answers have been recorded yet.', 'ఇంకా సమాధానాలు నమోదు కాలేదు.')}/>}</section>
    <section className="teacher-panel"><div className="teacher-panel-head"><div><p className="teacher-kicker">{ui(language, 'ENGINE REASONS', 'అభ్యాస సూచనల కారణాలు')}</p><h2>{ui(language, 'Why each next step appeared', 'ప్రతి తదుపరి అడుగు ఎందుకు సూచించబడింది')}</h2></div></div>{detail.decisions.length ? <div className="decision-list">{detail.decisions.slice(0,10).map((decision,index) => <article key={`${decision.ruleId}-${index}`}><b>{ui(language, decision.activity, ({ Learn: 'నేర్చుకోండి', Solve: 'సాధన', Test: 'పరీక్ష', Revise: 'పునశ్చరణ', Challenge: 'సవాలు' } as Record<string,string>)[decision.activity] ?? decision.activity)} · {decision.ruleId.replaceAll('-', ' ')}</b><p>{localized(decision.reason, language)}</p><small>{new Date(decision.createdAt).toLocaleString(language === 'te' ? 'te-IN' : 'en-IN')}</small></article>)}</div> : <EmptyState text={ui(language, 'Decision history will appear after the next recommendation.', 'తదుపరి సిఫార్సు తర్వాత నిర్ణయ చరిత్ర కనిపిస్తుంది.')}/>}</section></div>
  </div>;
}



