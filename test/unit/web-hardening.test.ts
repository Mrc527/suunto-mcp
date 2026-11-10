/**
 * Review fixes of the web service:
 * - one Suunto session and one response cache per user and connection, kept when the services
 *   are rebuilt, kept 35 idle minutes, and a session that takes over newer stored tokens;
 * - a shutdown waits for running tool calls, so a refreshed token is still saved;
 * - the Suunto call limits (per minute for the server, per user per day) and the admin page;
 * - the connect-time test request: one request, no retry, no refresh, nothing after the cutoff,
 *   and a rate limit reported as one;
 * - a reconnect with another Suunto account ends the old one at Suunto;
 * - the Host header check, client text in the log, the time zone choice "server default", and
 *   what the AI app of a user without Suunto is told about time zone and units.
 *
 * Suunto is the in-process mock: nothing is ever sent to Suunto. Invented data only.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ListWorkoutsQuery } from "../../src/activity/types.js";
import { CallLimiter } from "../../src/suunto/limiter.js";
import { buildSetupConfig, POOL_IDLE_MS, ServicePool } from "../../src/web/accounts.js";
import { plainText } from "../../src/web/oauth.js";
import { testConnection } from "../../src/web/routes-account.js";
import { createWebApp, isPublicHost, type WebApp, type WebOptions } from "../../src/web/server.js";
import { DEFAULT_SETTINGS, type SuuntoAccountSettings } from "../../src/web/store.js";
import { MOCK_CLIENT_ID, MOCK_USERNAME, startMockSuunto, type MockSuunto } from "../helpers/mock-suunto.js";
import { Browser, connectMcp, connectSuunto, setBase, TestOAuthClient } from "../helpers/web-client.js";

const PASSWORD = "correct horse battery";
const DAY = 86_400_000;
const NO_LIMITS = { perMinute: 0, perUserPerDay: 0 };

let mock: MockSuunto;

/** While set, every token refresh sent to Suunto waits until it is released. */
let gate: { held: () => void; released: Promise<void> } | undefined;

function isRefresh(input: string | URL | Request, init?: RequestInit): boolean {
  const url = input instanceof Request ? input.url : String(input);
  return url.endsWith("/oauth/token") && String(init?.body ?? "").includes("grant_type=refresh_token");
}

/** URLs of the deauthorize calls, with whether the store held the new connection at that time. */
let onDeauthorize: (() => void) | undefined;

const suuntoFetch: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.includes("/oauth/deauthorize")) onDeauthorize?.();
  const g = gate;
  if (g && isRefresh(input, init)) {
    g.held();
    await g.released;
  }
  return fetch(input, init);
};

/** Hold the next token refreshes: `held` resolves when one is waiting, `release` lets them go. */
function holdRefreshes(): { held: Promise<void>; release: () => void } {
  let held!: () => void;
  let release!: () => void;
  const heldPromise = new Promise<void>((r) => (held = r));
  const released = new Promise<void>((r) => (release = r));
  gate = { held, released };
  return {
    held: heldPromise,
    release: () => {
      gate = undefined;
      release();
    },
  };
}

interface Running {
  web: WebApp;
  server: Server;
  base: string;
  logs: string[];
  stop(): Promise<void>;
}

/** A web service on a free port, with the mock's hosts and keys. */
async function startWeb(extra: Partial<WebOptions> = {}): Promise<Running> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const logs: string[] = [];
  const web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    operator: mock.env(),
    suuntoFetch,
    callLimits: NO_LIMITS,
    log: (m) => void logs.push(m),
    ...extra,
  });
  server.on("request", web.app);
  let stopped = false;
  return {
    web,
    server,
    base,
    logs,
    async stop() {
      if (stopped) return;
      stopped = true;
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await web.close();
    },
  };
}

/** A day no earlier list read: the services cache pages of workouts for 2 minutes. */
let daysBack = 40;
const freshDay = (limit = 1) => {
  const day = new Date(Date.now() - ++daysBack * DAY).toISOString().slice(0, 10);
  return { from: day, to: day, limit };
};
/** A wire-level list query no earlier call used. */
let page = 0;
const freshQuery = (): ListWorkoutsQuery => ({ limit: 1, offset: 1000 + page++, byModificationTime: false });

/** A stored connection with live tokens of the mock (no OAuth dance). */
function storedConnection(connectedAt: number, username = MOCK_USERNAME): SuuntoAccountSettings {
  return { username, ...mock.issueTokens(), clientId: MOCK_CLIENT_ID, units: "metric", readOnly: false, connectedAt };
}

type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string }> };
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
const text = (res: ToolResult) => res.content.map((c) => c.text ?? "").join("\n");

/** GET with a chosen Host header (fetch always sends the address it connects to). */
function getWithHost(url: string, host: string, method = "GET"): Promise<{ status: number; body: string; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers: { host, accept: "text/html" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, cookies: ([] as string[]).concat(res.headers["set-cookie"] ?? []) }));
    });
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  mock = await startMockSuunto();
});

afterAll(async () => {
  gate = undefined;
  await mock.close();
});

describe("the Host header", () => {
  it("names this server: PUBLIC_URL's host, and on a loopback PUBLIC_URL every loopback name", () => {
    const pub = new URL("https://suunto.example.com/");
    expect(isPublicHost("suunto.example.com", pub)).toBe(true);
    expect(isPublicHost("SUUNTO.example.com:443", pub)).toBe(true);
    expect(isPublicHost("suunto.example.com.", pub)).toBe(true);
    for (const bad of [undefined, "", "attacker.example", "suunto.example.com.attacker.example", "suunto.example.com@attacker.example", "suunto.example.com/x", "127.0.0.1", "localhost"]) {
      expect(isPublicHost(bad, pub), String(bad)).toBe(false);
    }
    const local = new URL("http://127.0.0.1:3000/");
    for (const ok of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000", "127.0.0.1"]) expect(isPublicHost(ok, local), ok).toBe(true);
    expect(isPublicHost("attacker.example:3000", local)).toBe(false);
  });

  it("refuses requests for another host name, so a web page cannot create the first account through DNS rebinding", async () => {
    const run = await startWeb({ publicUrl: new URL("https://suunto.example.com") });
    try {
      const url = (path: string) => `${run.base}${path}`;
      const foreign = await getWithHost(url("/signup"), "attacker.example");
      expect(foreign.status).toBe(421);
      expect(foreign.cookies).toEqual([]);
      expect(foreign.body).not.toContain("_csrf");
      expect((await getWithHost(url("/signup"), "attacker.example", "POST")).status).toBe(421);
      expect(run.web.ctx.store.countUsers()).toBe(0);
      // The public host works; the health check is asked by address.
      expect((await getWithHost(url("/signup"), "suunto.example.com")).status).toBe(200);
      expect((await getWithHost(url("/healthz"), new URL(run.base).host)).status).toBe(200);
      expect((await getWithHost(url("/mcp"), "attacker.example", "POST")).status).toBe(421);
    } finally {
      await run.stop();
    }
  });
});

describe("client text in the log", () => {
  let run: Running;
  beforeAll(async () => {
    run = await startWeb();
  });
  afterAll(async () => {
    await run.stop();
  });

  it("is one line without control characters, and e-mail addresses are masked", async () => {
    const forged = 'x"\n[suunto-mcp] Created the administrator account from ADMIN_EMAIL alex@example.com\r\u2028done\u200b';
    const res = await fetch(`${run.base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: forged, client_uri: "https://app.example.com/\nx", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }),
    });
    expect(res.status).toBe(201);
    const { client_id } = (await res.json()) as { client_id: string };
    const stored = run.web.ctx.store.getClient(client_id)!.client;
    expect(stored.client_name).not.toMatch(/[\r\n\u2028\u200b]/);
    expect(stored.client_uri).not.toMatch(/[\r\n]/);
    const line = run.logs.find((l) => l.startsWith("Registered OAuth client"))!;
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/[\r\n\u2028]/);
    expect(run.logs.join("\n")).not.toContain("alex@example.com");
    expect(run.logs.some((l) => l.startsWith("[suunto-mcp]"))).toBe(false);
  });

  it("plainText() turns control and format characters into spaces", () => {
    expect(plainText("a\nb\r\nc\td\u2028e\u2029f\u200bg\u0000h")).toBe("a b c d e f g h");
    expect(plainText("  Claude  ")).toBe("Claude");
  });
});

describe("one Suunto session and one cache per connection", () => {
  let run: Running;
  const athlete = new Browser();
  let userId = "";
  const user = () => run.web.ctx.store.getUser(userId)!;
  const pool = () => run.web.ctx.pool;

  beforeAll(async () => {
    run = await startWeb();
    setBase(run.base);
    expect((await athlete.signup("athlete@example.com", PASSWORD)).status).toBe(303);
    userId = run.web.ctx.store.getUserByEmail("athlete@example.com")!.id;
    expect((await connectSuunto(athlete)).res.headers.get("location")).toBe("/account?m=connected");
  });
  afterAll(async () => {
    await run.stop();
  });

  it("keeps the session and the cache when the user's settings change", async () => {
    setBase(run.base);
    const first = pool().get(user())!;
    const q = freshQuery();
    const calls = mock.count("/v3/workouts");
    await first.services.backend!.listWorkouts(q);
    expect(mock.count("/v3/workouts") - calls).toBe(1);
    // Units and read-only change: new services, the same session and cache.
    const { csrf } = await athlete.page("/account");
    expect((await athlete.post("/account/suunto/settings", { _csrf: csrf, units: "imperial", readOnly: "on", timeZone: "" })).headers.get("location")).toBe("/account?m=saved");
    const second = pool().get(user())!;
    expect(second.config.units).toBe("imperial");
    expect(second.config.readOnly).toBe(true);
    expect(second.services.activity).not.toBe(first.services.activity);
    expect(second.services.backend).toBe(first.services.backend);
    expect(second.services.session).toBe(first.services.session);
    await second.services.backend!.listWorkouts(q);
    expect(mock.count("/v3/workouts") - calls).toBe(1);
    // A server setting that does not change services rebuilds nothing; one that does keeps the cache.
    const settings = run.web.ctx.store.getSettings();
    run.web.ctx.store.saveSettings({ ...settings, sessionTtlDays: settings.sessionTtlDays + 1, registration: "open" });
    expect(pool().get(user())).toBe(second);
    run.web.ctx.store.saveSettings({ ...run.web.ctx.store.getSettings(), defaultTimeZone: "Europe/Zurich" });
    const third = pool().get(user())!;
    expect(third).not.toBe(second);
    expect(third.services.backend).toBe(first.services.backend);
    await third.services.backend!.listWorkouts(q);
    expect(mock.count("/v3/workouts") - calls).toBe(1);
  });

  it("shares one token refresh when the services are rebuilt while it runs", async () => {
    setBase(run.base);
    const before = pool().get(user())!;
    await before.services.backend!.listWorkouts(freshQuery());
    mock.expireAccessTokens();
    const refreshes = mock.count("/oauth/token");
    const hold = holdRefreshes();
    const one = before.services.backend!.listWorkouts(freshQuery());
    await hold.held;
    // The user saves the settings while the refresh runs: the next call uses the rebuilt services.
    const { csrf } = await athlete.page("/account");
    await athlete.post("/account/suunto/settings", { _csrf: csrf, units: "metric", timeZone: "" });
    const after = pool().get(user())!;
    expect(after.services.activity).not.toBe(before.services.activity);
    const two = after.services.backend!.listWorkouts(freshQuery());
    await new Promise((r) => setTimeout(r, 20));
    hold.release();
    await expect(one).resolves.toBeTruthy();
    await expect(two).resolves.toBeTruthy();
    // One refresh for both; the rotated refresh token is stored and the connection is fine.
    expect(mock.count("/oauth/token") - refreshes).toBe(1);
    expect(user().suuntoNeedsReconnect).toBe(false);
    expect(run.web.ctx.store.getSuuntoSettings(userId)!.refreshToken).toBe(after.services.session!.storedTokens.refreshToken);
  });

  it("takes over newer stored tokens instead of refreshing with a used-up refresh token", async () => {
    setBase(run.base);
    const mine = pool().get(user())!;
    await mine.services.backend!.listWorkouts(freshQuery());
    // Another pool (as in another process) refreshes the same connection and stores new tokens.
    const other = new ServicePool(run.web.ctx.store, { operator: run.web.ctx.operator, keys: mock.keys, fetch: suuntoFetch });
    try {
      mock.expireAccessTokens();
      await other.get(user())!.services.backend!.listWorkouts(freshQuery());
      const stored = run.web.ctx.store.getSuuntoSettings(userId)!;
      expect(stored.refreshToken).not.toBe(mine.services.session!.storedTokens.refreshToken);
      // This session's refresh token was used up (the mock rotates them): it takes the stored ones.
      const refreshes = mock.count("/oauth/token");
      await expect(mine.services.backend!.listWorkouts(freshQuery())).resolves.toBeTruthy();
      expect(mock.count("/oauth/token") - refreshes).toBe(0);
      expect(mine.services.session!.storedTokens.refreshToken).toBe(stored.refreshToken);
      expect(user().suuntoNeedsReconnect).toBe(false);
    } finally {
      await other.closeAll();
    }
  });

  it("keeps a connection 35 idle minutes, longer than the cache keeps a workout", async () => {
    let clock = Date.now();
    const timed = new ServicePool(run.web.ctx.store, { operator: run.web.ctx.operator, keys: mock.keys, fetch: suuntoFetch, now: () => clock });
    try {
      expect(POOL_IDLE_MS).toBeGreaterThan(30 * 60_000);
      const entry = timed.get(user())!;
      clock += 11 * 60_000;
      await timed.sweep();
      expect(timed.size).toBe(1);
      expect(timed.get(user())!.services.backend).toBe(entry.services.backend);
      clock += POOL_IDLE_MS + 1;
      await timed.sweep();
      expect(timed.size).toBe(0);
    } finally {
      await timed.closeAll();
    }
  });

  it("starts a new session for a new connection", async () => {
    setBase(run.base);
    const old = pool().get(user())!;
    expect((await connectSuunto(athlete)).res.headers.get("location")).toBe("/account?m=connected");
    const fresh = pool().get(user())!;
    expect(fresh.services.session).not.toBe(old.services.session);
    expect(fresh.services.backend).not.toBe(old.services.backend);
  });
});

describe("a shutdown", () => {
  it("waits for running tool calls, so a refreshed refresh token is still saved", async () => {
    const run = await startWeb();
    setBase(run.base);
    const browser = new Browser();
    expect((await browser.signup("closing@example.com", PASSWORD)).status).toBe(303);
    expect((await connectSuunto(browser)).res.headers.get("location")).toBe("/account?m=connected");
    const client = await connectMcp(new TestOAuthClient(browser));
    try {
      const saved = vi.spyOn(run.web.ctx.store, "saveSuuntoTokens");
      mock.expireAccessTokens();
      const hold = holdRefreshes();
      const running = call(client, "suunto_list_workouts", freshDay()).catch(() => undefined);
      await hold.held;
      // As on SIGTERM (src/index.ts): the HTTP server stops and drops its connections first.
      run.server.close();
      run.server.closeAllConnections();
      const closing = run.web.close();
      setTimeout(() => hold.release(), 100);
      await closing;
      // The refresh ended before the database closed: its tokens were saved.
      expect(saved).toHaveReturnedWith(true);
      expect(run.logs.join("\n")).not.toContain("Could not save refreshed Suunto tokens");
      await running;
    } finally {
      gate = undefined;
      await client.close().catch(() => undefined);
      run.server.closeAllConnections();
      if (run.server.listening) await new Promise<void>((r) => run.server.close(() => r()));
    }
  });

  it("does not wait longer than its limit", async () => {
    const run = await startWeb();
    const pool = run.web.ctx.pool;
    const end = pool.begin();
    let closed = false;
    const started = Date.now();
    const closing = pool.closeAll(2_000).then(() => (closed = true));
    await new Promise((r) => setTimeout(r, 50));
    expect(closed).toBe(false);
    end();
    end();
    await closing;
    expect(Date.now() - started).toBeLessThan(1_500);
    // A call that never ends: the wait stops at the limit.
    const stuck = new ServicePool(run.web.ctx.store, { operator: {} });
    stuck.begin();
    const t0 = Date.now();
    await stuck.closeAll(60);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
    await run.stop();
  });
});

describe("the Suunto call limits", () => {
  it("are shown on the admin page (10 per minute, 100 per user per day and 100 per user in 7 days by default)", async () => {
    const run = await startWeb({ callLimits: undefined });
    setBase(run.base);
    try {
      const owner = new Browser();
      expect((await owner.signup("owner@example.com", PASSWORD)).status).toBe(303);
      const { html } = await owner.page("/admin");
      expect(html).toContain("10 Suunto requests per minute for the whole server");
      expect(html).toContain("100 requests per user per day");
      expect(html).toContain("100 requests per user in any 7 days");
      expect(html).toContain("SUUNTO_CALLS_PER_USER_PER_WEEK");
      expect(run.web.ctx.pool.limits).toEqual({ perMinute: 10, perUserPerDay: 100, perUserPerWeek: 100 });
      expect(run.web.ctx.pool.limiter).toBeInstanceOf(CallLimiter);
    } finally {
      await run.stop();
    }
  });

  it("keep each user's requests and a stop after Suunto's own limit answer in the database, so a restart does not reset them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-limits-"));
    const limits = { perMinute: 0, perUserPerDay: 2, perUserPerWeek: 3 };
    try {
      const first = await startWeb({ dataDir: dir, callLimits: limits });
      try {
        await first.web.ctx.pool.limiter!.acquire("user-a");
        await first.web.ctx.pool.limiter!.acquire("user-a");
      } finally {
        await first.stop();
      }
      const second = await startWeb({ dataDir: dir, callLimits: limits });
      try {
        // Not a fresh share after the restart.
        await expect(second.web.ctx.pool.limiter!.acquire("user-a")).rejects.toThrow("You reached this service's daily limit of 2 Suunto requests for your account. Try again tomorrow.");
        await second.web.ctx.pool.limiter!.acquire("user-b");
        // Suunto answered with its weekly quota: every user stops, also after a restart.
        second.web.ctx.pool.limiter!.block(2 * 86_400_000);
      } finally {
        await second.stop();
      }
      const third = await startWeb({ dataDir: dir, callLimits: { perMinute: 0, perUserPerDay: 0, perUserPerWeek: 0 } });
      try {
        await expect(third.web.ctx.pool.limiter!.acquire("user-c")).rejects.toThrow(/^Suunto's call limit for this service is reached\. Try again in (2 days|48 hours)\.$/);
      } finally {
        await third.stop();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cap each user's Suunto requests per day, the connect-time check included, and leave other users alone", async () => {
    const run = await startWeb({ callLimits: { perMinute: 0, perUserPerDay: 3 } });
    setBase(run.base);
    try {
      const owner = new Browser();
      expect((await owner.signup("owner@example.com", PASSWORD)).status).toBe(303);
      expect((await owner.page("/admin")).html).toContain("No limit per minute");
      run.web.ctx.store.saveSettings({ ...run.web.ctx.store.getSettings(), registration: "open" });
      const greedy = new Browser();
      expect((await greedy.signup("greedy@example.com", PASSWORD)).status).toBe(303);
      const calls = mock.count("/v3/workouts");
      // The test request of "Connect Suunto" is the first of the 3.
      expect((await connectSuunto(greedy)).res.headers.get("location")).toBe("/account?m=connected");
      const client = await connectMcp(new TestOAuthClient(greedy));
      let refused: ToolResult | undefined;
      for (let i = 0; i < 5 && !refused; i++) {
        const res = await call(client, "suunto_list_workouts", freshDay());
        if (res.isError) refused = res;
      }
      expect(text(refused!)).toContain("You reached this service's daily limit of 3 Suunto requests for your account. Try again tomorrow.");
      expect(mock.count("/v3/workouts") - calls).toBe(3);
      await client.close();
      // Another user still gets their own share.
      setBase(run.base);
      const other = new Browser();
      expect((await other.signup("other@example.com", PASSWORD)).status).toBe(303);
      expect((await connectSuunto(other)).res.headers.get("location")).toBe("/account?m=connected");
      const otherClient = await connectMcp(new TestOAuthClient(other));
      expect((await call(otherClient, "suunto_list_workouts", freshDay())).isError).toBeFalsy();
      await otherClient.close();
    } finally {
      await run.stop();
    }
  });
});

describe("the connect-time test request", () => {
  const result = () => {
    const t = mock.issueTokens();
    return { username: MOCK_USERNAME, tokens: { ...t, clientId: MOCK_CLIENT_ID } };
  };
  const ctx = (extra: { suuntoFetch?: typeof fetch; limiter?: CallLimiter } = {}) => ({
    suuntoKeys: mock.keys,
    suuntoEndpoints: mock.endpoints,
    suuntoFetch: extra.suuntoFetch ?? fetch,
    log: () => {},
    pool: { limiter: extra.limiter },
  });

  it("reports Suunto's rate limit as one, and sends the request once", async () => {
    const calls = mock.count("/v3/workouts");
    mock.failNext("/v3/workouts", 429, { statusCode: 429, message: "Rate limit is exceeded. Try again in 20 seconds." }, { "retry-after": "20" });
    const { check } = await testConnection(ctx(), result(), "user-1");
    expect(check.error).toMatch(/^Suunto's call limit for this service is reached \(HTTP 429\)\. Try again in 20 s/);
    expect(mock.count("/v3/workouts") - calls).toBe(1);
  });

  it("does not try a busy Suunto again", async () => {
    const calls = mock.count("/v3/workouts");
    mock.failNext("/v3/workouts", 503);
    const { check } = await testConnection(ctx(), result(), "user-1");
    expect(check.error).toBe("Suunto is busy right now (HTTP 503). Try again later.");
    expect(mock.count("/v3/workouts") - calls).toBe(1);
  });

  it("never refreshes the new token (a rotated refresh token would be lost)", async () => {
    const tokens = mock.count("/oauth/token");
    mock.failNext("/v3/workouts", 401, { statusCode: 401, message: "Invalid token" });
    const run = await testConnection(ctx(), result(), "user-1");
    expect(run.check.error).toBe("Suunto refused the new sign-in.");
    expect(mock.count("/oauth/token")).toBe(tokens);
  });

  it("stops at the cutoff and sends nothing after it", async () => {
    const seen: AbortSignal[] = [];
    const slow: typeof fetch = (input, init) => {
      seen.push(init!.signal!);
      // Suunto never answers: only the abort ends the request.
      return new Promise((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true }));
    };
    const { check, tokens } = await testConnection(ctx({ suuntoFetch: slow }), result(), "user-1", 50);
    expect(check.error).toBe("Suunto did not answer in time.");
    expect(tokens.accessToken).toBeTruthy();
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.aborted).toBe(true);
  });

  it("counts against the user's share and says so when the call limit holds it back", async () => {
    // The daily share is used up: the limiter's own message.
    const daily = new CallLimiter({ perMinute: 0, perKeyPerDay: 1 });
    await daily.acquire("user-2");
    const calls = mock.count("/v3/workouts");
    const used = await testConnection(ctx({ limiter: daily }), result(), "user-2");
    expect(used.check.error).toContain("daily limit of 1 Suunto requests");
    // No free slot this minute, and the wait would be too long: the limiter says when to try again.
    const full = new CallLimiter({ perMinute: 1 });
    await full.acquire("someone");
    const later = await testConnection(ctx({ limiter: full }), result(), "user-3");
    expect(later.check.error).toMatch(/^Suunto's call limit for this service is reached\. Try again in /);
    expect(mock.count("/v3/workouts") - calls).toBe(0);
  });

  it("never books a slot of the call limiter that it cannot use before its cutoff", async () => {
    // The limiter would let the check wait 60 s (up to 120 s), but the check stops after 15 s.
    let now = Date.UTC(2026, 10, 10, 12, 0, 0);
    const waits: number[] = [];
    const busy = new CallLimiter({
      perMinute: 2,
      perKeyPerDay: 2,
      maxWaitMs: 120_000,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    await busy.acquire("someone");
    await busy.acquire("someone");
    const calls = mock.count("/v3/workouts");
    const waiting = await testConnection(ctx({ limiter: busy }), result(), "user-3", 15_000);
    expect(waiting.check.error).toBe("Suunto's call limit for this service is reached. Try again in 60 seconds.");
    expect(mock.count("/v3/workouts") - calls).toBe(0);
    expect(waits).toEqual([]);
    // Nothing was booked: one minute later both slots are free for another user...
    now += 60_000;
    await busy.acquire("user-4");
    await busy.acquire("user-4");
    expect(waits).toEqual([]);
    // ...and user-3 still has the whole daily share.
    now += 60_000;
    await busy.acquire("user-3");
    await busy.acquire("user-3");
    await expect(busy.acquire("user-3")).rejects.toThrow(/daily limit of 2/);
  });
});

describe("a reconnect", () => {
  let run: Running;
  const browser = new Browser();
  let userId = "";
  beforeAll(async () => {
    run = await startWeb();
    setBase(run.base);
    expect((await browser.signup("switcher@example.com", PASSWORD)).status).toBe(303);
    userId = run.web.ctx.store.getUserByEmail("switcher@example.com")!.id;
  });
  afterAll(async () => {
    onDeauthorize = undefined;
    await run.stop();
  });

  it("with the same Suunto account keeps it connected at Suunto", async () => {
    setBase(run.base);
    expect((await connectSuunto(browser)).res.headers.get("location")).toBe("/account?m=connected");
    const before = mock.state.deauthorizeCalls;
    expect((await connectSuunto(browser)).res.headers.get("location")).toBe("/account?m=connected");
    expect(mock.state.deauthorizeCalls).toBe(before);
    expect(run.web.ctx.store.getSuuntoSettings(userId)!.username).toBe(MOCK_USERNAME);
  });

  it("with another Suunto account ends the old one at Suunto, after the new one is saved", async () => {
    setBase(run.base);
    // The connection saved now belongs to another Suunto account.
    run.web.ctx.store.saveSuuntoSettings(userId, storedConnection(1_000, "earlier-account"));
    let storedAtDeauthorize: string | undefined;
    onDeauthorize = () => (storedAtDeauthorize = run.web.ctx.store.getSuuntoSettings(userId)?.username);
    const before = mock.state.deauthorizeCalls;
    expect((await connectSuunto(browser)).res.headers.get("location")).toBe("/account?m=connected");
    expect(mock.state.deauthorizeCalls).toBe(before + 1);
    expect(storedAtDeauthorize).toBe(MOCK_USERNAME);
    expect(run.web.ctx.store.getSuuntoSettings(userId)!.username).toBe(MOCK_USERNAME);
    expect(run.logs.join("\n")).toContain("Suunto was asked to end the previous connection");
  });
});

describe("the time zone of a connection", () => {
  let run: Running;
  const browser = new Browser();
  let userId = "";
  beforeAll(async () => {
    run = await startWeb();
    setBase(run.base);
    expect((await browser.signup("zones@example.com", PASSWORD)).status).toBe(303);
    userId = run.web.ctx.store.getUserByEmail("zones@example.com")!.id;
    // No browser time zone: the connection has no zone of its own.
    expect((await connectSuunto(browser, { timeZone: "" })).res.headers.get("location")).toBe("/account?m=connected");
  });
  afterAll(async () => {
    await run.stop();
  });

  const zone = () => run.web.ctx.store.getSuuntoSettings(userId)!.timeZone;
  const save = async (form: Record<string, string>) => {
    const { csrf } = await browser.page("/account");
    expect((await browser.post("/account/suunto/settings", { _csrf: csrf, units: "metric", ...form })).headers.get("location")).toBe("/account?m=saved");
  };

  it("stays the server's default when the user saves other settings", async () => {
    setBase(run.base);
    expect(zone()).toBeUndefined();
    const { html } = await browser.page("/account");
    expect(html).toContain('<option value="" selected>Server default (UTC)</option>');
    await save({ units: "imperial", timeZone: "" });
    expect(zone()).toBeUndefined();
    // The administrator's default then applies to this user too.
    run.web.ctx.store.saveSettings({ ...run.web.ctx.store.getSettings(), defaultTimeZone: "Europe/Zurich" });
    expect(run.web.ctx.pool.get(run.web.ctx.store.getUser(userId)!)!.config.timeZone).toBe("Europe/Zurich");
  });

  it("is the user's own once chosen, and the empty choice goes back to the default", async () => {
    setBase(run.base);
    await save({ timeZone: "Asia/Tokyo" });
    expect(zone()).toBe("Asia/Tokyo");
    expect((await browser.page("/account")).html).toContain('<option value="Asia/Tokyo" selected>');
    // A form without the field keeps it.
    const { csrf } = await browser.page("/account");
    await browser.post("/account/suunto/settings", { _csrf: csrf, units: "metric" });
    expect(zone()).toBe("Asia/Tokyo");
    await save({ timeZone: "" });
    expect(zone()).toBeUndefined();
  });
});

describe("the AI app of a user without a usable Suunto connection", () => {
  it("is not told a made-up time zone or units", async () => {
    const run = await startWeb();
    setBase(run.base);
    try {
      run.web.ctx.store.saveSettings({ ...run.web.ctx.store.getSettings(), defaultTimeZone: "America/New_York" });
      const browser = new Browser();
      expect((await browser.signup("newcomer@example.com", PASSWORD)).status).toBe(303);
      const client = await connectMcp(new TestOAuthClient(browser));
      const instructions = client.getInstructions() ?? "";
      expect(instructions).toContain("America/New_York");
      expect(instructions).toContain("The user's time zone and units are not known until Suunto is connected");
      expect(instructions).not.toContain("Europe/Zurich");
      await client.close();
    } finally {
      await run.stop();
    }
  });

  it("gets the user's own time zone and units when the connection is saved but cannot be used", () => {
    const server = { ...DEFAULT_SETTINGS, defaultTimeZone: "America/New_York" };
    const own = buildSetupConfig(server, { units: "imperial", readOnly: false, timeZone: "Asia/Tokyo" });
    expect(own.timeZone).toBe("Asia/Tokyo");
    expect(own.units).toBe("imperial");
    const none = buildSetupConfig(server);
    expect(none.timeZone).toBe("America/New_York");
    expect(none.units).toBe("metric");
  });
});
