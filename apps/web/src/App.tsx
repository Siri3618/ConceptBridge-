import { api, readApiJson } from './api';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpenCheck, Check, Languages, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { studentLoginSchema, teacherLoginSchema, type SessionUser } from '@conceptbridge/shared';
import StudentLearningApp from './StudentLearningApp';
import TeacherWorkspace from './TeacherWorkspace';
import AdminWorkspace from './AdminWorkspace';

type Mode = 'student' | 'teacher';

export default function App() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<Mode>('student');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [csrf, setCsrf] = useState('');
  const refreshCsrf = async () => {
    const response = await api('/auth/csrf');
    const data = await readApiJson<{ csrfToken?: string }>(response);
    if (!response.ok || !data?.csrfToken) throw new Error('The API did not return a CSRF token.');
    setCsrf(data.csrfToken);
  };
  useEffect(() => { void refreshCsrf().catch(() => setError(t('signInUnavailable'))); void api('/auth/me').then(async (response) => response.ok ? readApiJson<{ user?: SessionUser }>(response) : null).then(data => { if (data?.user) setUser(data.user); }).catch(() => undefined); }, []);
  useEffect(() => { const updateDocumentLanguage = (language: string) => { document.documentElement.lang = language === 'te' ? 'te-IN' : 'en-IN'; }; updateDocumentLanguage(i18n.resolvedLanguage ?? i18n.language); i18n.on('languageChanged', updateDocumentLanguage); return () => { i18n.off('languageChanged', updateDocumentLanguage); }; }, [i18n]);
  const toggleLanguage = () => { const next = i18n.language === 'en' ? 'te' : 'en'; localStorage.setItem('cb-language', next); void i18n.changeLanguage(next); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true);
    const fd = new FormData(event.currentTarget);
    const body = mode === 'student' ? { classCode: fd.get('classCode'), rollNo: fd.get('rollNo'), pin: fd.get('pin') } : { email: fd.get('email'), password: fd.get('password') };
    const parsed = mode === 'student' ? studentLoginSchema.safeParse(body) : teacherLoginSchema.safeParse(body);
    if (!parsed.success) { setBusy(false); setError(mode === 'student' ? t('validLogin') : t('validTeacher')); return; }
    try { const res = await api(mode === 'student' ? '/auth/student' : '/auth/teacher', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify(parsed.data) }); const data = await readApiJson<{ user?: SessionUser; error?: { message?: string } }>(res); if (!res.ok || !data?.user) throw new Error(data?.error?.message ?? t('signInUnavailable')); await refreshCsrf(); setUser(data.user); }
    catch (e) { setError(e instanceof Error ? e.message : t('unavailable')); }
    finally { setBusy(false); }
  };
  const signOut = async () => { await api('/auth/session', { method: 'DELETE', headers: { 'X-CSRF-Token': csrf } }); await refreshCsrf(); setUser(null); setMode('student'); };

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/" aria-label="ConceptBridge home"><span className="brand-mark"><BookOpenCheck size={21}/></span><span>concept<span className="brand-light">bridge</span></span></a><div className="top-actions"><span className="safe-label"><ShieldCheck size={15}/>{t('demo')}</span><button className="language" onClick={toggleLanguage} aria-label={t('changeLanguage')}><Languages size={17}/><span>{i18n.language === 'en' ? 'తెలుగు' : 'English'}</span></button></div></header>
    {user?.role === 'student' ? <StudentLearningApp user={user} csrf={csrf} onSignOut={() => void signOut()} language={i18n.language}/> : user?.role === 'admin' ? <AdminWorkspace user={user} csrf={csrf} onSignOut={() => void signOut()} language={i18n.language}/> : user?.role === 'teacher' ? <TeacherWorkspace user={user} csrf={csrf} onSignOut={() => void signOut()} language={i18n.language}/> : <section className="content">
      <div className="intro"><div className="eyebrow"><span className="spark"><Sparkles size={14}/></span> {t('intro')}</div><h1>{user ? t('today') : t('welcome')}</h1><p>{user ? t('ready') : t('tagline')}</p></div>
      {user ? <section className="signed-card"><div className="avatar"><UserRound size={25}/></div><div className="signed-copy"><span className="eyebrow">{t('roleTeacher')}</span><h2>{user.name}</h2><p>{t('classroomReady')}</p></div><button className="primary" onClick={() => void signOut()}>{t('logout')}<ArrowRight size={18}/></button></section> : <section className="login-card">
        <div className="role-switch" role="tablist" aria-label="Choose sign-in type"><button className={mode === 'student' ? 'role-tab active' : 'role-tab'} role="tab" aria-selected={mode === 'student'} onClick={() => { setMode('student'); setError(''); }}>{t('student')}<span>{t('studentSub')}</span></button><button className={mode === 'teacher' ? 'role-tab active' : 'role-tab'} role="tab" aria-selected={mode === 'teacher'} onClick={() => { setMode('teacher'); setError(''); }}>{t('teacher')}<span>{t('teacherSub')}</span></button></div>
        <form className="login-form" onSubmit={submit} noValidate>
          {mode === 'student' ? <><label>{t('classCode')}<div className="input-wrap"><BookOpenCheck size={18}/><input name="classCode" placeholder="e.g. DEMO10" autoComplete="organization" required/></div></label><div className="field-row"><label>{t('rollNo')}<div className="input-wrap"><UserRound size={18}/><input name="rollNo" placeholder="e.g. 01" autoComplete="username" required/></div></label><label>{t('pin')}<div className="input-wrap"><LockKeyhole size={18}/><input name="pin" inputMode="numeric" type="password" placeholder="••••" autoComplete="current-password" required/></div></label></div></> : <><label>{t('email')}<div className="input-wrap"><Mail size={18}/><input name="email" type="email" placeholder="you@school.edu" autoComplete="username" required/></div></label><label>{t('password')}<div className="input-wrap"><LockKeyhole size={18}/><input name="password" type="password" placeholder={t('passwordPlaceholder')} autoComplete="current-password" required/></div></label></>}
          {error && <div className="error" role="alert">{error}</div>}<button className="primary submit" type="submit" disabled={busy}>{busy ? t('wait') : mode === 'student' ? t('continue') : t('signIn')}<ArrowRight size={18}/></button>
        </form><div className="privacy"><span className="check-icon"><Check size={14}/></span><p>{t('privacy')}</p></div>
      </section>}
      <div className="trust-row"><span><ShieldCheck size={16}/> {t('madeFor')}</span><i>·</i><span>{t('noRankings')}</span></div>
    </section>}
    {user?.role !== 'student' && <footer>© 2026 ConceptBridge <span>•</span> {t('learnPace')}</footer>}
  </main>;
}




