import { DailyTimeState, DEFAULT_DAILY_TIME_STATE } from "../storage";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_DELTA_MS = 6 * 60 * 60 * 1000; // Cap deltas at 6 hours to handle sleep/time jumps

/**
 * Get today's day key in local timezone (e.g., "2026-01-17")
 */
export const getTodayKey = (now: Date = new Date()): string => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Reset state if the day has changed, otherwise return as-is
 */
export const ensureCurrentDay = (state: DailyTimeState, todayKey: string): DailyTimeState => {
  if (state.dayKey === todayKey) {
    return state;
  }
  return {
    ...DEFAULT_DAILY_TIME_STATE,
    dayKey: todayKey,
  };
};

/**
 * Calculate remaining time in milliseconds
 */
export const getRemainingMs = (
  dailyLimitMinutes: number,
  state: DailyTimeState,
): number => {
  const limitMs = dailyLimitMinutes * 60 * 1000;
  const extraMs = state.extraGrantsUsed * FIVE_MINUTES_MS;
  const totalAllowedMs = limitMs + extraMs;
  return Math.max(0, totalAllowedMs - state.spentMs);
};

/**
 * Check if time limit is exhausted (should block)
 */
export const isTimeExhausted = (
  dailyLimitMinutes: number,
  state: DailyTimeState,
): boolean => {
  return getRemainingMs(dailyLimitMinutes, state) <= 0;
};

/**
 * Start a new active session
 */
export const startSession = (
  state: DailyTimeState,
  tabId: number,
  nowMs: number = Date.now(),
): DailyTimeState => {
  return {
    ...state,
    active: { tabId, startedAtMs: nowMs },
  };
};

/**
 * Flush the active session: add elapsed time to spentMs and clear active
 * Caps delta to MAX_DELTA_MS to handle sleep/time jumps
 */
export const flushSession = (
  state: DailyTimeState,
  nowMs: number = Date.now(),
): DailyTimeState => {
  if (!state.active) {
    return state;
  }

  let deltaMs = nowMs - state.active.startedAtMs;
  // Cap delta to avoid huge deductions from sleep/time changes
  if (deltaMs > MAX_DELTA_MS) {
    deltaMs = 0;
  }
  // Ignore negative deltas (clock went backwards)
  if (deltaMs < 0) {
    deltaMs = 0;
  }

  return {
    ...state,
    spentMs: state.spentMs + deltaMs,
    active: null,
  };
};

/**
 * Switch the active session to a different tab (flush current + start new)
 */
export const switchSession = (
  state: DailyTimeState,
  newTabId: number,
  nowMs: number = Date.now(),
): DailyTimeState => {
  const flushed = flushSession(state, nowMs);
  return startSession(flushed, newTabId, nowMs);
};

/**
 * Grant 5 extra minutes
 */
export const grantExtraTime = (state: DailyTimeState): DailyTimeState => {
  return {
    ...state,
    extraGrantsUsed: state.extraGrantsUsed + 1,
  };
};

/**
 * Format remaining milliseconds as "MM:SS" or "H:MM:SS"
 */
export const formatRemainingTime = (remainingMs: number): string => {
  if (remainingMs <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const FIVE_MINUTES_MS_EXPORT = FIVE_MINUTES_MS;
