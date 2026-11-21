// @vitest-environment happy-dom
/**
 * views/src/views.ts rendering the real tool answers of the demo account, and calling tools the
 * way a host forwards them. Invented data only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { DemoActivityStore } from "../../src/demo/activity.js";
import { createServices } from "../../src/server.js";
import { jsonResult } from "../../src/tooling.js";
import type { ToolResultLike } from "../../views/src/model.js";
import { renderView, type CallTool } from "../../views/src/views.js";

const ENV = { SUUNTO_CLIENT_ID: "client-invented", SUUNTO_CLIENT_SECRET: "secret-invented", SUUNTO_SUBSCRIPTION_KEY: "key-invented", SUUNTO_REFRESH_TOKEN: "rt-invented", SUUNTO_TIMEZONE: "Europe/Zurich" };
const activity = () => createServices(loadConfig(ENV), { demo: new DemoActivityStore() }).activity!;

/** The answer of a tool, as the tool returns it (JSON text). */
const answer = (data: unknown) => jsonResult(data) as ToolResultLike;

/** A host that forwards view tool calls to the demo account and records them. */
function demoHost() {
  const service = activity();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const callTool: CallTool = async (name, args) => {
    calls.push({ name, args });
    if (name !== "suunto_get_workout") throw new Error(`unexpected tool ${name}`);
    return answer(await service.getWorkout(args as never));
  };
  return { service, calls, callTool };
}

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("main");
  document.body.append(root);
});

const text = () => root.textContent ?? "";
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

describe("workouts view", () => {
  it("lists the workouts and opens one with a tool call, then goes back", async () => {
    const host = demoHost();
    const list = await host.service.listWorkouts({ limit: 5 });
    renderView("workouts", answer(list), root, host.callTool);
    const rows = [...root.querySelectorAll<HTMLButtonElement>("button.workout-row")];
    expect(rows).toHaveLength(5);
    const first = (list as { workouts: Array<{ workout_key: string; sport: string; name?: string }> }).workouts[0]!;
    expect(rows[0]!.textContent).toContain(first.sport);

    rows[0]!.click();
    await until(() => root.querySelector("h2")?.textContent !== "Workouts" && !text().includes("Loading"));
    // In the units of the list's answer.
    expect(host.calls).toEqual([{ name: "suunto_get_workout", args: { workout_key: first.workout_key, units: "metric" } }]);
    expect(root.querySelector("h2")!.textContent).toBe(first.name ?? first.sport);
    expect(text()).toContain("Duration");
    expect(root.querySelectorAll(".zone")).toHaveLength(5);

    root.querySelector<HTMLButtonElement>("button.back")!.click();
    expect(root.querySelector("h2")!.textContent).toBe("Workouts");
    expect(root.querySelectorAll("button.workout-row")).toHaveLength(5);
  });

  it("loads the route and the charts on request, and switches the metric", async () => {
    const host = demoHost();
    const list = (await host.service.listWorkouts({ limit: 20 })) as { workouts: Array<{ workout_key: string; sport: string }> };
    const run = list.workouts.find((w) => w.sport === "Running")!;
    renderView("workouts", answer(await host.service.getWorkout({ workout_key: run.workout_key })), root, host.callTool);
    expect(root.querySelector(".route")).toBeNull();
    const load = root.querySelector<HTMLButtonElement>("button.primary")!;
    expect(load.textContent).toBe("Show route and charts");

    load.click();
    await until(() => root.querySelector(".route path.track") !== null);
    expect(host.calls[0]).toEqual({
      name: "suunto_get_workout",
      args: { workout_key: run.workout_key, samples: expect.arrayContaining(["heart_rate", "altitude", "location"]), max_points: 400, units: "metric" },
    });
    expect(root.querySelector(".route path.track")!.getAttribute("d")).toMatch(/^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+)+$/);
    expect(root.querySelector(".chart h3")!.textContent).toBe("Heart rate (bpm)");
    expect(root.querySelector(".chart path.line.heart_rate")).not.toBeNull();

    const altitude = [...root.querySelectorAll<HTMLButtonElement>(".toggles button")].find((b) => b.textContent === "Altitude")!;
    altitude.click();
    expect(altitude.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector(".chart h3")!.textContent).toBe("Altitude (m)");

    // Arrow keys step through the points: the readout and the route marker follow.
    const plot = root.querySelector<SVGSVGElement>(".chart svg")!;
    plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(root.querySelector(".chart .detail")!.textContent).toMatch(/^\d+:\d{2} · [\d,.]+ m$/);
    expect(root.querySelector(".route .marker")!.getAttribute("visibility")).toBe("visible");
  });

  it("charts a dive's depth as a profile: the surface on top, deeper further down", async () => {
    const host = demoHost();
    const list = (await host.service.listWorkouts({ limit: 100 })) as { workouts: Array<{ workout_key: string; sport: string }> };
    const dive = list.workouts.find((w) => w.sport === "Scuba diving")!;
    renderView("workouts", answer(await host.service.getWorkout({ workout_key: dive.workout_key })), root, host.callTool);
    // No GPS track under water: charts only.
    const load = root.querySelector<HTMLButtonElement>("button.primary")!;
    expect(load.textContent).toBe("Show charts");

    load.click();
    await until(() => root.querySelector(".chart path.line") !== null);
    expect(host.calls[0]!.args.samples).toEqual(["depth", "heart_rate"]);
    expect(root.querySelector(".route")).toBeNull();
    // The dive opens on its depth.
    expect(root.querySelector(".chart h3")!.textContent).toBe("Depth (m)");
    expect([...root.querySelectorAll(".toggles button")].map((b) => b.textContent)).toEqual(["Depth", "Heart rate"]);
    const ys = [...root.querySelector(".chart path.line.depth")!.getAttribute("d")!.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    // The dive starts and ends at the surface (0 m): the top edge. Its deepest point is near the bottom.
    expect(ys[0]).toBe(0);
    expect(ys[ys.length - 1]).toBe(0);
    expect(Math.max(...ys)).toBeGreaterThan(160 * 0.85);
    expect(root.querySelector(".chart .sub")!.textContent).toMatch(/^min 0 · avg [\d.]+ · max [\d.]+$/);

    const plot = root.querySelector<SVGSVGElement>(".chart svg")!;
    plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(root.querySelector(".chart .detail")!.textContent).toMatch(/^\d+:\d{2} · [\d.]+ m$/);
  });

  it("renders a workout that already has its samples at once, without a tool call", async () => {
    const host = demoHost();
    const list = (await host.service.listWorkouts({ limit: 20 })) as { workouts: Array<{ workout_key: string; sport: string }> };
    const run = list.workouts.find((w) => w.sport === "Running")!;
    const full = await host.service.getWorkout({ workout_key: run.workout_key, samples: ["heart_rate", "location"], max_points: 50 });
    renderView("workouts", answer(full), root, host.callTool);
    expect(root.querySelector(".route path.track")).not.toBeNull();
    expect(root.querySelector("button.primary")).toBeNull();
    expect(host.calls).toEqual([]);
  });

  it("shows a failing tool call as an error, not as a crash", async () => {
    const host = demoHost();
    const failing: CallTool = vi.fn(async () => ({ isError: true, content: [{ type: "text", text: "Suunto said no." }] }));
    renderView("workouts", answer(await host.service.listWorkouts({ limit: 1 })), root, failing);
    root.querySelector<HTMLButtonElement>("button.workout-row")!.click();
    await until(() => root.querySelector(".message.error") !== null);
    expect(root.querySelector(".message.error")!.textContent).toBe("Suunto said no.");

    const throwing: CallTool = async () => {
      throw new Error("host gone");
    };
    renderView("workouts", answer(await host.service.listWorkouts({ limit: 1 })), root, throwing);
    root.querySelector<HTMLButtonElement>("button.workout-row")!.click();
    await until(() => root.querySelector(".message.error") !== null);
    expect(root.querySelector(".message.error")!.textContent).toBe("Could not load the workout: host gone");
  });

  it("opens a workout and loads its samples in the units of the answer", async () => {
    const host = demoHost();
    const list = await host.service.listWorkouts({ limit: 20, units: "imperial" });
    expect((list as { units: { distance: string } }).units.distance).toBe("mi");
    renderView("workouts", answer(list), root, host.callTool);
    expect(root.querySelector(".workout-row")!.textContent).toContain(" mi");
    const runIndex = (list as { workouts: Array<{ sport: string }> }).workouts.findIndex((w) => w.sport === "Running");
    root.querySelectorAll<HTMLButtonElement>("button.workout-row")[runIndex]!.click();
    await until(() => root.querySelector("button.primary") !== null);
    expect(host.calls[0]!.args.units).toBe("imperial");
    expect(root.querySelector(".tiles")!.textContent).toContain(" mi");
    root.querySelector<HTMLButtonElement>("button.primary")!.click();
    await until(() => root.querySelector(".chart") !== null);
    expect(host.calls[1]!.args.units).toBe("imperial");
  });

  it("shows a swim's pace with its own unit", async () => {
    const host = demoHost();
    const list = (await host.service.listWorkouts({ limit: 100, sport: "swim" })) as { workouts: Array<{ workout_key: string }> };
    expect(list.workouts.length).toBeGreaterThan(0);
    const swim = (await host.service.getWorkout({ workout_key: list.workouts[0]!.workout_key })) as { avg_pace?: string };
    renderView("workouts", answer(swim), root, host.callTool);
    const pace = [...root.querySelectorAll(".tile")].find((t) => t.querySelector("dt")!.textContent === "Pace");
    if (swim.avg_pace) {
      expect(pace!.querySelector("dd")!.textContent).toBe(swim.avg_pace);
      expect(pace!.textContent).not.toContain("min/km");
    }
  });

  it("does not offer the load again when the loaded samples have nothing to draw", () => {
    const host = demoHost();
    renderView(
      "workouts",
      answer({
        workout_key: "c".repeat(24),
        sport: "Running",
        duration_s: 600,
        available_data: ["heart_rate", "location"],
        samples: { heart_rate: { unit: "bpm", points: [] }, location: { points: [{ t: 0, lat: 46.9, lon: 8.4 }] } },
        units: {},
      }),
      root,
      host.callTool,
    );
    expect(root.querySelector("button.primary")).toBeNull();
    expect(root.querySelector(".message")!.textContent).toBe("No route or chart data for this workout.");
  });

  it("shows long paces and long zone times without turning minutes into hours", () => {
    const pace = { unit: "min/km", min: 4.5, avg: 6, max: 99.5, points: [{ t: 0, v: 5 }, { t: 3700, v: 99.5 }] };
    renderView(
      "workouts",
      answer({
        workout_key: "d".repeat(24),
        sport: "Hiking",
        duration_s: 4800,
        intensity: { heart_rate_zones: [{ zone: 1, time_s: 4800 }, { zone: 2, time_s: 60 }] },
        samples: { pace },
        units: {},
      }),
      root,
      demoHost().callTool,
    );
    expect([...root.querySelectorAll(".zone-time")].map((z) => z.textContent)).toEqual(["1:20:00", "1:00"]);
    expect(root.querySelector(".chart .sub")!.textContent).toBe("min 4:30 · avg 6:00 · max 99:30");
    const plot = root.querySelector<SVGSVGElement>(".chart svg")!;
    plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(root.querySelector(".chart .detail")!.textContent).toBe("1:01:40 · 99:30 min/km");
  });

  it("shows user text as text, never as HTML", () => {
    const evil = '<img src=x onerror="alert(1)">';
    renderView(
      "workouts",
      answer({ workouts: [{ workout_key: "a".repeat(24), sport: "Running", name: evil, start: "2026-11-19T07:07:48+01:00", duration_s: 60 }], units: {} }),
      root,
      demoHost().callTool,
    );
    expect(root.querySelector("img")).toBeNull();
    expect(text()).toContain(evil);
    renderView("workouts", answer({ workout_key: "b".repeat(24), sport: "Running", name: evil, description: evil, duration_s: 60, units: {} }), root, demoHost().callTool);
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("h2")!.textContent).toBe(evil);
  });

  it("shows an error result and an empty list as messages", () => {
    renderView("workouts", { isError: true, content: [{ type: "text", text: "Connect Suunto first." }] }, root, demoHost().callTool);
    expect(root.querySelector(".message.error")!.textContent).toBe("Connect Suunto first.");
    renderView("workouts", answer({ workouts: [], units: {} }), root, demoHost().callTool);
    expect(text()).toContain("No workouts in this range.");
  });
});

describe("training view", () => {
  it("shows the totals and one bar per period, and switches the metric", async () => {
    const stats = (await activity().workoutStats({ group_by: "month" })) as { groups: unknown[]; count: number };
    renderView("training", answer(stats), root, demoHost().callTool);
    expect(root.querySelector("h2")!.textContent).toBe("Training");
    expect(root.querySelector(".tiles")!.textContent).toContain(String(stats.count));
    expect(root.querySelectorAll(".chart rect.bar")).toHaveLength(stats.groups.length);
    expect(root.querySelector(".chart h3")!.textContent).toBe("Distance per month");
    expect(root.querySelector(".axis")!.textContent).toMatch(/[A-Z][a-z]{2} \d{2}/);
    [...root.querySelectorAll<HTMLButtonElement>(".toggles button")].find((b) => b.textContent === "Workouts")!.click();
    expect(root.querySelector(".chart h3")!.textContent).toBe("Workouts per month");
    root.querySelector<SVGRectElement>(".chart rect.bar")!.dispatchEvent(new FocusEvent("focus"));
    expect(root.querySelector(".chart .detail")!.textContent).toMatch(/^\d{4}-\d{2}: \d+ · \d+ workouts$/);
  });

  it("has no chart without group_by", async () => {
    renderView("training", answer(await activity().workoutStats({})), root, demoHost().callTool);
    expect(root.querySelector(".tiles")).not.toBeNull();
    expect(root.querySelector(".chart")).toBeNull();
  });
});

describe("sleep view", () => {
  it("stacks the sleep stages of every night and describes a night on focus", async () => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
    const sleep = (await activity().sleep({ from, to })) as { sleeps: Array<{ is_nap: boolean }> };
    const nights = sleep.sleeps.filter((s) => !s.is_nap).length;
    expect(nights).toBeGreaterThan(0);
    renderView("sleep", answer(sleep), root, demoHost().callTool);
    expect(root.querySelectorAll(".chart g.night")).toHaveLength(nights);
    expect(root.querySelectorAll(".chart rect.stage")).toHaveLength(nights * 4);
    root.querySelector<SVGGElement>(".chart g.night")!.dispatchEvent(new FocusEvent("focus"));
    expect(root.querySelector(".chart .detail")!.textContent).toMatch(/^\d{4}-\d{2}-\d{2} · deep \d+:\d{2} · light \d+:\d{2} · REM \d+:\d{2} · awake \d+:\d{2}/);
  });

  it("draws a night without sleep stages as one neutral bar, not as awake", () => {
    renderView("sleep", answer({ sleeps: [{ date: "2026-11-03", is_nap: false, duration_s: 27000 }], averages: { duration_s: 27000 } }), root, demoHost().callTool);
    expect(root.querySelectorAll(".chart rect.stage")).toHaveLength(1);
    expect(root.querySelector(".chart rect.stage.unknown")).not.toBeNull();
    expect(root.querySelector(".chart rect.stage.awake")).toBeNull();
    root.querySelector<SVGGElement>(".chart g.night")!.dispatchEvent(new FocusEvent("focus"));
    expect(root.querySelector(".chart .detail")!.textContent).toBe("2026-11-03 · 7:30, no sleep stages");
    expect(root.querySelector(".legend")!.textContent).toContain("No stages");
  });

  it("draws a night with only some stages as one neutral bar, and names the known ones", () => {
    renderView("sleep", answer({ sleeps: [{ date: "2026-11-05", is_nap: false, duration_s: 28800, deep_s: 3600 }] }), root, demoHost().callTool);
    expect(root.querySelector(".chart rect.stage.awake")).toBeNull();
    expect(root.querySelectorAll(".chart rect.stage.unknown")).toHaveLength(1);
    root.querySelector<SVGGElement>(".chart g.night")!.dispatchEvent(new FocusEvent("focus"));
    expect(root.querySelector(".chart .detail")!.textContent).toBe("2026-11-05 · 8:00 · deep 1:00 · other stages unknown");
  });

  it("says when a range holds only naps", () => {
    renderView("sleep", answer({ sleeps: [{ date: "2026-11-03", is_nap: true, duration_s: 1200 }, { date: "2026-11-04", is_nap: true, duration_s: 900 }] }), root, demoHost().callTool);
    expect(text()).toContain("Only naps in this range: 2.");
  });

  it("says so when there is no sleep", () => {
    renderView("sleep", answer({ sleeps: [], from: "2026-01-01", to: "2026-01-02" }), root, demoHost().callTool);
    expect(text()).toContain("No sleep in this range.");
  });
});
