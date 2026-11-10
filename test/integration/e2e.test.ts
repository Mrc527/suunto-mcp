/**
 * End-to-end tests against the in-process mock PADI API (test/helpers/mock-padi.ts): Cognito, the
 * PADI auth API, the logbook GraphQL API (proxy and direct) and the REST endpoints around it.
 * Nothing is ever sent to PADI.
 *
 * - "in process": the real services and MCP server, with a client over an in-memory transport;
 * - "built server": dist/index.js over stdio and with --http.
 *
 *   npm run build
 *   PADI_MCP_IT=1 npm run test:integration
 */
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { closeServices, createMcpServer, createServices, type Services } from "../../src/server.js";
import { MOCK_ACCOUNT, startMockPadi, type MockPadi } from "../helpers/mock-padi.js";

const enabled = process.env.PADI_MCP_IT === "1";

let mock: MockPadi;
const opened: Services[] = [];

function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PADI_EMAIL: MOCK_ACCOUNT.email,
    PADI_PASSWORD: MOCK_ACCOUNT.password,
    PADI_TIMEZONE: "Europe/Zurich",
    ...mock.env(),
    ...extra,
  };
}

/** A client of the real MCP server (in process) for a configuration. */
async function inProcess(extra: Record<string, string> = {}): Promise<{ client: Client; services: Services }> {
  const config = loadConfig(baseEnv(extra));
  const services = createServices(config);
  opened.push(services);
  const server = createMcpServer(config, services, () => {});
  const client = new Client({ name: "it", version: "1.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  return { client, services };
}

type Content = Array<{ type: string; text?: string; data?: string; mimeType?: string }>;

async function call<T = Record<string, unknown>>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Content;
  if (res.isError) throw new Error(`${name} failed: ${content.map((c) => c.text).join(" ")}`);
  return JSON.parse(content[0]!.text!) as T;
}

async function callError(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  expect(res.isError, `${name} should fail`).toBe(true);
  return (res.content as Content).map((c) => c.text).join(" ");
}

interface Summary {
  id: number;
  title: string;
  date: string;
  type: string;
  status: string;
  locked: boolean;
}

/**
 * logbook_list_dives with a log type or a status (filtered by PADI): the total and the dives are
 * exactly those of the mock's logbook, so a filter that is declared but not applied is seen.
 */
async function expectFiltered(client: Client): Promise<void> {
  const stored = [...mock.account.store.logs.values()];
  const cases: Array<[Record<string, string>, (d: (typeof stored)[number]) => boolean]> = [
    [{ log_type: "Training" }, (d) => d.log_type === "Training"],
    [{ log_type: "Recreational" }, (d) => d.log_type === "Recreational"],
    [{ status: "Verified" }, (d) => d.status === "Verified"],
    [{ status: "Draft" }, (d) => d.status === "Draft"],
  ];
  for (const [filter, keep] of cases) {
    const want = stored.filter(keep).map((d) => d.id).sort((a, b) => a - b);
    const label = JSON.stringify(filter);
    // Each filter keeps some dives but not all of them, so the check means something.
    expect(want.length, label).toBeGreaterThan(0);
    expect(want.length, label).toBeLessThan(stored.length);
    const page = await call<{ total: number; dives: Summary[] }>(client, "logbook_list_dives", { ...filter, limit: 100 });
    expect(page.total, label).toBe(want.length);
    expect(page.dives.map((d) => d.id).sort((a, b) => a - b), label).toEqual(want);
    if (filter.log_type) expect(page.dives.every((d) => d.type === filter.log_type), label).toBe(true);
    if (filter.status) expect(page.dives.every((d) => d.status === filter.status), label).toBe(true);
  }
}

describe.skipIf(!enabled)("against a mock PADI API", () => {
  beforeAll(async () => {
    mock = await startMockPadi();
  });

  afterAll(async () => {
    await Promise.allSettled(opened.map((s) => closeServices(s)));
    await mock?.close();
  });

  beforeEach(() => {
    mock.violations.length = 0;
  });

  describe("the mock itself (raw requests, as the PADI web app sends them)", () => {
    async function signIn(): Promise<{ idToken: string; refreshToken: string }> {
      const res = await fetch(`${mock.url}/cognito/`, {
        method: "POST",
        headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth" },
        body: JSON.stringify({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: mock.clientId, AuthParameters: { USERNAME: MOCK_ACCOUNT.email, PASSWORD: MOCK_ACCOUNT.password } }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { AuthenticationResult: { IdToken: string; RefreshToken: string } };
      return { idToken: body.AuthenticationResult.IdToken, refreshToken: body.AuthenticationResult.RefreshToken };
    }

    async function gql(path: string, token: string, query: string, variables: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
      const res = await fetch(`${mock.url}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-platform": "web", ...headers },
        body: JSON.stringify({ query, variables }),
      });
      return { status: res.status, body: res.status === 200 ? ((await res.json()) as { data?: Record<string, unknown>; errors?: Array<{ message: string; extensions: { code: string } }> }) : undefined };
    }

    it("signs in, refreshes, and refuses wrong passwords", async () => {
      const { idToken, refreshToken } = await signIn();
      expect(idToken.split(".")).toHaveLength(3);
      const claims = JSON.parse(Buffer.from(idToken.split(".")[1]!, "base64url").toString());
      expect(claims).toMatchObject({ "custom:affiliate_id": MOCK_ACCOUNT.affiliateId, aud: mock.clientId, email: MOCK_ACCOUNT.email });
      expect(claims.exp - claims.iat).toBe(3600);
      const refreshed = await fetch(`${mock.url}/cognito/`, {
        method: "POST",
        headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth" },
        body: JSON.stringify({ AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: mock.clientId, AuthParameters: { REFRESH_TOKEN: refreshToken } }),
      });
      const result = ((await refreshed.json()) as { AuthenticationResult: Record<string, unknown> }).AuthenticationResult;
      expect(result.IdToken).toBeTruthy();
      expect(result).not.toHaveProperty("RefreshToken");
      const wrong = await fetch(`${mock.url}/cognito/`, {
        method: "POST",
        headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth" },
        body: JSON.stringify({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: mock.clientId, AuthParameters: { USERNAME: MOCK_ACCOUNT.email, PASSWORD: "nope" } }),
      });
      expect(wrong.status).toBe(400);
      expect(await wrong.json()).toMatchObject({ __type: "NotAuthorizedException" });
      const login = await fetch(`${mock.url}/auth/api/oauth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: MOCK_ACCOUNT.email, password: MOCK_ACCOUNT.password, clientId: mock.clientId, extraData: "" }),
      });
      expect(((await login.json()) as { tokens: { idToken: string } }).tokens.idToken).toBeTruthy();
    });

    it("answers the logbook queries and mutations of the PADI web app", async () => {
      const { idToken } = await signIn();
      const aff = Number(MOCK_ACCOUNT.affiliateId);
      const headers = { "affiliate-id": MOCK_ACCOUNT.affiliateId };
      const list = await gql(
        "/api/Logbook",
        idToken,
        "query logbook_logs($affiliate_id: Int!, $limit: Int, $offset: Int) { logbook_logs(where: { affiliate_id: { _eq: $affiliate_id } } order_by: { dive_date: desc, id: desc } limit: $limit offset: $offset) { id log_type log_course log_number dive_title dive_date dive_location status } }",
        { affiliate_id: aff, limit: 15, offset: 0 },
        headers,
      );
      const rows = list.body!.data!.logbook_logs as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(15);
      expect(Object.keys(rows[0]!)).toEqual(["id", "log_type", "log_course", "log_number", "dive_title", "dive_date", "dive_location", "status"]);
      const deep = await gql(
        "/api/Logbook",
        idToken,
        "query logbook_logs($affiliate_id: Int!, $status: status, $limit: Int, $offset: Int) { logbook_logs(where: { affiliate_id: { _eq: $affiliate_id }, status: { _eq: $status } }, order_by: { depth_times_aggregate: { max: { max_depth: desc } } }, limit: $limit, offset: $offset) { id depth_times { max_depth } } }",
        { affiliate_id: String(aff), status: "Verified", limit: 1, offset: 0 },
        headers,
      );
      expect((deep.body!.data!.logbook_logs as Array<{ depth_times: Array<{ max_depth: number }> }>)[0]!.depth_times[0]!.max_depth).toBe(38.2);
      const count = await gql("/api/Logbook", idToken, "query logbook_logs_aggregate($affiliate_id: Int!) { logbook_logs_aggregate(where: { affiliate_id: { _eq: $affiliate_id } }) { aggregate { count } } }", { affiliate_id: aff }, headers);
      expect(count.body!.data).toEqual({ logbook_logs_aggregate: { aggregate: { count: 25 } } });
      const sum = await gql(
        "/api/Logbook",
        idToken,
        "query logbook_depth_time_aggregate($affiliate_id: Int!) { logbook_depth_time_aggregate(where: { log: { affiliate_id: { _eq: $affiliate_id } } }) { aggregate { sum { bottom_time } } } }",
        { affiliate_id: aff },
        headers,
      );
      expect((sum.body!.data as { logbook_depth_time_aggregate: { aggregate: { sum: { bottom_time: number } } } }).logbook_depth_time_aggregate.aggregate.sum.bottom_time).toBeGreaterThan(500);

      const insert = await gql(
        "/api/Logbook",
        idToken,
        "mutation insert_logbook_logs($general: [logbook_logs_insert_input!]!) { insert_logbook_logs(objects: $general) { affected_rows returning { id affiliate_id dive_title dive_date status } } }",
        {
          general: {
            affiliate_id: MOCK_ACCOUNT.affiliateId,
            log_type: "Recreational",
            log_course: null,
            log_number: null,
            created_date: "2026-11-09T19:40:00",
            update_date: "2026-11-09T19:40:00",
            dive_type: "BeachShore",
            dive_title: "Raw reef",
            dive_location: "Anchor Rock",
            dive_date: "11/09/2026",
            status: "Publish",
            memsys_member_number: null,
            depth_times: { data: { bottom_time: "42", max_depth: "28" } },
            conditions: { data: { water_type: "Salt", current: "SomeCurrent", surge: null } },
            equipment: { data: { additional_equipment: "{Hood,Boots}", gas_mixture: "Enriched_32", oxygen: "32", nitrogen: "68", helium: "0" } },
            experiences: { data: { feeling: "Amazing", notes: "", buddies: "Kim Demo", dive_center: "" } },
          },
        },
        headers,
      );
      const inserted = insert.body!.data!.insert_logbook_logs as { affected_rows: number; returning: Array<{ id: number; dive_date: string }> };
      expect(inserted.affected_rows).toBe(5);
      expect(inserted.returning[0]!.dive_date).toBe("2026-11-09T00:00:00");
      const id = inserted.returning[0]!.id;

      const update = await gql(
        "/api/Logbook",
        idToken,
        "mutation UpdateRecreationalDiveLog($id: Int!, $general: logbook_logs_set_input!, $depthTime: logbook_depth_time_set_input!, $conditions: logbook_conditions_set_input!, $equipment: logbook_equipment_set_input!, $experience: logbook_experience_set_input!) { update_logbook_logs(where: { id: { _eq: $id } }, _set: $general) { affected_rows } update_logbook_depth_time(where: { logs_id: { _eq: $id } }, _set: $depthTime) { affected_rows } update_logbook_conditions(where: { logs_id: { _eq: $id } }, _set: $conditions) { affected_rows } update_logbook_equipment(where: { logs_id: { _eq: $id } }, _set: $equipment) { affected_rows } update_logbook_experience(where: { logs_id: { _eq: $id } }, _set: $experience) { affected_rows } }",
        { id, general: { dive_title: "Raw reef 2" }, depthTime: { max_depth: 30 }, conditions: { weather: "Sunny" }, equipment: {}, experience: { notes: "x" } },
        headers,
      );
      expect(update.body!.data).toMatchObject({ update_logbook_logs: { affected_rows: 1 }, update_logbook_depth_time: { affected_rows: 1 } });
      const bad = await gql("/api/Logbook", idToken, "mutation m($id: Int!, $general: logbook_logs_set_input!) { update_logbook_logs(where: { id: { _eq: $id } }, _set: $general) { affected_rows } }", { id, general: { dive_type: "Shore" } }, headers);
      expect(bad.body!.errors![0]).toMatchObject({ extensions: { code: "data-exception" }, message: 'invalid input value for enum dive_type: "Shore"' });

      const onlyLog = await gql("/api/Logbook", idToken, "mutation d($id: Int!) { delete_logbook_logs(where: { id: { _eq: $id } }) { affected_rows } }", { id }, headers);
      expect(onlyLog.body!.errors![0]!.message).toMatch(/foreign key/i);
      const del = await gql(
        "/api/Logbook",
        idToken,
        "mutation delete_logbook_logs($id: Int) { delete_logbook_depth_time(where: { logs_id: { _eq: $id } }) { affected_rows returning { id } } delete_logbook_skills(where: { logs_id: { _eq: $id } }) { affected_rows } delete_logbook_conditions(where: { logs_id: { _eq: $id } }) { affected_rows } delete_logbook_experience(where: { logs_id: { _eq: $id } }) { affected_rows } delete_logbook_equipment(where: { logs_id: { _eq: $id } }) { affected_rows } delete_logbook_logs(where: { id: { _eq: $id } }) { affected_rows returning { id } } }",
        { id },
        headers,
      );
      expect(del.body!.data).toMatchObject({ delete_logbook_logs: { affected_rows: 1, returning: [{ id }] }, delete_logbook_skills: { affected_rows: 0 } });

      const sites = await gql("/api/Logbook", idToken, "query logbook_logs($name: String!) { logbook_dive_site(where: { name: { _ilike: $name } }) { id name } }", { name: "%reef%" }, headers);
      expect((sites.body!.data!.logbook_dive_site as Array<{ name: string }>).map((s) => s.name)).toEqual(["Lantern Reef", "Lumen Bay House Reef"]);
      const units = await gql(
        "/api/Logbook",
        idToken,
        "mutation insert_logbook_units_settings($affiliate_id: Int!, $unit: units!) { insert_logbook_units_settings(objects: { affiliate_id: $affiliate_id, unit: $unit } on_conflict: { constraint: units_settings_pkey, update_columns: unit }) { returning { affiliate_id unit } } }",
        { affiliate_id: aff, unit: "Imperial" },
        headers,
      );
      expect(units.body!.data).toEqual({ insert_logbook_units_settings: { returning: [{ affiliate_id: aff, unit: "Imperial" }] } });
      mock.account.store.units = "Metric";
      expect(mock.violations).toEqual([]);
    });

    it("answers like the real transports when something is wrong", async () => {
      const { idToken } = await signIn();
      const unscoped = await gql("/api/Logbook", idToken, "query { logbook_logs(limit: 1) { id } }", {}, { "affiliate-id": MOCK_ACCOUNT.affiliateId });
      expect(unscoped.status).toBe(200);
      expect(mock.violations.join(" ")).toMatch(/not filtered by affiliate_id/);
      mock.violations.length = 0;
      expect((await gql("/api/Logbook", "eyJ.bad.token", "query { logbook_logs { id } }")).status).toBe(401);
      const direct = await gql("/v1/graphql", "eyJ.bad.token", "query { logbook_logs { id } }");
      expect(direct.body!.errors![0]!.extensions.code).toBe("invalid-jwt");
      const other = await gql("/api/Logbook", idToken, "query q($affiliate_id: Int!) { logbook_logs(where: { affiliate_id: { _eq: $affiliate_id } }) { id } }", { affiliate_id: 1 });
      expect(other.body!.errors![0]!.extensions.code).toBe("permission-error");
      const pro = await fetch(`${mock.url}/api/Logbook/instructor/900001`, { headers: { authorization: `Bearer ${idToken}` } });
      expect(await pro.json()).toEqual({ results: [{ memberNumber: 900001, firstName: "Robin", middleInitial: "", lastName: "Example" }] });
      const nobody = await fetch(`${mock.url}/instructor/42`, { headers: { authorization: `Bearer ${idToken}` } });
      expect(((await nobody.json()) as { results: Array<{ memberNumber: number }> }).results[0]!.memberNumber).toBe(-1);
      const ecards = await fetch(`${mock.url}/api/eCard/GeteCardListConsumer`, { headers: { authorization: `Bearer ${idToken}` } });
      const cards = (await ecards.json()) as { affiliateSummary: { affiliateID: number }; eCardInfo: Array<{ certDate: string }> };
      expect(cards.affiliateSummary.affiliateID).toBe(Number(MOCK_ACCOUNT.affiliateId));
      expect(cards.eCardInfo[0]!.certDate).toMatch(/^\d{2}-[A-Z]{3}-\d{4}$/);
      mock.failNext("proxy", 503);
      expect((await gql("/api/Logbook", idToken, "query { logbook_logs { id } }")).status).toBe(503);
    });
  });

  describe("in process (proxy mode)", () => {
    let client: Client;
    /** Requests of this client only (the mock also served the tests above). */
    let first = 0;
    let firstGql = 0;
    const requests = () => mock.requests.slice(first);

    beforeAll(async () => {
      first = mock.requests.length;
      firstGql = mock.graphql.length;
      ({ client } = await inProcess());
    });

    it("signs in once with Cognito and reports the account", async () => {
      const info = await call(client, "padi_account_info", { check: true });
      expect(info).toMatchObject({ name: "River Tester", email: MOCK_ACCOUNT.email, affiliate_id: MOCK_ACCOUNT.affiliateId, demo: false, api_mode: "proxy" });
      expect(info.check).toMatchObject({ ok: true, dives: 25 });
      const signIns = requests().filter((r) => r.path.startsWith("/cognito") && r.body.includes("USER_PASSWORD_AUTH"));
      expect(signIns).toHaveLength(1);
      expect(JSON.parse(signIns[0]!.body).AuthParameters.USERNAME).toBe(MOCK_ACCOUNT.email);
      // Every logbook request carries the ID token, the affiliate id and x-platform.
      const gql = mock.graphql.slice(firstGql);
      expect(gql.length).toBeGreaterThan(0);
      for (const g of gql) {
        expect(String(g.headers.authorization)).toMatch(/^Bearer eyJ/);
        expect(g.headers["affiliate-id"]).toBe(MOCK_ACCOUNT.affiliateId);
        expect(g.headers["x-platform"]).toBe("web");
      }
      expect(mock.violations).toEqual([]);
    });

    it("lists, reads and counts the dives", async () => {
      const page = await call<{ total: number; dives: Summary[]; next_offset?: number }>(client, "logbook_list_dives", {});
      expect(page.total).toBe(25);
      expect(page.dives).toHaveLength(15);
      expect(page.next_offset).toBe(15);
      expect(page.dives[0]!.status).toBe("Draft");
      const dive = await call<Record<string, unknown>>(client, "logbook_get_dive", { dive_id: page.dives[1]!.id });
      expect(dive).toMatchObject({ id: page.dives[1]!.id, units: { depth: "m" } });
      expect(String(dive.web_url)).toContain("learning.padi.com");
      const deep = await call<{ dives: Summary[] }>(client, "logbook_list_dives", { sort: "max_depth", limit: 5 });
      expect(deep.dives.length).toBeGreaterThan(0);
      const stats = await call<{ count: number; total_bottom_time: string }>(client, "logbook_stats", { group_by: "year" });
      expect(stats.count).toBe(25);
      expect(stats.total_bottom_time).toMatch(/^\d+:\d{2}$/);
      await expectFiltered(client);
      expect(mock.violations).toEqual([]);
    });

    it("creates, updates, submits and deletes dives, writing what PADI expects", async () => {
      const created = await call<Record<string, unknown> & { id: number }>(client, "logbook_create_dive", {
        title: "Integration reef",
        date: "2026-11-01",
        location: "Anchor Rock",
        dive_type: "shore",
        max_depth: 21.5,
        bottom_time_min: 44,
        weather: "Partly Cloudy",
        gas: "Enriched_32",
        equipment: ["Hood", "Dive Light"],
        buddies: "Sam Example",
      });
      expect(created).toMatchObject({ title: "Integration reef", dive_type: "BeachShore", status: "Publish", max_depth: 21.5, oxygen_pct: 32 });
      const stored = mock.account.store.logs.get(created.id)!;
      expect(stored).toMatchObject({ dive_date: "2026-11-01T00:00:00", affiliate_id: Number(MOCK_ACCOUNT.affiliateId), log_type: "Recreational" });
      expect(stored.equipment![0]!.additional_equipment).toEqual(["Hood", "Dive Light"]);

      const updated = await call<Record<string, unknown>>(client, "logbook_update_dive", { dive_id: created.id, max_depth: 22, notes: "Edited" });
      expect(updated).toMatchObject({ max_depth: 22, bottom_time_min: 44, notes: "Edited", weather: "Partly Cloudy", buddies: "Sam Example" });
      // The update never sends log_type (the store refuses it) and keeps the other columns.
      expect(mock.account.store.logs.get(created.id)!.log_type).toBe("Recreational");

      expect(await callError(client, "logbook_submit_for_verification", { dive_id: created.id, instructor_number: "123456", confirm: true })).toMatch(/123456|not found|unknown/i);
      const sent = await call<{ dive: { status: string; locked: boolean }; instructor: { name: string } }>(client, "logbook_submit_for_verification", {
        dive_id: created.id,
        instructor_number: "900001",
        confirm: true,
      });
      expect(sent).toMatchObject({ dive: { status: "Pending", locked: true }, instructor: { name: "Robin Example" } });
      expect(mock.account.store.logs.get(created.id)).toMatchObject({ status: "Pending", memsys_member_number: 900001 });
      expect(await callError(client, "logbook_delete_dive", { dive_id: created.id, confirm_title: "Integration reef" })).toMatch(/lock|Pending/i);

      const victim = [...mock.account.store.logs.values()].find((d) => d.status === "Publish" && d.id !== created.id)!;
      expect(await callError(client, "logbook_delete_dive", { dive_id: victim.id, confirm_title: "not the title" })).toMatch(/title/i);
      const deleted = await call<{ deleted: boolean; dive: { title: string } }>(client, "logbook_delete_dive", { dive_id: victim.id, confirm_title: ` ${victim.dive_title!.toUpperCase()} ` });
      expect(deleted).toMatchObject({ deleted: true, dive: { title: victim.dive_title } });
      expect(mock.account.store.logs.has(victim.id)).toBe(false);
      expect(mock.violations).toEqual([]);
    });

    it("searches sites, looks up PADI Pros, lists eCards and photos, and sets the units", async () => {
      const sites = await call<{ sites: Array<{ name: string }> }>(client, "logbook_search_dive_sites", { query: "reef" });
      expect(sites.sites.map((s) => s.name)).toEqual(expect.arrayContaining(["Lantern Reef"]));
      expect(await call(client, "logbook_lookup_instructor", { member_number: "900001" })).toMatchObject({ found: true, name: "Robin Example" });
      expect(await call(client, "logbook_lookup_instructor", { member_number: "123" })).toMatchObject({ found: false });
      const cards = await call<{ count: number; certifications: Array<{ title: string }> }>(client, "padi_list_certifications");
      expect(cards.count).toBe(3);

      const diveId = [...mock.account.store.logs.keys()][0]!;
      const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
      mock.account.photos.set(diveId, [{ id: "img-1", mimeType: "image/png", data: png }]);
      const photos = await client.callTool({ name: "logbook_get_photos", arguments: { dive_id: diveId } });
      expect(photos.isError).toBeFalsy();
      const content = photos.content as Content;
      expect(content.map((c) => c.type)).toEqual(["text", "image"]);
      expect(content[1]).toMatchObject({ mimeType: "image/png", data: png.toString("base64") });

      const exported = await client.callTool({ name: "logbook_export_dives", arguments: { format: "csv" } });
      const parts = exported.content as Content;
      expect(JSON.parse(parts[0]!.text!).count).toBeGreaterThan(20);
      expect(parts[1]!.text!.split("\n").length).toBeGreaterThan(20);

      await call(client, "logbook_set_units", { units: "imperial" });
      expect(mock.account.store.units).toBe("Imperial");
      const page = await call<{ units: { depth: string } }>(client, "logbook_list_dives", { limit: 1 });
      expect(page.units.depth).toBe("ft");
      await call(client, "logbook_set_units", { units: "metric" });
      expect(mock.violations).toEqual([]);
    });

    it("refreshes an expired ID token with the stored refresh token", async () => {
      const before = requests().filter((r) => r.body.includes("REFRESH_TOKEN_AUTH")).length;
      mock.expireIdTokens();
      const page = await call<{ total: number }>(client, "logbook_list_dives", { limit: 1 });
      expect(page.total).toBeGreaterThan(20);
      const refreshes = requests().filter((r) => r.body.includes("REFRESH_TOKEN_AUTH")).length;
      expect(refreshes - before).toBeGreaterThanOrEqual(1);
      // The refresh token is used, not the password again.
      expect(requests().filter((r) => r.body.includes("USER_PASSWORD_AUTH"))).toHaveLength(1);
    });
  });

  describe("sign-in rules", () => {
    it("never retries a wrong password, and never shows it", async () => {
      const before = mock.requests.length;
      const { client } = await inProcess({ PADI_PASSWORD: "wrong-password-value" });
      const text = await callError(client, "padi_account_info", {});
      expect(text).toMatch(/password/i);
      expect(text).not.toContain("wrong-password-value");
      const sent = mock.requests.slice(before);
      expect(sent.filter((r) => r.path.startsWith("/cognito"))).toHaveLength(1);
      // auto mode does not fall back to the PADI auth API after "wrong e-mail or password".
      expect(sent.filter((r) => r.path.startsWith("/auth/api"))).toHaveLength(0);
      await callError(client, "padi_account_info", {});
      expect(mock.requests.slice(before).filter((r) => r.path.startsWith("/cognito"))).toHaveLength(1);
    });

    it("signs in with the PADI auth API and saves a rotated refresh token to the cache file", async () => {
      const dir = mkdtempSync(join(tmpdir(), "padi-mcp-it-"));
      const cache = join(dir, "token.json");
      mock.rotateRefreshTokens = true;
      try {
        const { client } = await inProcess({ PADI_LOGIN_METHOD: "padi", PADI_TOKEN_CACHE: cache });
        expect((await call(client, "padi_account_info", {})).affiliate_id).toBe(MOCK_ACCOUNT.affiliateId);
        const first = JSON.parse(readFileSync(cache, "utf8")) as { refreshToken: string; loginMethod: string };
        expect(first.loginMethod).toBe("padi");
        expect(statSync(cache).mode & 0o777).toBe(0o600);
        mock.expireIdTokens();
        await call(client, "logbook_list_dives", { limit: 1 });
        const second = JSON.parse(readFileSync(cache, "utf8")) as { refreshToken: string };
        expect(second.refreshToken).not.toBe(first.refreshToken);

        // A later run starts from the cache alone (no password).
        const config = loadConfig({ ...mock.env(), PADI_TOKEN_CACHE: cache, PADI_TIMEZONE: "Europe/Zurich" });
        const services = createServices(config);
        opened.push(services);
        expect((await services.logbook!.account()).affiliateId).toBe(MOCK_ACCOUNT.affiliateId);
      } finally {
        mock.rotateRefreshTokens = false;
      }
    });

    it("explains a sign-in challenge (MFA) instead of failing silently", async () => {
      mock.challenge = "SOFTWARE_TOKEN_MFA";
      const { client } = await inProcess();
      expect(await callError(client, "padi_account_info", {})).toMatch(/challenge|MFA|code|verification/i);
      mock.challenge = undefined;
    });
  });

  describe("direct mode", () => {
    it("talks to the Hasura endpoint without affiliate-id, and with x-hasura-role on writes", async () => {
      const before = mock.graphql.length;
      const { client } = await inProcess({ PADI_API_MODE: "direct" });
      const page = await call<{ total: number; dives: Summary[] }>(client, "logbook_list_dives", { limit: 3 });
      expect(page.total).toBeGreaterThan(20);
      await expectFiltered(client);
      const created = await call<{ id: number }>(client, "logbook_create_dive", { title: "Direct dive", date: "2026-10-30", location: "Eel Garden", dive_type: "Boat", status: "Draft" });
      expect(mock.account.store.logs.get(created.id)!.status).toBe("Draft");
      const calls = mock.graphql.slice(before);
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((c) => c.mode === "direct" && c.headers["affiliate-id"] === undefined)).toBe(true);
      expect(mock.violations).toEqual([]);
    });
  });

  describe("built server (dist/index.js)", () => {
    let stdio: Client | undefined;
    let http: ChildProcess | undefined;

    afterAll(async () => {
      await stdio?.close();
      http?.kill();
    });

    it("--check signs in, counts the dives and names the account", async () => {
      const result = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
        const child = spawn(process.execPath, ["dist/index.js", "--check"], { env: { ...baseEnv(), PATH: process.env.PATH ?? "" }, stdio: ["ignore", "pipe", "ignore"] });
        let stdout = "";
        child.stdout!.on("data", (c: Buffer) => (stdout += c.toString()));
        child.on("exit", (code) => resolve({ code, stdout }));
      });
      expect(result.code).toBe(0);
      const out = JSON.parse(result.stdout);
      expect(out.logbook).toMatchObject({ ok: true });
      expect(out.logbook.dives).toBeGreaterThan(20);
      expect(out.account).toMatchObject({ name: "River Tester", affiliate_id: MOCK_ACCOUNT.affiliateId });
      expect(result.stdout).not.toContain(MOCK_ACCOUNT.password);
    });

    it("serves the logbook over stdio", async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["dist/index.js"],
        env: { ...baseEnv(), PATH: process.env.PATH ?? "" },
        stderr: "pipe",
      });
      stdio = new Client({ name: "it-stdio", version: "1.0.0" });
      await stdio.connect(transport);
      expect(stdio.getServerVersion()).toMatchObject({ name: "padi-mcp", title: "MCP for PADI (dive logbook)" });
      const info = await call(stdio, "padi_account_info", { check: true });
      expect(info.check).toMatchObject({ ok: true });
      const created = await call<{ id: number; title: string }>(stdio, "logbook_create_dive", {
        title: "Stdio dive",
        date: "2026-11-02",
        location: "Sandy Slope",
        dive_type: "Boat",
        max_depth: 12,
        bottom_time_min: 50,
      });
      expect(mock.account.store.logs.has(created.id)).toBe(true);
      await call(stdio, "logbook_delete_dive", { dive_id: created.id, confirm_title: "Stdio dive" });
      expect(mock.account.store.logs.has(created.id)).toBe(false);
    });

    it("serves the logbook over HTTP with a bearer token", async () => {
      const port = await freePort();
      const token = "it-http-token-0123456789";
      http = spawn(process.execPath, ["dist/index.js", "--http", "--port", String(port)], {
        env: { ...baseEnv(), MCP_HTTP_TOKEN: token, PATH: process.env.PATH ?? "" },
        stdio: ["ignore", "ignore", "pipe"],
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("the HTTP server did not start")), 20_000);
        http!.stderr!.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("listening")) {
            clearTimeout(timer);
            resolve();
          }
        });
        http!.on("exit", (code) => reject(new Error(`the HTTP server exited with ${code}`)));
      });
      const client = new Client({ name: "it-http", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
      const page = await call<{ total: number }>(client, "logbook_list_dives", { limit: 2 });
      expect(page.total).toBeGreaterThan(20);
      await client.close();
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
