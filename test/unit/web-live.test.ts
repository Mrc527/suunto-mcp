/**
 * Web mode: live activity on the "Connected apps" page (Server-Sent Events).
 */
import { createServer, type Server } from "node:http";
import { connect, type AddressInfo, type Socket } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, connectMcp, setBase, TestOAuthClient } from "../helpers/web-client.js";

let web: WebApp;
let server: Server;
let port = 0;
const PASSWORD = "correct horse battery";
const user = new Browser();

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  setBase(base);
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    liveHeartbeatMs: 200,
    operator: { PADI_COGNITO_URL: "http://127.0.0.1:1/", PADI_AUTH_URL: "http://127.0.0.1:1/auth/api", PADI_LOGBOOK_URL: "http://127.0.0.1:1/api/Logbook" },
    log: () => {},
  });
  server.on("request", web.app);
  expect((await user.signup("live@example.com", PASSWORD)).status).toBe(303);
  // Tool calls are only logged once the user has a PADI connection (invented test data).
  const id = web.ctx.store.getUserByEmail("live@example.com")!.id;
  web.ctx.store.savePadiSettings(id, {
    email: "live.diver@example.com",
    refreshToken: "rt-invented",
    loginMethod: "cognito",
    clientId: "test-client",
    affiliateId: "10000003",
    units: "auto",
    readOnly: false,
    connectedAt: Date.now(),
  });
});

afterAll(async () => {
  await web.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

/** Read a Server-Sent Events stream until `until` matches the text received so far. */
async function readUntil(res: Response, until: (text: string) => boolean, timeoutMs = 4000): Promise<{ text: string; ended: boolean }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (!until(text)) {
      const left = deadline - Date.now();
      if (left <= 0) break;
      const chunk = await Promise.race([reader.read(), new Promise<"timeout">((r) => setTimeout(() => r("timeout"), left))]);
      if (chunk === "timeout") break;
      if (chunk.done) return { text, ended: true };
      text += decoder.decode(chunk.value, { stream: true });
    }
    return { text, ended: false };
  } finally {
    void reader.cancel().catch(() => {});
  }
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** A stream opened on a plain socket, so the test controls reading. */
async function rawStream(path: string): Promise<Socket> {
  const cookie = [...user.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const socket = connect(port, "127.0.0.1");
  await new Promise<void>((r) => socket.once("connect", () => r()));
  socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nCookie: ${cookie}\r\n\r\n`);
  return socket;
}

const events = (text: string) =>
  [...text.matchAll(/event: activity\ndata: (.+)\n/g)].map((m) => JSON.parse(m[1]!) as { id: number; tool: string; ok: boolean });

describe("live activity", () => {
  it("needs a signed-in user", async () => {
    const res = await new Browser().fetch("/account/activity/stream");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("pushes tool calls made through MCP to the open page", async () => {
    const stream = await user.fetch("/account/activity/stream");
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reading = readUntil(stream, (t) => t.includes("event: activity"));

    const oauth = new TestOAuthClient(user);
    const client = await connectMcp(oauth);
    await client.callTool({ name: "padi_account_info", arguments: {} });
    await client.close();

    const { text } = await reading;
    const [ev] = events(text);
    expect(ev).toMatchObject({ tool: "padi_account_info" });
    expect(text).toContain(`id: ${ev!.id}\n`);
    expect(text).toContain("retry: 10000");
  });

  it("sends what a reconnecting page missed", async () => {
    const userId = web.ctx.store.getUserByEmail("live@example.com")!.id;
    const before = web.ctx.store.recentActivity(userId, 1)[0]!.id;
    web.ctx.store.logActivity(userId, "logbook_list_dives", true, 12);
    web.ctx.store.logActivity(userId, "logbook_get_dive", false, 30);
    const res = await user.fetch(`/account/activity/stream?after=${before}`);
    const { text } = await readUntil(res, (t) => events(t).length >= 2);
    expect(events(text).map((e) => e.tool)).toEqual(["logbook_list_dives", "logbook_get_dive"]);
    // The Last-Event-ID header (sent by browsers when they reconnect) works the same way.
    const again = await user.fetch("/account/activity/stream", { headers: { "last-event-id": String(before + 1) } });
    const second = await readUntil(again, (t) => events(t).length >= 1);
    expect(events(second.text).map((e) => e.tool)).toEqual(["logbook_get_dive"]);
  });

  it("limits open streams per user", async () => {
    const open: Response[] = [];
    for (let i = 0; i < 5; i++) open.push(await user.fetch("/account/activity/stream"));
    // Earlier tests may still hold a stream for a moment; at most 5 are allowed in total.
    const extra = await user.fetch("/account/activity/stream");
    expect(extra.status).toBe(429);
    for (const res of open) await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 100));
    const after = await user.fetch("/account/activity/stream");
    expect(after.status).toBe(200);
    await after.body?.cancel();
  });

  it("ends the stream when the session ends and tells the page to stop", async () => {
    const other = new Browser();
    expect((await other.login("live@example.com", PASSWORD)).status).toBe(303);
    const res = await other.fetch("/account/activity/stream");
    expect(res.status).toBe(200);
    const { csrf } = await other.page("/account/security");
    const reading = readUntil(res, () => false, 3000);
    await other.post("/logout", { _csrf: csrf });
    const { ended, text } = await reading;
    expect(ended).toBe(true);
    expect(text).toContain("event: end\ndata: signed-out");
  });

  it("replays the newest entries to a page that showed none yet", async () => {
    const res = await user.fetch("/account/activity/stream?after=0");
    const { text } = await readUntil(res, (t) => events(t).length >= 3);
    const got = events(text);
    expect(got.length).toBeGreaterThanOrEqual(3);
    expect(got.map((e) => e.id)).toEqual([...got.map((e) => e.id)].sort((a, b) => a - b));
  });

  it("disconnects a client that never reads instead of crashing at the next heartbeat", async () => {
    const userId = web.ctx.store.getUserByEmail("live@example.com")!.id;
    // Streams of earlier tests close asynchronously.
    await waitFor(() => web.ctx.live.size === 0);
    const socket = await rawStream("/account/activity/stream");
    socket.pause(); // never read again
    await waitFor(() => web.ctx.live.size === 1);
    const big = "x".repeat(16_000);
    for (let i = 0; i < 2000 && web.ctx.live.size > 0; i++) {
      web.ctx.live.publish(userId, { id: 1_000_000 + i, at: Date.now(), tool: big, ok: true, durationMs: 1 });
      if (i % 50 === 0) await new Promise((r) => setTimeout(r, 1));
    }
    // Two heartbeats later the server is still running and the stream is gone.
    await new Promise((r) => setTimeout(r, 500));
    expect(web.ctx.live.size).toBe(0);
    expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
    socket.destroy();
  });

  it("does not keep pipelined stream requests", async () => {
    const cookie = [...user.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    await waitFor(() => web.ctx.live.size === 0);
    const req = `GET /account/activity/stream HTTP/1.1\r\nHost: 127.0.0.1\r\nCookie: ${cookie}\r\n\r\n`;
    const socket = connect(port, "127.0.0.1");
    await new Promise<void>((r) => socket.once("connect", () => r()));
    socket.write(req + req);
    await waitFor(() => web.ctx.live.size === 1);
    socket.destroy();
    await waitFor(() => web.ctx.live.size === 0);
  });

  it("refuses large JSON-RPC batches on /mcp", async () => {
    const batch = Array.from({ length: 21 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "tools/list" }));
    const oauth = new TestOAuthClient(user);
    const client = await connectMcp(oauth);
    await client.close();
    const token = oauth.savedTokens!.access_token;
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(batch),
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("At most 20 messages");
  });

  it("renders the page with the live list", async () => {
    const { html } = await user.page("/account/connections");
    expect(html).toContain('data-live="/account/activity/stream"');
    expect(html).toMatch(/data-last-id="\d+"/);
    expect(html).toContain("<tbody>");
  });
});
