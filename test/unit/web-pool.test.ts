/**
 * The service pool keeps one Suunto session per user and connection. When the user connects
 * Suunto again, a session of the older connection can still be running (a tool call in flight).
 * It must never write over the new connection: neither tokens it got from Suunto nor a "needs
 * reconnect" mark when its own refresh token stops working. Suunto is the in-process mock:
 * nothing is ever sent to Suunto.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActivityBackend, ListWorkoutsQuery } from "../../src/activity/types.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import type { SuuntoAccountSettings } from "../../src/web/store.js";
import { MOCK_CLIENT_ID, MOCK_USERNAME, startMockSuunto, type MockSuunto } from "../helpers/mock-suunto.js";
import { Browser, connectSuunto, setBase } from "../helpers/web-client.js";

const PASSWORD = "correct horse battery";

let mock: MockSuunto;
let web: WebApp;
let server: Server;
const athlete = new Browser();
let userId = "";

/** While set, every token refresh sent to Suunto waits until it is released. */
let gate: { held: () => void; released: Promise<void> } | undefined;

/** A token refresh (POST /oauth/token with grant_type=refresh_token), not a code exchange. */
function isRefresh(input: string | URL | Request, init?: RequestInit): boolean {
  const url = input instanceof Request ? input.url : String(input);
  return url.endsWith("/oauth/token") && String(init?.body ?? "").includes("grant_type=refresh_token");
}

const suuntoFetch: typeof fetch = async (input, init) => {
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

const store = () => web.ctx.store;
const user = () => store().getUser(userId)!;
/** The backend of the user's current pool entry. */
const backend = (): ActivityBackend => web.ctx.pool.get(user())!.services.backend!;

/** A workout list query that no earlier call used (the pool caches answers for 2 minutes). */
let page = 0;
const fresh = (): ListWorkoutsQuery => ({ limit: 1, offset: page++, byModificationTime: false });

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  mock = await startMockSuunto();
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    operator: { SUUNTO_OAUTH_URL: mock.oauthUrl, SUUNTO_API_URL: mock.apiUrl },
    suuntoKeys: mock.keys,
    suuntoFetch,
    // Many Suunto calls in a minute: no call limits.
    callLimits: { perMinute: 0, perUserPerDay: 0 },
    log: () => {},
  });
  server.on("request", web.app);
  expect((await athlete.signup("athlete@example.com", PASSWORD)).status).toBe(303);
  userId = store().getUserByEmail("athlete@example.com")!.id;
});

afterAll(async () => {
  gate = undefined;
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
  await mock.close();
});

/** "Connect Suunto" on the account page. */
async function connect(): Promise<SuuntoAccountSettings> {
  const run = await connectSuunto(athlete);
  expect(run.res.headers.get("location")).toBe("/account?m=connected");
  return store().getSuuntoSettings(userId)!;
}

/** A stored connection with live tokens of the mock (no OAuth dance). */
function storedConnection(connectedAt: number): SuuntoAccountSettings {
  return { username: MOCK_USERNAME, ...mock.issueTokens(), clientId: MOCK_CLIENT_ID, units: "metric", readOnly: false, connectedAt };
}

describe("a session of an older Suunto connection", () => {
  it("does not mark a new connection for reconnect when its own refresh fails", async () => {
    const first = await connect();
    const old = backend();
    await old.listWorkouts(fresh());
    // Suunto ends the first connection, while a tool call is about to refresh it.
    mock.revokeAll();
    const hold = holdRefreshes();
    const inFlight = old.listWorkouts(fresh()).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    await hold.held;
    // Meanwhile the user connects Suunto again on the account page.
    await new Promise((r) => setTimeout(r, 5));
    const second = await connect();
    expect(second.connectedAt).not.toBe(first.connectedAt);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    hold.release();
    // The old call fails, but the new connection is not touched.
    expect((await inFlight)?.message).toMatch(/connection expired/i);
    expect(user().suuntoNeedsReconnect).toBe(false);
    expect(store().getSuuntoSettings(userId)).toEqual(second);
    // The new connection works, and the account page says so.
    expect((await backend().listWorkouts(fresh())).payload).toHaveLength(1);
    expect((await athlete.page("/account")).html).not.toContain("Suunto refused your saved connection");
  });

  it("does mark its own connection when its refresh token stops working, and keeps the tokens", async () => {
    const current = store().getSuuntoSettings(userId)!;
    await backend().listWorkouts(fresh());
    mock.revokeAll();
    await expect(backend().listWorkouts(fresh())).rejects.toThrow(/connection expired/i);
    expect(user().suuntoNeedsReconnect).toBe(true);
    // Suunto has refused tokens by mistake: they are kept for a later try.
    expect(store().getSuuntoSettings(userId)).toEqual(current);
    await connect();
    expect(user().suuntoNeedsReconnect).toBe(false);
  });

  it("clears the mark when a refresh works again, without blocking calls", async () => {
    store().saveSuuntoSettings(userId, storedConnection(500));
    store().setSuuntoNeedsReconnect(userId, true);
    // The mark does not stop a call: the access token expires, the refresh works, the mark goes.
    mock.expireAccessTokens();
    expect((await backend().listWorkouts(fresh())).payload).toHaveLength(1);
    expect(user().suuntoNeedsReconnect).toBe(false);
    expect(store().getSuuntoSettings(userId)!.connectedAt).toBe(500);
  });

  it("does not save tokens from Suunto over a new connection", async () => {
    store().saveSuuntoSettings(userId, storedConnection(1_000));
    const old = backend();
    await old.listWorkouts(fresh());
    // The user connects again; then the old session refreshes and Suunto rotates its token.
    const second = storedConnection(2_000);
    store().saveSuuntoSettings(userId, second);
    mock.expireAccessTokens();
    const refreshes = mock.count("/oauth/token");
    await old.listWorkouts(fresh());
    expect(mock.count("/oauth/token") - refreshes).toBe(1);
    expect(store().getSuuntoSettings(userId)).toEqual(second);
    // The current connection's own rotated token is kept.
    await backend().listWorkouts(fresh());
    const kept = store().getSuuntoSettings(userId)!;
    expect(kept.connectedAt).toBe(2_000);
    expect(kept.refreshToken).not.toBe(second.refreshToken);
    expect(kept.accessToken).not.toBe(second.accessToken);
    expect(user().suuntoNeedsReconnect).toBe(false);
  });

  it("gives real users no services without the operator's app keys, and demo accounts still work", async () => {
    const { ServicePool } = await import("../../src/web/accounts.js");
    const pool = new ServicePool(store(), { operator: {}, demo: web.ctx.demo });
    try {
      expect(pool.configured).toBe(false);
      expect(pool.get(user())).toBeUndefined();
      const demo = store().createDemoUser("demo-pool@example.com", "x");
      expect(pool.get(demo)?.services.backend?.kind).toBe("demo");
    } finally {
      await pool.closeAll();
    }
  });
});
