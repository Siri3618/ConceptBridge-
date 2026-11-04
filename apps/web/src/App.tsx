import { api, readApiJson } from './api';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BookOpenCheck, Check, Eye, EyeOff, Languages, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { registerTeacherSchema, studentLoginSchema, studentRegistrationSchema, teacherLoginSchema, type SessionUser } from '@conceptbridge/shared';
import StudentLearningApp from './StudentLearningApp';
import TeacherWorkspace from './TeacherWorkspace';
import AdminWorkspace from './AdminWorkspace';

type Mode = 'student' | 'teacher';
type AuthView = 'login' | 'register' | 'student-register' | 'student-registered';
type AuthResponse = { user?: SessionUser; student?: { id: string; name: string; rollNo: string; classCode: string; classLevel: number; board: string }; error?: { code?: string; message?: string } };
type StudentRegistrationField = 'classCode' | 'name' | 'rollNo' | 'pin' | 'confirmPin';
type StudentRegistrationErrors = Partial<Record<StudentRegistrationField, string>>;

export default function App() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<Mode>('student');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState('');
  const [studentRegistrationErrors, setStudentRegistrationErrors] = useState<StudentRegistrationErrors>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);
  const [csrf, setCsrf] = useState('');
  const [authView, setAuthView] = useState<AuthView>(() => {
    return 'login';
  });

  const refreshCsrf = async () => {
    const response = await api('/auth/csrf');
    const data = await readApiJson<{ csrfToken?: string; user?: SessionUser | null }>(response);
    if (!response.ok || !data?.csrfToken) throw new Error('The API did not return a CSRF token.');
    setCsrf(data.csrfToken);
    return data.user ?? null;
  };
  useEffect(() => { void refreshCsrf().then((currentUser) => { if (authView === 'login') setUser(currentUser); }).catch(() => setError(t('signInUnavailable'))); }, []);
  useEffect(() => { const updateDocumentLanguage = (language: string) => { document.documentElement.lang = language === 'te' ? 'te-IN' : 'en-IN'; }; updateDocumentLanguage(i18n.resolvedLanguage ?? i18n.language); i18n.on('languageChanged', updateDocumentLanguage); return () => { i18n.off('languageChanged', updateDocumentLanguage); }; }, [i18n]);
  const toggleLanguage = () => { const next = i18n.language === 'en' ? 'te' : 'en'; localStorage.setItem('cb-language', next); void i18n.changeLanguage(next); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setStatus(''); setBusy(true);
    const fd = new FormData(event.currentTarget);
    if (mode === 'student' && authView === 'student-register') {
      const parsed = studentRegistrationSchema.safeParse({ classCode: fd.get('classCode'), name: fd.get('name'), rollNo: fd.get('rollNo'), pin: fd.get('pin'), confirmPin: fd.get('confirmPin') });
      if (!parsed.success) {
        const fieldErrors: StudentRegistrationErrors = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] as StudentRegistrationField | undefined;
          if (!field || fieldErrors[field]) continue;
          if (field === 'classCode') fieldErrors.classCode = t('studentClassCodeInvalid');
          else if (field === 'name') fieldErrors.name = t('studentNameInvalid');
          else if (field === 'rollNo') fieldErrors.rollNo = t('studentRollNumberInvalid');
          else if (field === 'pin') fieldErrors.pin = issue.code === 'custom' ? t('studentPinSequential') : t('studentPinFormat');
          else if (field === 'confirmPin') fieldErrors.confirmPin = t('studentPinMismatch');
        }
        setStudentRegistrationErrors(fieldErrors); setBusy(false); return;
      }
      setStudentRegistrationErrors({});
      try {
        const response = await api('/auth/student/register', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify(parsed.data) });
        const data = await readApiJson<AuthResponse>(response);
        if (!response.ok || !data?.student) {
          if (data?.error?.code === 'INVALID_CLASS_CODE') { setStudentRegistrationErrors({ classCode: t('studentClassCodeNotFound') }); return; }
          throw new Error(data?.error?.message ?? t('studentRegistrationUnavailable'));
        }
        setAuthView('student-registered'); setStatus(t('studentRegistrationSuccess'));
      } catch (cause) { setError(cause instanceof Error ? cause.message : t('studentRegistrationUnavailable')); }
      finally { setBusy(false); }
      return;
    }
    if (mode === 'teacher' && authView === 'register') {
      const password = String(fd.get('password') ?? '');
      if (password !== String(fd.get('confirmPassword') ?? '')) { setError(t('passwordsDoNotMatch')); setBusy(false); return; }
      const parsed = registerTeacherSchema.safeParse({ name: fd.get('name'), email: fd.get('email'), password });
      if (!parsed.success) { setError(t('validRegistration')); setBusy(false); return; }
      try {
        const response = await api('/auth/teacher/register', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify(parsed.data) });
        const data = await readApiJson<AuthResponse>(response);
        if (!response.ok || !data?.user) throw new Error(data?.error?.message ?? t('registrationUnavailable'));
        await refreshCsrf(); setAuthView('login'); setUser(data.user);
      } catch (cause) { setError(cause instanceof Error ? cause.message : t('registrationUnavailable')); }
      finally { setBusy(false); }
      return;
    }

    const body = mode === 'student' ? { classCode: fd.get('classCode'), rollNo: fd.get('rollNo'), pin: fd.get('pin') } : { email: fd.get('email'), password: fd.get('password') };
    const parsed = mode === 'student' ? studentLoginSchema.safeParse(body) : teacherLoginSchema.safeParse(body);
    if (!parsed.success) { setBusy(false); setError(mode === 'student' ? t('validLogin') : t('validTeacher')); return; }
    try {
      const response = await api(mode === 'student' ? '/auth/student' : '/auth/teacher', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify(parsed.data) });
      const data = await readApiJson<AuthResponse>(response);
      if (!response.ok || !data?.user) throw new Error(data?.error?.message ?? t('signInUnavailable'));
      await refreshCsrf(); setUser(data.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('unavailable')); }
    finally { setBusy(false); }
  };

  const signOut = async () => { await api('/auth/session', { method: 'DELETE', headers: { 'X-CSRF-Token': csrf } }); await refreshCsrf(); setUser(null); setMode('student'); setAuthView('login'); };
  const backToTeacherLogin = () => { setAuthView('login'); setMode('teacher'); setStatus(''); setError(''); };
  const backToStudentLogin = () => { setAuthView('login'); setMode('student'); setStatus(''); setError(''); setStudentRegistrationErrors({}); };
  const showAuthFlow = authView !== 'login';

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/" aria-label="ConceptBridge home"><span className="brand-mark"><BookOpenCheck size={21}/></span><span>concept<span className="brand-light">bridge</span></span></a><div className="top-actions"><span className="safe-label"><ShieldCheck size={15}/>{t('demo')}</span><button className="language" onClick={toggleLanguage} aria-label={t('changeLanguage')}><Languages size={17}/><span>{i18n.language === 'en' ? 'తెలుగు' : 'English'}</span></button></div></header>
    {!showAuthFlow && user?.role === 'student' ? <StudentLearningApp user={user} csrf={csrf} onSignOut={() => void signOut()} language={i18n.language}/> : !showAuthFlow && user?.role === 'admin' ? <AdminWorkspace user={user} csrf={csrf} onSignOut={() => void signOut()} language={i18n.language}/> : !showAuthFlow && user?.role === 'teacher' ? <TeacherWorkspace user={user} csrf={csrf} onSignOut={() => void signOut()} language={i18n.language}/> : <section className="content">
      <div className="intro"><div className="eyebrow"><span className="spark"><Sparkles size={14}/></span> {t('intro')}</div><h1>{showAuthFlow ? authView === 'register' ? t('createTeacherAccount') : authView === 'student-register' ? t('studentRegister') : authView === 'student-registered' ? t('studentRegistrationSuccess') : t('welcome') : user ? t('today') : t('welcome')}</h1><p>{showAuthFlow ? authView === 'register' ? t('passwordRequirements') : authView === 'student-register' ? t('studentPinPolicy') : authView === 'student-registered' ? t('studentRegistrationNext') : status || t('tagline') : user ? t('ready') : t('tagline')}</p></div>
      {!showAuthFlow && user ? <section className="signed-card"><div className="avatar"><UserRound size={25}/></div><div className="signed-copy"><span className="eyebrow">{t('roleTeacher')}</span><h2>{user.name}</h2><p>{t('classroomReady')}</p></div><button className="primary" onClick={() => void signOut()}>{t('logout')}<ArrowRight size={18}/></button></section> : <section className="login-card">
        {authView === 'login' ? <>
          <div className="role-switch" role="tablist" aria-label="Choose sign-in type"><button className={mode === 'student' ? 'role-tab active' : 'role-tab'} role="tab" aria-selected={mode === 'student'} onClick={() => { setMode('student'); setError(''); setStatus(''); }}>{t('student')}<span>{t('studentSub')}</span></button><button className={mode === 'teacher' ? 'role-tab active' : 'role-tab'} role="tab" aria-selected={mode === 'teacher'} onClick={() => { setMode('teacher'); setError(''); setStatus(''); }}>{t('teacher')}<span>{t('teacherSub')}</span></button></div>
          <form className="login-form" onSubmit={submit} noValidate>
            {mode === 'student' ? <><label>{t('classCode')}<div className="input-wrap"><BookOpenCheck size={18}/><input name="classCode" placeholder="e.g. DEMO10" autoComplete="organization" required/></div></label><div className="field-row"><label>{t('rollNo')}<div className="input-wrap"><UserRound size={18}/><input name="rollNo" placeholder="e.g. 01" autoComplete="username" required/></div></label><label>{t('pin')}<div className="input-wrap"><LockKeyhole size={18}/><input name="pin" inputMode="numeric" type="password" placeholder="••••" autoComplete="current-password" required/></div></label></div></> : <><label>{t('email')}<div className="input-wrap"><Mail size={18}/><input name="email" type="email" placeholder={t('emailPlaceholder')} autoComplete="username" required/></div></label><label>{t('password')}<div className="input-wrap"><LockKeyhole size={18}/><input name="password" type="password" placeholder={t('passwordPlaceholder')} autoComplete="current-password" required/></div></label></>}
            {error && <div className="error" role="alert">{error}</div>}<button className="primary submit" type="submit" disabled={busy}>{busy ? t('wait') : mode === 'student' ? t('continue') : t('signIn')}<ArrowRight size={18}/></button>
            {mode === 'student' && <button className="text-action" type="button" onClick={() => { setAuthView('student-register'); setError(''); setStatus(''); setStudentRegistrationErrors({}); }}>{t('studentRegister')}</button>}
            {mode === 'teacher' && <button className="text-action" type="button" onClick={() => { setAuthView('register'); setError(''); setStatus(''); }}>{t('createTeacherAccount')}</button>}
          </form><div className="privacy"><span className="check-icon"><Check size={14}/></span><p>{t('privacy')}</p></div>
        </> : authView === 'student-register' ? <>
          <form className="login-form" onSubmit={submit} noValidate>
            <div className="registration-field"><label htmlFor="student-class-code">{t('classCode')}</label><div className="input-wrap"><BookOpenCheck size={18}/><input id="student-class-code" name="classCode" placeholder="e.g. DEMO10" autoComplete="organization" maxLength={12} required aria-invalid={Boolean(studentRegistrationErrors.classCode)} aria-describedby={studentRegistrationErrors.classCode ? 'student-class-code-error' : undefined}/></div>{studentRegistrationErrors.classCode && <span id="student-class-code-error" className="field-error" role="alert">{studentRegistrationErrors.classCode}</span>}</div>
            <div className="registration-field"><label htmlFor="student-full-name">{t('fullName')}</label><div className="input-wrap"><UserRound size={18}/><input id="student-full-name" name="name" autoComplete="name" maxLength={100} required aria-invalid={Boolean(studentRegistrationErrors.name)} aria-describedby={studentRegistrationErrors.name ? 'student-name-error' : undefined}/></div>{studentRegistrationErrors.name && <span id="student-name-error" className="field-error" role="alert">{studentRegistrationErrors.name}</span>}</div>
            <div className="registration-field"><label htmlFor="student-roll-number">{t('rollNo')}</label><div className="input-wrap"><UserRound size={18}/><input id="student-roll-number" name="rollNo" autoComplete="username" maxLength={20} required aria-invalid={Boolean(studentRegistrationErrors.rollNo)} aria-describedby={studentRegistrationErrors.rollNo ? 'student-roll-number-error' : undefined}/></div>{studentRegistrationErrors.rollNo && <span id="student-roll-number-error" className="field-error" role="alert">{studentRegistrationErrors.rollNo}</span>}</div>
            <div className="field-row"><div className="registration-field"><label htmlFor="student-pin">{t('pin')}</label><div className="input-wrap"><LockKeyhole size={18}/><input id="student-pin" name="pin" inputMode="numeric" type="password" minLength={4} maxLength={8} autoComplete="new-password" required aria-invalid={Boolean(studentRegistrationErrors.pin)} aria-describedby={studentRegistrationErrors.pin ? 'student-pin-error' : undefined}/></div>{studentRegistrationErrors.pin && <span id="student-pin-error" className="field-error" role="alert">{studentRegistrationErrors.pin}</span>}</div><div className="registration-field"><label htmlFor="student-confirm-pin">{t('confirmPin')}</label><div className="input-wrap"><LockKeyhole size={18}/><input id="student-confirm-pin" name="confirmPin" inputMode="numeric" type="password" minLength={4} maxLength={8} autoComplete="new-password" required aria-invalid={Boolean(studentRegistrationErrors.confirmPin)} aria-describedby={studentRegistrationErrors.confirmPin ? 'student-confirm-pin-error' : undefined}/></div>{studentRegistrationErrors.confirmPin && <span id="student-confirm-pin-error" className="field-error" role="alert">{studentRegistrationErrors.confirmPin}</span>}</div></div>
            {error && <div className="error" role="alert">{error}</div>}<button className="primary submit" type="submit" disabled={busy}>{busy ? t('wait') : t('studentRegister')}<ArrowRight size={18}/></button>
            <button className="text-action" type="button" onClick={backToStudentLogin}>{t('backToStudentLogin')}</button>
          </form><div className="privacy"><span className="check-icon"><Check size={14}/></span><p>{t('studentPinPolicy')}</p></div>
        </> : authView === 'student-registered' ? <>
          <div className="auth-status success" role="status">{status || t('studentRegistrationSuccess')}</div><div className="login-form"><button className="primary submit" type="button" onClick={backToStudentLogin}>{t('backToStudentLogin')}<ArrowRight size={18}/></button></div>
        </> : <>
          <form className="login-form" onSubmit={submit} noValidate>
            <label>{t('fullName')}<div className="input-wrap"><UserRound size={18}/><input name="name" autoComplete="name" maxLength={100} required/></div></label>
            <label>{t('email')}<div className="input-wrap"><Mail size={18}/><input name="email" type="email" placeholder={t('emailPlaceholder')} autoComplete="email" maxLength={254} required/></div></label>
            <label>{t('password')}<div className="input-wrap"><LockKeyhole size={18}/><input name="password" type={showTeacherPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required/><button className="password-visibility" type="button" aria-label={showTeacherPassword ? t('hidePassword') : t('showPassword')} aria-pressed={showTeacherPassword} onClick={() => setShowTeacherPassword((visible) => !visible)}>{showTeacherPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
              <ul className="password-rules"><li>{t('passwordRuleLength')}</li><li>{t('passwordRuleLowercase')}</li><li>{t('passwordRuleUppercase')}</li><li>{t('passwordRuleNumber')}</li><li>{t('passwordRuleSymbol')}</li></ul>
            </label>
            <label>{t('confirmPassword')}<div className="input-wrap"><LockKeyhole size={18}/><input name="confirmPassword" type={showTeacherPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required/></div></label>
            {error && <div className="error" role="alert">{error}</div>}<button className="primary submit" type="submit" disabled={busy}>{busy ? t('wait') : t('register')}<ArrowRight size={18}/></button>
            <button className="text-action" type="button" onClick={backToTeacherLogin}>{t('alreadyHaveAccount')}</button>
          </form>
        </>}
      </section>}
      <div className="trust-row"><span><ShieldCheck size={16}/> {t('madeFor')}</span><i>·</i><span>{t('noRankings')}</span></div>
    </section>}
    {user?.role !== 'student' && <footer>© 2026 ConceptBridge <span>•</span> {t('learnPace')}</footer>}
  </main>;
}
