import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TeacherWorkspace from './TeacherWorkspace';

const dashboard = {
  classes: [6, 7, 8, 9, 10].map((classLevel) => ({ id: `c${classLevel}`, name: `Class ${classLevel} Demo`, classLevel, board: 'CBSE' })),
  classroom: { id: 'c1', name: 'Class 10 Demo', code: 'DEMO10', classLevel: 10, board: 'CBSE' },
  concepts: [
    { id: 'x0', slug: 'fractions', name: 'Fractions', classLevel: 6, chapter: 'Fractions' },
    { id: 'x1', slug: 'integers-sign-rules', name: 'Integers & sign rules', classLevel: 7, chapter: 'Integers' },
    { id: 'x2', slug: 'algebraic-expressions', name: 'Algebraic expressions', classLevel: 8, chapter: 'Algebra' },
    { id: 'x3', slug: 'ratio-proportion', name: 'Ratio and proportion', classLevel: 9, chapter: 'Ratio' },
    { id: 'x4', slug: 'quadratic-equations', name: 'Quadratic equations', classLevel: 10, chapter: 'Quadratic Equations' },
  ],
  students: [{ id: 's1', name: 'Student 01', rollNo: '01', classLevel: 10, language: 'en', lastActiveAt: new Date().toISOString(), group: 'on-track', mastery: { 'integers-sign-rules': 0.5 }, overallMastery: 0.5, weakConcepts: 0, streak: 3, values: [0.5] }],
  groups: [{ group: 'on-track', count: 1, studentIds: ['s1'], activity: '10-minute partner practice', approved: false, updatedAt: null }],
  activitySources: { real: 3, demo: 2, unclassified: 1 },
  masteryAttribution: 'cumulative-not-source-attributed',
  misconceptions: [{ id: 'm1', text: { en: 'A negative times a negative is positive.', te: 'ఋణాన్ని ఋణంతో గుణిస్తే ధనం.' }, conceptId: 'integers-sign-rules', conceptName: 'Integers & sign rules', likelyRootCause: 'integers-sign-rules', studentCount: 14, attemptCount: 14, activitySources: { real: 8, demo: 4, unclassified: 2 } }],
  alerts: [{ id: 'a1', studentId: 's1', studentName: 'Student 01', type: 'inactivity', message: { en: 'A friendly check-in may help.', te: 'స్నేహపూర్వకంగా అడిగి చూడండి.' } }],
};

describe('teacher classroom dashboard', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('shows class heatmap, misconception counts, group plans, and alerts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => dashboard }));
    render(<TeacherWorkspace user={{ id: 't1', role: 'teacher', name: 'Demo Teacher', language: 'en', board: 'CBSE' }} csrf="csrf" onSignOut={() => undefined} language="en"/>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Class 10 Demo' })).toBeInTheDocument());
    expect(screen.getByText('CLASS HEATMAP')).toBeInTheDocument();
    expect(screen.getByText('14 of 1')).toBeInTheDocument();
    expect(screen.getByText(/Attempts — real: 3 · demo: 2 · unclassified: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Real \/ demo \/ unclassified attempts: 8 \/ 4 \/ 2/)).toBeInTheDocument();
    expect(screen.getByText(/Mastery is cumulative and is not attributed by source/)).toBeInTheDocument();
    expect(screen.getByText('Tomorrow’s 10-minute activity')).toBeInTheDocument();
    expect(screen.getByText('ALERT INBOX')).toBeInTheDocument();
    expect(screen.getByText('Save group instruction')).toBeInTheDocument();
  });

  it('fetches and displays the complete dashboard for each classroom from Classes 6–10', async () => {
    const classDashboard = (level: number) => {
      const studentCount = level === 10 ? 40 : 8;
      const recentlyActive = level === 10 ? 34 : 7;
      const concepts = dashboard.concepts.filter((concept) => concept.classLevel <= level);
      const students = Array.from({ length: studentCount }, (_, index) => ({
        id: `s${level}-${index + 1}`,
        name: `Class ${level} Student ${String(index + 1).padStart(2, '0')}`,
        rollNo: String(index + 1).padStart(2, '0'),
        classLevel: level,
        language: 'en',
        lastActiveAt: index < recentlyActive ? new Date().toISOString() : new Date(Date.now() - 4 * 86_400_000).toISOString(),
        group: 'on-track' as const,
        mastery: Object.fromEntries(concepts.map((concept) => [concept.slug, 0.6])),
        overallMastery: 0.6,
        weakConcepts: 0,
        streak: 2,
        values: concepts.map(() => 0.6),
      }));
      return {
        ...dashboard,
        classroom: { id: `c${level}`, name: `Class ${level} Demo`, code: `DEMO${level}`, classLevel: level, board: 'CBSE' },
        concepts,
        students,
        groups: dashboard.groups.map((group) => ({ ...group, count: group.group === 'on-track' ? studentCount : 0, studentIds: group.group === 'on-track' ? students.map((student) => student.id) : [], activity: `Class ${level} activity plan` })),
        misconceptions: level === 10 ? dashboard.misconceptions : [],
        alerts: level === 10 ? Array.from({ length: 10 }, (_, index) => ({ id: `a${index}`, studentId: students[index]!.id, studentName: students[index]!.name, type: 'inactivity', message: { en: `Class 10 check-in ${index + 1}`, te: `తరగతి 10 తనిఖీ ${index + 1}` } })) : [],
      };
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const requestedClassId = new URL(url, 'http://localhost').searchParams.get('classId');
      const level = requestedClassId ? Number(requestedClassId.slice(1)) : 6;
      return Promise.resolve({ ok: true, json: async () => classDashboard(level) });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<TeacherWorkspace user={{ id: 't1', role: 'teacher', name: 'Demo Teacher', language: 'en', board: 'CBSE' }} csrf="csrf" onSignOut={() => undefined} language="en"/>);
    const selector = await screen.findByRole('combobox', { name: 'Class' });
    for (const level of [6, 7, 8, 9, 10]) {
      fireEvent.change(selector, { target: { value: `c${level}` } });
      expect(await screen.findByRole('heading', { name: `Class ${level} Demo` })).toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([url]) => String(url) === `/api/teacher/dashboard?classId=c${level}`)).toBe(true);
      const expectedStudents = level === 10 ? 40 : 8;
      const recentStudents = level === 10 ? 34 : 7;
      expect(screen.getByText(`${recentStudents}/${expectedStudents}`)).toBeInTheDocument();
      expect(document.querySelector('.heatmap tbody tr')?.textContent).toContain(`Class ${level} Student 01`);
      expect(screen.getByRole('textbox', { name: 'On track activity' })).toHaveValue(`Class ${level} activity plan`);
      expect(document.querySelectorAll('.heatmap thead th:not(.student-sticky)')).toHaveLength(level - 5);
      expect(document.querySelectorAll('.heatmap tbody tr')).toHaveLength(expectedStudents);
      expect(document.querySelectorAll('.alert-card')).toHaveLength(level === 10 ? 10 : 0);
    }
    expect(selector).toHaveValue('c10');
    expect(document.querySelector('.teacher-metric b')?.textContent).toBe('40');
    expect(screen.getByText('14 of 40')).toBeInTheDocument();
  });

  it('creates a classroom, selects its dashboard, and copies the persistent code', async () => {
    const emptyDashboard = { ...dashboard, classes: [], classroom: null, students: [], groups: [], misconceptions: [], alerts: [] };
    const createdDashboard = {
      ...dashboard,
      classes: [...dashboard.classes, { id: 'new-class', name: 'Class 8 Evening', classLevel: 8, board: 'CBSE' }],
      classroom: { id: 'new-class', name: 'Class 8 Evening', code: 'CB0123456789', classLevel: 8, board: 'CBSE' },
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/teacher/classrooms' && init?.method === 'POST') return Promise.resolve({ ok: true, status: 201, json: async () => ({ classroom: createdDashboard.classroom }) });
      if (url === '/api/teacher/dashboard?classId=new-class') return Promise.resolve({ ok: true, json: async () => createdDashboard });
      return Promise.resolve({ ok: true, json: async () => emptyDashboard });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<TeacherWorkspace user={{ id: 't1', role: 'teacher', name: 'Demo Teacher', language: 'en', board: 'CBSE' }} csrf="csrf-token" onSignOut={() => undefined} language="en"/>);
    await screen.findByRole('heading', { name: 'Create your first classroom' });
    fireEvent.click(screen.getByRole('button', { name: /Create Classroom/i }));
    fireEvent.change(screen.getByLabelText('Classroom name'), { target: { value: 'Class 8 Evening' } });
    fireEvent.change(screen.getByLabelText('Class level'), { target: { value: '8' } });
    const createButtons = screen.getAllByRole('button', { name: /Create Classroom/i });
    fireEvent.click(createButtons.at(-1)!);
    await screen.findByRole('heading', { name: 'Class 8 Evening' });
    expect(fetchMock).toHaveBeenCalledWith('/api/teacher/classrooms', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }) }));
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url) === '/api/teacher/classrooms')?.[1]?.body))).toEqual({ name: 'Class 8 Evening', classLevel: 8, board: 'CBSE' });
    expect(screen.getByRole('combobox', { name: 'Class' })).toHaveValue('new-class');
    expect(screen.getByText('CB0123456789')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Copy code/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('CB0123456789'));
    expect(screen.getByText('Classroom code copied.')).toBeInTheDocument();
  });

  it('confirms removal, explains that history is preserved, then refreshes the roster', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const refreshed = { ...dashboard, students: [] };
    let removed = false;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') { removed = true; return Promise.resolve({ ok: true, json: async () => ({ removed: true, alreadyInactive: false }) }); }
      return Promise.resolve({ ok: true, json: async () => removed ? refreshed : dashboard });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<TeacherWorkspace user={{ id: 't1', role: 'teacher', name: 'Demo Teacher', language: 'en', board: 'CBSE' }} csrf="csrf-token" onSignOut={() => undefined} language="en"/>);
    await screen.findByRole('heading', { name: 'Class 10 Demo' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Student 01' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('learning history will be preserved'));
    await screen.findByText('Student 01 was removed. Their learning history is preserved.');
    expect(fetchMock).toHaveBeenCalledWith('/api/teacher/classrooms/c1/students/s1', expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }) }));
    await waitFor(() => expect(document.querySelectorAll('.heatmap tbody tr')).toHaveLength(0));
  });

  it('does not send a removal request when confirmation is cancelled and shows server errors', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(init?.method === 'DELETE'
      ? { ok: false, status: 403, json: async () => ({ error: { message: 'This class is not assigned to your account.' } }) }
      : { ok: true, json: async () => dashboard }));
    vi.stubGlobal('fetch', fetchMock);
    render(<TeacherWorkspace user={{ id: 't1', role: 'teacher', name: 'Demo Teacher', language: 'en', board: 'CBSE' }} csrf="csrf-token" onSignOut={() => undefined} language="en"/>);
    await screen.findByRole('heading', { name: 'Class 10 Demo' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Student 01' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/teacher/classrooms/c1/students/s1', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Student 01' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This class is not assigned to your account.');
    expect(fetchMock).toHaveBeenCalledWith('/api/teacher/classrooms/c1/students/s1', expect.objectContaining({ method: 'DELETE' }));
  });
});
