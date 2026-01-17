import storage, { DailyTimeState } from "../storage";
import findRule from "./find-rule";
import * as counterHelper from "./counter";
import getBlockedUrl from "./get-blocked-url";
import { getTodayKey, ensureCurrentDay, isTimeExhausted } from "./time-limit";

interface BlockSiteOptions {
  blocked: string[]
  tabId: number
  url: string
  // Time limit options (optional for backward compatibility)
  timeLimitEnabled?: boolean
  dailyTimeLimitMinutes?: number
  dailyTimeState?: DailyTimeState
}

export default (options: BlockSiteOptions) => {
  const { blocked, tabId, url, timeLimitEnabled, dailyTimeLimitMinutes, dailyTimeState } = options;
  if (!blocked.length || !tabId || !url.startsWith("http")) {
    return;
  }

  const foundRule = findRule(url, blocked);
  if (!foundRule || foundRule.type === "allow") {
    storage.get(["counter"]).then(({ counter }) => {
      counterHelper.flushObsoleteEntries({ blocked, counter });
      storage.set({ counter });
    });
    return;
  }

  // Time limit mode: if enabled and time remains, allow access (don't block yet)
  let dailyLimitExhausted = false;
  if (timeLimitEnabled && dailyTimeLimitMinutes && dailyTimeState) {
    const todayKey = getTodayKey();
    const state = ensureCurrentDay(dailyTimeState, todayKey);

    if (!isTimeExhausted(dailyTimeLimitMinutes, state)) {
      // Time remains: allow access, tracking is handled by background
      storage.get(["counter"]).then(({ counter }) => {
        counterHelper.flushObsoleteEntries({ blocked, counter });
        storage.set({ counter });
      });
      return;
    }
    // Time exhausted: fall through to block with dailyLimit reason
    dailyLimitExhausted = true;
  }

  storage.get(["counter", "counterShow", "counterPeriod", "resolution"]).then(({ counter, counterShow, counterPeriod, resolution }) => {
    counterHelper.flushObsoleteEntries({ blocked, counter });

    const timeStamp = Date.now();
    const count = counterHelper.add(foundRule.path, timeStamp, {
      counter,
      countFromTimeStamp: counterHelper.counterPeriodToTimeStamp(counterPeriod, new Date().getTime()),
    });
    storage.set({ counter });

    switch (resolution) {
    case "CLOSE_TAB":
      chrome.tabs.remove(tabId);
      break;
    case "SHOW_BLOCKED_INFO_PAGE": {
      const commonUpdateProperties = {
        url: getBlockedUrl({
          url,
          rule: foundRule.path,
          countParams: counterShow ? { count, period: counterPeriod } : undefined,
          dailyLimitExhausted,
        }),
      };

      if (process.env.TARGET === "chrome") {
        chrome.tabs.update(tabId, commonUpdateProperties);
        break;
      }

      if (process.env.TARGET === "firefox") {
        browser.tabs.update(tabId, { ...commonUpdateProperties, loadReplace: true });
        break;
      }
    }}
  });
};
