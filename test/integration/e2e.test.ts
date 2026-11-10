/**
 * End-to-end tests against the in-process mock Suunto Cloud API (test/helpers/mock-suunto.ts):
 * Suunto's OAuth host and its data host. Nothing is ever sent to Suunto.
 *
 * - "built server": dist/index.js with --login, --check, over stdio and with --http, sharing one
 *   token cache file (SUUNTO_TOKEN_CACHE), as a single user runs it;
 * - "in process": the real services and MCP server with a client over an in-memory transport, for
 *   the cases that need failures on cue (call limits, a refused refresh token).
 *
 *   npm run build
 *   SUUNTO_MCP_IT=1 npm run test:integration
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Stream } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { closeServices, createMcpServer, createServices, type Services } from "../../src/server.js";
import { CallLimiter } from "../../src/suunto/limiter.js";
import { addDays, todayInZone } from "../../src/util/dates.js";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_SUBSCRIPTION_KEY, MOCK_USERNAME, startMockSuunto, type MockSuunto } from "../helpers/mock-suunto.js";

const enabled = process.env.SUUNTO_MCP_IT === "1";

const ZONE = "Europe/Zurich";
const DAY_MS = 86_400_000;

/** Every tool of the server (DESIGN.md section 6). */
const READ_TOOLS = [
  "suunto_account_info",
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
const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS].sort();

/** An invented route (three points on an invented ridge). */
const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="suunto-mcp integration test" xmlns="http://www.topografix.com/GPX/1/1">
  <rte><name>Integration ridge</name>
    <rtept lat="46.9861" lon="9.0712"><ele>1210</ele></rtept>
    <rtept lat="46.9902" lon="9.0811"><ele>1620</ele></rtept>
    <rtept lat="46.9944" lon="9.0868"><ele>2014</ele></rtept>
  </rte>
</gpx>
`;

let mock: MockSuunto;
let dir = "";
let cache = "";
const opened: Services[] = [];

type Content = Array<{ type: string; text?: string; resource?: { uri: string; mimeType?: string; blob?: string } }>;

async function call<T = Record<string, unknown>>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Content;
  if (res.isError) throw new Error(`${name} failed: ${content.map((c) => c.text).join(" ")}`);
  return JSON.parse(content[0]!.text!) as T;
}

async function callError(client: Client, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Content).map((c) => c.text).join(" ");
  expect(res.isError, `${name} should fail: ${text}`).toBe(true);
  return text;
}

/**
 * The environment of the built server: the mock's hosts and app keys, and the token cache. The
 * tests send more than Suunto's 10 calls a minute, so the call limiter is off.
 */
function cliEnv(extra: Record<string, string> = {}): Record<string, string> {
  return { ...mock.env(), SUUNTO_TOKEN_CACHE: cache, SUUNTO_TIMEZONE: ZONE, SUUNTO_CALLS_PER_MINUTE: "0", PATH: process.env.PATH ?? "", ...extra };
}

/** Every secret the mock knows of: app keys, tokens and codes. */
function secrets(m: MockSuunto = mock): string[] {
  return [
    MOCK_CLIENT_SECRET,
    MOCK_SUBSCRIPTION_KEY,
    ...m.state.accessTokens.map((t) => t.token),
    ...m.state.refreshTokens.map((t) => t.token),
    ...m.state.codes.map((c) => c.code),
  ];
}

/** No secret and nothing shaped like a JWT (header.payload) in a text. */
function expectNoSecrets(text: string, label: string, extra: string[] = []): void {
  for (const secret of [...secrets(), ...extra]) {
    expect(text.includes(secret), `${label} holds a secret starting ${secret.slice(0, 4)}...`).toBe(false);
  }
  expect(text, label).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}/);
}

/** Workouts of the mock that started in the last 30 days (what the connection check counts). */
function recentWorkouts(): number {
  const now = Date.now();
  return mock.state.workouts.filter((w) => Number(w.startTime) >= now - 30 * DAY_MS && Number(w.startTime) < now).length;
}

/**
 * List arguments with a range of their own: the service reads whole pages of a range and keeps
 * them in the response cache, so a list that must reach the mock needs a range no test read yet.
 */
function uncachedRange(daysBack: number): { from: string; to: string } {
  const today = todayInZone(ZONE);
  return { from: addDays(today, -daysBack), to: today };
}

/** The mock's workouts, newest first. */
function newestFirst() {
  return [...mock.state.workouts].sort((a, b) => Number(b.startTime) - Number(a.startTime));
}

interface CacheFile {
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  clientId: string;
  username?: string;
}

function readCache(): CacheFile {
  return JSON.parse(readFileSync(cache, "utf8")) as CacheFile;
}

/** The refresh token the mock still accepts (it rotates them: only the newest works). */
function liveRefreshToken(m: MockSuunto = mock): string | undefined {
  return m.state.refreshTokens.filter((t) => !t.revoked).at(-1)?.token;
}

/** Collects a child's output. */
function collect(stream: Stream | null | undefined): { text: () => string } {
  let out = "";
  stream?.on("data", (chunk: Buffer) => (out += chunk.toString()));
  return { text: () => out };
}

/** Run the built CLI to the end. */
function runCli(args: string[], env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["dist/index.js", ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = collect(child.stdout);
    const stderr = collect(child.stderr);
    child.on("exit", (code) => resolve({ code, stdout: stdout.text(), stderr: stderr.text() }));
  });
}

describe.skipIf(!enabled)("against a mock Suunto API", () => {
  beforeAll(async () => {
    mock = await startMockSuunto();
    dir = mkdtempSync(join(tmpdir(), "suunto-mcp-it-"));
    cache = join(dir, "tokens.json");
  });

  afterAll(async () => {
    await Promise.allSettled(opened.map((s) => closeServices(s)));
    await mock?.close();
  });

  describe("built server (dist/index.js)", () => {
    let stdio: Client | undefined;
    let stdioErr: { text: () => string } | undefined;
    let http: ChildProcess | undefined;

    afterAll(async () => {
      await stdio?.close();
      http?.kill();
    });

    it("refuses to serve without a sign-in, and says how to get one", async () => {
      const { code, stdout, stderr } = await runCli([], cliEnv());
      expect(code).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain(`The token cache ${cache} (SUUNTO_TOKEN_CACHE) does not exist yet. Run suunto-mcp --login`);
      expectNoSecrets(stderr, "stderr");
    });

    it("--login signs in through Suunto's page and saves the tokens (mode 0600)", async () => {
      const port = await freePort();
      const redirect = `http://127.0.0.1:${port}/callback`;
      const tokenCalls = mock.count("/oauth/token");
      const child = spawn(process.execPath, ["dist/index.js", "--login"], { env: cliEnv({ SUUNTO_REDIRECT_URI: redirect }), stdio: ["ignore", "ignore", "pipe"] });
      const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
      let stderr = "";
      // The authorize URL is printed on a line of its own once the local server listens.
      const authorize = await new Promise<URL>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`--login printed no address: ${stderr}`)), 20_000);
        child.stderr!.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
          const line = stderr.split("\n").find((l) => l.startsWith(`${mock.oauthUrl}/oauth/authorize?`));
          if (line && stderr.includes("Waiting for Suunto")) {
            clearTimeout(timer);
            resolve(new URL(line.trim()));
          }
        });
        void exited.then((code) => reject(new Error(`--login exited with ${code}: ${stderr}`)));
      });
      expect(Object.fromEntries(authorize.searchParams)).toMatchObject({ response_type: "code", client_id: MOCK_CLIENT_ID, redirect_uri: redirect });
      expect(authorize.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{20,}$/);

      // A callback with another state is not this sign-in: refused, and the wait goes on.
      expect((await fetch(`${redirect}?code=invented&state=not-this-one`)).status).toBe(400);
      // Suunto's sign-in page (the mock approves at once) sends the browser back with a code.
      const signIn = await fetch(authorize, { redirect: "manual" });
      expect(signIn.status).toBe(302);
      const callback = new URL(signIn.headers.get("location")!);
      expect(callback.origin + callback.pathname).toBe(redirect);
      const page = await fetch(callback);
      expect(page.status).toBe(200);
      expect(page.headers.get("referrer-policy")).toBe("no-referrer");
      expect(await page.text()).toContain(`Signed in to Suunto as ${MOCK_USERNAME}.`);
      expect(await exited).toBe(0);

      expect(mock.count("/oauth/token") - tokenCalls).toBe(1);
      expect(stderr).toContain(`Signed in to Suunto as ${MOCK_USERNAME}. The tokens are saved in ${cache}`);
      expect(stderr).toContain("Ignored a callback with a state that does not belong to this sign-in.");
      const saved = readCache();
      expect(saved).toMatchObject({ clientId: MOCK_CLIENT_ID, username: MOCK_USERNAME, refreshToken: liveRefreshToken() });
      expect(saved.accessToken).toBe(mock.state.accessTokens.at(-1)!.token);
      expect(saved.accessTokenExpiresAt).toBeGreaterThan(Date.now());
      expect(statSync(cache).mode & 0o777).toBe(0o600);
      expectNoSecrets(stderr, "--login output");
    });

    it("--check uses the token cache, counts the workouts and prints no secret", async () => {
      const tokenCalls = mock.count("/oauth/token");
      const { code, stdout, stderr } = await runCli(["--check"], cliEnv());
      expect(code, stderr).toBe(0);
      const out = JSON.parse(stdout) as { version: string; config: Record<string, unknown>; account: Record<string, unknown> };
      expect(out.config).toMatchObject({ app_keys: "set", sign_in: "token cache", token_cache: cache, units: "metric", read_only: false, time_zone: ZONE });
      expect(out.config.custom_endpoints).toEqual(expect.arrayContaining(["SUUNTO_OAUTH_URL", "SUUNTO_API_URL"]));
      expect(out.account).toMatchObject({ username: MOCK_USERNAME, connected: true, demo: false, time_zone: ZONE, check: { ok: true, workouts_last_30_days: recentWorkouts() } });
      // The cached access token is still valid: no refresh.
      expect(mock.count("/oauth/token")).toBe(tokenCalls);
      expect(stderr).toContain("Using custom Suunto endpoints");
      expectNoSecrets(stdout + stderr, "--check output");
      expect(stdout).not.toContain(MOCK_CLIENT_ID);
    });

    it("serves every tool and both prompts over stdio", async () => {
      const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], env: cliEnv(), stderr: "pipe" });
      stdioErr = collect(transport.stderr);
      stdio = new Client({ name: "it-stdio", version: "1.0.0" });
      await stdio.connect(transport);
      const client = stdio;
      expect(client.getServerVersion()).toMatchObject({ name: "suunto-mcp", title: "MCP for Suunto (workouts, sleep, recovery)" });
      expect(client.getInstructions()).toContain(`user's time zone, ${ZONE}`);

      const tools = (await client.listTools()).tools;
      expect(tools.map((t) => t.name).sort()).toEqual(ALL_TOOLS);
      for (const tool of tools) {
        const write = WRITE_TOOLS.includes(tool.name);
        expect(tool.annotations, tool.name).toMatchObject({ readOnlyHint: !write, destructiveHint: false, idempotentHint: !write });
      }
      const prompts = (await client.listPrompts()).prompts;
      expect(prompts.map((p) => p.name).sort()).toEqual(["sleep_and_recovery", "training_review"]);
      expect(prompts.find((p) => p.name === "training_review")!.arguments?.map((a) => a.name)).toEqual(["period"]);
      expect(prompts.find((p) => p.name === "sleep_and_recovery")!.arguments?.map((a) => a.name)).toEqual(["days"]);
      const review = await client.getPrompt({ name: "training_review", arguments: { period: "last week" } });
      expect(JSON.stringify(review.messages)).toContain("suunto_workout_stats");
      const recovery = await client.getPrompt({ name: "sleep_and_recovery", arguments: { days: "3" } });
      expect(JSON.stringify(recovery.messages)).toContain("the last 3 days");

      const today = todayInZone(ZONE);
      const requestsBefore = mock.requests.length;

      // Read tools, each once.
      const info = await call(client, "suunto_account_info", { check: true });
      expect(info).toMatchObject({ username: MOCK_USERNAME, connected: true, demo: false, read_only: false, time_zone: ZONE, today, check: { ok: true } });
      expect(Date.parse(String(info.token_expires_at))).toBeGreaterThan(Date.now());

      const list = await call<{ count: number; workouts: Array<{ workout_key: string; start: string }>; units: { distance: string } }>(client, "suunto_list_workouts");
      expect(list.count).toBe(recentWorkouts());
      expect(list.workouts.map((w) => w.workout_key)).toEqual(newestFirst().slice(0, list.count).map((w) => w.workoutKey));
      expect(list.units.distance).toBe("km");
      const key = list.workouts[0]!.workout_key;

      const workout = await call<{ workout_key: string; samples: Record<string, { unit: string; original_points: number; points: unknown[] }>; available_data: string[] }>(client, "suunto_get_workout", {
        workout_key: key,
        samples: ["heart_rate", "location"],
        max_points: 20,
      });
      expect(workout.workout_key).toBe(key);
      expect(workout.available_data).toEqual(expect.arrayContaining(["heart_rate", "location"]));
      expect(workout.samples.heart_rate!.unit).toBe("bpm");
      expect(workout.samples.heart_rate!.original_points).toBeGreaterThan(20);
      expect(workout.samples.heart_rate!.points.length).toBeGreaterThan(1);
      expect(workout.samples.heart_rate!.points.length).toBeLessThanOrEqual(20);
      expect(workout.samples.location!.points[0]).toMatchObject({ lat: expect.any(Number), lon: expect.any(Number) });

      const stats = await call<{ count: number; groups: Array<{ key: string; count: number }> }>(client, "suunto_workout_stats", { group_by: "sport" });
      expect(stats.count).toBe(mock.state.workouts.length);
      expect(stats.groups.reduce((n, g) => n + g.count, 0)).toBe(mock.state.workouts.length);
      expect(stats.groups.map((g) => g.key)).toContain("Running");

      const fit = await client.callTool({ name: "suunto_export_workout_fit", arguments: { workout_key: key } });
      expect(fit.isError).toBeFalsy();
      const parts = fit.content as Content;
      const file = Buffer.from(parts[1]!.resource!.blob!, "base64");
      expect(parts[1]!.resource).toMatchObject({ uri: `suunto://workouts/${key}.fit`, mimeType: "application/vnd.ant.fit" });
      expect(file.subarray(8, 12).toString("ascii")).toBe(".FIT");
      expect(JSON.parse(parts[0]!.text!)).toMatchObject({ workout_key: key, bytes: file.length });

      const daily = await call<{ days: Array<{ date: string }>; totals: { steps: number } }>(client, "suunto_daily_activity", { from: addDays(today, -6), to: today });
      expect(daily.days.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)));
      expect(daily.totals.steps).toBeGreaterThan(0);

      const samples = await call<{ resolution: string; count: number }>(client, "suunto_activity_samples", { from: addDays(today, -1), to: today });
      expect(samples.resolution).toBe("hour");
      expect(samples.count).toBeGreaterThan(0);
      expect(samples.count).toBeLessThanOrEqual(48);

      const sleep = await call<{ count: number; sleeps: Array<{ date: string; is_nap: boolean }> }>(client, "suunto_sleep", { from: addDays(today, -6), to: today });
      expect(sleep.sleeps.filter((s) => !s.is_nap).length).toBeGreaterThanOrEqual(5);
      for (const s of sleep.sleeps) expect(s.date >= addDays(today, -6) && s.date <= today, s.date).toBe(true);

      const rec = await call<{ resolution: string; count: number; summary: { balance_pct_avg: number } }>(client, "suunto_recovery", { from: addDays(today, -2), to: today });
      expect(rec.resolution).toBe("day");
      expect(rec.count).toBeGreaterThan(0);
      expect(rec.summary.balance_pct_avg).toBeGreaterThan(0);
      expect(rec.summary.balance_pct_avg).toBeLessThanOrEqual(100);

      const routes = await call<{ count: number; routes: Array<{ route_id: string; name: string }> }>(client, "suunto_list_routes");
      expect(routes.count).toBe(mock.state.routes.length);
      expect(routes.routes[0]!.name).toBe("Test summit path");
      const gpx = await call<{ format: string; gpx: string }>(client, "suunto_get_route", { route_id: routes.routes[0]!.route_id, format: "gpx" });
      expect(gpx.format).toBe("gpx");
      expect(gpx.gpx).toContain("<rte><name>Test summit path</name>");

      const pois = await call<{ count: number; pois: Array<{ name: string; type: string }> }>(client, "suunto_list_pois");
      expect(pois.count).toBe(mock.state.pois.length);
      expect(pois.pois.map((p) => p.type)).toContain("Peak");

      // The two write tools.
      const routeCount = mock.state.routes.length;
      const imported = await call<{ added: boolean; route: { name: string; sports: string[] } }>(client, "suunto_import_route", { gpx: GPX, sports: ["Hiking"] });
      expect(imported).toMatchObject({ added: true, route: { name: "Integration ridge", sports: ["Hiking"] } });
      expect(mock.state.routes).toHaveLength(routeCount + 1);
      const sent = mock.requests.filter((r) => r.path === "/v2/route/import").at(-1)!;
      expect(sent.headers["content-type"]).toMatch(/^application\/gpx\+xml/);
      expect(sent.query.activities).toBe("11");
      expect(sent.body).toBe(GPX);

      const poiCount = mock.state.pois.length;
      const poi = await call<{ added: boolean; poi: Record<string, unknown> }>(client, "suunto_create_poi", {
        name: "Integration hut",
        latitude: 46.9902,
        longitude: 9.0811,
        altitude_m: 1620,
        type: "Mountain",
        sport: "Hiking",
      });
      expect(poi).toMatchObject({ added: true, poi: { name: "Integration hut", type: "Mountain", type_id: 16, altitude: 1620, sport: "Hiking" } });
      expect(mock.state.pois).toHaveLength(poiCount + 1);
      expect(mock.state.pois.at(-1)).toMatchObject({ point: { x: 9.0811, y: 46.9902, z: 1620, name: "Integration hut", type: 16 }, activityId: 11, watchEnabled: true });
      // A write clears the cached lists: the new route and point show at once.
      expect((await call<{ count: number }>(client, "suunto_list_routes")).count).toBe(routeCount + 1);
      expect((await call<{ count: number }>(client, "suunto_list_pois")).count).toBe(poiCount + 1);

      // Every request carried the subscription key, a Bearer token and the User-Agent.
      const sentNow = mock.requests.slice(requestsBefore).filter((r) => r.host === "api");
      expect(sentNow.length).toBeGreaterThan(10);
      for (const r of sentNow) expect(r.headers).toMatchObject({ authorization: "Bearer ***", "ocp-apim-subscription-key": "***" });
      expect(mock.state.violations).toEqual([]);
    });

    it("never shows a token or key that Suunto echoes in an error", async () => {
      const client = stdio!;
      const access = mock.state.accessTokens.at(-1)!.token;
      mock.failNext("/v3/workouts", 400, { message: `Rejected Bearer ${access} with key ${MOCK_SUBSCRIPTION_KEY} and secret ${MOCK_CLIENT_SECRET}` });
      const text = await callError(client, "suunto_list_workouts", { limit: 3, ...uncachedRange(11) });
      expect(text).toContain("Suunto says the request is not valid");
      expect(text).toContain("Rejected Bearer ***");
      expectNoSecrets(text, "the tool error");
      // A workout key Suunto does not know: a clear "not found".
      expect(await callError(client, "suunto_get_workout", { workout_key: "0123456789abcdef01234567" })).toBe("Suunto has no workout with the key 0123456789abcdef01234567.");
      // Wrong arguments are refused before anything is sent.
      const before = mock.requests.length;
      expect(await callError(client, "suunto_list_workouts", { limit: 101 })).toMatch(/limit/);
      expect(await callError(client, "suunto_list_workouts", { occurrence: 1 })).toMatch(/occurrence|unrecognized/i);
      expect(mock.requests.length).toBe(before);
    });

    it("refreshes an expired access token and saves the new refresh token to the cache", async () => {
      const client = stdio!;
      const before = readCache();
      const tokenCalls = mock.count("/oauth/token");
      // Suunto ends the access token early: the next request gets 401 and the session refreshes once.
      mock.expireAccessTokens();
      const page = await call<{ count: number }>(client, "suunto_list_workouts", { limit: 2, ...uncachedRange(12) });
      expect(page.count).toBe(2);
      expect(mock.count("/oauth/token") - tokenCalls).toBe(1);
      const after = readCache();
      // The mock rotates refresh tokens: the cache holds the one that works now.
      expect(after.refreshToken).not.toBe(before.refreshToken);
      expect(after.refreshToken).toBe(liveRefreshToken());
      expect(after.accessToken).toBe(mock.state.accessTokens.at(-1)!.token);
      expect(after).toMatchObject({ clientId: MOCK_CLIENT_ID, username: MOCK_USERNAME });
      expect(statSync(cache).mode & 0o777).toBe(0o600);
      // The next call needs no refresh.
      await call(client, "suunto_list_workouts", { limit: 1 });
      expect(mock.count("/oauth/token") - tokenCalls).toBe(1);
      // Nothing the server logged holds a secret.
      expect(stdioErr!.text()).toContain("Tool suunto_list_workouts failed");
      expectNoSecrets(stdioErr!.text(), "stdio stderr");
    });

    it("serves the tools over HTTP with a bearer token", async () => {
      const port = await freePort();
      const token = "it-http-token-0123456789abcdef";
      http = spawn(process.execPath, ["dist/index.js", "--http", "--port", String(port)], {
        env: cliEnv({ MCP_HTTP_TOKEN: token }),
        stdio: ["ignore", "ignore", "pipe"],
      });
      const stderr = collect(http.stderr);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`the HTTP server did not start: ${stderr.text()}`)), 20_000);
        http!.stderr!.on("data", () => {
          if (stderr.text().includes("listening")) {
            clearTimeout(timer);
            resolve();
          }
        });
        http!.on("exit", (code) => reject(new Error(`the HTTP server exited with ${code}: ${stderr.text()}`)));
      });
      const url = `http://127.0.0.1:${port}/mcp`;
      const anonymous = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
      expect(anonymous.status).toBe(401);

      const client = new Client({ name: "it-http", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
      expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(ALL_TOOLS);
      expect(await call(client, "suunto_account_info")).toMatchObject({ username: MOCK_USERNAME, connected: true });
      const page = await call<{ count: number; workouts: Array<{ workout_key: string }> }>(client, "suunto_list_workouts", { limit: 2 });
      expect(page.workouts.map((w) => w.workout_key)).toEqual(newestFirst().slice(0, 2).map((w) => w.workoutKey));
      const rec = await call<{ count: number }>(client, "suunto_recovery", { from: addDays(todayInZone(ZONE), -1), to: todayInZone(ZONE), resolution: "hour" });
      expect(rec.count).toBeGreaterThan(0);
      await client.close();
      expectNoSecrets(stderr.text(), "HTTP stderr", [token]);
    });
  });

  describe("in process", () => {
    /** A client of the real MCP server (in process), signed in with a fresh refresh token. */
    async function inProcess(m: MockSuunto, logs: string[] = []): Promise<Client> {
      const config = loadConfig({ ...m.env(), SUUNTO_REFRESH_TOKEN: m.issueTokens().refreshToken, SUUNTO_TIMEZONE: ZONE, SUUNTO_CALLS_PER_MINUTE: "0" });
      // A limiter of its own: a stop after a call limit answer in one test leaves the others alone.
      const services = createServices(config, { log: (line) => void logs.push(line), limiter: new CallLimiter({ perMinute: 0 }) });
      opened.push(services);
      const server = createMcpServer(config, services, (line) => void logs.push(line));
      const client = new Client({ name: "it", version: "1.0.0" });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await Promise.all([client.connect(ct), server.connect(st)]);
      return client;
    }

    it("serves a repeated read from memory, and reports Suunto's call limits without a refresh", async () => {
      const client = await inProcess(mock);
      await call(client, "suunto_account_info");
      const lists = mock.count("/v3/workouts");
      const first = await call(client, "suunto_list_workouts", { limit: 4 });
      expect(await call(client, "suunto_list_workouts", { limit: 4 })).toEqual(first);
      expect(mock.count("/v3/workouts") - lists).toBe(1);

      const tokenCalls = mock.count("/oauth/token");
      // The minute limit: 429 with a Retry-After longer than this server waits.
      mock.failNext("/v3/workouts", 429, { statusCode: 429, message: "Rate limit is exceeded. Try again in 60 seconds." }, { "retry-after": "60" });
      expect(await callError(client, "suunto_list_workouts", { limit: 5, ...uncachedRange(27) })).toContain("Suunto's call limit for this service is reached (HTTP 429). Try again in 60 seconds.");
      // Suunto's limits count every request of the app: until the wait is over, nothing is sent.
      const sent = mock.count("/v3/workouts");
      expect(await callError(client, "suunto_list_workouts", { limit: 6, ...uncachedRange(28) })).toMatch(/^Suunto's call limit for this service is reached\. Try again in (59|60) seconds\.$/);
      expect(mock.count("/v3/workouts")).toBe(sent);
      // The weekly quota: 403 with Azure's quota text (another process, so no stop is in force).
      expect(mock.count("/oauth/token")).toBe(tokenCalls);
      const fresh = await inProcess(mock);
      await call(fresh, "suunto_account_info");
      const freshTokenCalls = mock.count("/oauth/token");
      mock.failNext("/v3/workouts", 403, { statusCode: 403, message: "Out of call volume quota. Quota will be replenished in 2.03:04:05." });
      expect(await callError(fresh, "suunto_list_workouts", { limit: 6, ...uncachedRange(28) })).toMatch(/^Suunto's call limit for this service is reached \(HTTP 403\)\. Try again in \d+ (days|hours)\./);
      // A call limit is never a sign-in problem.
      expect(mock.count("/oauth/token")).toBe(freshTokenCalls);
      const third = await inProcess(mock);
      expect((await call<{ count: number }>(third, "suunto_list_workouts", { limit: 6, ...uncachedRange(28) })).count).toBe(6);
    });

    it("says to sign in again when Suunto refuses the refresh token, and waits before trying again", async () => {
      // A mock of its own: revoking every token here leaves the other tests alone.
      const other = await startMockSuunto();
      const logs: string[] = [];
      try {
        const client = await inProcess(other, logs);
        expect(await call(client, "suunto_account_info")).toMatchObject({ username: MOCK_USERNAME, connected: true });
        other.revokeAll();
        other.expireAccessTokens();
        const text = await callError(client, "suunto_list_workouts");
        // No token cache here: only a new SUUNTO_REFRESH_TOKEN and a restart help.
        expect(text).toContain("Your Suunto connection expired. Set a new SUUNTO_REFRESH_TOKEN and restart the server");
        // During the cool-down, calls fail at once without asking Suunto again.
        const tokenCalls = other.count("/oauth/token");
        expect(await callError(client, "suunto_daily_activity", { from: addDays(todayInZone(ZONE), -1), to: todayInZone(ZONE) })).toContain("Your Suunto connection expired.");
        expect(other.count("/oauth/token")).toBe(tokenCalls);
        // check=true still answers: not connected, and why.
        const info = await call<{ connected: boolean; check: { ok: boolean; error: string } }>(client, "suunto_account_info", { check: true });
        expect(info).toMatchObject({ connected: false, check: { ok: false } });
        expect(info.check.error).toContain("Your Suunto connection expired.");
        // The mock echoes the refused refresh token in its error: it never reaches the answer or the log.
        const tokens = [...other.state.refreshTokens, ...other.state.accessTokens].map((t) => t.token);
        for (const t of tokens) {
          expect(text.includes(t)).toBe(false);
          expect(logs.join("\n").includes(t)).toBe(false);
        }
        expect(logs.join("\n")).toContain("Set a new SUUNTO_REFRESH_TOKEN and restart the server");
        expect(logs.join("\n")).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}/);
      } finally {
        await other.close();
      }
    });
  });
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}
