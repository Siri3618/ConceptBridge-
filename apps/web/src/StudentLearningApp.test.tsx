import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import StudentLearningApp from './StudentLearningApp';

const dashboard = {
  student: { name: 'Asha', classLevel: 10, board: 'CBSE' }, diagnosticNeeded: false,
  concepts: [{ id: '1', slug: 'quadratic-equations', name: 'Quadratic equations', classLevel: 10, chapter: 'Quadratic Equations', mastery: 0.42, baselineMastery: 0.2, confidence: 0.7, nextRevisionAt: null }],
  edges: [], decision: { activity: 'Learn', conceptId: 'quadratic-equations', ruleId: 'learn-low-mastery', reason: { en: 'Let’s build this idea.', te: 'ఈ భావనను నేర్చుకుందాం.' }, rewindPath: [], teacherSet: false },
  streak: { current: 2, longest: 4, freezes: 1, history: [] }, daily: { attempts: 2, goal: 5, revisionsDue: 0, openAlerts: 0 },
};

describe('student learning dashboard', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('loads Today’s Path, the map, and streak details from the student API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => dashboard }));
    render(<StudentLearningApp user={{ id: 's1', role: 'student', name: 'Asha', language: 'en', board: 'CBSE', classLevel: 10 }} csrf="csrf" onSignOut={() => undefined} language="en"/>);
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Quadratic equations' }).length).toBeGreaterThan(0));
    expect(screen.getByText('TODAY’S PATH')).toBeInTheDocument();
    expect(screen.getByText('MY MAP')).toBeInTheDocument();
    expect(screen.getByText('YOUR LEARNING STREAK')).toBeInTheDocument();
    expect(screen.getByText('First check')).toBeInTheDocument();
  });
});
