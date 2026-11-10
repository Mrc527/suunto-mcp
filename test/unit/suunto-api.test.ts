import { afterEach, describe, expect, it } from "vitest";
import type { WirePoiInput } from "../../src/activity/types.js";
import { SuuntoApi, type SuuntoApiOptions } from "../../src/suunto/api.js";
import type { SuuntoEndpoints } from "../../src/suunto/endpoints.js";
import { formatWait, quotaWaitMs, SuuntoHttpError } from "../../src/suunto/http.js";
import { authorizeUrl, exchangeCode } from "../../src/suunto/oauth.js";
import { SuuntoSession, type StoredSuuntoTokens, type TokenSink } from "../../src/suunto/session.js";
import { NotFoundError, UnconfirmedWriteError, UserFacingError } from "../../src/util/errors.js";
import { VERSION } from "../../src/version.js";
import {
  fakeJwt,
  fitCrc,
  jsonResponse,
  MOCK_USERNAME,
  refusedError,
  resetError,
  scriptedFetch,
  startMockSuunto,
  timeoutError,
  tokenResponse,
  type FetchResponder,
  type MockSuunto,
  type RecordedFetch,
} from "../helpers/mock-suunto.js";

const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
const ENDPOINTS: SuuntoEndpoints = { oauthUrl: "https://oauth.test", apiUrl: "https://api.test" };
const KEYS = { clientId: "client-1", clientSecret: "client-secret-value", subscriptionKey: "subscription-key-value" };
const KEY = "5b190f5c52ce7b316acbd520";

function recordingSink(): TokenSink & { saved: StoredSuuntoTokens[]; invalidated: string[] } {
  const saved: StoredSuuntoTokens[] = [];
  const invalidated: string[] = [];
  return { saved, invalidated, save: (t) => void saved.push(t), invalid: (r) => void invalidated.push(r) };
}

const isToken = (r: RecordedFetch) => r.url.startsWith(ENDPOINTS.oauthUrl);
const dataCalls = (requests: RecordedFetch[]) => requests.filter((r) => !isToken(r));

/** A SuuntoApi with a valid stored access token; token requests get a fresh token. */
function api(responder: FetchResponder, extra: Partial<SuuntoApiOptions> = {}) {
  const access = fakeJwt({ nowMs: T0, claims: { n: 0 } });
  let n = 0;
  const m = scriptedFetch((req, i) => (isToken(req) ? tokenResponse(fakeJwt({ nowMs: T0, claims: { n: ++n } }), `refresh-${n}`) : responder(req, i)));
  const sink = recordingSink();
  const session = new SuuntoSession({
    tokens: { refreshToken: "refresh-0", accessToken: access, accessTokenExpiresAt: T0 + DAY, clientId: KEYS.clientId },
    keys: KEYS,
    endpoints: ENDPOINTS,
    fetch: m.fetch,
    sink,
    backoffMs: 0,
    now: () => T0 + 1000,
  });
  const waits: number[] = [];
  const a = new SuuntoApi({
    session,
    keys: KEYS,
    endpoints: ENDPOINTS,
    fetch: m.fetch,
    backoffMs: 0,
    sleep: async (ms) => void waits.push(ms),
    ...extra,
  });
  return { api: a, requests: m.requests, sink, session, access, waits };
}

async function failure(p: Promise<unknown>): Promise<Error> {
  const e = await p.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(e).toBeInstanceOf(UserFacingError);
  return e as Error;
}

const query = (r: RecordedFetch) => Object.fromEntries(new URL(r.url).searchParams);

describe("SuuntoApi requests", () => {
  it("sends the bearer token, the subscription key, Accept and the User-Agent", async () => {
    const { api: a, requests, access } = api(() => jsonResponse({ error: null, payload: [{ workoutKey: KEY }], metadata: { workoutcount: "1" } }));
    const list = await a.listWorkouts({ since: 1000, until: 2000, limit: 10, offset: 20, byModificationTime: false });
    expect(list).toEqual({ error: null, payload: [{ workoutKey: KEY }], metadata: { workoutcount: "1" } });
    const req = requests[0]!;
    expect(req.method).toBe("GET");
    expect(req.url.split("?")[0]).toBe("https://api.test/v3/workouts");
    expect(query(req)).toEqual({ since: "1000", until: "2000", limit: "10", offset: "20", "filter-by-modification-time": "false" });
    expect(req.headers.authorization).toBe(`Bearer ${access}`);
    expect(req.headers["ocp-apim-subscription-key"]).toBe(KEYS.subscriptionKey);
    expect(req.headers.accept).toBe("application/json");
    expect(req.headers["user-agent"]).toBe(`suunto-mcp/${VERSION}`);
    expect(req.body).toBe("");
    // since and until are left out when not given.
    await a.listWorkouts({ limit: 1, offset: 0, byModificationTime: true });
    expect(query(requests[1]!)).toEqual({ limit: "1", offset: "0", "filter-by-modification-time": "true" });
  });

  it("gets one workout with the extensions joined by commas, and returns the payload", async () => {
    const { api: a, requests } = api(() => jsonResponse({ error: null, payload: { workoutKey: KEY, activityId: 1 }, metadata: {} }));
    expect(await a.getWorkout(KEY, ["SummaryExtension", "HeartrateStreamExtension", "bad name"])).toEqual({ workoutKey: KEY, activityId: 1 });
    expect(requests[0]!.url).toBe(`https://api.test/v3/workouts/${KEY}?extensions=SummaryExtension,HeartrateStreamExtension`);
    await a.getWorkout("a/b?c", []);
    expect(requests[1]!.url).toBe("https://api.test/v3/workouts/a%2Fb%3Fc");
    await expect(a.getWorkout("..", [])).rejects.toBeInstanceOf(UserFacingError);
    expect(requests).toHaveLength(2);
  });

  it("turns an envelope with an error into an error (redacted)", async () => {
    const secret = fakeJwt({ nowMs: T0 });
    const { api: a } = api(() => jsonResponse({ error: { code: "E42", description: `Something broke for ${secret}` }, payload: null }));
    const e = await failure(a.getWorkout(KEY, []));
    expect(e).toBeInstanceOf(SuuntoHttpError);
    expect((e as SuuntoHttpError).kind).toBe("api");
    expect(e.message).toContain("Something broke for ***");
    expect(e.message).toContain("E42");
    await expect(a.listWorkouts({ limit: 1, offset: 0, byModificationTime: false })).rejects.toThrow(/workout list with an error/);
    const empty = api(() => jsonResponse({ error: null, payload: null }));
    await expect(empty.api.getWorkout(KEY, [])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("exports a FIT file as bytes", async () => {
    const bytes = Buffer.from([14, 0x20, 1, 2, 3]);
    const { api: a, requests } = api(() => new Response(bytes, { status: 200, headers: { "content-type": "application/octet-stream" } }));
    expect((await a.exportFit(KEY)).equals(bytes)).toBe(true);
    expect(requests[0]!.url).toBe(`https://api.test/v3/workouts/${KEY}/fit`);
    expect(requests[0]!.headers.accept).toBe("application/octet-stream");
  });

  it("reads 24/7 samples with epoch ms and Content-Type: application/json", async () => {
    const sample = { timestamp: "2026-11-01T12:00:00Z", entryData: { HR: 72 } };
    const { api: a, requests } = api(() => jsonResponse([sample, { timestamp: 5 }, "junk", { timestamp: "x" }]));
    expect(await a.activitySamples(1000.7, 2000.2)).toEqual([sample]);
    expect(requests[0]!.url).toBe("https://api.test/247samples/activity?from=1000&to=2000");
    expect(requests[0]!.headers["content-type"]).toBe("application/json");
    await a.sleep(1, 2);
    await a.recovery(1, 2);
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(["/247samples/activity", "/247samples/sleep", "/247samples/recovery"]);
  });

  it("reads daily statistics", async () => {
    const stat = { Name: "stepcount", Aggregation: "sum", Sources: [{ Name: "w", Samples: [{ TimeISO8601: "2026-11-01T00:00:00.000", Value: 4617 }] }] };
    const { api: a, requests } = api(() => jsonResponse([stat, { Aggregation: "sum" }]));
    expect(await a.dailyStatistics("2026-11-01T00:00:00", "2026-11-07T23:59:59")).toEqual([stat]);
    expect(query(requests[0]!)).toEqual({ startdate: "2026-11-01T00:00:00", enddate: "2026-11-07T23:59:59" });
  });

  it("lists, gets and exports routes", async () => {
    const route = { id: "604bcfc20a76e57785370afe", description: "Kerava - Sipoo", activityIds: [3] };
    const { api: a, requests } = api((req) => {
      if (req.url.includes("/export")) return new Response("<gpx/>", { status: 200, headers: { "content-type": "application/gpx+xml" } });
      if (req.url.includes("/v2/route/")) return jsonResponse(route);
      return jsonResponse([route, { name: "no id" }]);
    });
    expect(await a.listRoutes({ page: 2, size: 20, sort: "desc", since: 5 })).toEqual([route]);
    expect(query(requests[0]!)).toEqual({ page: "2", size: "20", sort: "desc", since: "5" });
    expect(await a.getRoute(route.id)).toEqual(route);
    expect(await a.exportRouteGpx(route.id)).toBe("<gpx/>");
    expect(requests[2]!.url).toBe(`https://api.test/v2/route/${route.id}/export`);
    expect(requests[2]!.headers.accept).toBe("application/gpx+xml");
  });

  it("imports a GPX route and reads whatever answer comes back", async () => {
    const route = { id: "new-route", description: "x" };
    let answer: () => Response = () => jsonResponse(route);
    const { api: a, requests } = api(() => answer());
    expect(await a.importRouteGpx("<gpx></gpx>", [1, 22, -3, 1.5])).toEqual(route);
    const req = requests[0]!;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://api.test/v2/route/import?activities=1,22");
    expect(req.headers["content-type"]).toBe("application/gpx+xml");
    expect(req.body).toBe("<gpx></gpx>");
    answer = () => jsonResponse({ items: [{ id: "item-1" }] });
    expect((await a.importRouteGpx("<gpx/>", []))?.id).toBe("item-1");
    expect(new URL(requests[1]!.url).search).toBe("");
    answer = () => new Response("", { status: 200 });
    expect(await a.importRouteGpx("<gpx/>", [])).toBeUndefined();
    answer = () => jsonResponse({ ok: true });
    expect(await a.importRouteGpx("<gpx/>", [])).toBeUndefined();
  });

  it("lists and creates points of interest", async () => {
    const poi = { key: "5e3be95baba83c5b1781593b", point: { x: 45.1, y: 32.2, z: 11.5, name: "Beautiful POI", type: 1 }, watchEnabled: true };
    const input: WirePoiInput = { point: { x: 8.5, y: 47.3, name: "Spring", type: 75 }, watchEnabled: true };
    let createAnswer: () => Response = () => jsonResponse({ pointOfInterest: { ...input, key: "k1" } });
    const { api: a, requests } = api((req) => (req.method === "POST" ? createAnswer() : jsonResponse([{ pointOfInterest: poi }, { pointOfInterest: { point: { x: "bad" } } }])));
    expect(await a.listPois({ limit: 10, offset: 5 })).toEqual([{ pointOfInterest: poi }]);
    expect(query(requests[0]!)).toEqual({ limit: "10", offset: "5" });
    expect((await a.createPoi(input)).pointOfInterest.key).toBe("k1");
    expect(requests[1]!.url).toBe("https://api.test/v2/poi/create");
    expect(requests[1]!.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(requests[1]!.body)).toEqual(input);
    // Saved, but the answer did not carry the point: what was sent comes back.
    createAnswer = () => new Response("", { status: 200 });
    expect((await a.createPoi(input)).pointOfInterest.point.name).toBe("Spring");
  });

  it("answers account() from the token claims, without a request", async () => {
    const { api: a, requests } = api(() => jsonResponse({}));
    expect(await a.account()).toEqual({ username: MOCK_USERNAME, tokenExpiresAt: new Date(T0 + DAY).toISOString() });
    await a.close();
    expect(requests).toHaveLength(0);
    expect(a.kind).toBe("suunto");
  });
});

describe("SuuntoApi sign-in rules", () => {
  it("refreshes once on HTTP 401 and sends the request once more", async () => {
    let calls = 0;
    const { api: a, requests, sink, access } = api(() => (++calls === 1 ? jsonResponse({ error: "invalid_token" }, 401) : jsonResponse([])));
    expect(await a.listPois({ limit: 1, offset: 0 })).toEqual([]);
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(["/v2/poi", "/oauth/token", "/v2/poi"]);
    expect(requests[0]!.headers.authorization).toBe(`Bearer ${access}`);
    expect(requests[2]!.headers.authorization).not.toBe(`Bearer ${access}`);
    expect(sink.saved.map((t) => t.refreshToken)).toEqual(["refresh-1"]);
  });

  it("maps a second 401 to the sign-in message", async () => {
    const { api: a, requests } = api(() => new Response("", { status: 401 }));
    const e = await failure(a.listPois({ limit: 1, offset: 0 }));
    expect(e.message).toBe("Suunto refused the sign-in. Connect Suunto again.");
    expect((e as SuuntoHttpError).status).toBe(401);
    expect(requests).toHaveLength(3);
  });

  it("does not refresh when the 401 is about the subscription key or a rate limit", async () => {
    const key = api(() => jsonResponse({ statusCode: 401, message: "Access denied due to invalid subscription key. Make sure to provide a valid key for an active subscription." }, 401));
    const e = await failure(key.api.listPois({ limit: 1, offset: 0 }));
    expect(e.message).toMatch(/SUUNTO_SUBSCRIPTION_KEY/);
    expect(e.message).not.toContain(KEYS.subscriptionKey);
    expect(key.requests).toHaveLength(1);
    const rate = api(() => jsonResponse({ statusCode: 401, message: "RateLimitExceeded" }, 401, { "retry-after": "90" }));
    const r = (await failure(rate.api.listPois({ limit: 1, offset: 0 }))) as SuuntoHttpError;
    expect(r.kind).toBe("rate_limit");
    expect(r.message).toBe("Suunto's call limit for this service is reached (HTTP 401). Try again in 90 seconds.");
    expect(rate.requests).toHaveLength(1);
  });

  it("stops at once when the refresh token is refused (invalid_grant)", async () => {
    const m = scriptedFetch((req) => (isToken(req) ? jsonResponse({ error: "invalid_grant" }, 400) : new Response("", { status: 401 })));
    const sink = recordingSink();
    const session = new SuuntoSession({
      tokens: { refreshToken: "r", accessToken: fakeJwt({ nowMs: T0 }), accessTokenExpiresAt: T0 + DAY, clientId: KEYS.clientId },
      keys: KEYS,
      endpoints: ENDPOINTS,
      fetch: m.fetch,
      sink,
      now: () => T0,
    });
    const a = new SuuntoApi({ session, keys: KEYS, endpoints: ENDPOINTS, fetch: m.fetch, backoffMs: 0 });
    await expect(a.listPois({ limit: 1, offset: 0 })).rejects.toThrow("Your Suunto connection expired. Connect Suunto again.");
    expect(sink.invalidated).toHaveLength(1);
    await expect(a.listRoutes({ page: 0, size: 5, sort: "desc" })).rejects.toThrow(/connection expired/);
    await expect(a.account()).rejects.toThrow(/connection expired/);
    expect(m.requests).toHaveLength(2);
  });
});

describe("SuuntoApi errors and retries", () => {
  it("maps 403, 404 and 400", async () => {
    const forbidden = api(() => new Response("", { status: 403 }));
    expect((await failure(forbidden.api.sleep(1, 2))).message).toMatch(/Suunto refused the sleep data \(HTTP 403\)\. Either this server's Suunto API subscription/);
    const missing = api(() => jsonResponse({ message: "Route not found" }, 404));
    const nf = await failure(missing.api.getRoute("r1"));
    expect(nf).toBeInstanceOf(NotFoundError);
    expect(nf.message).toBe("Suunto has no route with the id r1.");
    const token = fakeJwt({ nowMs: T0 });
    const bad = api(() => jsonResponse({ error: { description: `Type mismatch for ${token} ${"x".repeat(400)}` } }, 400));
    const e = await failure(bad.api.activitySamples(1, 2));
    expect(e.message).toMatch(/^Suunto says the request is not valid \(the 24\/7 activity samples, HTTP 400\)\. Suunto said: "Type mismatch for \*\*\* x+\.\.\."$/);
    expect(e.message).not.toContain(token);
    expect(e.message.length).toBeLessThan(320);
    for (const body of [{ error_description: "desc" }, { message: "msg" }, { error: "plain" }]) {
      expect((await failure(api(() => jsonResponse(body, 400)).api.listPois({ limit: 1, offset: 0 }))).message).toContain(`Suunto said: "${Object.values(body)[0]}"`);
    }
  });

  it("maps the weekly quota (403 with a quota text) to a rate limit error", async () => {
    const { api: a, requests } = api(() => jsonResponse({ statusCode: 403, message: "Out of call volume quota. Quota will be replenished in 1.02:03:04." }, 403));
    const e = (await failure(a.listPois({ limit: 1, offset: 0 }))) as SuuntoHttpError;
    expect(e.kind).toBe("rate_limit");
    expect(e.message).toBe("Suunto's call limit for this service is reached (HTTP 403). Try again in 27 hours.");
    expect(requests).toHaveLength(1);
    expect(quotaWaitMs("Quota will be replenished in 00:00:40")).toBe(40_000);
    expect(quotaWaitMs("nothing")).toBeUndefined();
    expect([formatWait(1000), formatWait(40_000), formatWait(600_000), formatWait(5 * 3_600_000), formatWait(3 * DAY)]).toEqual([
      "1 second",
      "40 seconds",
      "10 minutes",
      "5 hours",
      "3 days",
    ]);
  });

  it("tries a read again on 429 and honours Retry-After", async () => {
    let calls = 0;
    const { api: a, requests, waits } = api(() => (++calls === 1 ? jsonResponse({}, 429, { "retry-after": "2" }) : jsonResponse([])));
    expect(await a.listRoutes({ page: 0, size: 5, sort: "desc" })).toEqual([]);
    expect(requests).toHaveLength(2);
    expect(waits).toEqual([2000]);
  });

  it("gives up after 3 tries with the rate limit message", async () => {
    const { api: a, requests, waits } = api(() => jsonResponse({}, 429, { "retry-after": "1" }));
    const e = (await failure(a.listRoutes({ page: 0, size: 5, sort: "desc" }))) as SuuntoHttpError;
    expect(e.kind).toBe("rate_limit");
    expect(e.message).toBe("Suunto's call limit for this service is reached (HTTP 429). Try again in 1 second.");
    expect(requests).toHaveLength(3);
    expect(waits).toEqual([1000, 1000]);
  });

  it("does not wait for a Retry-After longer than 30 s", async () => {
    const { api: a, requests, waits } = api(() => jsonResponse({}, 429, { "retry-after": "120" }));
    expect((await failure(a.listRoutes({ page: 0, size: 5, sort: "desc" }))).message).toMatch(/Try again in 2 minutes/);
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("tries a read again on 5xx and network errors, then says what failed", async () => {
    const busy = api(() => new Response("Service capacity exceeded. Try again later.", { status: 503 }));
    expect((await failure(busy.api.recovery(1, 2))).message).toBe("Suunto is busy right now (HTTP 503, the recovery data). Try again later.");
    expect(busy.requests).toHaveLength(3);
    const wrongKey = api(() => new Response("", { status: 500 }));
    expect((await failure(wrongKey.api.getWorkout(KEY, []))).message).toMatch(/HTTP 500, the workout\)\. Suunto also answers this way for a workout key that does not exist/);
    let calls = 0;
    const flaky = api(() => {
      if (++calls < 3) throw resetError();
      return jsonResponse([]);
    });
    expect(await flaky.api.listPois({ limit: 1, offset: 0 })).toEqual([]);
    expect(flaky.requests).toHaveLength(3);
    const slow = api(() => Promise.reject(timeoutError()));
    expect((await failure(slow.api.listPois({ limit: 1, offset: 0 }))).message).toBe("Suunto did not answer within 20 s (the points of interest). Try again later.");
  });

  it("never sends a write again once it may have reached Suunto", async () => {
    const input: WirePoiInput = { point: { x: 8.5, y: 47.3, name: "Spring", type: 75 }, watchEnabled: true };
    const broken = api(() => {
      throw resetError();
    });
    const e1 = await failure(broken.api.createPoi(input));
    expect(e1).toBeInstanceOf(UnconfirmedWriteError);
    expect(e1.message).toMatch(/Check in the Suunto App .* before you try again/);
    expect(broken.requests).toHaveLength(1);
    for (const status of [500, 502, 503, 504]) {
      const server = api(() => new Response("", { status }));
      expect(await failure(server.api.importRouteGpx("<gpx/>", [1]))).toBeInstanceOf(UnconfirmedWriteError);
      expect(server.requests).toHaveLength(1);
    }
    const limited = api(() => jsonResponse({}, 429, { "retry-after": "1" }));
    expect(((await failure(limited.api.createPoi(input))) as SuuntoHttpError).kind).toBe("rate_limit");
    expect(limited.requests).toHaveLength(1);
    // A connection that never opened sent nothing: that is safe to try again.
    let calls = 0;
    const refused = api(() => {
      if (++calls < 2) throw refusedError();
      return jsonResponse({ pointOfInterest: { ...input, key: "k" } });
    });
    expect((await refused.api.createPoi(input)).pointOfInterest.key).toBe("k");
    expect(refused.requests).toHaveLength(2);
  });

  it("refuses an answer above the size limit", async () => {
    const { api: a } = api(() => new Response("x".repeat(6 * 1024 * 1024), { status: 200, headers: { "content-type": "application/gpx+xml" } }));
    const e = (await failure(a.exportRouteGpx("r1"))) as SuuntoHttpError;
    expect(e.kind).toBe("too_large");
    expect(e.message).toMatch(/larger than 5 MB/);
  });

  it("never shows the tokens or keys in an error", async () => {
    const { api: a, access } = api(() =>
      jsonResponse({ message: `bad request: Bearer ${access} key ${KEYS.subscriptionKey} secret ${KEYS.clientSecret} refresh refresh-0` }, 400),
    );
    const e = await failure(a.listPois({ limit: 1, offset: 0 }));
    for (const secret of [access, KEYS.subscriptionKey, KEYS.clientSecret, "refresh-0"]) expect(e.message).not.toContain(secret);
  });
});

describe("mock Suunto server (smoke test)", () => {
  let mock: MockSuunto | undefined;
  afterEach(async () => {
    await mock?.close();
    mock = undefined;
  });

  it("runs the OAuth flow and serves every data endpoint", async () => {
    mock = await startMockSuunto();
    const redirect = "http://127.0.0.1:8723/callback";

    // Authorize: a 302 back to the redirect URI with the code and the state.
    const res = await fetch(authorizeUrl(mock.endpoints, mock.clientId, redirect, "state-1"), { redirect: "manual" });
    expect(res.status).toBe(302);
    const callback = new URL(res.headers.get("location")!);
    expect(`${callback.origin}${callback.pathname}`).toBe(redirect);
    expect(callback.searchParams.get("state")).toBe("state-1");
    const code = callback.searchParams.get("code")!;

    const oauth = { endpoints: mock.endpoints, keys: mock.keys };
    const result = await exchangeCode(code, redirect, oauth);
    expect(result.username).toBe(MOCK_USERNAME);
    // A code works once.
    await expect(exchangeCode(code, redirect, oauth)).rejects.toMatchObject({ code: "invalid_grant" });

    const sink = recordingSink();
    const session = new SuuntoSession({ tokens: result.tokens, keys: mock.keys, endpoints: mock.endpoints, sink });
    const a = new SuuntoApi({ session, keys: mock.keys, endpoints: mock.endpoints, backoffMs: 0 });

    const now = Date.now();
    const list = await a.listWorkouts({ since: now - 30 * DAY, until: now, limit: 100, offset: 0, byModificationTime: false });
    expect(list.payload.length).toBeGreaterThan(3);
    const first = list.payload[0]!;
    expect(first.workoutKey).toMatch(/^[0-9a-f]{24}$/);
    expect(first.extensions?.map((e) => e.type)).toEqual(["SummaryExtension"]);
    const full = await a.getWorkout(first.workoutKey!, ["SummaryExtension", "HeartrateStreamExtension"]);
    expect(full.extensions?.map((e) => e.type)).toEqual(["SummaryExtension", "HeartrateStreamExtension"]);
    await expect(a.getWorkout(first.workoutKey!, ["NoSuchExtension"])).rejects.toThrow(/not valid/);
    await expect(a.getWorkout("ffffffffffffffffffffffff", [])).rejects.toBeInstanceOf(NotFoundError);

    const fit = await a.exportFit(first.workoutKey!);
    expect(fit[0]).toBe(14);
    expect(fit.subarray(8, 12).toString("ascii")).toBe(".FIT");
    expect(fit.readUInt16LE(12)).toBe(fitCrc(fit.subarray(0, 12)));
    expect(fit.readUInt32LE(4)).toBe(fit.length - 16);
    expect(fitCrc(fit)).toBe(0);

    const samples = await a.activitySamples(now - DAY, now);
    expect(samples.length).toBeGreaterThan(100);
    expect(typeof samples[0]!.entryData.HR).toBe("number");
    expect((await a.sleep(now - 7 * DAY, now)).length).toBeGreaterThanOrEqual(6);
    expect((await a.recovery(now - DAY, now)).length).toBeGreaterThan(40);
    await expect(a.recovery(now - 40 * DAY, now)).rejects.toThrow(/28 days/);
    const day0 = new Date(Math.floor(now / DAY) * DAY - 6 * DAY).toISOString().slice(0, 19);
    const stats = await a.dailyStatistics(day0, new Date(now).toISOString().slice(0, 19));
    expect(stats.map((s) => s.Name).sort()).toEqual(["energyconsumption", "stepcount"]);

    const routes = await a.listRoutes({ page: 0, size: 10, sort: "desc" });
    expect(routes).toHaveLength(3);
    expect(await a.getRoute(routes[0]!.id)).toMatchObject({ id: routes[0]!.id });
    expect(await a.exportRouteGpx(routes[0]!.id)).toContain("<rtept");
    const gpx = '<?xml version="1.0"?><gpx version="1.1"><trk><name>New loop</name><trkseg><trkpt lat="47.1" lon="8.1"><ele>400</ele></trkpt><trkpt lat="47.2" lon="8.2"/></trkseg></trk></gpx>';
    const imported = await a.importRouteGpx(gpx, [1, 22]);
    expect(imported).toMatchObject({ description: "New loop", activityIds: [1, 22] });
    expect((await a.listRoutes({ page: 0, size: 10, sort: "desc" })).length).toBe(4);
    mock.importAnswer = "empty";
    expect(await a.importRouteGpx(gpx, [])).toBeUndefined();

    const pois = await a.listPois({ limit: 50, offset: 0 });
    expect(pois).toHaveLength(3);
    const created = await a.createPoi({ point: { x: 8.5, y: 47.3, z: 500, name: "Spring", type: 75 }, watchEnabled: true });
    expect(created.pointOfInterest).toMatchObject({ point: { name: "Spring", type: 75 }, watchEnabled: true });
    expect(await a.listPois({ limit: 50, offset: 0 })).toHaveLength(4);

    // An expired access token: 401, one refresh (rotated), the same call again.
    mock.expireAccessTokens();
    expect(await a.listPois({ limit: 1, offset: 0 })).toHaveLength(1);
    expect(sink.saved).toHaveLength(1);
    expect(sink.saved[0]!.refreshToken).not.toBe(result.tokens.refreshToken);
    expect(mock.state.refreshTokens.find((t) => t.token === result.tokens.refreshToken)?.revoked).toBe(true);

    expect(mock.state.violations).toEqual([]);
    expect(mock.requests.every((r) => !JSON.stringify(r).includes(mock!.clientSecret) && !JSON.stringify(r).includes(mock!.subscriptionKey))).toBe(true);
    expect(mock.requests.find((r) => r.path === "/v3/workouts")?.headers["ocp-apim-subscription-key"]).toBe("***");

    // Disconnect: every token stops working.
    await session.deauthorize();
    expect(mock.state.deauthorizeCalls).toBe(1);
    await expect(a.listPois({ limit: 1, offset: 0 })).rejects.toThrow(/connection expired/);
    expect(sink.invalidated).toHaveLength(1);
  });

  it("refuses wrong keys, a denied sign-in and calls to the wrong host", async () => {
    mock = await startMockSuunto({ deny: true, rotateRefreshTokens: false });
    const res = await fetch(authorizeUrl(mock.endpoints, mock.clientId, "http://127.0.0.1:1/cb", "s"), { redirect: "manual" });
    const callback = new URL(res.headers.get("location")!);
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("state")).toBe("s");

    const tokens = mock.issueTokens();
    const stored = { ...tokens, clientId: mock.clientId };
    const wrongKey = new SuuntoApi({
      session: new SuuntoSession({ tokens: stored, keys: mock.keys, endpoints: mock.endpoints }),
      keys: { ...mock.keys, subscriptionKey: "wrong-key-123" },
      endpoints: mock.endpoints,
    });
    await expect(wrongKey.listPois({ limit: 1, offset: 0 })).rejects.toThrow(/SUUNTO_SUBSCRIPTION_KEY/);
    await expect(exchangeCode("nope", "http://x.test/cb", { endpoints: mock.endpoints, keys: { clientId: mock.clientId, clientSecret: "wrong" } })).rejects.toMatchObject({
      code: "bad_client",
    });
    const swapped = { oauthUrl: mock.apiUrl, apiUrl: mock.oauthUrl };
    const lost = new SuuntoApi({ session: new SuuntoSession({ tokens: stored, keys: mock.keys, endpoints: swapped }), keys: mock.keys, endpoints: swapped });
    await expect(lost.listPois({ limit: 1, offset: 0 })).rejects.toBeInstanceOf(NotFoundError);

    // Without rotation the refresh answer repeats the same refresh token.
    const sink = recordingSink();
    const session = new SuuntoSession({ tokens: { refreshToken: tokens.refreshToken, clientId: mock.clientId }, keys: mock.keys, endpoints: mock.endpoints, sink });
    await session.accessToken();
    expect(sink.saved[0]!.refreshToken).toBe(tokens.refreshToken);
    mock.failNext("/v2/poi", 429, { message: "Rate limit is exceeded" }, { "retry-after": "0" });
    const a = new SuuntoApi({ session, keys: mock.keys, endpoints: mock.endpoints, backoffMs: 0 });
    expect(await a.listPois({ limit: 1, offset: 0 })).toHaveLength(1);
    // The wrong-host call above went to the OAuth host; the data host saw the 429 and the retry.
    expect(mock.count("/v2/poi")).toBe(4);
    expect(mock.requests.filter((r) => r.host === "api" && r.path === "/v2/poi")).toHaveLength(3);
  });
});
