import storage, { VALIDATORS, CounterPeriod, DEFAULT_DAILY_TIME_STATE } from "./storage";
import getBlockedMessage from "./helpers/get-blocked-message";
import { getTodayKey, ensureCurrentDay, grantExtraTime } from "./helpers/time-limit";

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);

  const url = params.get("url");
  if (!url) {
    return;
  }

  const rule = params.get("rule");
  if (!rule) {
    return;
  }

  const count = parseInt(params.get("count") || "");
  const period = params.get("period");
  const countParams = (!isNaN(count) && VALIDATORS.counterPeriod(period))
    ? { count, period: period as CounterPeriod }
    : undefined;

  const message = getBlockedMessage({
    url,
    rule,
    countParams,
  });

  (document.getElementById("message") as HTMLParagraphElement).innerHTML = message;

  // Check if blocked due to daily limit
  const reason = params.get("reason");
  if (reason === "dailyLimit") {
    const dailyLimitSection = document.getElementById("daily-limit-section") as HTMLDivElement;
    const grantExtraBtn = document.getElementById("grant-extra-btn") as HTMLButtonElement;
    const extraGrantsInfo = document.getElementById("extra-grants-info") as HTMLParagraphElement;

    dailyLimitSection.classList.remove("hidden");

    // Show current extra grants used
    storage.get(["dailyTimeState"]).then(({ dailyTimeState }) => {
      const state = dailyTimeState || DEFAULT_DAILY_TIME_STATE;
      if (state.extraGrantsUsed > 0) {
        extraGrantsInfo.textContent = `Extra time granted today: ${state.extraGrantsUsed} × 5 minutes`;
      }
    });

    // Handle +5 minutes button click
    grantExtraBtn.addEventListener("click", () => {
      storage.get(["dailyTimeState"]).then(({ dailyTimeState }) => {
        const todayKey = getTodayKey();
        let state = ensureCurrentDay(dailyTimeState || DEFAULT_DAILY_TIME_STATE, todayKey);
        state = grantExtraTime(state);
        storage.set({ dailyTimeState: state }).then(() => {
          // Navigate back to the original URL
          if (url) {
            window.location.href = url;
          }
        });
      });
    });
  }

  document.body.classList.add("ready");
});
