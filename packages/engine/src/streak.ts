import { ENGINE_CONFIG } from './config.js';
export interface StreakState { current: number; longest: number; freezes: number; lastActiveDate?: string; history: string[] }
export interface StreakUpdate { state: StreakState; counted: boolean; milestone?: 3 | 7 | 14 | 30; message: { en: string; te: string } }
const dateKey = (timestamp: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const dayNumber = (key: string) => { const [year, month, day] = key.split('-').map(Number); return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000); };
const weekday = (key: string) => { const [year, month, day] = key.split('-').map(Number); return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay(); };

/** Records an engaged activity day; duplicate and out-of-order offline events are idempotent. */
export function recordStreakActivity(state: StreakState, timestamp: number, timeZone = ENGINE_CONFIG.streak.timezone): StreakUpdate {
  const key = dateKey(timestamp, timeZone);
  if (state.history.includes(key)) return { state: { ...state, history: [...state.history] }, counted: false, message: { en: 'You already made progress today. Keep it up!', te: 'ఈరోజు మీరు ఇప్పటికే అభ్యాసం చేశారు. కొనసాగించండి!' } };
  const history = [...state.history, key].sort();
  if (!state.lastActiveDate) return result({ ...state, current: 1, longest: Math.max(1, state.longest), lastActiveDate: key, history }, true);
  const gap = dayNumber(key) - dayNumber(state.lastActiveDate);
  if (gap <= 0) return { state: { ...state, history }, counted: true, message: { en: 'Your offline progress is saved for that day.', te: 'ఆ రోజు మీ ఆఫ్‌లైన్ అభ్యాసం భద్రపరచబడింది.' } };
  let current = state.current;
  let freezes = state.freezes;
  if (gap === 1) current += 1;
  else if (gap === 2 && [5, 6].includes(weekday(state.lastActiveDate))) current += 1; // weekend-friendly grace day
  else if (gap === 2 && freezes > 0) { freezes -= 1; current += 1; }
  else current = 1;
  return result({ ...state, current, longest: Math.max(state.longest, current), freezes, lastActiveDate: key, history }, true);
}

/** Mastering a concept earns one freeze, with a maximum of two stored. */
export function earnStreakFreeze(state: StreakState): StreakState {
  return { ...state, freezes: Math.min(ENGINE_CONFIG.streak.maxFreezes, state.freezes + 1) };
}
function result(state: StreakState, counted: boolean): StreakUpdate {
  const milestone = ([3, 7, 14, 30] as const).find((n) => n === state.current);
  return { state, counted, ...(milestone ? { milestone } : {}), message: milestone
    ? { en: `${milestone} days of learning! You’re building a strong habit.`, te: `${milestone} రోజుల అభ్యాసం! మీరు మంచి అలవాటును పెంచుకుంటున్నారు.` }
    : { en: 'Nice work showing up for your learning today.', te: 'ఈరోజు అభ్యాసానికి సమయం కేటాయించడం చాలా బాగుంది.' } };
}
