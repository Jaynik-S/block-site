import storage, {
  Schema, Resolution, CounterPeriod, RESOLUTIONS, BLOCKED_EXAMPLE, DailyTimeState,
} from "./storage";
import {
  getTodayKey,
  ensureCurrentDay,
  getRemainingMs,
  formatRemainingTime,
} from "./helpers/time-limit";

const UI = (() => {
  const elements = {
    enabled: document.getElementById("enabled") as HTMLSelectElement,
    contextMenu: document.getElementById("context-menu") as HTMLSelectElement,
    blockedList: document.getElementById("blocked-list") as HTMLTextAreaElement,
    resolution: document.getElementById("resolution") as HTMLSelectElement,
    counterShow: document.getElementById("counter-show") as HTMLSelectElement,
    counterPeriod: document.getElementById("counter-period") as HTMLSelectElement,
    timeLimitEnabled: document.getElementById("time-limit-enabled") as HTMLSelectElement,
    dailyTimeLimit: document.getElementById("daily-time-limit") as HTMLInputElement,
    timeRemainingValue: document.getElementById("time-remaining-value") as HTMLSpanElement,
  };

  let currentTimeState: DailyTimeState | null = null;
  let currentTimeLimitMinutes: number = 30;
  let updateIntervalId: number | null = null;

  elements.blockedList.placeholder = BLOCKED_EXAMPLE.join("\n");

  const booleanToString = (b: boolean) => b ? "YES" : "NO";
  const stringToBoolean = (s: string) => s === "YES";

  const getEventTargetValue = (event: Event) => (event.target as HTMLTextAreaElement | HTMLSelectElement).value;
  const stringToBlocked = (string: string) => string.split("\n").map((s) => s.trim()).filter(Boolean);

  elements.enabled.addEventListener("change", (event) => {
    const enabled = stringToBoolean(getEventTargetValue(event));
    storage.set({ enabled });
  });

  elements.contextMenu.addEventListener("change", (event) => {
    const contextMenu = stringToBoolean(getEventTargetValue(event));
    storage.set({ contextMenu });
  });

  elements.blockedList.addEventListener("input", (event) => {
    const blocked = stringToBlocked(getEventTargetValue(event));
    storage.set({ blocked });
  });

  elements.resolution.addEventListener("change", (event) => {
    const resolution = getEventTargetValue(event) as Resolution;
    storage.set({ resolution });
  });

  elements.counterShow.addEventListener("change", (event) => {
    const counterShow = stringToBoolean(getEventTargetValue(event));
    storage.set({ counterShow });
  });

  elements.counterPeriod.addEventListener("change", (event) => {
    const counterPeriod = getEventTargetValue(event) as CounterPeriod;
    storage.set({ counterPeriod });
  });

  elements.timeLimitEnabled.addEventListener("change", (event) => {
    const timeLimitEnabled = stringToBoolean(getEventTargetValue(event));
    storage.set({ timeLimitEnabled });
  });

  elements.dailyTimeLimit.addEventListener("input", (event) => {
    const value = parseInt((event.target as HTMLInputElement).value) || 30;
    const dailyTimeLimitMinutes = Math.max(1, Math.min(1440, value));
    storage.set({ dailyTimeLimitMinutes });
  });

  const updateTimeDisplay = () => {
    if (!currentTimeState) return;

    const todayKey = getTodayKey();
    const state = ensureCurrentDay(currentTimeState, todayKey);
    let remainingMs = getRemainingMs(currentTimeLimitMinutes, state);

    // If there's an active session, subtract elapsed time
    if (state.active) {
      const elapsedMs = Date.now() - state.active.startedAtMs;
      remainingMs = Math.max(0, remainingMs - elapsedMs);
    }

    elements.timeRemainingValue.textContent = formatRemainingTime(remainingMs);

    // Update color based on remaining time
    elements.timeRemainingValue.classList.remove("warning", "critical");
    if (remainingMs <= 60 * 1000) {
      elements.timeRemainingValue.classList.add("critical");
    } else if (remainingMs <= 5 * 60 * 1000) {
      elements.timeRemainingValue.classList.add("warning");
    }
  };

  const init = <T extends Partial<Schema>>(items: T) => {
    if (items.enabled !== undefined) {
      elements.enabled.value = booleanToString(items.enabled);
    }

    if (items.contextMenu !== undefined) {
      elements.contextMenu.value = booleanToString(items.contextMenu);
    }

    if (items.blocked !== undefined) {
      const valueAsBlocked = stringToBlocked(elements.blockedList.value);
      if (JSON.stringify(valueAsBlocked) !== JSON.stringify(items.blocked)) {
        elements.blockedList.value = items.blocked.join("\r\n");
      }
    }

    if (items.resolution !== undefined) {
      elements.resolution.value = items.resolution;
      RESOLUTIONS.forEach((oneResolution) => {
        document.body.classList.remove(`resolution-${oneResolution}`);
      });
      document.body.classList.add(`resolution-${items.resolution}`);
    }

    if (items.counterShow !== undefined) {
      elements.counterShow.value = booleanToString(items.counterShow);
      document.body.classList.toggle("counter-show", items.counterShow);
    }

    if (items.counterPeriod !== undefined) {
      elements.counterPeriod.value = items.counterPeriod;
    }

    if (items.timeLimitEnabled !== undefined) {
      elements.timeLimitEnabled.value = booleanToString(items.timeLimitEnabled);
      document.body.classList.toggle("time-limit-enabled", items.timeLimitEnabled);
    }

    if (items.dailyTimeLimitMinutes !== undefined) {
      elements.dailyTimeLimit.value = items.dailyTimeLimitMinutes.toString();
      currentTimeLimitMinutes = items.dailyTimeLimitMinutes;
    }

    if (items.dailyTimeState !== undefined) {
      currentTimeState = items.dailyTimeState;
      updateTimeDisplay();

      // Start interval for live updates if not already running
      if (updateIntervalId === null) {
        updateIntervalId = window.setInterval(updateTimeDisplay, 1000);
      }
    }
  };

  return { elements, init };
})();

window.addEventListener("DOMContentLoaded", () => {
  const keys: (keyof Schema)[] = [
    "enabled",
    "contextMenu",
    "blocked",
    "resolution",
    "counterShow",
    "counterPeriod",
    "timeLimitEnabled",
    "dailyTimeLimitMinutes",
    "dailyTimeState",
  ];

  storage.get(keys).then((local) => {
    UI.init(local);
    document.body.classList.add("ready");
  });

  chrome.storage.local.onChanged.addListener((changes) => {
    keys.forEach((key) => {
      if (changes[key]) {
        UI.init({ [key]: changes[key].newValue });
      }
    });
  });
});
