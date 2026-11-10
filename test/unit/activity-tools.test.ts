import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { ActivityService } from "../../src/activity/service.js";
import { registerActivityTools } from "../../src/activity/tools.js";
import type { ActivityBackend, WireWorkout } from "../../src/activity/types.js";
import type { AppConfig } from "../../src/config.js";
import type { ToolContext } from "../../src/tooling.js";

// Invented test data only.
const NOW = Date.parse("2026-11-10T09:00:00Z");
const SECRET = "not-a-real-subscription-key";

const READ_TOOLS = [
  "suunto_activity_samples",
  "suunto_daily_activity",
  "suunto_export_workout_fit",
  "suunto_get_route",
  "suunto_get_workout",
  "suunto_list_pois",
  "suunto_list_routes",
  "suunto_list_workouts",
  "suunto_recovery",
  "suunto_sleep",
  "suunto_workout_stats",
];
const WRITE_TOOLS = ["suunto_create_poi", "suunto_import_route"];

/** Valid arguments for each tool (an unknown key is added to them in the strict test). */
const VALID_ARGS: Record<string, Record<string, unknown>> = {
  suunto_list_workouts: {},
  suunto_get_workout: { workout_key: "w1" },
  suunto_workout_stats: {},
  suunto_export_workout_fit: { workout_key: "w1" },
  suunto_daily_activity: { from: "2026-11-01", to: "2026-11-02" },
  suunto_activity_samples: { from: "2026-11-01", to: "2026-11-02" },
  suunto_sleep: { from: "2026-11-01", to: "2026-11-02" },
  suunto_recovery: { from: "2026-11-01", to: "2026-11-02" },
  suunto_list_routes: {},
  suunto_get_route: { route_id: "r1" },
  suunto_list_pois: {},
  suunto_import_route: { gpx: '<gpx><rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2.1"/></rte></gpx>' },
  suunto_create_poi: { name: "Spring", latitude: 46.5, longitude: 7.9 },
};

const WORKOUT: WireWorkout = {
  workoutKey: "w1",
  activityId: 1,
  startTime: NOW - 86_400_000,
  timeOffsetInMinutes: 60,
  totalTime: 1800,
  totalDistance: 5000,
  hrdata: { workoutAvgHR: 150 },
};

/** A backend with one workout, one route and a FIT file; it records which operations ran. */
function fakeBackend(fit = Buffer.from([0x0e, 0x10, 0x2e, 0x46, 0x49, 0x54])): ActivityBackend & { ops: string[] } {
  const ops: string[] = [];
  const op = (name: string) => ops.push(name);
  return {
    kind: "demo",
    ops,
    async listWorkouts() {
      op("listWorkouts");
      return { payload: [WORKOUT], metadata: null };
    },
    async getWorkout() {
      op("getWorkout");
      return WORKOUT;
    },
    async exportFit() {
      op("exportFit");
      return fit;
    },
    async activitySamples() {
      op("activitySamples");
      return [];
    },
    async sleep() {
      op("sleep");
      return [];
    },
    async recovery() {
      op("recovery");
      return [];
    },
    async dailyStatistics() {
      op("dailyStatistics");
      return [];
    },
    async listRoutes() {
      op("listRoutes");
      return [{ id: "r1", description: "Loop", activityIds: [1], totalDistance: 8000 }];
    },
    async getRoute() {
      op("getRoute");
      return { id: "r1", description: "Loop", activityIds: [1], totalDistance: 8000 };
    },
    async exportRouteGpx() {
      op("exportRouteGpx");
      return "<gpx/>";
    },
    async importRouteGpx() {
      op("importRouteGpx");
      return { id: "r2", description: "New", activityIds: [1] };
    },
    async listPois() {
      op("listPois");
      return [];
    },
    async createPoi(poi) {
      op("createPoi");
      return { pointOfInterest: { ...poi, key: "p1" } };
    },
    async account() {
      return { username: "testuser" };
    },
    async close() {},
  };
}

async function connect(opts: { readOnly?: boolean; backend?: ActivityBackend } = {}) {
  const backend = opts.backend ?? fakeBackend();
  const server = new McpServer({ name: "suunto-mcp-test", version: "0.0.0" });
  const config = { readOnly: opts.readOnly ?? false, secrets: [SECRET] } as unknown as AppConfig;
  const logs: string[] = [];
  const ctx: ToolContext = { server, config, log: (m) => logs.push(m) };
  const service = new ActivityService(backend, { readOnly: opts.readOnly ?? false, units: "metric", timeZone: "Europe/Zurich", now: () => NOW });
  registerActivityTools(ctx, service);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, logs };
}

function text(result: unknown): string {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content;
  return content.find((c) => c.type === "text")?.text ?? "";
}

describe("activity tools", () => {
  it("registers every tool of DESIGN section 6 except suunto_account_info, with annotations", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
    for (const tool of tools) {
      const write = WRITE_TOOLS.includes(tool.name);
      expect(tool.annotations, tool.name).toEqual({
        title: tool.title,
        readOnlyHint: !write,
        destructiveHint: false,
        idempotentHint: !write,
        openWorldHint: false,
      });
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description!.length, tool.name).toBeGreaterThan(80);
      // Writing rules: no em dash anywhere the AI app reads.
      expect(JSON.stringify(tool)).not.toContain(String.fromCharCode(0x2014));
    }
  });

  it("describes accepted values, units and limits", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const props = (name: string) => byName[name]!.inputSchema.properties as Record<string, { description?: string; enum?: string[] }>;
    expect(byName.suunto_list_workouts!.description).toMatch(/last 30 days/);
    expect(byName.suunto_list_workouts!.description).toMatch(/1000 workouts/);
    expect(props("suunto_list_workouts").sport!.description).toMatch(/trail.*mtb.*open water/);
    expect(props("suunto_list_workouts").limit!.description).toMatch(/1-100 \(default 20\)/);
    expect(props("suunto_get_workout").samples!.description).toMatch(/heart_rate, altitude, speed, pace, cadence, power, temperature, depth, distance, location/);
    expect(props("suunto_get_workout").max_points!.description).toMatch(/10-1000 \(default 200\)/);
    expect(byName.suunto_workout_stats!.description).toMatch(/2000 workouts/);
    expect(props("suunto_workout_stats").group_by!.enum).toEqual(["none", "week", "month", "year", "sport"]);
    expect(byName.suunto_daily_activity!.description).toMatch(/at most 92 days/);
    expect(byName.suunto_activity_samples!.description).toMatch(/At most 28 days per call, at most 2 days with resolution raw/);
    expect(byName.suunto_export_workout_fit!.description).toMatch(/8 MB/);
    expect(byName.suunto_get_route!.description).toMatch(/1 MB/);
    expect(byName.suunto_import_route!.description).toMatch(/5 MB.*DOCTYPE/s);
    expect(byName.suunto_import_route!.description).toMatch(/Ask the user first/);
    expect(byName.suunto_create_poi!.description).toMatch(/Peak.*Campfire/);
    expect(props("suunto_create_poi").units!.description).toMatch(/metric \(km, m, km\/h, min\/km, °C\)/);
  });

  it("refuses unknown argument names (strict arguments)", async () => {
    const { client } = await connect();
    for (const [name, args] of Object.entries(VALID_ARGS)) {
      const result = await client.callTool({ name, arguments: { ...args, colour: "red" } });
      expect(result.isError, name).toBe(true);
    }
  });

  it("answers compact JSON with units", async () => {
    const { client } = await connect();
    const list = JSON.parse(text(await client.callTool({ name: "suunto_list_workouts", arguments: {} })));
    expect(list).toMatchObject({ count: 1, total_in_range: 1, workouts: [{ workout_key: "w1", sport: "Running", distance: 5, avg_pace: "6:00", avg_hr: 150 }], units: { distance: "km" } });
    const workout = JSON.parse(text(await client.callTool({ name: "suunto_get_workout", arguments: { workout_key: "w1", units: "imperial" } })));
    expect(workout).toMatchObject({ workout_key: "w1", distance: 3.11, utc_offset: "+01:00", units: { distance: "mi" } });
    const route = JSON.parse(text(await client.callTool({ name: "suunto_get_route", arguments: { route_id: "r1" } })));
    expect(route).toMatchObject({ route_id: "r1", name: "Loop", distance: 8, units: { distance: "km" } });
    const poi = JSON.parse(text(await client.callTool({ name: "suunto_create_poi", arguments: VALID_ARGS.suunto_create_poi! })));
    expect(poi).toMatchObject({ added: true, poi: { poi_key: "p1", name: "Spring", type: "POI" }, units: { elevation: "m" } });
  });

  it("sends the FIT file as an embedded resource after a short JSON text", async () => {
    const fit = Buffer.from([0x0e, 0x10, 0x2e, 0x46, 0x49, 0x54, 0x01, 0x02]);
    const { client } = await connect({ backend: fakeBackend(fit) });
    const result = await client.callTool({ name: "suunto_export_workout_fit", arguments: { workout_key: "w1" } });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "text", text: JSON.stringify({ workout_key: "w1", bytes: 8, file_name: "suunto-workout-w1.fit" }) });
    expect(content[1]).toEqual({
      type: "resource",
      resource: { uri: "suunto://workouts/w1.fit", mimeType: "application/vnd.ant.fit", blob: fit.toString("base64") },
    });
    expect(JSON.stringify(result)).not.toContain("__raw");
  });

  it("hides the write tools on a read-only account", async () => {
    const { client } = await connect({ readOnly: true });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names.sort()).toEqual([...READ_TOOLS].sort());
  });

  it("turns errors into tool errors with clear text and no secrets", async () => {
    const backend = fakeBackend();
    backend.getWorkout = async () => {
      throw new Error(`upstream said Ocp-Apim-Subscription-Key: ${SECRET}`);
    };
    const { client, logs } = await connect({ backend });
    const result = await client.callTool({ name: "suunto_get_workout", arguments: { workout_key: "w1" } });
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain(SECRET);
    expect(logs.join("\n")).not.toContain(SECRET);
    const bad = await client.callTool({ name: "suunto_import_route", arguments: { gpx: "<kml/>" } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatch(/root element must be <gpx>/);
  });
});
