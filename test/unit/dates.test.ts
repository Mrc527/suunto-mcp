import { describe, expect, it } from "vitest";
import {
  addDays,
  datesBetween,
  daysBetween,
  formatInZone,
  formatOffset,
  formatUtcNoOffset,
  formatWithOffset,
  hasLocalOffset,
  isoWeek,
  localDateOf,
  localHourStart,
  parseDateTimeInput,
  parseUtcTimestamp,
  startOfDay,
  todayInZone,
  tzOffsetMinutes,
} from "../../src/util/dates.js";

describe("parseDateTimeInput", () => {
  it("interprets local times in the given zone", () => {
    expect(parseDateTimeInput("2026-11-10T09:00", "Europe/Rome").toISOString()).toBe("2026-11-10T08:00:00.000Z");
    expect(parseDateTimeInput("2026-07-10T09:00", "Europe/Rome").toISOString()).toBe("2026-07-10T07:00:00.000Z");
    expect(parseDateTimeInput("2026-11-10 09:30:15", "America/New_York").toISOString()).toBe("2026-11-10T14:30:15.000Z");
  });

  it("keeps absolute times", () => {
    expect(parseDateTimeInput("2026-11-10T09:00:00Z", "Europe/Rome").toISOString()).toBe("2026-11-10T09:00:00.000Z");
    expect(parseDateTimeInput("2026-11-10T09:00:00+05:30", "Europe/Rome").toISOString()).toBe("2026-11-10T03:30:00.000Z");
  });

  it("treats a date as midnight in the zone", () => {
    expect(parseDateTimeInput("2026-11-10", "Asia/Kolkata").toISOString()).toBe("2026-11-09T18:30:00.000Z");
  });

  it("shifts non-existent DST times forward and picks the earlier ambiguous time", () => {
    expect(formatInZone(parseDateTimeInput("2026-03-29T02:30", "Europe/Rome"), "Europe/Rome")).toBe("2026-03-29T03:30:00+02:00");
    expect(parseDateTimeInput("2026-10-25T02:30", "Europe/Rome").toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(parseDateTimeInput("2026-11-01T01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("rejects garbage", () => {
    expect(() => parseDateTimeInput("tomorrow", "UTC")).toThrow(/Could not parse/);
    expect(() => parseDateTimeInput("2026-02-30", "UTC")).toThrow(/Invalid/);
    expect(() => parseDateTimeInput("2026-13-01T10:00", "UTC")).toThrow(/Invalid/);
  });
});

describe("helpers", () => {
  it("formats with offsets", () => {
    expect(formatInZone(new Date("2026-11-10T08:00:00Z"), "Europe/Rome")).toBe("2026-11-10T09:00:00+01:00");
    expect(formatInZone(new Date("2026-11-10T08:00:00Z"), "UTC")).toBe("2026-11-10T08:00:00Z");
    expect(formatInZone(new Date("2026-11-10T08:00:00Z"), "Asia/Kathmandu")).toBe("2026-11-10T13:45:00+05:45");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("computes offsets and today", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/Los_Angeles")).toBe(-480);
    expect(todayInZone("Pacific/Kiritimati", new Date("2026-11-10T23:00:00Z"))).toBe("2026-11-11");
  });
});

describe("strict parsing", () => {
  it("rejects non-ISO and rolled-over dates", () => {
    expect(() => parseDateTimeInput("Nov 10 2026 09:00", "Europe/Rome")).toThrow(/Could not parse/);
    expect(() => parseDateTimeInput("2026-02-30T10:00:00Z", "UTC")).toThrow(/Invalid/);
    expect(parseDateTimeInput("2026-11-10 09:00:00+01:00", "UTC").toISOString()).toBe("2026-11-10T08:00:00.000Z");
  });
});

describe("helpers for activity data", () => {
  it("finds local midnight across DST changes (Europe/Zurich)", () => {
    expect(startOfDay("2026-03-29", "Europe/Zurich").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(startOfDay("2026-03-30", "Europe/Zurich").toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(startOfDay("2026-10-25", "Europe/Zurich").toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(startOfDay("2026-10-26", "Europe/Zurich").toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(localDateOf(Date.parse("2026-10-25T22:30:00Z"), "Europe/Zurich")).toBe("2026-10-25");
    expect(localDateOf(Date.parse("2026-10-25T23:30:00Z"), "Europe/Zurich")).toBe("2026-10-26");
  });

  it("counts and lists days", () => {
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(daysBetween("2026-03-02", "2026-02-27")).toBe(-3);
    expect(datesBetween("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(datesBetween("2026-01-02", "2026-01-01")).toEqual([]);
  });

  it("formats fixed offsets and UTC without an offset", () => {
    expect(formatOffset(120)).toBe("+02:00");
    expect(formatOffset(-330)).toBe("-05:30");
    expect(formatOffset(0)).toBe("+00:00");
    expect(formatWithOffset(Date.parse("2026-05-01T05:30:00.900Z"), 120)).toBe("2026-05-01T07:30:00+02:00");
    expect(formatWithOffset(Date.parse("2026-05-01T02:00:00Z"), -300)).toBe("2026-04-30T21:00:00-05:00");
    expect(formatUtcNoOffset(Date.parse("2026-03-28T23:00:00.500Z"))).toBe("2026-03-28T23:00:00");
  });

  it("reads Suunto timestamps: with Z, with an offset, or UTC without a zone", () => {
    expect(parseUtcTimestamp("2019-02-11T12:00:00Z")).toBe(Date.parse("2019-02-11T12:00:00Z"));
    expect(parseUtcTimestamp("2024-12-10T14:50:00.000+02:00")).toBe(Date.parse("2024-12-10T12:50:00Z"));
    expect(parseUtcTimestamp("2019-02-11T02:00:00.000")).toBe(Date.parse("2019-02-11T02:00:00Z"));
    expect(parseUtcTimestamp("2021-01-24T21:54:52.217Z")).toBe(Date.parse("2021-01-24T21:54:52.217Z"));
    expect(parseUtcTimestamp("2026-01-01")).toBe(Date.parse("2026-01-01T00:00:00Z"));
    expect(parseUtcTimestamp("yesterday")).toBeUndefined();
    expect(hasLocalOffset("2026-09-27T12:00:00+02:00")).toBe(true);
    expect(hasLocalOffset("2026-09-27T12:00:00-0500")).toBe(true);
    expect(hasLocalOffset("2026-09-27T12:00:00Z")).toBe(false);
    expect(hasLocalOffset("2019-02-11T02:00:00.000")).toBe(false);
    expect(hasLocalOffset("2026-09-27")).toBe(false);
  });

  it("finds the start of the local hour, also in the repeated hour of a DST change", () => {
    const tz = "Europe/Zurich";
    expect(new Date(localHourStart(Date.parse("2026-10-25T00:40:00Z"), tz)).toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(new Date(localHourStart(Date.parse("2026-10-25T01:40:00Z"), tz)).toISOString()).toBe("2026-10-25T01:00:00.000Z");
    expect(new Date(localHourStart(Date.parse("2026-11-10T08:15:00Z"), "Asia/Kolkata")).toISOString()).toBe("2026-11-10T07:30:00.000Z");
  });

  it("names ISO weeks (Monday first)", () => {
    expect(isoWeek("2026-05-04")).toBe("2026-W19");
    expect(isoWeek("2026-05-10")).toBe("2026-W19");
    expect(isoWeek("2026-05-11")).toBe("2026-W20");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2024-12-30")).toBe("2025-W01");
  });
});
