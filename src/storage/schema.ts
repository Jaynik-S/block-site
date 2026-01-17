export const RESOLUTIONS = [
  "CLOSE_TAB",
  "SHOW_BLOCKED_INFO_PAGE",
] as const;

export const COUNTER_PERIODS = [
  "ALL_TIME",
  "THIS_MONTH",
  "THIS_WEEK",
  "TODAY",
] as const;

export type Resolution = typeof RESOLUTIONS[number];
export type CounterPeriod = typeof COUNTER_PERIODS[number];

/** Tracks active time-counting session for MV3 persistence */
export interface TimeLimitActiveSession {
  tabId: number
  startedAtMs: number
}

/** Daily time limit state that resets each day */
export interface DailyTimeState {
  dayKey: string              // e.g. "2026-01-17" in local timezone
  spentMs: number             // total time spent on blacklisted sites today
  extraGrantsUsed: number     // number of +5 min grants used today
  active: TimeLimitActiveSession | null
}

export interface Schema {
  enabled: boolean
  contextMenu: boolean
  blocked: string[]
  counter: Record<string, number[]>
  counterShow: boolean
  counterPeriod: CounterPeriod
  resolution: Resolution
  // Daily time limit settings
  timeLimitEnabled: boolean
  dailyTimeLimitMinutes: number
  dailyTimeState: DailyTimeState
}

/** Default daily time state for new day or first install */
export const DEFAULT_DAILY_TIME_STATE: Readonly<DailyTimeState> = {
  dayKey: "",
  spentMs: 0,
  extraGrantsUsed: 0,
  active: null,
};

export const DEFAULTS: Readonly<Schema> = {
  enabled: false,
  contextMenu: false,
  blocked: [],
  counter: {},
  counterShow: false,
  counterPeriod: "ALL_TIME",
  resolution: "CLOSE_TAB",
  // Daily time limit defaults
  timeLimitEnabled: false,
  dailyTimeLimitMinutes: 30,
  dailyTimeState: DEFAULT_DAILY_TIME_STATE,
};

export const VALIDATORS: Readonly<Record<keyof Schema, (value: unknown) => boolean>> = {
  enabled: (value) => typeof value === "boolean",
  contextMenu: (value) => typeof value === "boolean",
  blocked: (value) => Array.isArray(value),
  counter: (value) => typeof value === "object",
  counterShow: (value) => typeof value === "boolean",
  counterPeriod: (value) => COUNTER_PERIODS.includes(value as CounterPeriod),
  resolution: (value) => RESOLUTIONS.includes(value as Resolution),
  // Daily time limit validators
  timeLimitEnabled: (value) => typeof value === "boolean",
  dailyTimeLimitMinutes: (value) => typeof value === "number" && value > 0,
  dailyTimeState: (value) => (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DailyTimeState).dayKey === "string" &&
    typeof (value as DailyTimeState).spentMs === "number" &&
    typeof (value as DailyTimeState).extraGrantsUsed === "number"
  ),
};

export const BLOCKED_EXAMPLE: string[] = [
  "example.com          # any page (same as example.com/*)",
  "example.com/         # main page only",
  "example.com/*        # any page",
  "",

  "!one.example.com     # ! = exclude",
  "*.example.com        # * = any zero or more characters",
  "",

  "example.com/???/     # ? = any one character",
  "example.com/app/*",
];
