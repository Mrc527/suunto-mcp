/**
 * Settings the web service checks when it starts, and the deploy files that feed them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operatorOverrides } from "../../src/web/accounts.js";
import { createWebApp, suuntoRedirectUri, webOptionsFromEnv } from "../../src/web/server.js";

const env = (extra: Record<string, string>) => ({ PUBLIC_URL: "https://suunto.example.com", ...extra });
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const KEYS = { SUUNTO_CLIENT_ID: "invented-client", SUUNTO_CLIENT_SECRET: "invented-secret-value", SUUNTO_SUBSCRIPTION_KEY: "0123456789abcdef0123456789abcdef" };

describe("the operator's Suunto settings", () => {
  it("reads the three app keys, or none", () => {
    expect(webOptionsFromEnv(env(KEYS), {}, () => {}).suuntoKeys).toEqual({ clientId: "invented-client", clientSecret: "invented-secret-value", subscriptionKey: "0123456789abcdef0123456789abcdef" });
    expect(webOptionsFromEnv(env({}), {}, () => {}).suuntoKeys).toBeUndefined();
    // Docker Compose passes unset variables as empty strings: all three empty means none.
    expect(webOptionsFromEnv(env({ SUUNTO_CLIENT_ID: "", SUUNTO_CLIENT_SECRET: " ", SUUNTO_SUBSCRIPTION_KEY: "" }), {}, () => {}).suuntoKeys).toBeUndefined();
    // Only some of them: refused at startup, with what is missing.
    expect(() => webOptionsFromEnv(env({ SUUNTO_CLIENT_ID: "invented-client" }), {}, () => {})).toThrow(/SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set/);
  });

  it("keeps only the host overrides as operator settings, checked at startup", () => {
    const opts = webOptionsFromEnv(env({ ...KEYS, SUUNTO_API_URL: "http://127.0.0.1:9/cloudapi", SUUNTO_OAUTH_URL: "" }), {}, () => {});
    expect(opts.operator).toEqual({ SUUNTO_API_URL: "http://127.0.0.1:9/cloudapi" });
    // The keys never travel in the operator settings.
    expect(JSON.stringify(opts.operator)).not.toContain("invented-secret-value");
    expect(() => webOptionsFromEnv(env({ SUUNTO_API_URL: "http://api.example.com" }), {}, () => {})).toThrow(/SUUNTO_API_URL must use https/);
    expect(operatorOverrides({ SUUNTO_OAUTH_URL: "", SUUNTO_API_URL: " " })).toEqual({});
    expect(operatorOverrides({ ...KEYS })).toEqual({});
  });

  it("uses <PUBLIC_URL>/suunto/callback as the redirect URI unless SUUNTO_REDIRECT_URI is set", () => {
    const publicUrl = new URL("https://suunto.example.com/");
    expect(suuntoRedirectUri(publicUrl, undefined)).toBe("https://suunto.example.com/suunto/callback");
    expect(suuntoRedirectUri(publicUrl, "  ")).toBe("https://suunto.example.com/suunto/callback");
    expect(suuntoRedirectUri(publicUrl, "https://other.example.com/cb")).toBe("https://other.example.com/cb");
    expect(() => suuntoRedirectUri(publicUrl, "http://other.example.com/cb")).toThrow(/must be an https URL/);
    expect(() => suuntoRedirectUri(publicUrl, "not a url")).toThrow(/not a valid URL/);
    expect(webOptionsFromEnv(env({ SUUNTO_REDIRECT_URI: "" }), {}, () => {}).suuntoRedirectUri).toBeUndefined();
    expect(webOptionsFromEnv(env({ SUUNTO_REDIRECT_URI: "https://suunto.example.com/suunto/callback" }), {}, () => {}).suuntoRedirectUri).toBe("https://suunto.example.com/suunto/callback");
  });

  it("starts without keys and says what to do", async () => {
    const logs: string[] = [];
    const web = await createWebApp({ publicUrl: new URL("http://127.0.0.1:1"), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: {}, log: (m) => void logs.push(m) });
    try {
      expect(web.ctx.suuntoKeys).toBeUndefined();
      expect(web.ctx.pool.configured).toBe(false);
      expect(web.ctx.suuntoRedirectUri).toBe("http://127.0.0.1:1/suunto/callback");
      expect(logs.join("\n")).toContain("warning: SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set");
      expect(logs.join("\n")).toContain("http://127.0.0.1:1/suunto/callback");
    } finally {
      await web.close();
    }
    // With keys (also given with the hosts, as tests do): no warning, and the keys stay out of ctx.operator.
    const quiet: string[] = [];
    const configured = await createWebApp({ publicUrl: new URL("http://127.0.0.1:1"), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: { ...KEYS, SUUNTO_API_URL: "http://127.0.0.1:2" }, log: (m) => void quiet.push(m) });
    try {
      expect(configured.ctx.suuntoKeys?.clientId).toBe("invented-client");
      expect(configured.ctx.operator).toEqual({ SUUNTO_API_URL: "http://127.0.0.1:2" });
      expect(configured.ctx.suuntoEndpoints.apiUrl).toBe("http://127.0.0.1:2");
      expect(quiet.join("\n")).not.toContain("are not set");
    } finally {
      await configured.close();
    }
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
  it("pass the Suunto settings to the service and name the Compose project", () => {
    for (const path of ["deploy/docker-compose.yml", "deploy/server/compose.yml"]) {
      const compose = read(path);
      for (const name of ["SUUNTO_CLIENT_ID", "SUUNTO_CLIENT_SECRET", "SUUNTO_SUBSCRIPTION_KEY", "SUUNTO_REDIRECT_URI"]) {
        expect(compose, `${path}: ${name}`).toContain(`${name}: \${${name}:-}`);
      }
      expect(compose, path).toMatch(/^name: suunto-mcp$/m);
    }
  });

  it("publish no port of the service on the server: the proxy reaches it over a Docker network", () => {
    const compose = read("deploy/server/compose.yml");
    const service = compose.slice(compose.indexOf("\n  suunto-mcp:"), compose.indexOf("\n  caddy:"));
    expect(service).toContain("image: ${SUUNTO_MCP_IMAGE");
    expect(service).not.toMatch(/^\s+ports:/m);
    // Only the answer "host" in setup-server.sh publishes one, in compose.override.yml.
    const setup = read("deploy/server/setup-server.sh");
    expect(setup).toContain('"${BIND_ADDRESS:-127.0.0.1}:${HOST_PORT:-3000}:3000"');
    expect(setup).toContain("traefik.http.routers.suunto-mcp.rule=Host(");
    expect(read("deploy/server/.env.example")).not.toMatch(/^HOST_PORT=/m);
  });

  it("ship no administrator password and no Suunto keys", () => {
    for (const path of ["deploy/.env.example", "deploy/server/.env.example"]) {
      const text = read(path);
      expect(text, path).toMatch(/^ADMIN_EMAIL=$/m);
      expect(text, path).toMatch(/^ADMIN_PASSWORD=$/m);
      expect(text, path).not.toContain("change-me");
      for (const name of ["SUUNTO_CLIENT_ID", "SUUNTO_CLIENT_SECRET", "SUUNTO_SUBSCRIPTION_KEY"]) expect(text, `${path}: ${name}`).toMatch(new RegExp(`^${name}=$`, "m"));
    }
  });
});
