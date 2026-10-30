import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, Check, LockKeyhole, RefreshCw, Shield, UserPlus, Users } from 'lucide-react';
import type { SessionUser } from '@conceptbridge/shared';
import { api, readApiJson } from './api';
import './admin.css';

type Teacher = { id: string; name: string; email: string; board: string; language: string; active: boolean; createdAt?: string };
type Concept = { id: string; name: string; nameTe: string; classLevel: number; chapters?: Record<string, string>; questions: number; explanations: number };
type Overview = { metrics: { teachers: number; activeTeachers: number; classes: number; students: number }; teachers: Teacher[]; concepts: Concept[] };
type Props = { user: SessionUser; csrf: string; onSignOut: () => void; language: string };
const copy = (language: string, en: string, te: string) => language === 'te' ? te : en;

export default function AdminWorkspace({ user, csrf, onSignOut, language }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [board, setBoard] = useState<'CBSE' | 'TELANGANA_SCERT'>('CBSE');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api('/admin/overview');
      const data = await readApiJson<Overview & { error?: { message?: string } }>(response);
      if (!response.ok || !data) throw new Error(data?.error?.message ?? 'Could not load administrator data.');
      setOverview(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load administrator data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createTeacher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await api('/admin/teachers', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify({ name, email, password, board, language: 'en' }) });
      const data = await readApiJson<{ error?: { message?: string } }>(response);
      if (!response.ok || !data) throw new Error(data?.error?.message ?? 'Could not create that teacher account.');
      setName(''); setEmail(''); setPassword('');
      setNotice(copy(language, 'Teacher account created. Share the initial password securely.', 'ఉపాధ్యాయ ఖాతా సృష్టించబడింది. ప్రారంభ పాస్‌వర్డ్‌ను సురక్షితంగా అందించండి.'));
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create that teacher account.'); }
    finally { setBusy(false); }
  };

  const setTeacherActive = async (teacher: Teacher) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api(`/admin/teachers/${teacher.id}/status`, { method: 'PATCH', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify({ active: !teacher.active }) });
      const data = await readApiJson<{ error?: { message?: string } }>(response);
      if (!response.ok || !data) throw new Error(data?.error?.message ?? 'Could not update that teacher account.');
      setNotice(teacher.active ? 'Teacher access disabled.' : 'Teacher access restored.');
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update that teacher account.'); }
    finally { setBusy(false); }
  };

  if (loading && !overview) return <main className="admin-shell"><p role="status">{copy(language, 'Loading administration tools…', 'నిర్వహణ సాధనాలను తెరుస్తున్నాం…')}</p></main>;

  return <main className="admin-shell">
    <header className="admin-header"><div><p className="admin-kicker"><Shield size={15}/> ADMINISTRATION · {user.name.toUpperCase()}</p><h1>{copy(language, 'School administration', 'పాఠశాల నిర్వహణ')}</h1><p>{copy(language, 'Manage teacher access and check seeded curriculum coverage.', 'ఉపాధ్యాయుల ప్రవేశాన్ని నిర్వహించి పాఠ్యాంశాల వివరాలను చూడండి.')}</p></div><div className="admin-actions"><button className="admin-quiet" type="button" onClick={() => void refresh()}><RefreshCw size={15}/>{copy(language, 'Refresh', 'రిఫ్రెష్')}</button><button className="admin-quiet" type="button" onClick={onSignOut}><LockKeyhole size={15}/>{copy(language, 'Sign out', 'నిష్క్రమించండి')}</button></div></header>
    {error && <p className="admin-error" role="alert">{error}</p>}{notice && <p className="admin-notice" role="status"><Check size={15}/>{notice}</p>}
    {overview && <>
      <section className="admin-metrics" aria-label={copy(language, 'Platform overview', 'వేదిక వివరాలు')}>
        <article><Users/><span>{copy(language, 'Teachers', 'ఉపాధ్యాయులు')}</span><b>{overview.metrics.activeTeachers} / {overview.metrics.teachers}</b></article>
        <article><BookOpen/><span>{copy(language, 'Classes', 'తరగతులు')}</span><b>{overview.metrics.classes}</b></article>
        <article><Users/><span>{copy(language, 'Active students', 'క్రియాశీల విద్యార్థులు')}</span><b>{overview.metrics.students}</b></article>
        <article><BookOpen/><span>{copy(language, 'Concepts seeded', 'భావనలు')}</span><b>{overview.concepts.length}</b></article>
      </section>
      <div className="admin-grid">
        <section className="admin-panel"><div className="admin-panel-title"><div><p className="admin-kicker">TEACHER ACCESS</p><h2>{copy(language, 'Teacher accounts', 'ఉపాధ్యాయ ఖాతాలు')}</h2></div><UserPlus size={19}/></div>
          <form className="admin-form" onSubmit={(event) => void createTeacher(event)}>
            <label>{copy(language, 'Teacher name', 'ఉపాధ్యాయుని పేరు')}<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100}/></label>
            <label>{copy(language, 'School email', 'పాఠశాల ఈమెయిల్')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254}/></label>
            <label>{copy(language, 'Initial password (12+ characters)', 'ప్రారంభ పాస్‌వర్డ్ (12+ అక్షరాలు)')}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password"/></label>
            <label>{copy(language, 'Default board', 'బోర్డు')}<select value={board} onChange={(event) => setBoard(event.target.value as typeof board)}><option value="CBSE">CBSE</option><option value="TELANGANA_SCERT">Telangana SCERT</option></select></label>
            <button className="admin-primary" type="submit" disabled={busy}>{busy ? copy(language, 'Saving…', 'భద్రపరుస్తున్నాం…') : copy(language, 'Create teacher account', 'ఉపాధ్యాయ ఖాతా సృష్టించండి')}<ArrowRight size={16}/></button>
            <p>{copy(language, 'Passwords are stored as Argon2 hashes. Give the initial password directly to the teacher.', 'పాస్‌వర్డ్‌లు Argon2 హ్యాష్‌లుగా భద్రపరచబడతాయి. ప్రారంభ పాస్‌వర్డ్‌ను నేరుగా ఉపాధ్యాయునికి అందించండి.')}</p>
          </form>
          <div className="admin-teacher-list">{overview.teachers.map((teacher) => <article key={teacher.id}><div><b>{teacher.name}</b><span>{teacher.email} · {teacher.board}</span></div><span className={teacher.active ? 'admin-status active' : 'admin-status'}>{teacher.active ? copy(language, 'Active', 'క్రియాశీలం') : copy(language, 'Disabled', 'నిలిపివేశారు')}</span><button type="button" disabled={busy} onClick={() => void setTeacherActive(teacher)}>{teacher.active ? copy(language, 'Disable', 'నిలిపివేయి') : copy(language, 'Restore', 'పునరుద్ధరించు')}</button></article>)}</div>
        </section>
        <section className="admin-panel"><div className="admin-panel-title"><div><p className="admin-kicker">SEEDED LEARNING CONTENT</p><h2>{copy(language, 'Curriculum coverage', 'పాఠ్యాంశాల కవరేజ్')}</h2></div><BookOpen size={19}/></div>
          <div className="admin-content-list">{overview.concepts.map((concept) => <article key={concept.id}><div><b>{language === 'te' ? concept.nameTe || concept.name : concept.name}</b><span>{copy(language, 'Class', 'తరగతి')} {concept.classLevel} · {concept.chapters?.CBSE ?? ''}</span></div><small>{concept.questions} {copy(language, 'questions', 'ప్రశ్నలు')} · {concept.explanations} {copy(language, 'explanations', 'వివరణలు')}</small></article>)}</div>
        </section>
      </div>
    </>}
  </main>;
}
