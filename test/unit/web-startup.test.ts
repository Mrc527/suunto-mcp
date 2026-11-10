/**
 * Settings the web service checks when it starts, and the deploy files that feed them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operatorOverrides } from "../../src/web/accounts.js";
import { createWebApp, webOptionsFromEnv } from "../../src/web/server.js";

const env = (extra: Record<string, string>) => ({ PUBLIC_URL: "https://padi.example.com", ...extra });
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("PADI_API_MODE", () => {
  it("is checked and lowercased at startup", () => {
    expect(webOptionsFromEnv(env({ PADI_API_MODE: "Direct" }), {}, () => {}).operator.PADI_API_MODE).toBe("direct");
    expect(webOptionsFromEnv(env({ PADI_API_MODE: " auto " }), {}, () => {}).operator.PADI_API_MODE).toBe("auto");
    expect(() => webOptionsFromEnv(env({ PADI_API_MODE: "foo" }), {}, () => {})).toThrow(/PADI_API_MODE must be one of proxy, direct, auto/);
  });

  it("is left out when it is empty, as the Compose files pass it when .env does not set it", () => {
    expect(operatorOverrides({ PADI_API_MODE: "" })).not.toHaveProperty("PADI_API_MODE");
    expect(operatorOverrides({})).not.toHaveProperty("PADI_API_MODE");
  });
});

describe("the administrator from ADMIN_EMAIL and ADMIN_PASSWORD", () => {
  it("is not created with the password an earlier example file had", async () => {
    const opts = { publicUrl: new URL("http://127.0.0.1:1"), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: {}, log: () => {} };
    await expect(createWebApp({ ...opts, adminEmail: "admin@example.com", adminPassword: "change-me-to-a-long-password" })).rejects.toThrow(/example value/);
    const web = await createWebApp({ ...opts, adminEmail: "admin@example.com", adminPassword: "a long password of my own" });
    try {
      expect(web.ctx.store.getUserByEmail("admin@example.com")?.isAdmin).toBe(true);
    } finally {
      await web.close();
    }
  });
});

describe("deploy files", () => {
  it("pass PADI_API_MODE to the service and name the Compose project", () => {
    for (const path of ["deploy/docker-compose.yml", "deploy/server/compose.yml"]) {
      const compose = read(path);
      expect(compose, path).toContain("PADI_API_MODE: ${PADI_API_MODE:-}");
      expect(compose, path).toMatch(/^name: padi-mcp$/m);
    }
  });

  it("publish no port of the service on the server: the proxy reaches it over a Docker network", () => {
    const compose = read("deploy/server/compose.yml");
    const service = compose.slice(compose.indexOf("\n  padi-mcp:"), compose.indexOf("\n  caddy:"));
    expect(service).toContain("image: ${PADI_MCP_IMAGE");
    expect(service).not.toMatch(/^\s+ports:/m);
    // Only the answer "host" in setup-server.sh publishes one, in compose.override.yml.
    const setup = read("deploy/server/setup-server.sh");
    expect(setup).toContain('"${BIND_ADDRESS:-127.0.0.1}:${HOST_PORT:-3000}:3000"');
    expect(setup).toContain("traefik.http.routers.padi-mcp.rule=Host(");
    expect(read("deploy/server/.env.example")).not.toMatch(/^HOST_PORT=/m);
  });

  it("ship no administrator password", () => {
    for (const path of ["deploy/.env.example", "deploy/server/.env.example"]) {
      const text = read(path);
      expect(text, path).toMatch(/^ADMIN_EMAIL=$/m);
      expect(text, path).toMatch(/^ADMIN_PASSWORD=$/m);
      expect(text, path).not.toContain("change-me");
    }
  });
});
