import { describe, expect, it } from "vitest";
import { isAllowedHost } from "../../src/http.js";

const settings = (host: string, allowedHosts: string[] = []) => ({ host, port: 3000, allowedHosts, allowedOrigins: [] });

describe("isAllowedHost", () => {
  it("only accepts loopback names when bound to loopback (DNS rebinding protection)", () => {
    expect(isAllowedHost("localhost:3000", settings("127.0.0.1"))).toBe(true);
    expect(isAllowedHost("127.0.0.1:3000", settings("127.0.0.1"))).toBe(true);
    expect(isAllowedHost("[::1]:3000", settings("127.0.0.1"))).toBe(true);
    expect(isAllowedHost("evil.example.com", settings("127.0.0.1"))).toBe(false);
    expect(isAllowedHost("127.evil.example.com", settings("127.0.0.1"))).toBe(false);
    expect(isAllowedHost("[::1]:3000", settings("::1"))).toBe(true);
    expect(isAllowedHost(undefined, settings("127.0.0.1"))).toBe(false);
  });

  it("accepts any host when bound to all interfaces (a token is required there), else only the bind address", () => {
    expect(isAllowedHost("suunto.mcp.example:3000", settings("0.0.0.0"))).toBe(true);
    expect(isAllowedHost("suunto.mcp.example", settings("::"))).toBe(true);
    expect(isAllowedHost("10.0.0.5:3000", settings("10.0.0.5"))).toBe(true);
    expect(isAllowedHost("10.0.0.6:3000", settings("10.0.0.5"))).toBe(false);
  });

  it("supports an explicit allow list", () => {
    expect(isAllowedHost("mcp.example.com", settings("127.0.0.1", ["mcp.example.com"]))).toBe(true);
    expect(isAllowedHost("mcp.example.com:443", settings("10.0.0.5", ["mcp.example.com"]))).toBe(true);
    expect(isAllowedHost("other.example.com", settings("10.0.0.5", ["mcp.example.com"]))).toBe(false);
  });
});
