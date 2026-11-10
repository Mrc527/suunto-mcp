import { describe, expect, it } from "vitest";
import type { SuuntoEndpoints } from "../../src/suunto/endpoints.js";
import { INVALID_GRANT_COOLDOWN_MS, REFRESH_MARGIN_MS, SuuntoAuthError, SuuntoSession, type StoredSuuntoTokens, type SuuntoSessionOptions, type TokenSink } from "../../src/suunto/session.js";
import { UserFacingError } from "../../src/util/errors.js";
import { fakeJwt, jsonResponse, MOCK_USERNAME, refusedError, scriptedFetch, tokenResponse, type FetchResponder } from "../helpers/mock-suunto.js";

const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
const ENDPOINTS: SuuntoEndpoints = { oauthUrl: "https://oauth.test", apiUrl: "https://api.test" };
const KEYS = { clientId: "client-1", clientSecret: "secret-1", subscriptionKey: "key-1" };

function recordingSink(): TokenSink & { saved: StoredSuuntoTokens[]; invalidated: string[] } {
  const saved: StoredSuuntoTokens[] = [];
  const invalidated: string[] = [];
  return { saved, invalidated, save: (t) => void saved.push(t), invalid: (r) => void invalidated.push(r) };
}

function session(responder: FetchResponder, opts: Partial<SuuntoSessionOptions> & { clock?: { now: number } } = {}) {
  const m = scriptedFetch(responder);
  const clock = opts.clock ?? { now: T0 };
  const sink = recordingSink();
  const s = new SuuntoSession({
    tokens: { refreshToken: "refresh-0", clientId: KEYS.clientId },
    keys: KEYS,
    endpoints: ENDPOINTS,
    fetch: m.fetch,
    sink,
    backoffMs: 0,
    now: () => clock.now,
    ...opts,
  });
  return { s, sink, requests: m.requests, clock };
}

/** The refresh token sent in a token request. */
const sentRefresh = (body: string) => new URLSearchParams(body).get("refresh_token");

describe("SuuntoSession", () => {
  it("uses a stored access token that is still valid, without a request", async () => {
    const token = fakeJwt({ nowMs: T0 });
    const { s, requests } = session(
      () => {
        throw new Error("no request expected");
      },
      { tokens: { refreshToken: "r", accessToken: token, accessTokenExpiresAt: T0 + DAY, clientId: "client-1" } },
    );
    expect(await s.accessToken()).toBe(token);
    expect(await s.username()).toBe(MOCK_USERNAME);
    expect(s.tokenExpiresAt).toBe(T0 + DAY);
    expect(requests).toHaveLength(0);
    // Without a stored expiry, the token's own exp is used.
    const { s: s2, requests: r2 } = session(() => jsonResponse({}), { tokens: { refreshToken: "r", accessToken: token, clientId: "client-1" } });
    expect(await s2.accessToken()).toBe(token);
    expect(s2.tokenExpiresAt).toBe(T0 + DAY);
    expect(r2).toHaveLength(0);
  });

  it("refreshes when no access token is known and saves the new tokens", async () => {
    const access = fakeJwt({ nowMs: T0 });
    const { s, sink, requests } = session(() => tokenResponse(access, "refresh-1"));
    expect(await s.accessToken()).toBe(access);
    expect(sentRefresh(requests[0]!.body)).toBe("refresh-0");
    expect(sink.saved).toEqual([{ refreshToken: "refresh-1", accessToken: access, accessTokenExpiresAt: T0 + DAY, clientId: "client-1" }]);
    expect(s.storedTokens).toEqual(sink.saved[0]);
    expect(await s.username()).toBe(MOCK_USERNAME);
    expect(requests).toHaveLength(1);
  });

  it("refreshes when less than 5 minutes are left, and always sends the newest refresh token", async () => {
    let n = 0;
    const { s, sink, requests, clock } = session(() => tokenResponse(fakeJwt({ nowMs: clock.now, claims: { n: ++n } }), `refresh-${n}`));
    await s.accessToken();
    clock.now = T0 + DAY - REFRESH_MARGIN_MS - 1000;
    await s.accessToken();
    expect(requests).toHaveLength(1);
    clock.now += 2000;
    await s.accessToken();
    expect(requests).toHaveLength(2);
    expect(requests.map((r) => sentRefresh(r.body))).toEqual(["refresh-0", "refresh-1"]);
    expect(sink.saved.map((t) => t.refreshToken)).toEqual(["refresh-1", "refresh-2"]);
  });

  it("keeps a refresh token that was not rotated", async () => {
    const { s, sink } = session(() => tokenResponse(fakeJwt({ nowMs: T0 })));
    await s.accessToken();
    expect(sink.saved[0]!.refreshToken).toBe("refresh-0");
  });

  it("keeps a just-renewed short-lived token instead of refreshing on every call", async () => {
    const { s, requests, clock } = session(() => tokenResponse(fakeJwt({ nowMs: clock.now, lifetimeS: 120 }), "r"));
    const a = await s.accessToken();
    clock.now += 10_000;
    expect(await s.accessToken()).toBe(a);
    expect(requests).toHaveLength(1);
    clock.now += 30_000;
    await s.accessToken();
    expect(requests).toHaveLength(2);
  });

  it("shares one refresh between concurrent callers", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { s, requests, sink } = session(async () => {
      await gate;
      return tokenResponse(fakeJwt({ nowMs: T0 }), "refresh-1");
    });
    const all = Promise.all([s.accessToken(), s.accessToken(), s.username(), s.refreshNow()]);
    release();
    const [a, b, name, d] = await all;
    expect(a).toBe(b);
    expect(a).toBe(d);
    expect(name).toBe(MOCK_USERNAME);
    expect(requests).toHaveLength(1);
    expect(sink.saved).toHaveLength(1);
  });

  it("refreshNow skips the refresh when another caller already replaced the refused token", async () => {
    let n = 0;
    const { s, requests } = session(() => tokenResponse(fakeJwt({ nowMs: T0, claims: { n: ++n } }), `refresh-${n}`));
    const first = await s.accessToken();
    const second = await s.refreshNow(first);
    expect(second).not.toBe(first);
    expect(await s.refreshNow(first)).toBe(second);
    expect(requests).toHaveLength(2);
  });

  it("marks the connection invalid on invalid_grant and stops asking Suunto during the cool-down", async () => {
    let refuse = true;
    const { s, sink, requests, clock } = session(
      () => (refuse ? jsonResponse({ error: "invalid_grant", error_description: "Invalid refresh token: refresh-0" }, 400) : tokenResponse(fakeJwt({ nowMs: clock.now }), "refresh-9")),
      { connectAgain: "Connect Suunto again at https://suunto.mcp.example/account." },
    );
    const e = await s.accessToken().catch((error: unknown) => error);
    expect(e).toBeInstanceOf(SuuntoAuthError);
    expect(e).toBeInstanceOf(UserFacingError);
    expect((e as SuuntoAuthError).code).toBe("invalid_grant");
    expect((e as Error).message).toBe("Your Suunto connection expired. Connect Suunto again at https://suunto.mcp.example/account.");
    expect((e as Error).message).not.toContain("refresh-0");
    expect(sink.invalidated).toHaveLength(1);
    expect(s.expired).toBe(true);
    // Every call fails at once, without a request.
    await expect(s.accessToken()).rejects.toThrow(/connection expired/);
    await expect(s.refreshNow()).rejects.toThrow(/connection expired/);
    await expect(s.username()).rejects.toThrow(/connection expired/);
    await s.deauthorize();
    expect(requests).toHaveLength(1);
    expect(sink.invalidated).toHaveLength(1);

    // After the cool-down the same refresh token is tried once more (Suunto has sent false invalid_grant answers).
    clock.now += INVALID_GRANT_COOLDOWN_MS;
    await expect(s.accessToken()).rejects.toThrow(/connection expired/);
    expect(requests).toHaveLength(2);
    expect(sink.invalidated).toHaveLength(2);
    clock.now += INVALID_GRANT_COOLDOWN_MS;
    refuse = false;
    expect(await s.accessToken()).toMatch(/^eyJ/);
    expect(s.expired).toBe(false);
    expect(sink.saved.map((t) => t.refreshToken)).toEqual(["refresh-9"]);
    expect(requests.map((r) => sentRefresh(r.body))).toEqual(["refresh-0", "refresh-0", "refresh-0"]);
  });

  it("keeps trying after a network problem (it is not the user's fault)", async () => {
    let fail = true;
    const { s, sink } = session(() => (fail ? new Response("down", { status: 503 }) : tokenResponse(fakeJwt({ nowMs: T0 }), "r2")));
    const e = (await s.accessToken().catch((error: unknown) => error)) as SuuntoAuthError;
    expect(e.code).toBe("network");
    expect(sink.invalidated).toEqual([]);
    fail = false;
    expect(await s.accessToken()).toMatch(/^eyJ/);
  });

  it("keeps using the old access token while it works and the refresh fails for network reasons", async () => {
    const old = fakeJwt({ nowMs: T0 - DAY + 60_000 });
    const { s, requests } = session(
      () => {
        throw refusedError();
      },
      { tokens: { refreshToken: "r", accessToken: old, clientId: "client-1" } },
    );
    // One minute left: a refresh is due, but Suunto's sign-in cannot be reached.
    expect(await s.accessToken()).toBe(old);
    expect(requests.length).toBeGreaterThan(0);
    // After a 401, the old token is of no use: the error comes through.
    await expect(s.refreshNow(old)).rejects.toThrow(/Could not reach Suunto/);
  });

  it("survives a sink that throws", async () => {
    const m = scriptedFetch(() => tokenResponse(fakeJwt({ nowMs: T0 }), "r2"));
    const s = new SuuntoSession({
      tokens: { refreshToken: "r", clientId: "client-1" },
      keys: KEYS,
      endpoints: ENDPOINTS,
      fetch: m.fetch,
      now: () => T0,
      sink: {
        save: () => {
          throw new Error("disk full");
        },
        invalid: () => {
          throw new Error("disk full");
        },
      },
    });
    expect(await s.accessToken()).toMatch(/^eyJ/);
    expect(s.storedTokens.refreshToken).toBe("r2");
  });

  it("deauthorizes with the current token, best effort", async () => {
    const token = fakeJwt({ nowMs: T0 });
    const stored = { refreshToken: "r", accessToken: token, accessTokenExpiresAt: T0 + DAY, clientId: "client-1" };
    const ok = session(() => new Response("", { status: 200 }), { tokens: stored });
    await ok.s.deauthorize();
    expect(ok.requests).toHaveLength(1);
    expect(ok.requests[0]!.url).toBe("https://oauth.test/oauth/deauthorize?client_id=client-1");
    expect(ok.requests[0]!.headers.authorization).toBe(`Bearer ${token}`);
    // Errors never come out.
    await expect(session(() => new Response("", { status: 500 }), { tokens: stored }).s.deauthorize()).resolves.toBeUndefined();
    await expect(
      session(
        () => {
          throw refusedError();
        },
        { tokens: stored },
      ).s.deauthorize(),
    ).resolves.toBeUndefined();
    // Without a usable access token it refreshes first.
    const fresh = session((req) => (req.url.endsWith("/oauth/token") ? tokenResponse(fakeJwt({ nowMs: T0 }), "r2") : new Response("", { status: 200 })));
    await fresh.s.deauthorize();
    expect(fresh.requests.map((r) => new URL(r.url).pathname)).toEqual(["/oauth/token", "/oauth/deauthorize"]);
  });
});
