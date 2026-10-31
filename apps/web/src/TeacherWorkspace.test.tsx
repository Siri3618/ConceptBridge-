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
  misconceptions: [{ id: 'm1', text: { en: 'A negative times a negative is positive.', te: 'ఋణాన్ని ఋణంతో గుణిస్తే ధనం.' }, conceptId: 'integers-sign-rules', conceptName: 'Integers & sign rules', likelyRootCause: 'integers-sign-rules', studentCount: 14, attemptCount: 14 }],
  alerts: [{ id: 'a1', studentId: 's1', studentName: 'Student 01', type: 'inactivity', message: { en: 'A friendly check-in may help.', te: 'స్నేహపూర్వకంగా అడిగి చూడండి.' } }],
};

describe('teacher classroom dashboard', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shows class heatmap, misconception counts, group plans, and alerts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => dashboard }));
    render(<TeacherWorkspace user={{ id: 't1', role: 'teacher', name: 'Demo Teacher', language: 'en', board: 'CBSE' }} csrf="csrf" onSignOut={() => undefined} language="en"/>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Class 10 Demo' })).toBeInTheDocument());
    expect(screen.getByText('CLASS HEATMAP')).toBeInTheDocument();
    expect(screen.getByText('14 of 1')).toBeInTheDocument();
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
});
