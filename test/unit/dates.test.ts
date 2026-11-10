import { describe, expect, it } from "vitest";
import { addDays, formatInZone, parseDateTimeInput, todayInZone, tzOffsetMinutes } from "../../src/util/dates.js";

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
