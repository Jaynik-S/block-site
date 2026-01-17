import { getRevisitedSchema } from "../init";
import { Schema, DEFAULTS } from "../schema";

test("getRevisitedSchema() returns defaults for any invalid attribute", () => {
  expect(getRevisitedSchema({})).toEqual(DEFAULTS);

  expect(getRevisitedSchema(DEFAULTS)).toEqual({});

  expect(getRevisitedSchema({
    enabled: DEFAULTS.enabled,
    blocked: DEFAULTS.blocked,
  })).toEqual({
    contextMenu: false,
    counter: DEFAULTS.counter,
    counterShow: DEFAULTS.counterShow,
    counterPeriod: DEFAULTS.counterPeriod,
    resolution: DEFAULTS.resolution,
    timeLimitEnabled: DEFAULTS.timeLimitEnabled,
    dailyTimeLimitMinutes: DEFAULTS.dailyTimeLimitMinutes,
    dailyTimeState: DEFAULTS.dailyTimeState,
  } as Partial<Schema>);

  expect(getRevisitedSchema({
    ...DEFAULTS,
    enabled: "YES",     // invalid
    contextMenu: "YES", // invalid
  })).toEqual({
    enabled: DEFAULTS.enabled,
    contextMenu: DEFAULTS.contextMenu,
  } as Partial<Schema>);

  expect(getRevisitedSchema({
    ...DEFAULTS,
    enabled: "YES", // invalid
    blocked: "ALL", // invalid
    resolution: "BLOCK", // invalid
  })).toEqual({
    enabled: DEFAULTS.enabled,
    blocked: DEFAULTS.blocked,
    resolution: DEFAULTS.resolution,
  } as Partial<Schema>);
});

test("getRevisitedSchema() handles time limit validation", () => {
  // Invalid time limit values should be replaced with defaults
  expect(getRevisitedSchema({
    ...DEFAULTS,
    timeLimitEnabled: "YES", // invalid - should be boolean
    dailyTimeLimitMinutes: -5, // invalid - should be > 0
  })).toEqual({
    timeLimitEnabled: DEFAULTS.timeLimitEnabled,
    dailyTimeLimitMinutes: DEFAULTS.dailyTimeLimitMinutes,
  } as Partial<Schema>);

  // Valid time limit values should not be replaced
  expect(getRevisitedSchema({
    ...DEFAULTS,
    timeLimitEnabled: true,
    dailyTimeLimitMinutes: 60,
    dailyTimeState: {
      dayKey: "2026-01-17",
      spentMs: 5000,
      extraGrantsUsed: 1,
      active: null,
    },
  })).toEqual({});
});
