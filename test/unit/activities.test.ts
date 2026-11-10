import { describe, expect, it } from "vitest";
import {
  ACTIVITIES,
  DEFAULT_POI_TYPE,
  POI_TYPES,
  activityIdFor,
  activityIdsFor,
  activityName,
  isKnownActivity,
  poiTypeId,
  poiTypeName,
} from "../../src/suunto/activities.js";

describe("activity ids", () => {
  it("has the 121 ids of Suunto's list (0 to 121 without 89)", () => {
    expect(ACTIVITIES).toHaveLength(121);
    const ids = ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(121);
    expect(ids).not.toContain(89);
    expect(Math.min(...ids)).toBe(0);
    expect(Math.max(...ids)).toBe(121);
  });

  it("names ids and never guesses", () => {
    expect(activityName(1)).toBe("Running");
    expect(activityName(22)).toBe("Trail running");
    expect(activityName(78)).toBe("Scuba diving");
    expect(activityName(999)).toBe("Activity 999");
    expect(activityName(89)).toBe("Activity 89");
    expect(activityName(null)).toBe("Unknown activity");
    expect(activityName(undefined)).toBe("Unknown activity");
    expect(isKnownActivity(85)).toBe(true);
    expect(isKnownActivity(89)).toBe(false);
  });

  it("maps aliases to one or more ids, ignoring case and spacing", () => {
    expect(activityIdsFor("run")).toEqual(expect.arrayContaining([1, 22, 53, 103, 115]));
    expect(activityIdsFor("RUNNING")).toEqual(activityIdsFor("run"));
    expect(activityIdsFor("trail")).toEqual([22]);
    expect(activityIdsFor("bike")).toEqual(expect.arrayContaining([2, 10, 52, 99]));
    expect(activityIdsFor("ride")).toEqual(activityIdsFor("cycling"));
    expect(activityIdsFor("mtb")).toEqual([10, 106]);
    expect(activityIdsFor("swim")).toEqual([21, 85]);
    expect(activityIdsFor("pool")).toEqual([21]);
    expect(activityIdsFor("Open Water")).toEqual([85]);
    expect(activityIdsFor("hike")).toEqual([11, 70]);
    expect(activityIdsFor("walk")).toEqual([0, 24]);
    expect(activityIdsFor("ski")).toEqual(expect.arrayContaining([3, 13, 31, 117, 118]));
    expect(activityIdsFor("xc ski")).toEqual([3, 117, 118]);
    expect(activityIdsFor("dive")).toEqual([78, 79]);
    expect(activityIdsFor("diving")).toEqual([78, 79]);
    expect(activityIdsFor("gym")).toContain(23);
    expect(activityIdsFor("strength")).toEqual(expect.arrayContaining([23, 54, 63]));
    expect(activityIdsFor("yoga")).toEqual([51, 121]);
    expect(activityIdsFor("row")).toEqual([15, 57]);
    expect(activityIdsFor("paddle")).toEqual(expect.arrayContaining([14, 61, 72, 82]));
  });

  it("accepts exact activity names and ids", () => {
    expect(activityIdsFor("Trail running")).toEqual([22]);
    expect(activityIdsFor("Classic skiing")).toEqual([118]);
    expect(activityIdsFor("Scubadiving")).toEqual([78]);
    expect(activityIdsFor("Mountain biking")).toEqual([10, 106]);
    expect(activityIdsFor("22")).toEqual([22]);
    expect(activityIdsFor("quidditch")).toEqual([]);
    expect(activityIdsFor("  ")).toEqual([]);
  });

  it("finds the whole family for the name of the activity a family is named after", () => {
    // The tool texts give these names as examples, so AI apps use them as filters.
    const families: Array<[string, number[]]> = [
      ["Running", [1, 22, 53, 103, 115]],
      ["Cycling", [2, 10, 52, 99, 105, 106, 114]],
      ["Mountain biking", [10, 106]],
      ["Swimming", [21, 85]],
      ["Hiking", [11, 70]],
      ["Walking", [0, 24]],
      ["Cross-country skiing", [3, 117, 118]],
      ["Ski touring", [31, 107, 116]],
      ["Gym", [23, 20]],
      ["Yoga", [51, 121]],
      ["Pilates", [51, 120]],
      ["Rowing", [15, 57]],
      ["Paddling", [14, 61, 72, 82]],
      ["Multisport", [68, 74, 92, 93, 94]],
    ];
    for (const [name, ids] of families) {
      expect(activityIdsFor(name), name).toEqual(ids);
      // Each spelling of the name works.
      expect(activityIdsFor(name.toUpperCase().replace("-", " ")), name).toEqual(ids);
    }
    // One id for a route or a point of interest is still the activity of that name.
    expect(activityIdFor("Cross-country skiing")).toBe(3);
  });

  it("picks one id for routes and points of interest", () => {
    expect(activityIdFor("Running")).toBe(1);
    expect(activityIdFor("Trail running")).toBe(22);
    expect(activityIdFor("hike")).toBe(11);
    expect(activityIdFor("Ski touring")).toBe(31);
    expect(activityIdFor("nothing like this")).toBeUndefined();
  });
});

describe("point of interest types", () => {
  it("has Suunto's PoiType enum", () => {
    expect(POI_TYPES).toHaveLength(63);
    expect(POI_TYPES[0]).toEqual({ id: -1, name: "Unknown" });
    expect(POI_TYPES.at(-1)).toEqual({ id: 77, name: "Campfire" });
    expect(POI_TYPES.map((t) => t.id)).not.toContain(50);
    expect(DEFAULT_POI_TYPE).toBe(26);
    expect(poiTypeName(26)).toBe("POI");
  });

  it("names types and finds them by name", () => {
    expect(poiTypeName(34)).toBe("Peak");
    expect(poiTypeName(99)).toBe("Type 99");
    expect(poiTypeId("peak")).toBe(34);
    expect(poiTypeId("Fishing spot")).toBe(36);
    expect(poiTypeId("FISHINGSPOT")).toBe(36);
    expect(poiTypeId("water point")).toBe(75);
    expect(poiTypeId("summit")).toBe(34);
    expect(poiTypeId("34")).toBe(34);
    expect(poiTypeId("50")).toBeUndefined();
    expect(poiTypeId("castle")).toBeUndefined();
  });
});
