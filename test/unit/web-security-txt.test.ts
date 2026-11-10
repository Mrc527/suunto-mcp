/**
 * /.well-known/security.txt (RFC 9116): how to report a security problem.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTACT_EMAIL } from "../../src/web/operator.js";
import { SECURITY_POLICY_URL, SECURITY_TXT_EXPIRES, securityTxt } from "../../src/web/security-txt.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";

let web: WebApp;
let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    operator: { PADI_COGNITO_URL: "http://127.0.0.1:1/", PADI_AUTH_URL: "http://127.0.0.1:1/auth/api", PADI_LOGBOOK_URL: "http://127.0.0.1:1/api/Logbook" },
    log: () => {},
  });
  server.on("request", web.app);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
});

/** Field name to values, from "Name: value" lines (comments and blank lines skipped). */
function fields(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z-]+): (.+)$/);
    expect(m, `bad line: ${line}`).not.toBeNull();
    out.set(m![1]!, [...(out.get(m![1]!) ?? []), m![2]!]);
  }
  return out;
}

describe("security.txt", () => {
  it("is served as plain text, cached for a day, without cookies", async () => {
    const res = await fetch(`${base}/.well-known/security.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.getSetCookie()).toEqual([]);
    const text = await res.text();
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toContain("\u2014");
  });

  it("has the required and chosen fields", async () => {
    const f = fields(await (await fetch(`${base}/.well-known/security.txt`)).text());
    expect(f.get("Contact")).toEqual([`mailto:${CONTACT_EMAIL}`]);
    expect(CONTACT_EMAIL).toBe("marco@visin.ch");
    expect(f.get("Expires")).toEqual(["2027-11-08T00:00:00.000Z"]);
    expect(f.get("Preferred-Languages")).toEqual(["en, it, de"]);
    expect(f.get("Canonical")).toEqual([`${base}/.well-known/security.txt`]);
    // No public policy page yet (the repository is private): the optional field is left out.
    expect(SECURITY_POLICY_URL).toBeUndefined();
    expect(f.get("Policy")).toBeUndefined();
  });

  it("has a valid expiry date at most a year after it was written", () => {
    const expires = Date.parse(SECURITY_TXT_EXPIRES);
    expect(Number.isNaN(expires)).toBe(false);
    expect(new Date(expires).toISOString()).toBe(SECURITY_TXT_EXPIRES);
    expect(expires - Date.parse("2026-11-08T00:00:00.000Z")).toBeLessThanOrEqual(366 * 86_400_000);
  });

  it("builds the canonical address from the public URL", () => {
    const canonical = (url: string) => fields(securityTxt(new URL(url))).get("Canonical");
    expect(canonical("https://mcp.example.com")).toEqual(["https://mcp.example.com/.well-known/security.txt"]);
    expect(canonical("https://mcp.example.com/")).toEqual(["https://mcp.example.com/.well-known/security.txt"]);
    expect(canonical("https://example.com/mail")).toEqual(["https://example.com/mail/.well-known/security.txt"]);
  });

  it("answers HEAD requests", async () => {
    const res = await fetch(`${base}/.well-known/security.txt`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });
});
