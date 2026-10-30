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
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('shows student and teacher sign-in choices', () => {
    render(<I18nextProvider i18n={i18n}><App /></I18nextProvider>);
    expect(screen.getByRole('tab', { name: /I’m a student/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /I’m a teacher/i })).toBeInTheDocument();
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
    expect(screen.getByText('CLASS HEATMAP')).toBeInTheDocument();
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

