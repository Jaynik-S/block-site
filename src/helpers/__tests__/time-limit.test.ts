import {
  getTodayKey,
  ensureCurrentDay,
  getRemainingMs,
  isTimeExhausted,
  startSession,
  flushSession,
  switchSession,
  grantExtraTime,
  formatRemainingTime,
} from "../time-limit";
import { DailyTimeState, DEFAULT_DAILY_TIME_STATE } from "../../storage";

describe("time-limit helpers", () => {
  describe("getTodayKey()", () => {
    it("returns date in YYYY-MM-DD format", () => {
      const date = new Date(2026, 0, 17); // Jan 17, 2026
      expect(getTodayKey(date)).toBe("2026-01-17");
    });

    it("pads single-digit months and days", () => {
      const date = new Date(2026, 0, 5); // Jan 5, 2026
      expect(getTodayKey(date)).toBe("2026-01-05");
    });
  });

  describe("ensureCurrentDay()", () => {
    it("returns state as-is if dayKey matches", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 5000,
        extraGrantsUsed: 1,
        active: null,
      };
      const result = ensureCurrentDay(state, "2026-01-17");
      expect(result).toEqual(state);
    });

    it("resets state if dayKey differs", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-16",
        spentMs: 5000,
        extraGrantsUsed: 2,
        active: { tabId: 1, startedAtMs: 1000 },
      };
      const result = ensureCurrentDay(state, "2026-01-17");
      expect(result).toEqual({
        dayKey: "2026-01-17",
        spentMs: 0,
        extraGrantsUsed: 0,
        active: null,
      });
    });
  });

  describe("getRemainingMs()", () => {
    it("calculates remaining time correctly", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 10 * 60 * 1000, // 10 minutes spent
        extraGrantsUsed: 0,
        active: null,
      };
      // 30 min limit - 10 min spent = 20 min remaining
      expect(getRemainingMs(30, state)).toBe(20 * 60 * 1000);
    });

    it("includes extra grants in calculation", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 30 * 60 * 1000, // 30 minutes spent (limit exhausted)
        extraGrantsUsed: 1, // +5 min granted
        active: null,
      };
      // 30 min limit + 5 min extra - 30 min spent = 5 min remaining
      expect(getRemainingMs(30, state)).toBe(5 * 60 * 1000);
    });

    it("returns 0 when time is exhausted", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 35 * 60 * 1000, // 35 minutes spent
        extraGrantsUsed: 0,
        active: null,
      };
      expect(getRemainingMs(30, state)).toBe(0);
    });
  });

  describe("isTimeExhausted()", () => {
    it("returns false when time remains", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 10 * 60 * 1000,
        extraGrantsUsed: 0,
        active: null,
      };
      expect(isTimeExhausted(30, state)).toBe(false);
    });

    it("returns true when time is exhausted", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 30 * 60 * 1000,
        extraGrantsUsed: 0,
        active: null,
      };
      expect(isTimeExhausted(30, state)).toBe(true);
    });
  });

  describe("startSession()", () => {
    it("sets active session with tabId and timestamp", () => {
      const state: DailyTimeState = { ...DEFAULT_DAILY_TIME_STATE, dayKey: "2026-01-17" };
      const result = startSession(state, 42, 1000);
      expect(result.active).toEqual({ tabId: 42, startedAtMs: 1000 });
    });
  });

  describe("flushSession()", () => {
    it("adds elapsed time to spentMs and clears active", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 5000,
        extraGrantsUsed: 0,
        active: { tabId: 42, startedAtMs: 1000 },
      };
      const result = flushSession(state, 6000); // 5 seconds elapsed
      expect(result.spentMs).toBe(10000); // 5000 + 5000
      expect(result.active).toBeNull();
    });

    it("returns state unchanged if no active session", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 5000,
        extraGrantsUsed: 0,
        active: null,
      };
      const result = flushSession(state, 6000);
      expect(result).toEqual(state);
    });

    it("caps large deltas (sleep/time jump protection)", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 5000,
        extraGrantsUsed: 0,
        active: { tabId: 42, startedAtMs: 1000 },
      };
      // 10 hours later - should be capped to 0
      const tenHoursLater = 1000 + 10 * 60 * 60 * 1000;
      const result = flushSession(state, tenHoursLater);
      expect(result.spentMs).toBe(5000); // unchanged
    });

    it("ignores negative deltas (clock went backwards)", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 5000,
        extraGrantsUsed: 0,
        active: { tabId: 42, startedAtMs: 10000 },
      };
      const result = flushSession(state, 5000); // clock went back
      expect(result.spentMs).toBe(5000); // unchanged
    });
  });

  describe("switchSession()", () => {
    it("flushes current session and starts new one", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 5000,
        extraGrantsUsed: 0,
        active: { tabId: 42, startedAtMs: 1000 },
      };
      const result = switchSession(state, 99, 6000);
      expect(result.spentMs).toBe(10000); // flushed 5 seconds
      expect(result.active).toEqual({ tabId: 99, startedAtMs: 6000 });
    });
  });

  describe("grantExtraTime()", () => {
    it("increments extraGrantsUsed", () => {
      const state: DailyTimeState = {
        dayKey: "2026-01-17",
        spentMs: 30 * 60 * 1000,
        extraGrantsUsed: 0,
        active: null,
      };
      const result = grantExtraTime(state);
      expect(result.extraGrantsUsed).toBe(1);
    });
  });

  describe("formatRemainingTime()", () => {
    it("formats seconds correctly", () => {
      expect(formatRemainingTime(45 * 1000)).toBe("0:45");
    });

    it("formats minutes and seconds", () => {
      expect(formatRemainingTime(5 * 60 * 1000 + 30 * 1000)).toBe("5:30");
    });

    it("formats hours, minutes, and seconds", () => {
      expect(formatRemainingTime(2 * 60 * 60 * 1000 + 15 * 60 * 1000 + 5 * 1000)).toBe("2:15:05");
    });

    it("returns 0:00 for zero or negative", () => {
      expect(formatRemainingTime(0)).toBe("0:00");
      expect(formatRemainingTime(-1000)).toBe("0:00");
    });
  });
});
