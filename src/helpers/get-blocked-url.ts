import { CounterPeriod } from "../storage";

export const __getBlockedHtmlUrl = () => chrome.runtime.getURL("blocked.html");

export interface GetBlockedUrlParams {
  url: string
  rule: string
  countParams?: {
    count: number
    period: CounterPeriod
  }
  /** If true, indicates blocking due to daily time limit exhausted */
  dailyLimitExhausted?: boolean
}

export default ({ url, rule, countParams, dailyLimitExhausted }: GetBlockedUrlParams): string => {
  const params = new URLSearchParams({ url, rule });
  if (countParams) {
    params.append("count", countParams.count.toString());
    params.append("period", countParams.period);
  }
  if (dailyLimitExhausted) {
    params.append("reason", "dailyLimit");
  }

  return `${__getBlockedHtmlUrl()}?${params.toString()}`;
};
