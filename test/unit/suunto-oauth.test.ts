import { describe, expect, it } from "vitest";
import type { SuuntoEndpoints } from "../../src/suunto/endpoints.js";
import { authorizeUrl, callbackError, deauthorize, exchangeCode, refreshTokens, SuuntoAuthError, type OAuthOptions } from "../../src/suunto/oauth.js";
import { UserFacingError } from "../../src/util/errors.js";
import { VERSION } from "../../src/version.js";
import { fakeJwt, jsonResponse, MOCK_USERNAME, refusedError, resetError, scriptedFetch, timeoutError, tokenResponse, type FetchResponder } from "../helpers/mock-suunto.js";

const T0 = 1_800_000_000_000;
const ENDPOINTS: SuuntoEndpoints = { oauthUrl: "https://oauth.test", apiUrl: "https://api.test" };
const KEYS = { clientId: "client-1234", clientSecret: "client-secret-9876" };
const REDIRECT = "https://suunto.mcp.example/suunto/callback";
const CODE = "G5ahWs";

function options(responder: FetchResponder, extra: Partial<OAuthOptions> = {}) {
  const m = scriptedFetch(responder);
  const opts: OAuthOptions = { endpoints: ENDPOINTS, keys: KEYS, fetch: m.fetch, now: () => T0, backoffMs: 0, ...extra };
  return { opts, requests: m.requests };
}

async function authError(p: Promise<unknown>): Promise<SuuntoAuthError> {
  const e = await p.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(e).toBeInstanceOf(SuuntoAuthError);
  expect(e).toBeInstanceOf(UserFacingError);
  return e as SuuntoAuthError;
}

describe("authorizeUrl", () => {
  it("builds Suunto's sign-in URL with encoded parameters", () => {
    const url = new URL(authorizeUrl(ENDPOINTS, "client id/1", REDIRECT, "st+ate/=="));
    expect(`${url.origin}${url.pathname}`).toBe("https://oauth.test/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({ response_type: "code", client_id: "client id/1", redirect_uri: REDIRECT, state: "st+ate/==" });
    expect(new URL(authorizeUrl(ENDPOINTS, "c", REDIRECT, "")).searchParams.has("state")).toBe(false);
  });

  it("maps the error of a callback", () => {
    expect(callbackError("access_denied").code).toBe("denied");
    expect(callbackError("ACCESS_DENIED").message).toMatch(/did not allow access/);
    expect(callbackError("invalid_client").code).toBe("bad_client");
    expect(callbackError("temporarily_unavailable").code).toBe("network");
    expect(callbackError("<script>").code).toBe("unknown");
    expect(callbackError("<script>").message).not.toContain("script");
  });
});

describe("exchangeCode", () => {
  it("posts the code with Basic auth and a form body, and reads the token claims", async () => {
    const access = fakeJwt({ nowMs: T0 });
    const { opts, requests } = options(() => tokenResponse(access, "refresh-1"));
    const result = await exchangeCode(` ${CODE} `, REDIRECT, opts);
    expect(result).toEqual({
      tokens: { refreshToken: "refresh-1", accessToken: access, accessTokenExpiresAt: T0 + 86_400_000, clientId: KEYS.clientId },
      username: MOCK_USERNAME,
      scope: "workout",
    });
    expect(requests).toHaveLength(1);
    const req = requests[0]!;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://oauth.test/oauth/token");
    expect(req.headers.authorization).toBe(`Basic ${Buffer.from(`${KEYS.clientId}:${KEYS.clientSecret}`).toString("base64")}`);
    expect(req.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(req.headers["user-agent"]).toBe(`suunto-mcp/${VERSION}`);
    // No subscription key on OAuth calls (Suunto FAQ).
    expect(req.headers["ocp-apim-subscription-key"]).toBeUndefined();
    expect(Object.fromEntries(new URLSearchParams(req.body))).toEqual({ grant_type: "authorization_code", code: CODE, redirect_uri: REDIRECT });
  });

  it("takes the expiry from exp when present, else from expires_in", async () => {
    // exp says 1 hour, expires_in says 24 hours: the token wins.
    const short = fakeJwt({ nowMs: T0, lifetimeS: 3600 });
    expect((await exchangeCode(CODE, REDIRECT, options(() => tokenResponse(short, "r")).opts)).tokens.accessTokenExpiresAt).toBe(T0 + 3_600_000);
    const noExp = fakeJwt({ nowMs: T0, claims: { exp: undefined } });
    const r2 = await exchangeCode(CODE, REDIRECT, options(() => tokenResponse(noExp, "r", { expires_in: 7200 })).opts);
    expect(r2.tokens.accessTokenExpiresAt).toBe(T0 + 7_200_000);
    // Neither: a careful one hour.
    const r3 = await exchangeCode(CODE, REDIRECT, options(() => tokenResponse(noExp, "r", { expires_in: undefined })).opts);
    expect(r3.tokens.accessTokenExpiresAt).toBe(T0 + 3_600_000);
  });

  it("reads the username from the claims, with fallbacks", async () => {
    const userName = fakeJwt({ nowMs: T0, claims: { user: undefined, user_name: "spring-user" } });
    expect((await exchangeCode(CODE, REDIRECT, options(() => tokenResponse(userName, "r")).opts)).username).toBe("spring-user");
    const sub = fakeJwt({ nowMs: T0, claims: { user: undefined, sub: "sub-user" } });
    expect((await exchangeCode(CODE, REDIRECT, options(() => tokenResponse(sub, "r")).opts)).username).toBe("sub-user");
    // An opaque access token: the "user" field of the answer.
    const opaque = await exchangeCode(CODE, REDIRECT, options(() => tokenResponse("opaque-token", "r", { user: "field-user" })).opts);
    expect(opaque.username).toBe("field-user");
    expect(opaque.tokens.accessTokenExpiresAt).toBe(T0 + 86_400_000);
  });

  it("fails clearly without a username, an access token or a refresh token", async () => {
    const noUser = fakeJwt({ nowMs: T0, claims: { user: undefined } });
    const e1 = await authError(exchangeCode(CODE, REDIRECT, options(() => tokenResponse(noUser, "r")).opts));
    expect(e1.code).toBe("unknown");
    expect(e1.message).toMatch(/without a Suunto username/);
    const e2 = await authError(exchangeCode(CODE, REDIRECT, options(() => jsonResponse({ refresh_token: "r" })).opts));
    expect(e2.message).toMatch(/without an access token/);
    const e3 = await authError(exchangeCode(CODE, REDIRECT, options(() => tokenResponse(fakeJwt({ nowMs: T0 }))).opts));
    expect(e3.message).toMatch(/without a refresh token/);
  });

  it("maps refused codes to invalid_grant and never shows the code", async () => {
    const { opts } = options(() => jsonResponse({ error: "invalid_grant", error_description: `Invalid authorization code: ${CODE}` }, 400));
    const e = await authError(exchangeCode(CODE, REDIRECT, opts));
    expect(e.code).toBe("invalid_grant");
    expect(e.status).toBe(400);
    expect(e.message).not.toContain(CODE);
    expect(e.message).toMatch(/Start again with Connect Suunto/);
    expect((await authError(exchangeCode("", REDIRECT, opts))).code).toBe("invalid_grant");
  });

  it("maps a refused client to bad_client", async () => {
    const e1 = await authError(exchangeCode(CODE, REDIRECT, options(() => jsonResponse({ error: "invalid_client", error_description: "Bad client credentials" }, 401)).opts));
    expect(e1.code).toBe("bad_client");
    expect(e1.message).toMatch(/SUUNTO_CLIENT_ID and SUUNTO_CLIENT_SECRET/);
    expect(e1.message).not.toContain(KEYS.clientSecret);
    // A 401 without a body on the token endpoint is the same.
    expect((await authError(exchangeCode(CODE, REDIRECT, options(() => new Response("", { status: 401 })).opts))).code).toBe("bad_client");
    expect((await authError(exchangeCode(CODE, REDIRECT, options(() => jsonResponse({ error: "unauthorized", error_description: "Bad credentials" }, 401)).opts))).code).toBe("bad_client");
  });

  it("maps other answers: denied, network, unknown", async () => {
    expect((await authError(exchangeCode(CODE, REDIRECT, options(() => jsonResponse({ error: "access_denied" }, 400)).opts))).code).toBe("denied");
    expect((await authError(exchangeCode(CODE, REDIRECT, options(() => new Response("Forbidden", { status: 403 })).opts))).code).toBe("denied");
    expect((await authError(exchangeCode(CODE, REDIRECT, options(() => new Response("busy", { status: 503 })).opts))).code).toBe("network");
    expect((await authError(exchangeCode(CODE, REDIRECT, options(() => new Response("", { status: 429 })).opts))).code).toBe("network");
    // A named protocol error is about the request, not about the user's grant.
    const bad = await authError(exchangeCode(CODE, REDIRECT, options(() => jsonResponse({ error: "unsupported_grant_type" }, 400)).opts));
    expect(bad.code).toBe("unknown");
    expect((await authError(exchangeCode(CODE, REDIRECT, options(() => new Response("", { status: 302 })).opts))).code).toBe("unknown");
  });

  it("never sends a code twice, even when the connection never opened", async () => {
    const { opts, requests } = options(() => {
      throw refusedError();
    });
    const e = await authError(exchangeCode(CODE, REDIRECT, opts));
    expect(e.code).toBe("network");
    expect(e.message).toMatch(/Could not reach Suunto/);
    expect(requests).toHaveLength(1);
    const t = await authError(exchangeCode(CODE, REDIRECT, options(() => Promise.reject(timeoutError())).opts));
    expect(t.code).toBe("network");
    expect(t.message).toMatch(/did not answer the sign-in within 20 s/);
  });
});

describe("refreshTokens", () => {
  it("keeps a rotated refresh token", async () => {
    const access = fakeJwt({ nowMs: T0 });
    const { opts, requests } = options(() => tokenResponse(access, "refresh-2"));
    const result = await refreshTokens("refresh-1", opts);
    expect(result.tokens).toEqual({ refreshToken: "refresh-2", accessToken: access, accessTokenExpiresAt: T0 + 86_400_000, clientId: KEYS.clientId });
    expect(result.username).toBe(MOCK_USERNAME);
    expect(Object.fromEntries(new URLSearchParams(requests[0]!.body))).toEqual({ grant_type: "refresh_token", refresh_token: "refresh-1" });
  });

  it("keeps the old refresh token when the answer has none", async () => {
    const { opts } = options(() => tokenResponse(fakeJwt({ nowMs: T0 })));
    expect((await refreshTokens("refresh-1", opts)).tokens.refreshToken).toBe("refresh-1");
  });

  it("maps a refused refresh token to invalid_grant, without the token in the message", async () => {
    const refresh = fakeJwt({ nowMs: T0, claims: { ati: "x" } });
    for (const answer of [
      () => jsonResponse({ error: "invalid_grant", error_description: `Invalid refresh token: ${refresh}` }, 400),
      () => jsonResponse({ error: "invalid_token", error_description: "Cannot convert access token to JSON" }, 401),
      () => new Response("", { status: 400 }),
    ]) {
      const e = await authError(refreshTokens(refresh, options(answer).opts));
      expect(e.code).toBe("invalid_grant");
      expect(e.message).toBe("Your Suunto connection expired. Connect Suunto again.");
    }
    expect((await authError(refreshTokens(" ", options(() => jsonResponse({})).opts))).code).toBe("invalid_grant");
  });

  it("tries again only when the connection never opened", async () => {
    let n = 0;
    const { opts, requests } = options(() => {
      if (++n < 3) throw refusedError();
      return tokenResponse(fakeJwt({ nowMs: T0 }), "r2");
    });
    expect((await refreshTokens("r1", opts)).tokens.refreshToken).toBe("r2");
    expect(requests).toHaveLength(3);
    // A broken connection may have reached Suunto (and rotated the token): no second try.
    const broken = options(() => {
      throw resetError();
    });
    expect((await authError(refreshTokens("r1", broken.opts))).code).toBe("network");
    expect(broken.requests).toHaveLength(1);
  });
});

describe("deauthorize", () => {
  it("sends the access token as Bearer with the client id", async () => {
    const { opts, requests } = options(() => new Response("", { status: 200 }));
    await deauthorize("access-token-1", opts);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://oauth.test/oauth/deauthorize?client_id=client-1234");
    expect(requests[0]!.headers.authorization).toBe("Bearer access-token-1");
  });

  it("throws a SuuntoAuthError when Suunto does not confirm", async () => {
    expect((await authError(deauthorize("t", options(() => new Response("", { status: 401 })).opts))).code).toBe("invalid_grant");
    expect((await authError(deauthorize("t", options(() => new Response("", { status: 500 })).opts))).code).toBe("network");
    expect((await authError(deauthorize("t", options(() => new Response("", { status: 400 })).opts))).code).toBe("unknown");
    const net = await authError(
      deauthorize(
        "t",
        options(() => {
          throw refusedError();
        }).opts,
      ),
    );
    expect(net.code).toBe("network");
  });
});
