/**
 * The service pool keeps one PADI session per user and connection. When the user signs in to
 * PADI again, a session of the older connection can still be running (a tool call in flight).
 * It must never write over the new connection: neither a refresh token it got from PADI nor a
 * "needs reconnect" mark when its own refresh token stops working. PADI is the in-process mock:
 * nothing is ever sent to PADI.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signIn } from "../../src/padi/auth.js";
import { endpointsFromEnv } from "../../src/padi/endpoints.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import type { PadiAccountSettings } from "../../src/web/store.js";
import { MOCK_ACCOUNT, startMockPadi, type MockPadi } from "../helpers/mock-padi.js";
import { Browser, setBase } from "../helpers/web-client.js";

const PASSWORD = "correct horse battery";

let mock: MockPadi;
let web: WebApp;
let server: Server;
const diver = new Browser();
let userId = "";

/** While set, every token refresh sent to PADI waits until it is released. */
let gate: { held: () => void; released: Promise<void> } | undefined;

/** A token refresh (Cognito REFRESH_TOKEN_AUTH or the PADI auth API's /oauth/refresh). */
function isRefresh(input: string | URL | Request, init?: RequestInit): boolean {
  const url = input instanceof Request ? input.url : String(input);
  return url.endsWith("/oauth/refresh") || (typeof init?.body === "string" && init.body.includes('"REFRESH_TOKEN_AUTH"'));
}

const padiFetch: typeof fetch = async (input, init) => {
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
/** The logbook of the user's current pool entry. */
const logbook = () => web.ctx.pool.get(user())!.services.logbook!;

beforeAll(async () => {
  mock = await startMockPadi();
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    operator: mock.env(),
    padiFetch,
    log: () => {},
  });
  server.on("request", web.app);
  expect((await diver.signup("diver@example.com", PASSWORD)).status).toBe(303);
  userId = store().getUserByEmail("diver@example.com")!.id;
});

afterAll(async () => {
  gate = undefined;
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
  await mock.close();
});

/** "Save and test" on the account page. */
async function connect(): Promise<PadiAccountSettings> {
  const { csrf } = await diver.page("/account");
  const res = await diver.post("/account/padi", { _csrf: csrf, email: MOCK_ACCOUNT.email, password: MOCK_ACCOUNT.password });
  expect(res.headers.get("location")).toBe("/account?m=connected");
  return store().getPadiSettings(userId)!;
}

describe("a session of an older PADI connection", () => {
  it("does not mark a new connection for reconnect when its own refresh fails", async () => {
    const first = await connect();
    const old = web.ctx.pool.get(user())!.services.logbook!;
    await old.listDives({ limit: 1 });
    // The first connection's sign-in ends at PADI, while a tool call is about to refresh it.
    mock.expireIdTokens();
    mock.revokeRefreshTokens();
    const hold = holdRefreshes();
    const inFlight = old.listDives({ limit: 1 }).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    await hold.held;
    // Meanwhile the user signs in to PADI again on the account page.
    await new Promise((r) => setTimeout(r, 5));
    const second = await connect();
    expect(second.connectedAt).not.toBe(first.connectedAt);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    hold.release();
    // The old call fails, but the new connection is not touched.
    expect((await inFlight)?.message).toMatch(/sign-in expired/i);
    expect(user().padiNeedsReconnect).toBe(false);
    expect(store().getPadiSettings(userId)).toEqual(second);
    // The new connection works, and the account page says so.
    expect((await logbook().listDives({ limit: 1 })).total).toBe(mock.account.store.sorted().length);
    expect((await diver.page("/account")).html).not.toContain("sign-in expired");
  });

  it("does mark its own connection when its refresh token stops working", async () => {
    const current = store().getPadiSettings(userId)!;
    await logbook().listDives({ limit: 1 });
    mock.expireIdTokens();
    mock.revokeRefreshTokens();
    await expect(logbook().listDives({ limit: 1 })).rejects.toThrow(/sign-in expired/i);
    expect(user().padiNeedsReconnect).toBe(true);
    expect(store().getPadiSettings(userId)).toEqual(current);
    await connect();
    expect(user().padiNeedsReconnect).toBe(false);
  });

  it("does not save a refresh token from PADI over a new connection", async () => {
    // Signed in through the PADI auth API, whose refresh hands out a new refresh token.
    const endpoints = endpointsFromEnv(mock.env());
    const signInPadi = async (connectedAt: number): Promise<PadiAccountSettings> => {
      const r = await signIn(MOCK_ACCOUNT.email, MOCK_ACCOUNT.password, { method: "padi", endpoints, backoffMs: 0 });
      return {
        email: MOCK_ACCOUNT.email,
        refreshToken: r.tokens.refreshToken,
        loginMethod: "padi",
        clientId: r.tokens.clientId,
        affiliateId: r.claims.affiliateId,
        units: "auto",
        readOnly: false,
        connectedAt,
      };
    };
    store().savePadiSettings(userId, await signInPadi(1_000));
    const old = logbook();
    await old.listDives({ limit: 1 });
    // The user connects again; then the old session refreshes and PADI rotates its token.
    const second = await signInPadi(2_000);
    store().savePadiSettings(userId, second);
    mock.expireIdTokens();
    mock.rotateRefreshTokens = true;
    try {
      await old.listDives({ limit: 1 });
      expect(store().getPadiSettings(userId)).toEqual(second);
      // The current connection's own rotated token is kept.
      await logbook().listDives({ limit: 1 });
      const kept = store().getPadiSettings(userId)!;
      expect(kept.connectedAt).toBe(2_000);
      expect(kept.refreshToken).not.toBe(second.refreshToken);
    } finally {
      mock.rotateRefreshTokens = false;
    }
    expect(user().padiNeedsReconnect).toBe(false);
  });
});
