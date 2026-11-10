import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { startHttpServer } from "../../src/http.js";
import { closeServices, createMcpServer, createServices, type Services } from "../../src/server.js";

const TOKEN = "test-token-0123456789";
let server: Server;
let services: Services;
let url = "";

beforeAll(async () => {
  const config = loadConfig(
    {
      // Invented test data; the PADI hosts point at a closed local port.
      PADI_EMAIL: "diver.test@example.com",
      PADI_PASSWORD: "pw-pw-pw-pw",
      PADI_COGNITO_URL: "http://127.0.0.1:1/",
      PADI_LOGBOOK_URL: "http://127.0.0.1:1/api/Logbook",
      MCP_HTTP_TOKEN: TOKEN,
    },
    { transport: "http", port: 0, host: "127.0.0.1" },
  );
  // Port 0 is not a valid configured port; listen on an ephemeral port instead.
  config.http.port = 0;
  services = createServices(config);
  server = await startHttpServer({ settings: config.http, createMcpServer: () => createMcpServer(config, services, () => {}), log: () => {} });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await closeServices(services);
});

const initBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
});
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };

describe("HTTP transport", () => {
  it("requires the bearer token", async () => {
    const res = await fetch(url, { method: "POST", headers, body: initBody });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/Bearer/);
    const wrong = await fetch(url, { method: "POST", headers: { ...headers, authorization: "Bearer nope" }, body: initBody });
    expect(wrong.status).toBe(401);
  });

  it("rejects foreign Host headers and browser origins", async () => {
    // fetch() does not allow overriding Host, so use a raw request (DNS rebinding scenario).
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(url, { method: "POST", headers: { ...headers, authorization: `Bearer ${TOKEN}`, host: "evil.example.com" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end(initBody);
    });
    expect(status).toBe(403);
    const origin = await fetch(url, { method: "POST", headers: { ...headers, authorization: `Bearer ${TOKEN}`, origin: "https://evil.example.com" }, body: initBody });
    expect(origin.status).toBe(403);
  });

  it("serves MCP over HTTP with a valid token", async () => {
    const client = new Client({ name: "http-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${TOKEN}` } } }));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("padi_account_info");
    expect(client.getServerVersion()?.name).toBe("padi-mcp");
    await client.close();
  });

  it("answers health checks and rejects GET on the MCP endpoint", async () => {
    const health = await fetch(url.replace("/mcp", "/healthz"));
    expect(health.status).toBe(200);
    const get = await fetch(url, { headers: { authorization: `Bearer ${TOKEN}`, accept: "text/event-stream" } });
    expect(get.status).toBe(405);
  });
});
