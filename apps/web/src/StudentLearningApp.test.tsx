import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.getByText('Challenge')).toBeInTheDocument();
    expect(screen.getByText('Build your foundation first')).toBeInTheDocument();
    expect(screen.getByText('MY MAP')).toBeInTheDocument();
    expect(screen.getByText('YOUR LEARNING STREAK')).toBeInTheDocument();
    expect(screen.getByText('First check')).toBeInTheDocument();
  });

  it('does not repeat a due revision in Continue or Fix this first', async () => {
    const dueDashboard = {
      ...dashboard,
      concepts: [{ ...dashboard.concepts[0]!, nextRevisionAt: '2026-01-01T00:00:00.000Z' }],
      decision: { ...dashboard.decision, conceptId: 'quadratic-equations' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => dueDashboard }));
    const { container } = render(<StudentLearningApp user={{ id: 's1', role: 'student', name: 'Asha', language: 'en', board: 'CBSE', classLevel: 10 }} csrf="csrf" onSignOut={() => undefined} language="en"/>);

    await waitFor(() => expect(screen.getByText('Class path complete')).toBeInTheDocument());
    expect(screen.queryByText('Fix this first')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.path-card h3')).toHaveLength(3);
    expect([...container.querySelectorAll('.path-card h3')].filter((heading) => heading.textContent === 'Quadratic equations')).toHaveLength(1);
  });

  it('prefetches the next question during feedback and consumes it on Continue', async () => {
    const user = userEvent.setup();
    let questionRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/student/dashboard')) return Promise.resolve({ ok: true, json: async () => dashboard });
      if (url.includes('/student/question')) {
        questionRequests++;
        const questionNumber = questionRequests;
        const requestUrl = new URL(url, 'http://localhost');
        return Promise.resolve({ ok: true, json: async () => ({ question: { id: `q${questionNumber}`, conceptId: 'question-object-id', difficulty: 3, text: { en: questionNumber === 1 ? 'Question one?' : 'Question two?' }, expectedTimeSec: 30, options: [{ index: 0, text: { en: '3' } }, { index: 1, text: { en: '4' } }], hints: [] }, concept: { id: 'quadratic-equations' }, activity: 'solve', activityId: requestUrl.searchParams.get('activityId'), studentId: 's1' }) });
      }
      if (url.includes('/student/answer')) return Promise.resolve({ ok: true, json: async () => ({ correct: true, feedback: null, answer: '3', mastery: 0.5, confidence: 0.7, conceptCheckRequired: false, rewindPath: [], decision: { activity: 'Solve', conceptId: 'quadratic-equations', ruleId: 'practice', reason: { en: 'Practice', te: 'సాధన' } }, streak: null }) });
      if (url.includes('/student/topic-pack/')) return Promise.resolve({ ok: true, json: async () => ({}) });
      throw new Error(`Unexpected API request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StudentLearningApp user={{ id: 's1', role: 'student', name: 'Asha', language: 'en', board: 'CBSE', classLevel: 10 }} csrf="csrf" onSignOut={() => undefined} language="en"/>);

    await user.click(await screen.findByRole('button', { name: /^Solve/ }));
    expect(await screen.findByRole('heading', { name: 'Question one?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /A\s*3/ }));
    await user.click(screen.getByRole('button', { name: 'Sure' }));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await waitFor(() => expect(questionRequests).toBe(2));
    expect(await screen.findByText('That’s correct!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Question two?' })).toBeInTheDocument();
    expect(questionRequests).toBe(2);
  });

  it('falls back to a fresh request when a prefetch fails or expires', async () => {
    const user = userEvent.setup();
    let questionRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/student/dashboard')) return Promise.resolve({ ok: true, json: async () => dashboard });
      if (url.includes('/student/question')) {
        questionRequests++;
        if (questionRequests === 2) return Promise.resolve({ ok: false, json: async () => ({ error: { message: 'Temporary question service error.' } }) });
        const questionNumber = questionRequests;
        const requestUrl = new URL(url, 'http://localhost');
        return Promise.resolve({ ok: true, json: async () => ({ question: { id: `q${questionNumber}`, conceptId: 'question-object-id', difficulty: 3, text: { en: `Question ${questionNumber}?` }, expectedTimeSec: 30, options: [{ index: 0, text: { en: '3' } }, { index: 1, text: { en: '4' } }], hints: [] }, concept: { id: 'quadratic-equations' }, activity: 'solve', activityId: requestUrl.searchParams.get('activityId'), studentId: questionNumber === 4 ? 'other-student' : 's1' }) });
      }
      if (url.includes('/student/answer')) return Promise.resolve({ ok: true, json: async () => ({ correct: true, feedback: null, answer: '3', mastery: 0.5, confidence: 0.7, conceptCheckRequired: false, rewindPath: [], decision: { activity: 'Solve', conceptId: 'quadratic-equations', ruleId: 'practice', reason: { en: 'Practice', te: 'సాధన' } }, streak: null }) });
      if (url.includes('/student/topic-pack/')) return Promise.resolve({ ok: true, json: async () => ({}) });
      throw new Error(`Unexpected API request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StudentLearningApp user={{ id: 's1', role: 'student', name: 'Asha', language: 'en', board: 'CBSE', classLevel: 10 }} csrf="csrf" onSignOut={() => undefined} language="en"/>);

    await user.click(await screen.findByRole('button', { name: /^Solve/ }));
    expect(await screen.findByRole('heading', { name: 'Question 1?' })).toBeInTheDocument();
    const answerCurrentQuestion = async () => {
      await user.click(screen.getByRole('button', { name: /A\s*3/ }));
      await user.click(screen.getByRole('button', { name: 'Sure' }));
      await user.click(screen.getByRole('button', { name: 'Check answer' }));
      await screen.findByText('That’s correct!');
    };
    await answerCurrentQuestion();
    await waitFor(() => expect(questionRequests).toBe(2));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Question 3?' })).toBeInTheDocument();
    expect(questionRequests).toBe(3);

    await answerCurrentQuestion();
    await waitFor(() => expect(questionRequests).toBe(4));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Question 5?' })).toBeInTheDocument();
    expect(questionRequests).toBe(5);

    await answerCurrentQuestion();
    await waitFor(() => expect(questionRequests).toBe(6));
    const future = Date.now() + 31_000;
    vi.spyOn(Date, 'now').mockReturnValue(future);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Question 7?' })).toBeInTheDocument();
    expect(questionRequests).toBe(7);
    vi.restoreAllMocks();
  });
});
