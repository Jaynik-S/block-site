import storage, { DailyTimeState, DEFAULT_DAILY_TIME_STATE } from "./storage";
import {
  getTodayKey,
  ensureCurrentDay,
  getRemainingMs,
  formatRemainingTime,
  grantExtraTime,
} from "./helpers/time-limit";

const UI = (() => {
  const elements = {
    timeLimitSection: document.getElementById("time-limit-section") as HTMLDivElement,
    timeLimitDisabled: document.getElementById("time-limit-disabled") as HTMLDivElement,
    timeDisplay: document.getElementById("time-display") as HTMLSpanElement,
    exhaustedSection: document.getElementById("time-exhausted-section") as HTMLDivElement,
    grantExtraBtn: document.getElementById("grant-extra-btn") as HTMLButtonElement,
    extraGrantsInfo: document.getElementById("extra-grants-info") as HTMLParagraphElement,
    optionsLink: document.getElementById("options-link") as HTMLAnchorElement,
  };

  let currentState: {
    timeLimitEnabled: boolean;
    dailyTimeLimitMinutes: number;
    dailyTimeState: DailyTimeState;
  } | null = null;

  let updateIntervalId: number | null = null;

  const updateDisplay = () => {
    if (!currentState) return;

    const { timeLimitEnabled, dailyTimeLimitMinutes, dailyTimeState } = currentState;

    if (!timeLimitEnabled) {
      elements.timeLimitSection.classList.add("hidden");
      elements.timeLimitDisabled.classList.remove("hidden");
      return;
    }

    elements.timeLimitSection.classList.remove("hidden");
    elements.timeLimitDisabled.classList.add("hidden");

    const todayKey = getTodayKey();
    const state = ensureCurrentDay(dailyTimeState, todayKey);

    // Calculate remaining time, accounting for active session
    let remainingMs = getRemainingMs(dailyTimeLimitMinutes, state);

    // If there's an active session, subtract elapsed time since session start
    if (state.active) {
      const elapsedMs = Date.now() - state.active.startedAtMs;
      remainingMs = Math.max(0, remainingMs - elapsedMs);
    }

    const exhausted = remainingMs <= 0;

    // Update time display
    elements.timeDisplay.textContent = formatRemainingTime(remainingMs);

    // Update time display color based on remaining time
    elements.timeDisplay.classList.remove("warning", "critical");
    if (remainingMs <= 60 * 1000) { // 1 minute or less
      elements.timeDisplay.classList.add("critical");
    } else if (remainingMs <= 5 * 60 * 1000) { // 5 minutes or less
      elements.timeDisplay.classList.add("warning");
    }

    // Show/hide exhausted section
    if (exhausted) {
      elements.exhaustedSection.classList.remove("hidden");
      if (state.extraGrantsUsed > 0) {
        elements.extraGrantsInfo.textContent = `Extra time granted: ${state.extraGrantsUsed} × 5 minutes`;
      } else {
        elements.extraGrantsInfo.textContent = "";
      }
    } else {
      elements.exhaustedSection.classList.add("hidden");
    }
  };

  const init = (data: {
    timeLimitEnabled: boolean;
    dailyTimeLimitMinutes: number;
    dailyTimeState: DailyTimeState;
  }) => {
    currentState = data;
    updateDisplay();

    // Update display every second for live countdown
    if (updateIntervalId === null) {
      updateIntervalId = window.setInterval(updateDisplay, 1000);
    }
  };

  // Handle +5 minutes button
  elements.grantExtraBtn.addEventListener("click", () => {
    if (!currentState) return;

    storage.get(["dailyTimeState"]).then(({ dailyTimeState }) => {
      const todayKey = getTodayKey();
      let state = ensureCurrentDay(dailyTimeState || DEFAULT_DAILY_TIME_STATE, todayKey);
      state = grantExtraTime(state);
      storage.set({ dailyTimeState: state });
    });
  });

  // Handle options link
  elements.optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  return { init };
})();

window.addEventListener("DOMContentLoaded", () => {
  storage.get(["timeLimitEnabled", "dailyTimeLimitMinutes", "dailyTimeState"]).then((data) => {
    UI.init({
      timeLimitEnabled: data.timeLimitEnabled ?? false,
      dailyTimeLimitMinutes: data.dailyTimeLimitMinutes ?? 30,
      dailyTimeState: data.dailyTimeState ?? DEFAULT_DAILY_TIME_STATE,
    });
    document.body.classList.add("ready");
  });

  chrome.storage.local.onChanged.addListener(() => {
    storage.get(["timeLimitEnabled", "dailyTimeLimitMinutes", "dailyTimeState"]).then((data) => {
      UI.init({
        timeLimitEnabled: data.timeLimitEnabled ?? false,
        dailyTimeLimitMinutes: data.dailyTimeLimitMinutes ?? 30,
        dailyTimeState: data.dailyTimeState ?? DEFAULT_DAILY_TIME_STATE,
      });
    });
  });
});
