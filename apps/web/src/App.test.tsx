import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import App from './App';

const teacherDashboard = {
  classes: [{ id: 'c1', name: 'Class 10 Demo', classLevel: 10, board: 'CBSE' }],
  classroom: { id: 'c1', name: 'Class 10 Demo', code: 'DEMO10', classLevel: 10, board: 'CBSE' },
  concepts: [{ id: 'x1', slug: 'integers-sign-rules', name: 'Integers & sign rules', classLevel: 7, chapter: 'Integers' }],
  students: [], groups: [], misconceptions: [], alerts: [],
};
const studentDashboard = {
  student: { name: 'Asha', classLevel: 10, board: 'CBSE' }, diagnosticNeeded: false,
  concepts: [{ id: 'q1', slug: 'quadratic-equations', name: 'Quadratic equations', classLevel: 10, chapter: 'Quadratic Equations', mastery: 0.42, baselineMastery: 0.2, confidence: 0.7, nextRevisionAt: null }],
  edges: [], decision: { activity: 'Learn', conceptId: 'quadratic-equations', ruleId: 'learn-low-mastery', reason: { en: 'Let’s build this idea.', te: 'ఈ భావనను నేర్చుకుందాం.' }, rewindPath: [], teacherSet: false },
  streak: { current: 2, longest: 4, freezes: 1, history: [] }, daily: { attempts: 2, goal: 5, revisionsDue: 0, openAlerts: 0 },
};
const adminOverview = {
  metrics: { teachers: 1, activeTeachers: 1, classes: 1, students: 40 },
  teachers: [{ id: 't1', name: 'Demo Teacher', email: 'teacher@example.school', board: 'CBSE', language: 'en', active: true }],
  concepts: [{ id: 'c1', name: 'Fractions', nameTe: 'భిన్నాలు', classLevel: 6, chapters: { CBSE: 'Fractions' }, questions: 6, explanations: 2 }],
};

function apiResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 401, json: async () => body });
}

describe('sign-in and role journeys', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState({}, '', '/'); });

  it('shows student and teacher sign-in choices', () => {
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);
    expect(screen.getByRole('tab', { name: /I’m a student/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /I’m a teacher/i })).toBeInTheDocument();
  });

  it('registers a student with classroom-only credentials and returns to student sign-in', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) return apiResponse({ csrfToken: 'csrf-test' });
      if (url.endsWith('/auth/student/register')) return apiResponse({ student: { id: 's-new', name: 'Asha Rao', rollNo: '01', classCode: 'DEMO10', classLevel: 10, board: 'CBSE' } });
      throw new Error(`Unexpected API request: ${url} ${String(init?.body ?? '')}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);
    await user.click(screen.getByRole('button', { name: /Create student account/i }));
    await user.type(screen.getByLabelText('Class code'), 'demo10');
    await user.type(screen.getByLabelText('Full name'), 'Asha Rao');
    await user.type(screen.getByLabelText('Roll number'), '01');
    await user.type(screen.getByLabelText('PIN'), '4826');
    await user.type(screen.getByLabelText('Confirm PIN'), '4826');
    const registerButtons = screen.getAllByRole('button', { name: /Create student account/i });
    await user.click(registerButtons.at(-1)!);
    expect(await screen.findAllByText('Student account created. You can now sign in.')).not.toHaveLength(0);
    const registration = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/student/register'));
    expect(JSON.parse(String(registration?.[1]?.body))).toEqual({ classCode: 'DEMO10', name: 'Asha Rao', rollNo: '01', pin: '4826', confirmPin: '4826' });
    expect(JSON.stringify(registration?.[1]?.body)).not.toMatch(/email|phone|classId|teacherId|pinHash|role/);
    await user.click(screen.getByRole('button', { name: /Back to student sign in/i }));
    expect(screen.getByRole('tab', { name: /I’m a student/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows separate field errors for invalid student registration values without exposing PINs', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) return apiResponse({ csrfToken: 'csrf-test' });
      throw new Error(`Unexpected API request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);
    await user.click(screen.getByRole('button', { name: /Create student account/i }));
    await user.type(screen.getByLabelText('Class code'), '!');
    await user.type(screen.getByLabelText('Full name'), 'A');
    await user.type(screen.getByLabelText('Roll number'), '   ');
    await user.type(screen.getByLabelText('PIN'), '1234');
    await user.type(screen.getByLabelText('Confirm PIN'), '5678');
    await user.click(screen.getAllByRole('button', { name: /Create student account/i }).at(-1)!);

    expect(screen.getByText('Enter a code with 4–12 letters, numbers, or hyphens.')).toBeInTheDocument();
    expect(screen.getByText('Enter a full name between 2 and 100 characters.')).toBeInTheDocument();
    expect(screen.getByText('Enter a roll number (up to 20 characters).')).toBeInTheDocument();
    expect(screen.getByText('PIN cannot use all repeated digits or a consecutive sequence.')).toBeInTheDocument();
    expect(screen.getByText('The PIN entries do not match.')).toBeInTheDocument();
    expect(screen.queryByText(/1234|5678/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/student/register'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Change language' }));
    await user.click(screen.getByRole('button', { name: 'విద్యార్థి ఖాతా సృష్టించండి' }));
    expect(screen.getByText('4–12 అక్షరాలు, సంఖ్యలు లేదా హైఫన్‌లతో కోడ్ నమోదు చేయండి.')).toBeInTheDocument();
    expect(screen.getByText('అన్ని అంకెలు ఒకేలా లేదా వరుసగా ఉండే పిన్ వాడకండి.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'భాష మార్చండి' }));
  });

  it('shows invalid classroom code responses on the classroom-code field', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) return apiResponse({ csrfToken: 'csrf-test' });
      if (url.endsWith('/auth/student/register')) return apiResponse({ error: { code: 'INVALID_CLASS_CODE', message: 'That classroom code was not found.' } }, false);
      throw new Error(`Unexpected API request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);
    await user.click(screen.getByRole('button', { name: /Create student account/i }));
    await user.type(screen.getByLabelText('Class code'), 'CB0123456789');
    await user.type(screen.getByLabelText('Full name'), 'Asha Rao');
    await user.type(screen.getByLabelText('Roll number'), '01');
    await user.type(screen.getByLabelText('PIN'), '4826');
    await user.type(screen.getByLabelText('Confirm PIN'), '4826');
    await user.click(screen.getAllByRole('button', { name: /Create student account/i }).at(-1)!);

    expect(await screen.findByText('Classroom code not found. Check the code with your teacher.')).toBeInTheDocument();
    expect(document.querySelector('input[name="classCode"]')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/Enter valid classroom and student details/)).not.toBeInTheDocument();
  });

  it('logs a teacher in and opens the classroom overview', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) return apiResponse({ csrfToken: 'csrf-test' });
      if (url.endsWith('/auth/me')) return apiResponse({ error: { message: 'Please sign in.' } }, false);
      if (url.endsWith('/auth/teacher')) return apiResponse({ user: { id: 't1', role: 'teacher', name: 'Demo Teacher', language: 'en', board: 'CBSE' } });
      if (url.includes('/teacher/dashboard')) return apiResponse(teacherDashboard);
      throw new Error(`Unexpected API request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);

    await user.click(screen.getByRole('tab', { name: /I’m a teacher/i }));
    await user.type(screen.getByLabelText('Email address'), 'teacher@conceptbridge.demo');
    await user.type(screen.getByLabelText('Password'), 'LearnMath2026!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('heading', { name: 'Class 10 Demo' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/teacher', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/me'))).toBe(false);
    expect(screen.getByText('CLASS HEATMAP')).toBeInTheDocument();
  });

  it('registers a teacher directly into an authenticated classroom workspace without email verification', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) return apiResponse({ csrfToken: 'csrf-test', user: null });
      if (url.endsWith('/auth/teacher/register')) return apiResponse({ user: { id: 'new-teacher', role: 'teacher', name: 'New Teacher', language: 'en', board: 'CBSE' } });
      if (url.includes('/teacher/dashboard')) return apiResponse(teacherDashboard);
      throw new Error(`Unexpected API request: ${url} ${String(init?.body ?? '')}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);
    await user.click(screen.getByRole('tab', { name: /I’m a teacher/i }));
    await user.click(screen.getByRole('button', { name: /Create a teacher account/i }));
    const passwordInput = document.querySelector<HTMLInputElement>('input[name="password"]')!;
    const confirmPasswordInput = document.querySelector<HTMLInputElement>('input[name="confirmPassword"]')!;
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(screen.getByText('12–128 characters')).toBeInTheDocument();
    expect(screen.getByText('At least one lowercase letter (a–z)')).toBeInTheDocument();
    expect(screen.getByText('At least one uppercase letter (A–Z)')).toBeInTheDocument();
    expect(screen.getByText('At least one number (0–9)')).toBeInTheDocument();
    expect(screen.getByText(/At least one symbol/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(confirmPasswordInput).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Change language' }));
    expect(await screen.findByText('12–128 అక్షరాలు')).toBeInTheDocument();
    expect(screen.getByText('కనీసం ఒక చిన్న అక్షరం (a–z)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'భాష మార్చండి' }));
    await user.type(screen.getByLabelText('Full name'), 'New Teacher');
    await user.type(screen.getByLabelText('Email address'), 'New.Teacher@Example.com');
    await user.type(document.querySelector<HTMLInputElement>('input[name="password"]')!, 'StrongTeacher2026!');
    await user.type(screen.getByLabelText('Confirm password'), 'StrongTeacher2026!');
    await user.click(screen.getByRole('button', { name: /Create account/i }));
    expect(await screen.findByRole('heading', { name: 'Class 10 Demo' })).toBeInTheDocument();
    const registerCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/teacher/register'));
    expect(JSON.parse(String(registerCall?.[1]?.body))).toEqual({ name: 'New Teacher', email: 'new.teacher@example.com', password: 'StrongTeacher2026!' });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/verification/'))).toBe(false);
  });

  it('shows a useful service message when the API returns an empty response', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) return apiResponse({ csrfToken: 'csrf-test' });
      if (url.endsWith('/auth/me')) return apiResponse({ error: { message: 'Please sign in.' } }, false);
      if (url.endsWith('/auth/teacher')) return Promise.resolve({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } });
      throw new Error(`Unexpected API request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);

    await user.click(screen.getByRole('tab', { name: /I’m a teacher/i }));
    await user.type(screen.getByLabelText('Email address'), 'teacher@conceptbridge.demo');
    await user.type(screen.getByLabelText('Password'), 'LearnMath2026!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the sign-in service. Check that MongoDB and the API are running.');
    expect(screen.queryByText(/Unexpected end of JSON input/)).not.toBeInTheDocument();
  });

  it('routes an administrator sign-in to teacher and curriculum management', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) return apiResponse({ csrfToken: 'csrf-test' });
      if (url.endsWith('/auth/me')) return apiResponse({ error: { message: 'Please sign in.' } }, false);
      if (url.endsWith('/auth/teacher')) return apiResponse({ user: { id: 'a1', role: 'admin', name: 'School Admin', language: 'en', board: 'CBSE' } });
      if (url.endsWith('/admin/overview')) return apiResponse(adminOverview);
      throw new Error(`Unexpected API request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);

    await user.click(screen.getByRole('tab', { name: /I’m a teacher/i }));
    await user.type(screen.getByLabelText('Email address'), 'admin@example.school');
    await user.type(screen.getByLabelText('Password'), 'SecureAdminPass2026!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('heading', { name: 'School administration' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Teacher accounts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Curriculum coverage' })).toBeInTheDocument();
  });

  it('logs a student in and opens Today’s Path and My Map', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/csrf')) return apiResponse({ csrfToken: 'csrf-test' });
      if (url.endsWith('/auth/me')) return apiResponse({ error: { message: 'Please sign in.' } }, false);
      if (url.endsWith('/auth/student')) return apiResponse({ user: { id: 's1', role: 'student', name: 'Asha', language: 'en', board: 'CBSE', classLevel: 10 } });
      if (url.includes('/student/dashboard')) return apiResponse(studentDashboard);
      if (url.includes('/student/topic-pack/')) return apiResponse({});
      throw new Error(`Unexpected API request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);

    await user.type(screen.getByLabelText(/Class code/i), 'DEMO10');
    await user.type(screen.getByLabelText(/Roll number/i), '01');
    await user.type(screen.getByLabelText(/PIN/i), '1001');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('heading', { name: 'Quadratic equations' })).toBeInTheDocument();
    expect(screen.getByText('TODAY’S PATH')).toBeInTheDocument();
    expect(screen.getByText('MY MAP')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/student', expect.objectContaining({ method: 'POST' })));
  });
});

