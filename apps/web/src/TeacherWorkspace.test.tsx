import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TeacherWorkspace from './TeacherWorkspace';

const dashboard = {
  classes: [{ id: 'c1', name: 'Class 10 Demo', classLevel: 10, board: 'CBSE' }, { id: 'c2', name: 'Class 6 Demo', classLevel: 6, board: 'CBSE' }],
  classroom: { id: 'c1', name: 'Class 10 Demo', code: 'DEMO10', classLevel: 10, board: 'CBSE' },
  concepts: [{ id: 'x1', slug: 'integers-sign-rules', name: 'Integers & sign rules', classLevel: 7, chapter: 'Integers' }],
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

  it('keeps the selected class after refresh polling is installed', async () => {
    const classSixDashboard = { ...dashboard, classroom: { id: 'c2', name: 'Class 6 Demo', code: 'DEMO06', classLevel: 6, board: 'CBSE' }, concepts: [], students: [], groups: [], alerts: [] };
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true, json: async () => url.includes('classId=c2') ? classSixDashboard : dashboard }));
    vi.stubGlobal('fetch', fetchMock);
    render(<TeacherWorkspace user={{ id: 't1', role: 'teacher', name: 'Demo Teacher', language: 'en', board: 'CBSE' }} csrf="csrf" onSignOut={() => undefined} language="en"/>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Class 10 Demo' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'c2' } });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Class 6 Demo' })).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('classId=c2'))).toBe(true);
  });
});
