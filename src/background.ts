import initStorage from "./storage/init";
import storage, { DailyTimeState, DEFAULT_DAILY_TIME_STATE } from "./storage";
import recreateContextMenu from "./helpers/recreate-context-menu";
import blockSite from "./helpers/block-site";
import findRule from "./helpers/find-rule";
import {
  getTodayKey,
  ensureCurrentDay,
  getRemainingMs,
  isTimeExhausted,
  flushSession,
  startSession,
} from "./helpers/time-limit";

const ALARM_NAME = "dailyTimeLimit";

let __enabled: boolean;
let __contextMenu: boolean;
let __blocked: string[];
let __timeLimitEnabled: boolean;
let __dailyTimeLimitMinutes: number;
let __dailyTimeState: DailyTimeState;
let __windowFocused: boolean = true;

initStorage().then(() => {
  storage.get([
    "enabled", "contextMenu", "blocked",
    "timeLimitEnabled", "dailyTimeLimitMinutes", "dailyTimeState",
  ]).then(({ enabled, contextMenu, blocked, timeLimitEnabled, dailyTimeLimitMinutes, dailyTimeState }) => {
    __enabled = enabled;
    __contextMenu = contextMenu;
    __blocked = blocked;
    __timeLimitEnabled = timeLimitEnabled;
    __dailyTimeLimitMinutes = dailyTimeLimitMinutes;
    __dailyTimeState = dailyTimeState || DEFAULT_DAILY_TIME_STATE;

    recreateContextMenu(__enabled && __contextMenu);

    // Initialize time tracking on startup
    reconcileTimeTracking();
  });

  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes["enabled"]) {
      __enabled = changes["enabled"].newValue as boolean;
    }

    if (changes["contextMenu"]) {
      __contextMenu = changes["contextMenu"].newValue as boolean;
    }

    if (changes["enabled"] || changes["contextMenu"]) {
      recreateContextMenu(__enabled && __contextMenu);
    }

    if (changes["blocked"]) {
      __blocked = changes["blocked"].newValue as string[];
      // Re-evaluate tracking when blocklist changes
      reconcileTimeTracking();
    }

    if (changes["timeLimitEnabled"]) {
      __timeLimitEnabled = changes["timeLimitEnabled"].newValue as boolean;
      reconcileTimeTracking();
    }

    if (changes["dailyTimeLimitMinutes"]) {
      __dailyTimeLimitMinutes = changes["dailyTimeLimitMinutes"].newValue as number;
      reconcileTimeTracking();
    }

    if (changes["dailyTimeState"]) {
      __dailyTimeState = changes["dailyTimeState"].newValue as DailyTimeState;
      // Don't reconcile here to avoid loops; this is triggered by our own writes
    }
  });
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!__enabled || !__blocked.length) {
    return;
  }

  const { tabId, url, frameId } = details;
  if (!url || !url.startsWith("http") || frameId !== 0) {
    return;
  }

  blockSite({
    blocked: __blocked,
    tabId,
    url,
    timeLimitEnabled: __timeLimitEnabled,
    dailyTimeLimitMinutes: __dailyTimeLimitMinutes,
    dailyTimeState: __dailyTimeState,
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!tabId || !__enabled || !__blocked.length) {
    return;
  }

  const { url } = changeInfo;
  if (!url || !url.startsWith("http")) {
    return;
  }

  blockSite({
    blocked: __blocked,
    tabId,
    url,
    timeLimitEnabled: __timeLimitEnabled,
    dailyTimeLimitMinutes: __dailyTimeLimitMinutes,
    dailyTimeState: __dailyTimeState,
  });

  // Re-evaluate time tracking when URL changes
  reconcileTimeTracking();
});

// ==========================================
// Daily Time Limit Tracking
// ==========================================

/**
 * Find any tab that matches a block rule
 */
const findAnyMatchingTab = async (): Promise<chrome.tabs.Tab | undefined> => {
  if (!__enabled || !__blocked.length || !__timeLimitEnabled) {
    return undefined;
  }

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !tab.url.startsWith("http") || !tab.id) {
      continue;
    }
    const rule = findRule(tab.url, __blocked);
    if (rule && rule.type === "block") {
      return tab;
    }
  }
  return undefined;
};

/**
 * Core reconciliation: check current state and update tracking accordingly
 */
const reconcileTimeTracking = async () => {
  if (!__enabled || !__timeLimitEnabled || !__blocked.length) {
    // Time limit not active: flush any active session and clear alarm
    if (__dailyTimeState?.active) {
      const todayKey = getTodayKey();
      let state = ensureCurrentDay(__dailyTimeState, todayKey);
      state = flushSession(state);
      __dailyTimeState = state;
      await storage.set({ dailyTimeState: state });
    }
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }

  const todayKey = getTodayKey();
  let state = ensureCurrentDay(__dailyTimeState, todayKey);
  const now = Date.now();

  // If time is already exhausted, ensure no active session and clear alarm
  if (isTimeExhausted(__dailyTimeLimitMinutes, state)) {
    if (state.active) {
      state = flushSession(state, now);
    }
    __dailyTimeState = state;
    await storage.set({ dailyTimeState: state });
    await chrome.alarms.clear(ALARM_NAME);

    // Block any matching tabs that are currently open
    await blockAllMatchingTabs();
    return;
  }

  // Find a matching tab
  const matchingTab = await findAnyMatchingTab();

  if (matchingTab && matchingTab.id && __windowFocused) {
    // Should be tracking
    if (!state.active) {
      // Start new session
      state = startSession(state, matchingTab.id, now);
      __dailyTimeState = state;
      await storage.set({ dailyTimeState: state });
    } else if (state.active.tabId !== matchingTab.id) {
      // Switch to different matching tab (flush old, start new)
      state = flushSession(state, now);
      state = startSession(state, matchingTab.id, now);
      __dailyTimeState = state;
      await storage.set({ dailyTimeState: state });
    }

    // Schedule alarm for when time runs out
    const remainingMs = getRemainingMs(__dailyTimeLimitMinutes, state);
    // Account for time already in current session
    const activeMs = state.active ? (now - state.active.startedAtMs) : 0;
    const alarmInMs = Math.max(1000, remainingMs - activeMs);

    await chrome.alarms.clear(ALARM_NAME);
    chrome.alarms.create(ALARM_NAME, { when: now + alarmInMs });
  } else {
    // No matching tab or window not focused: stop tracking
    if (state.active) {
      state = flushSession(state, now);
      __dailyTimeState = state;
      await storage.set({ dailyTimeState: state });
    }
    await chrome.alarms.clear(ALARM_NAME);
  }
};

/**
 * Block all currently open tabs that match block rules
 */
const blockAllMatchingTabs = async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !tab.url.startsWith("http") || !tab.id) {
      continue;
    }
    const rule = findRule(tab.url, __blocked);
    if (rule && rule.type === "block") {
      blockSite({
        blocked: __blocked,
        tabId: tab.id,
        url: tab.url,
        timeLimitEnabled: __timeLimitEnabled,
        dailyTimeLimitMinutes: __dailyTimeLimitMinutes,
        dailyTimeState: __dailyTimeState,
      });
    }
  }
};

// Listen to tab activation changes
chrome.tabs.onActivated.addListener(() => {
  reconcileTimeTracking();
});

// Listen to tab removal
chrome.tabs.onRemoved.addListener(() => {
  reconcileTimeTracking();
});

// Listen to window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  __windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  reconcileTimeTracking();
});

// Listen to alarms (time limit reached)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    reconcileTimeTracking();
  }
});

// Handle browser startup
chrome.runtime.onStartup.addListener(() => {
  reconcileTimeTracking();
});
