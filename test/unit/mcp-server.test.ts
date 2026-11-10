import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { DemoLogbookStore } from "../../src/demo/logbook.js";
import { LogbookService, type ExportResult, type GetPhotosResult } from "../../src/logbook/service.js";
import type { LogbookBackend, PadiAccount } from "../../src/logbook/types.js";
import { buildInstructions, createMcpServer, createServices, reviewYear, SERVER_DESCRIPTION, SERVER_TITLE, type Services } from "../../src/server.js";
import { redact } from "../../src/util/errors.js";

// Invented test data only.
const PASSWORD = "not-a-real-password";
const FAKE_JWT = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXBhcnQ";
const env = { PADI_EMAIL: "diver.test@example.com", PADI_PASSWORD: PASSWORD, PADI_TIMEZONE: "Europe/Zurich" };

const READ_TOOLS = [
  "logbook_export_dives",
  "logbook_get_dive",
  "logbook_get_photos",
  "logbook_list_dives",
  "logbook_lookup_instructor",
  "logbook_search_dive_sites",
  "logbook_stats",
  "padi_account_info",
  "padi_list_certifications",
];
const WRITE_TOOLS = ["logbook_create_dive", "logbook_delete_dive", "logbook_set_units", "logbook_submit_for_verification", "logbook_update_dive"];

/** The annotations of DESIGN.md section 6. */
const ANNOTATIONS: Record<string, { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean }> = {
  ...Object.fromEntries(READ_TOOLS.map((n) => [n, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }])),
  logbook_create_dive: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  logbook_update_dive: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  logbook_set_units: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  logbook_submit_for_verification: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  logbook_delete_dive: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
};

/** Valid arguments for each tool (an unknown key is added to them). */
const VALID_ARGS: Record<string, Record<string, unknown>> = {
  padi_account_info: {},
  logbook_list_dives: {},
  logbook_get_dive: { dive_id: 1 },
  logbook_stats: {},
  logbook_search_dive_sites: { query: "reef" },
  logbook_export_dives: { format: "csv" },
  logbook_lookup_instructor: { member_number: "900001" },
  padi_list_certifications: {},
  logbook_get_photos: { dive_id: 1 },
  logbook_create_dive: { title: "Reef", date: "2026-01-02", location: "Lantern Reef", dive_type: "Boat", max_depth: 12, bottom_time_min: 40 },
  logbook_update_dive: { dive_id: 1, title: "Reef" },
  logbook_set_units: { units: "metric" },
  logbook_submit_for_verification: { dive_id: 1, instructor_number: "900001", confirm: true },
  logbook_delete_dive: { dive_id: 1, confirm_title: "Reef" },
};

/** A backend that answers account() and check(); everything else fails like an unreachable PADI. */
function fakeBackend(opts: { failWith?: string; checkError?: string } = {}): LogbookBackend & { calls: string[] } {
  const calls: string[] = [];
  const account: PadiAccount = { affiliateId: "10000002", email: "diver.test@example.com", name: "Test Diver", isPro: false, loginMethod: "cognito", apiMode: "proxy" };
  const fail = (name: string) => async (): Promise<never> => {
    calls.push(name);
    throw new Error(opts.failWith ?? "not available in this test");
  };
  return {
    kind: "padi",
    calls,
    listLogs: fail("listLogs"),
    countLogs: fail("countLogs"),
    totalBottomTime: fail("totalBottomTime"),
    getLog: fail("getLog"),
    insertLog: fail("insertLog"),
    updateLog: fail("updateLog"),
    deleteLog: fail("deleteLog"),
    searchSites: fail("searchSites"),
    getUnits: fail("getUnits"),
    setUnits: fail("setUnits"),
    lookupInstructor: fail("lookupInstructor"),
    listCertifications: fail("listCertifications"),
    listPhotoIds: fail("listPhotoIds"),
    getPhoto: fail("getPhoto"),
    account: async () => {
      calls.push("account");
      if (opts.failWith) throw new Error(opts.failWith);
      return account;
    },
    check: async () => (opts.checkError ? { ok: false, error: opts.checkError } : { ok: true, dives: 7, apiMode: "proxy" }),
    close: async () => {},
  };
}

async function connectWith(config: ReturnType<typeof loadConfig>, services: Services, hooks: Parameters<typeof createMcpServer>[3] = {}) {
  const server = createMcpServer(config, services, () => {}, hooks);
  const client = new Client({ name: "test", version: "1.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  return client;
}

async function connect(extra: Record<string, string> = {}, backend: LogbookBackend | null = fakeBackend(), service?: LogbookService) {
  const config = loadConfig({ ...env, ...extra });
  const opts = { readOnly: config.readOnly, units: config.units, timeZone: config.timeZone };
  const services: Services = backend ? { backend, logbook: service ?? new LogbookService(backend, opts) } : {};
  return connectWith(config, services);
}

function textOf(res: unknown): string {
  return ((res as { content: Array<{ type: string; text?: string }> }).content).map((c) => c.text ?? "").join("\n");
}

describe("MCP server", () => {
  it("names itself MCP for PADI, with the trademark notice", async () => {
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: "padi-mcp", title: SERVER_TITLE, description: SERVER_DESCRIPTION });
    expect(SERVER_TITLE).toBe("MCP for PADI (dive logbook)");
    expect(SERVER_DESCRIPTION).toContain("It is not made by, affiliated with, or endorsed by PADI.");
  });

  it("offers every tool of DESIGN.md section 6 with the right annotations", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toMatchObject(ANNOTATIONS[tool.name]!);
      expect(tool.annotations?.title, tool.name).toBe(tool.title);
      expect(tool.description?.length, tool.name).toBeGreaterThan(40);
    }
  });

  it("hides every write tool and the log_a_dive prompt in read-only mode", async () => {
    const client = await connect({ PADI_READ_ONLY: "true" });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(READ_TOOLS);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(["year_in_review"]);
  });

  it("offers only padi_account_info without a PADI sign-in", async () => {
    const client = await connect({}, null);
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["padi_account_info"]);
    const res = await client.callTool({ name: "padi_account_info", arguments: {} });
    expect(res.isError).toBeFalsy();
    const info = JSON.parse(textOf(res));
    expect(info).toMatchObject({ connected: false, email: "diver.test@example.com", demo: false });
    expect(info).not.toHaveProperty("affiliate_id");
  });

  it("rejects unknown argument names on every tool, before anything reaches PADI", async () => {
    const backend = fakeBackend();
    const client = await connect({}, backend);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect((tool.inputSchema as { additionalProperties?: unknown }).additionalProperties, tool.name).toBe(false);
      const res = await client.callTool({ name: tool.name, arguments: { ...VALID_ARGS[tool.name], confirm_titel: "x" } });
      expect(res.isError, tool.name).toBe(true);
      expect(textOf(res), tool.name).toMatch(/confirm_titel/);
    }
    expect(backend.calls).toEqual([]);
  });

  it("checks the confirmations in the input shapes", async () => {
    const backend = fakeBackend();
    const client = await connect({}, backend);
    const noConfirm = await client.callTool({ name: "logbook_submit_for_verification", arguments: { dive_id: 1, instructor_number: "900001", confirm: false } });
    expect(noConfirm.isError).toBe(true);
    const noTitle = await client.callTool({ name: "logbook_delete_dive", arguments: { dive_id: 1 } });
    expect(noTitle.isError).toBe(true);
    expect(textOf(noTitle)).toMatch(/confirm_title/);
    expect(backend.calls).toEqual([]);
  });

  it("describes the accepted values, the units and when to ask the user", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const create = byName.logbook_create_dive!.description!;
    // The accepted values are in the tool description or in the field descriptions.
    const createAll = JSON.stringify(byName.logbook_create_dive);
    for (const value of ["BeachShore", "Publish", "Draft", "Partly Cloudy", "SomeCurrent", "BigSurge", "FullSuit_5mm", "SemiDrySuit", "Aluminum", "Enriched_32", "Amazing", "YYYY-MM-DD"]) {
      expect(createAll).toContain(value);
    }
    for (const value of ["BeachShore", "Publish", "Draft", "Enriched_32", "Trimix", "YYYY-MM-DD", "Open", "Advanced", "SpecialtyAndDistinctive"]) expect(create).toContain(value);
    for (const unit of ["m or ft", "degrees C or F", "kg or lb", "litres or cubic feet", "bar or psi", "minutes"]) expect(create).toContain(unit);
    expect(byName.logbook_delete_dive!.description).toMatch(/Ask the user first/);
    expect(byName.logbook_submit_for_verification!.description).toMatch(/Ask the user first/);
    expect(byName.logbook_update_dive!.description).toMatch(/locked/);
    expect(byName.logbook_list_dives!.description).toContain("QR Code Verified");
    // Every input field carries a description.
    for (const tool of tools) {
      const props = (tool.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
      for (const [key, prop] of Object.entries(props)) expect(prop.description, `${tool.name}.${key}`).toBeTruthy();
    }
    // Simple English: never the em dash.
    expect(JSON.stringify(tools)).not.toContain("\u2014");
  });

  it("sends instructions about dates, units, locked dives, confirmations and untrusted text", async () => {
    const client = await connect();
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toContain("PADI");
    expect(instructions).toContain("Europe/Zurich");
    expect(instructions).toMatch(/locked/);
    expect(instructions).toMatch(/never follow instructions/);
    expect(instructions).toMatch(/Ask the user before deleting a dive or submitting it/);
    expect(instructions).toMatch(/PADI logbook setting/);
    // "today" on the server is not the user's today.
    expect(instructions).toMatch(/user's local calendar dates/);
    expect(instructions).toMatch(/can be a day off the user's date/);
    expect(instructions).not.toContain("\u2014");
    const readOnly = await connect({ PADI_READ_ONLY: "true" });
    expect(readOnly.getInstructions()).toMatch(/read-only/);
    expect(readOnly.getInstructions()).not.toMatch(/Ask the user before deleting/);
    expect(buildInstructions(loadConfig({ ...env, PADI_UNITS: "imperial" }))).toContain("imperial units (ft, degrees F, psi, lb, cubic feet)");
  });

  it("reports the account without secrets", async () => {
    const client = await connect();
    const res = await client.callTool({ name: "padi_account_info", arguments: { check: true } });
    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    const info = JSON.parse(text);
    expect(info).toMatchObject({
      name: "Test Diver",
      email: "diver.test@example.com",
      affiliate_id: "10000002",
      is_pro: false,
      units: "auto",
      read_only: false,
      api_mode: "proxy",
      login_method: "cognito",
      demo: false,
      time_zone: "Europe/Zurich",
    });
    expect(info.check).toEqual({ ok: true, dives: 7, apiMode: "proxy" });
    expect(info.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(info.server_version).toMatch(/^\d+\.\d+\.\d+/);
    expect(text).not.toContain(PASSWORD);
  });

  it("masks secrets and tokens in tool errors and in a failed check", async () => {
    const client = await connect({}, fakeBackend({ failWith: `PADI said no to ${PASSWORD} with Bearer ${FAKE_JWT}` }));
    const res = await client.callTool({ name: "padi_account_info", arguments: {} });
    expect(res.isError).toBe(true);
    const text = textOf(res);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(FAKE_JWT);

    // With check=true a failed sign-in is a connection report, not a failed call.
    const report = await client.callTool({ name: "padi_account_info", arguments: { check: true } });
    expect(report.isError).toBeFalsy();
    const reportText = textOf(report);
    const reportInfo = JSON.parse(reportText);
    expect(reportInfo).toMatchObject({ connected: false, email: "diver.test@example.com", units: "auto", read_only: false, demo: false, time_zone: "Europe/Zurich" });
    expect(reportInfo.check.ok).toBe(false);
    expect(reportInfo.check.error).toMatch(/PADI said no/);
    expect(reportInfo.server_version).toMatch(/^\d+\.\d+\.\d+/);
    expect(reportInfo.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(reportText).not.toContain(PASSWORD);
    expect(reportText).not.toContain(FAKE_JWT);

    const checked = await connect({}, fakeBackend({ checkError: `refresh failed for ${FAKE_JWT} (${PASSWORD})` }));
    const out = textOf(await checked.callTool({ name: "padi_account_info", arguments: { check: true } }));
    expect(JSON.parse(out).check.ok).toBe(false);
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain(FAKE_JWT);
  });

  it("keeps secrets and e-mail addresses out of the log line of a failed tool", async () => {
    const config = loadConfig(env);
    const backend = fakeBackend({ failWith: `no logbook for diver.test@example.com (${PASSWORD}, Bearer ${FAKE_JWT})` });
    const services: Services = { backend, logbook: new LogbookService(backend, { readOnly: false, units: config.units, timeZone: config.timeZone }) };
    const lines: string[] = [];
    const server = createMcpServer(config, services, (line) => lines.push(line));
    const client = new Client({ name: "test", version: "1.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(ct), server.connect(st)]);
    expect((await client.callTool({ name: "padi_account_info", arguments: {} })).isError).toBe(true);
    const logged = lines.join("\n");
    expect(logged).toContain("Tool padi_account_info failed");
    expect(logged).toContain("d***@example.com");
    expect(logged).not.toContain("diver.test@example.com");
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(FAKE_JWT);
  });

  it("says in padi_account_info when the account is a demo account", async () => {
    const config = loadConfig({ ...env, PADI_EMAIL: "alex.demo@example.com" });
    const services = createServices(config, { demo: new DemoLogbookStore() });
    const client = await connectWith(config, services, { accountInfo: { demo_account: "sample data" }, extraInstructions: "This is a demo account." });
    const info = JSON.parse(textOf(await client.callTool({ name: "padi_account_info", arguments: { check: true } })));
    expect(info).toMatchObject({ name: "Alex Demo", email: "alex.demo@example.com", affiliate_id: "10000001", demo: true, demo_account: "sample data", api_mode: "demo" });
    expect(info.check).toMatchObject({ ok: true, dives: 25 });
    expect(client.getInstructions()).toMatch(/This is a demo account\.$/);
  });

  it("offers the logbook prompts", async () => {
    const client = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(["log_a_dive", "year_in_review"]);
    const review = await client.getPrompt({ name: "year_in_review", arguments: { year: "2025" } });
    const text = JSON.stringify(review.messages);
    expect(text).toContain("from=2025-01-01");
    expect(text).toContain("logbook_stats");
    // Other ways to name a year are understood, or passed on, never replaced by this year.
    expect(JSON.stringify((await client.getPrompt({ name: "year_in_review", arguments: { year: "2024 season" } })).messages)).toContain("from=2024-01-01");
    const unclear = JSON.stringify((await client.getPrompt({ name: "year_in_review", arguments: { year: "the year I got certified" } })).messages);
    expect(unclear).toContain("the year I got certified");
    expect(unclear).toContain("ask me");
    expect(reviewYear("last year", "2026-11-09")).toEqual({ year: "2025" });
    expect(reviewYear(" This  Year ", "2026-11-09")).toEqual({ year: "2026" });
    expect(reviewYear(undefined, "2026-11-09")).toEqual({ year: "2026" });
    expect(reviewYear("diving in 1998", "2026-11-09")).toEqual({ year: "1998" });
    expect(reviewYear("my first year", "2026-11-09")).toEqual({ text: "my first year" });
    const log = await client.getPrompt({ name: "log_a_dive", arguments: { details: "Lantern Reef yesterday, 18 m" } });
    expect(JSON.stringify(log.messages)).toContain("Lantern Reef yesterday, 18 m");
    expect(JSON.stringify(log.messages)).toContain("logbook_create_dive");
  });
});

describe("special answers", () => {
  class FakeService extends LogbookService {
    override async getPhotos(): Promise<GetPhotosResult> {
      return {
        dive_id: 7,
        total: 4,
        skipped: 2,
        skipped_unsupported: [{ id: "c", mimeType: "image/heic" }],
        web_url: "https://learning.padi.com/logbook/log-dive/recreational/update/7",
        photos: [
          { id: "a", mimeType: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff, 0x00]) },
          { id: "b", mimeType: "image/png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
        ],
      };
    }
    override async exportDives(): Promise<ExportResult> {
      return { format: "csv", total: 3, count: 1, offset: 0, next_offset: 1, units: { depth: "m", temp: "C", pressure: "bar", weight: "kg", volume: "l" }, content: "id,title\n1,Reef\n" };
    }
  }

  it("returns dive photos as image content after a JSON summary", async () => {
    const backend = fakeBackend();
    const client = await connect({}, backend, new FakeService(backend, { readOnly: false, units: "auto", timeZone: "Europe/Zurich" }));
    const res = await client.callTool({ name: "logbook_get_photos", arguments: { dive_id: 7, max: 2 } });
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    expect(content.map((c) => c.type)).toEqual(["text", "image", "image"]);
    const summary = JSON.parse(content[0]!.text!);
    expect(summary).toMatchObject({ dive_id: 7, total: 4, returned: 2, skipped: 2, skipped_unsupported: [{ id: "c", mimeType: "image/heic" }] });
    expect(summary.note).toMatch(/cannot show.*learning\.padi\.com.*update\/7/);
    expect(content[1]).toMatchObject({ mimeType: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64") });
    expect(content[2]!.mimeType).toBe("image/png");
    expect(res).not.toHaveProperty("__raw");
  });

  it("returns an export as a JSON summary and the file content", async () => {
    const backend = fakeBackend();
    const client = await connect({}, backend, new FakeService(backend, { readOnly: false, units: "auto", timeZone: "Europe/Zurich" }));
    const res = await client.callTool({ name: "logbook_export_dives", arguments: { format: "csv" } });
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(2);
    expect(JSON.parse(content[0]!.text)).toMatchObject({ format: "csv", total: 3, count: 1, offset: 0, next_offset: 1, units: { depth: "m" } });
    expect(content[1]!.text).toBe("id,title\n1,Reef\n");
  });
});

describe("tool arguments on the demo logbook", () => {
  it("accepts null for optional fields on create, units on list, and paging on export", async () => {
    const config = loadConfig(env);
    const client = await connectWith(config, createServices(config, { demo: new DemoLogbookStore() }));
    const created = await client.callTool({
      name: "logbook_create_dive",
      arguments: { title: "T", date: "2026-11-01", location: "L", dive_type: "boat", max_depth: 10, bottom_time_min: 30, surge: null, notes: null, gas: null, training: null, units: "metric" },
    });
    expect(created.isError, textOf(created)).toBeFalsy();
    expect(JSON.parse(textOf(created))).toMatchObject({ title: "T", max_depth: 10 });
    const listed = await client.callTool({ name: "logbook_list_dives", arguments: { units: "imperial", limit: 1, sort: "max_depth" } });
    expect(listed.isError, textOf(listed)).toBeFalsy();
    const page = JSON.parse(textOf(listed));
    expect(page.units.depth).toBe("ft");
    expect(page.dives[0].max_depth).toBeGreaterThan(0);
    const exported = await client.callTool({ name: "logbook_export_dives", arguments: { format: "json", limit: 10, offset: 5 } });
    const parts = exported.content as Array<{ text: string }>;
    expect(JSON.parse(parts[0]!.text)).toMatchObject({ format: "json", total: 26, count: 10, offset: 5, next_offset: 15 });
    expect(JSON.parse(parts[1]!.text)).toHaveLength(10);
  });
});

describe("createServices", () => {
  it("builds a PADI backend from a password or a refresh token, and nothing without either", () => {
    const withPassword = createServices(loadConfig(env));
    expect(withPassword.backend?.kind).toBe("padi");
    expect(withPassword.logbook).toBeInstanceOf(LogbookService);
    expect(createServices(loadConfig({ PADI_REFRESH_TOKEN: "rt-invented" })).backend?.kind).toBe("padi");
  });

  it("uses the demo store when given one, with the account's read-only setting", () => {
    const services = createServices(loadConfig({ ...env, PADI_READ_ONLY: "true" }), { demo: new DemoLogbookStore() });
    expect(services.backend?.kind).toBe("demo");
    expect(services.logbook?.readOnly).toBe(true);
  });
});

describe("redact", () => {
  it("masks configured secrets, bearer tokens and JWT-shaped strings", () => {
    const jwe = "eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIn0.a2V5.aXY.Y2lwaGVy.dGFn";
    const out = redact(`pw=${PASSWORD} Authorization: Bearer abc.def.ghi-123456 token ${FAKE_JWT} refresh ${jwe}`, [PASSWORD]);
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain("abc.def.ghi-123456");
    expect(out).not.toContain(FAKE_JWT);
    expect(out).not.toContain("Y2lwaGVy");
    expect(out).toContain("Bearer ***");
  });
});
