import { execFile } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REDIRECT_URI,
  callLimitsFromEnv,
  checkRedirectUri,
  describeConfig,
  expandPath,
  inspectTokenCache,
  loadConfig,
  loadLoginConfig,
  readSecret,
  suuntoKeysFromEnv,
} from "../../src/config.js";
import { fileTokenSink, readTokenCache, writeTokenCache } from "../../src/server.js";
import { DEFAULT_ENDPOINTS } from "../../src/suunto/endpoints.js";
import { fakeJwt } from "../helpers/mock-suunto.js";

// Invented test data only.
const KEYS = { SUUNTO_CLIENT_ID: "client-invented", SUUNTO_CLIENT_SECRET: "secret-invented-value", SUUNTO_SUBSCRIPTION_KEY: "subkey-invented-value" };
const base = { ...KEYS, SUUNTO_REFRESH_TOKEN: "rt-invented-value", SUUNTO_TIMEZONE: "Europe/Zurich" };

describe("loadConfig", () => {
  it("applies the Suunto defaults", () => {
    const c = loadConfig(base);
    expect(c.suunto.keys).toEqual({ clientId: "client-invented", clientSecret: "secret-invented-value", subscriptionKey: "subkey-invented-value" });
    expect(c.suunto.refreshToken).toBe("rt-invented-value");
    expect(c.suunto.tokenCache).toBeUndefined();
    expect(c.suunto.redirectUri).toBe(DEFAULT_REDIRECT_URI);
    expect(DEFAULT_REDIRECT_URI).toBe("http://localhost:8723/callback");
    expect(c.suunto.endpoints).toEqual(DEFAULT_ENDPOINTS);
    expect(c.units).toBe("metric");
    expect(c.readOnly).toBe(false);
    expect(c.timeZone).toBe("Europe/Zurich");
    expect(c.transport).toBe("stdio");
    expect(c.http).toMatchObject({ host: "127.0.0.1", port: 3000, allowedHosts: [], allowedOrigins: [] });
    expect(c.secrets.sort()).toEqual(["rt-invented-value", "secret-invented-value", "subkey-invented-value"]);
    expect(c.callLimits).toEqual({ perMinute: 10, perUserPerDay: 0, perUserPerWeek: 0 });
  });

  it("reads the Suunto call limits (0 = no limit, empty = unset, other values refused)", () => {
    expect(callLimitsFromEnv({})).toEqual({ perMinute: 10, perUserPerDay: 0, perUserPerWeek: 0 });
    expect(callLimitsFromEnv({ SUUNTO_CALLS_PER_MINUTE: "0", SUUNTO_CALLS_PER_USER_PER_DAY: " 250 " })).toEqual({ perMinute: 0, perUserPerDay: 250, perUserPerWeek: 0 });
    expect(callLimitsFromEnv({ SUUNTO_CALLS_PER_MINUTE: "", SUUNTO_CALLS_PER_USER_PER_DAY: " " })).toEqual({ perMinute: 10, perUserPerDay: 0, perUserPerWeek: 0 });
    // The web service's own default (100 a day) applies only while the variable is unset.
    expect(callLimitsFromEnv({}, { perUserPerDay: 100 })).toEqual({ perMinute: 10, perUserPerDay: 100, perUserPerWeek: 0 });
    expect(callLimitsFromEnv({ SUUNTO_CALLS_PER_USER_PER_DAY: "" }, { perUserPerDay: 100 })).toEqual({ perMinute: 10, perUserPerDay: 100, perUserPerWeek: 0 });
    expect(callLimitsFromEnv({ SUUNTO_CALLS_PER_USER_PER_DAY: "0" }, { perUserPerDay: 100 })).toEqual({ perMinute: 10, perUserPerDay: 0, perUserPerWeek: 0 });
    for (const bad of ["ten", "-1", "1.5", "1e3", "0x10"]) {
      expect(() => callLimitsFromEnv({ SUUNTO_CALLS_PER_MINUTE: bad }), bad).toThrow(`SUUNTO_CALLS_PER_MINUTE must be a whole number of 0 or more (0 means no limit), got "${bad}"`);
    }
    expect(() => callLimitsFromEnv({ SUUNTO_CALLS_PER_USER_PER_DAY: "lots" })).toThrow(/SUUNTO_CALLS_PER_USER_PER_DAY must be a whole number/);
    // The weekly cap per user: 0 (none) unless set, or the web service's default while unset.
    expect(callLimitsFromEnv({ SUUNTO_CALLS_PER_USER_PER_WEEK: "70" }).perUserPerWeek).toBe(70);
    expect(callLimitsFromEnv({ SUUNTO_CALLS_PER_USER_PER_WEEK: "" }, { perUserPerWeek: 100 }).perUserPerWeek).toBe(100);
    expect(callLimitsFromEnv({ SUUNTO_CALLS_PER_USER_PER_WEEK: "0" }, { perUserPerWeek: 100 }).perUserPerWeek).toBe(0);
    expect(() => callLimitsFromEnv({ SUUNTO_CALLS_PER_USER_PER_WEEK: "x" })).toThrow(/SUUNTO_CALLS_PER_USER_PER_WEEK must be a whole number/);
    expect(loadConfig({ ...base, SUUNTO_CALLS_PER_MINUTE: "30", SUUNTO_CALLS_PER_USER_PER_DAY: "500" }).callLimits).toEqual({ perMinute: 30, perUserPerDay: 500, perUserPerWeek: 0 });
    expect(() => loadConfig({ ...base, SUUNTO_CALLS_PER_MINUTE: "fast" })).toThrow(/SUUNTO_CALLS_PER_MINUTE/);
  });

  it("warns when a refresh token has no token cache to keep its newer versions", () => {
    const warnings: string[] = [];
    loadConfig(base, {}, (w) => warnings.push(w));
    expect(warnings).toEqual([expect.stringMatching(/SUUNTO_REFRESH_TOKEN is set without SUUNTO_TOKEN_CACHE/)]);
    const quiet: string[] = [];
    loadConfig({ ...base, SUUNTO_TOKEN_CACHE: join(tmpdir(), "suunto-mcp-unused.json") }, {}, (w) => quiet.push(w));
    expect(quiet).toEqual([]);
  });

  it("reads units, read-only and the HTTP settings", () => {
    const c = loadConfig({ ...base, SUUNTO_UNITS: "Imperial", SUUNTO_READ_ONLY: "yes", MCP_HTTP_PORT: "4100", MCP_HTTP_ALLOWED_HOSTS: "a.example.com, b.example.com" });
    expect(c.units).toBe("imperial");
    expect(c.readOnly).toBe(true);
    expect(c.http.port).toBe(4100);
    expect(c.http.allowedHosts).toEqual(["a.example.com", "b.example.com"]);
  });

  it("reads secrets from files", () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-config-"));
    writeFileSync(join(dir, "secret"), "secret-from-a-file\n");
    writeFileSync(join(dir, "key"), "key-from-a-file\n");
    writeFileSync(join(dir, "rt"), "rt-from-a-file\n");
    expect(readSecret({ X_FILE: join(dir, "secret") }, "X")).toBe("secret-from-a-file");
    const c = loadConfig({
      SUUNTO_CLIENT_ID: "client-invented",
      SUUNTO_CLIENT_SECRET_FILE: join(dir, "secret"),
      SUUNTO_SUBSCRIPTION_KEY_FILE: join(dir, "key"),
      SUUNTO_REFRESH_TOKEN_FILE: join(dir, "rt"),
    });
    expect(c.suunto.keys).toEqual({ clientId: "client-invented", clientSecret: "secret-from-a-file", subscriptionKey: "key-from-a-file" });
    expect(c.suunto.refreshToken).toBe("rt-from-a-file");
    expect(c.secrets).toEqual(expect.arrayContaining(["secret-from-a-file", "key-from-a-file", "rt-from-a-file"]));
    expect(() => readSecret({ X_FILE: join(dir, "missing") }, "X")).toThrow(/X_FILE/);
  });

  it("needs the three app keys, and says where to get them", () => {
    expect(() => loadConfig({ SUUNTO_REFRESH_TOKEN: "rt" })).toThrow(/SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set.*Suunto API Zone.*profile/);
    expect(() => loadConfig({ SUUNTO_CLIENT_ID: "c", SUUNTO_REFRESH_TOKEN: "rt" })).toThrow(/SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set, but the other/);
    expect(() => loadConfig({ ...KEYS, SUUNTO_SUBSCRIPTION_KEY: "", SUUNTO_REFRESH_TOKEN: "rt" })).toThrow(/^SUUNTO_SUBSCRIPTION_KEY is not set, but the other/);
  });

  it("needs a sign-in: a refresh token or an existing token cache file", () => {
    expect(() => loadConfig(KEYS)).toThrow(/No Suunto sign-in is set.*suunto-mcp --login.*SUUNTO_REFRESH_TOKEN/);
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-cache-"));
    const cache = join(dir, "tokens.json");
    expect(() => loadConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: cache })).toThrow(/does not exist yet. Run suunto-mcp --login/);
    writeTokenCache(cache, { refreshToken: "rt-invented-cache-value", clientId: "client-invented" });
    expect(loadConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: cache }).suunto.tokenCache).toBe(cache);
  });

  it("refuses a token cache that is there but cannot be used, naming the file and the reason", () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-cache-"));
    const cache = join(dir, "tokens.json");
    const cases: Array<[string, () => void]> = [
      ["was written for another Suunto app (another SUUNTO_CLIENT_ID)", () => writeTokenCache(cache, { refreshToken: "rt-other-app", clientId: "another-client" })],
      ["is not a valid token cache (not JSON; it may be damaged)", () => writeFileSync(cache, '{"refreshToken": "rt-cut')],
      ["holds no Suunto sign-in", () => writeFileSync(cache, "{}")],
    ];
    for (const [reason, write] of cases) {
      write();
      const text = `The token cache ${cache} (SUUNTO_TOKEN_CACHE) ${reason}.`;
      expect(() => loadConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: cache }), reason).toThrow(`${text} Run suunto-mcp --login again to sign in to Suunto and replace it.`);
      // With SUUNTO_REFRESH_TOKEN the server starts from it, and says so.
      const warnings: string[] = [];
      expect(loadConfig({ ...base, SUUNTO_TOKEN_CACHE: cache }, {}, (w) => warnings.push(w)).suunto.tokenCache).toBe(cache);
      expect(warnings).toEqual([`${text} Using SUUNTO_REFRESH_TOKEN instead; the next refresh replaces the file.`]);
    }
    // A file that cannot be read: the system error code.
    const folder = join(dir, "a-folder");
    mkdirSync(folder);
    expect(() => loadConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: folder })).toThrow(`The token cache ${folder} (SUUNTO_TOKEN_CACHE) cannot be read (EISDIR).`);
    // The client id of the other app is never shown.
    expect(() => loadConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: cache })).not.toThrow(/another-client/);
  });

  it("expands a leading ~ in SUUNTO_TOKEN_CACHE and makes the path absolute", () => {
    expect(expandPath("~")).toBe(homedir());
    expect(expandPath("~/.config/suunto-mcp/tokens.json")).toBe(join(homedir(), ".config/suunto-mcp/tokens.json"));
    expect(expandPath("tokens.json")).toBe(resolve("tokens.json"));
    expect(expandPath("/srv/tokens.json")).toBe("/srv/tokens.json");
    expect(loadLoginConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: "~/.config/suunto-mcp/tokens.json" }).suunto.tokenCache).toBe(join(homedir(), ".config/suunto-mcp/tokens.json"));
    expect(loadLoginConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: "cache/tokens.json" }).suunto.tokenCache).toBe(resolve("cache/tokens.json"));
    // The server looks for the same file as --login wrote, from any working folder.
    expect(() => loadConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: "~/suunto-mcp-test-missing-cache.json" })).toThrow(
      `The token cache ${join(homedir(), "suunto-mcp-test-missing-cache.json")} (SUUNTO_TOKEN_CACHE) does not exist yet.`,
    );
  });

  it("treats empty and blank values as unset (Docker Compose passes unset variables as empty strings)", () => {
    const empty = { SUUNTO_CLIENT_ID: "", SUUNTO_CLIENT_SECRET: " ", SUUNTO_SUBSCRIPTION_KEY: "", SUUNTO_CLIENT_SECRET_FILE: "", SUUNTO_SUBSCRIPTION_KEY_FILE: "  " };
    expect(suuntoKeysFromEnv(empty)).toBeUndefined();
    // All three empty is "no keys", not "only some are set".
    expect(() => loadConfig({ ...empty, SUUNTO_REFRESH_TOKEN: "rt" })).toThrow(/^SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set/);
    const c = loadConfig({
      ...base,
      SUUNTO_REDIRECT_URI: "",
      SUUNTO_UNITS: "",
      SUUNTO_READ_ONLY: "",
      SUUNTO_TOKEN_CACHE: " ",
      SUUNTO_OAUTH_URL: "",
      SUUNTO_API_URL: " ",
      SUUNTO_TIMEZONE: " ",
      TZ: "America/New_York",
      MCP_TRANSPORT: "",
      MCP_HTTP_HOST: "",
      MCP_HTTP_PORT: "",
      PORT: "4200",
      MCP_HTTP_TOKEN: "",
    });
    expect(c.suunto.redirectUri).toBe(DEFAULT_REDIRECT_URI);
    expect(c.suunto.tokenCache).toBeUndefined();
    expect(c.suunto.endpoints).toEqual(DEFAULT_ENDPOINTS);
    expect(c.units).toBe("metric");
    expect(c.readOnly).toBe(false);
    expect(c.timeZone).toBe("America/New_York");
    expect(c.transport).toBe("stdio");
    expect(c.http).toMatchObject({ host: "127.0.0.1", port: 4200 });
    expect(c.http.token).toBeUndefined();
    expect(() => loadConfig({ ...KEYS, SUUNTO_REFRESH_TOKEN: "", SUUNTO_REFRESH_TOKEN_FILE: "" })).toThrow(/No Suunto sign-in/);
  });

  it("takes the time zone from SUUNTO_TIMEZONE, else an IANA TZ, else the system", () => {
    expect(loadConfig({ ...base, TZ: "Asia/Tokyo" }).timeZone).toBe("Europe/Zurich");
    const { SUUNTO_TIMEZONE: _unused, ...noZone } = base;
    expect(loadConfig({ ...noZone, TZ: "Asia/Tokyo" }).timeZone).toBe("Asia/Tokyo");
    const warnings: string[] = [];
    const c = loadConfig({ ...noZone, TZ: ":/etc/localtime" }, {}, (w) => warnings.push(w));
    expect(c.timeZone.length).toBeGreaterThan(0);
    expect(warnings.join(" ")).toMatch(/TZ ":\/etc\/localtime" is not an IANA time zone/);
  });

  it("validates input", () => {
    expect(() => loadConfig({ ...base, SUUNTO_UNITS: "nautical" })).toThrow(/SUUNTO_UNITS/);
    expect(() => loadConfig({ ...base, SUUNTO_TIMEZONE: "Mars/Olympus" })).toThrow(/SUUNTO_TIMEZONE.*time zone/);
    expect(() => loadConfig({ ...base, SUUNTO_READ_ONLY: "maybe" })).toThrow(/SUUNTO_READ_ONLY/);
    expect(() => loadConfig({ ...base, MCP_HTTP_PORT: "99999" })).toThrow(/port/);
    expect(() => loadConfig({ ...base, MCP_TRANSPORT: "carrier-pigeon" })).toThrow(/MCP_TRANSPORT/);
    expect(() => loadConfig({ ...base, SUUNTO_CLIENT_ID: "has space" })).toThrow(/SUUNTO_CLIENT_ID must not contain spaces/);
    expect(() => loadConfig({ ...base, SUUNTO_API_URL: "http://api.example.com" })).toThrow(/SUUNTO_API_URL must use https/);
  });

  it("only checks SUUNTO_REDIRECT_URI for --login (the web service sets an https one)", () => {
    expect(loadConfig({ ...base, SUUNTO_REDIRECT_URI: "https://suunto.mcp.example/suunto/callback" }).suunto.redirectUri).toBe("https://suunto.mcp.example/suunto/callback");
  });

  it("warns about custom Suunto endpoints", () => {
    const warnings: string[] = [];
    const c = loadConfig({ ...base, SUUNTO_OAUTH_URL: "http://127.0.0.1:9999/oauth-mock/", SUUNTO_API_URL: "https://api.example.com" }, {}, (w) => warnings.push(w));
    expect(c.suunto.endpoints).toEqual({ oauthUrl: "http://127.0.0.1:9999/oauth-mock", apiUrl: "https://api.example.com" });
    expect(warnings.join(" ")).toMatch(/custom Suunto endpoints \(SUUNTO_OAUTH_URL, SUUNTO_API_URL\)/);
    expect(describeConfig(c).custom_endpoints).toEqual(["SUUNTO_OAUTH_URL", "SUUNTO_API_URL"]);
  });

  it("refuses unauthenticated public HTTP binds", () => {
    expect(() => loadConfig(base, { transport: "http", host: "0.0.0.0" })).toThrow(/MCP_HTTP_TOKEN/);
    const c = loadConfig({ ...base, MCP_HTTP_TOKEN: "long-random-token-value" }, { transport: "http", host: "0.0.0.0" });
    expect(c.http.token).toBe("long-random-token-value");
    expect(c.secrets).toContain("long-random-token-value");
    expect(loadConfig(base, { transport: "http" }).http.host).toBe("127.0.0.1");
  });

  it("never exposes secrets or keys in the description", () => {
    const c = loadConfig({ ...base, MCP_HTTP_TOKEN: "long-random-token-value" });
    const text = JSON.stringify(describeConfig(c));
    for (const secret of c.secrets) expect(text).not.toContain(secret);
    expect(text).not.toContain("client-invented");
    expect(describeConfig(c)).toEqual({ app_keys: "set", sign_in: "SUUNTO_REFRESH_TOKEN", units: "metric", read_only: false, time_zone: "Europe/Zurich" });
  });
});

describe("suuntoKeysFromEnv (web service)", () => {
  it("is undefined without keys and refuses only some of them", () => {
    expect(suuntoKeysFromEnv({})).toBeUndefined();
    expect(suuntoKeysFromEnv(KEYS)).toEqual({ clientId: "client-invented", clientSecret: "secret-invented-value", subscriptionKey: "subkey-invented-value" });
    expect(() => suuntoKeysFromEnv({ SUUNTO_CLIENT_ID: "c", SUUNTO_SUBSCRIPTION_KEY: "k" })).toThrow(/^SUUNTO_CLIENT_SECRET is not set/);
    // Never the values in a message.
    try {
      suuntoKeysFromEnv({ SUUNTO_CLIENT_SECRET: "secret-invented-value" });
    } catch (error) {
      expect((error as Error).message).not.toContain("secret-invented-value");
    }
  });
});

describe("loadLoginConfig (--login)", () => {
  const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-login-"));
  const cache = join(dir, "tokens.json");

  it("needs the app keys and SUUNTO_TOKEN_CACHE, but no sign-in", () => {
    const c = loadLoginConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: cache });
    expect(c.suunto.tokenCache).toBe(cache);
    expect(c.suunto.refreshToken).toBeUndefined();
    expect(c.suunto.redirectUri).toBe(DEFAULT_REDIRECT_URI);
    expect(c.transport).toBe("stdio");
    expect(() => loadLoginConfig(KEYS)).toThrow(/SUUNTO_TOKEN_CACHE is not set/);
    expect(() => loadLoginConfig({ SUUNTO_TOKEN_CACHE: cache })).toThrow(/SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set/);
  });

  it("accepts only a loopback http redirect URI, as written", () => {
    for (const ok of ["http://localhost:8723/callback", "http://127.0.0.1:9000/cb", "http://[::1]:8723/callback", "http://localhost:8723"]) {
      expect(loadLoginConfig({ ...KEYS, SUUNTO_TOKEN_CACHE: cache, SUUNTO_REDIRECT_URI: ok }).suunto.redirectUri).toBe(ok);
    }
    expect(() => checkRedirectUri("https://localhost:8723/callback")).toThrow(/plain http address on this machine/);
    expect(() => checkRedirectUri("http://suunto.mcp.example/callback")).toThrow(/plain http address on this machine/);
    expect(() => checkRedirectUri("http://192.168.1.2:8723/callback")).toThrow(/plain http address on this machine/);
    expect(() => checkRedirectUri("not a url")).toThrow(/not a valid URL/);
    expect(() => checkRedirectUri("http://user:pw@localhost:8723/callback")).toThrow(/user name or password/);
    expect(() => checkRedirectUri("http://localhost:8723/callback#x")).toThrow(/fragment/);
  });
});

describe("token cache (SUUNTO_TOKEN_CACHE)", () => {
  const access = fakeJwt({ claims: { user: "cachetester" } });
  const tokens = { refreshToken: "rt-invented-cache-value", accessToken: access, accessTokenExpiresAt: 1_900_000_000_000, clientId: "client-invented" };

  it("is written atomically, readable by the owner only, and read back", () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-tokens-"));
    const file = join(dir, "sub", "tokens.json");
    const logs: string[] = [];
    fileTokenSink(file, (m) => logs.push(m)).save(tokens);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    // The username comes from the access token's "user" claim.
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ ...tokens, username: "cachetester" });
    expect(readTokenCache(file, "client-invented")).toEqual(tokens);
    expect(readTokenCache(file)).toEqual(tokens);
    expect(logs).toEqual([]);
    writeTokenCache(file, { refreshToken: "rt-only", clientId: "client-invented" }, "named");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ refreshToken: "rt-only", clientId: "client-invented", username: "named" });
    expect(readTokenCache(file)).toEqual({ refreshToken: "rt-only", clientId: "client-invented" });
  });

  it("never writes through a file or symlink placed at a temporary path", () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-tokens-"));
    const file = join(dir, "tokens.json");
    // A predictable temporary name: a world-readable file, then a symlink to a file of someone else.
    const planted = `${file}.${process.pid}.tmp`;
    writeFileSync(planted, "");
    chmodSync(planted, 0o666);
    fileTokenSink(file, () => {}).save(tokens);
    expect(lstatSync(file).isFile()).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(planted, "utf8")).toBe("");

    const dir2 = mkdtempSync(join(tmpdir(), "suunto-mcp-tokens-"));
    const file2 = join(dir2, "tokens.json");
    const target = join(dir2, "someone-elses-file");
    writeFileSync(target, "");
    symlinkSync(target, `${file2}.${process.pid}.tmp`);
    fileTokenSink(file2, () => {}).save(tokens);
    expect(lstatSync(file2).isFile()).toBe(true);
    expect(lstatSync(file2).isSymbolicLink()).toBe(false);
    expect(statSync(file2).mode & 0o777).toBe(0o600);
    expect(readFileSync(target, "utf8")).toBe("");
    // No temporary file of ours is left behind.
    expect(readdirSync(dir2).filter((n) => n.endsWith(".tmp") && n !== `tokens.json.${process.pid}.tmp`)).toEqual([]);
  });

  it("ignores a cache of another app, and broken or missing files", () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-tokens-"));
    const file = join(dir, "tokens.json");
    writeTokenCache(file, tokens);
    expect(readTokenCache(file, "another-client")).toBeUndefined();
    writeFileSync(file, "not json");
    expect(readTokenCache(file)).toBeUndefined();
    writeFileSync(file, JSON.stringify({ refreshToken: "", clientId: "c" }));
    expect(readTokenCache(file)).toBeUndefined();
    writeFileSync(file, JSON.stringify({ refreshToken: "rt" }));
    expect(readTokenCache(file)).toBeUndefined();
    // An expiry without an access token is dropped; a bad expiry too.
    writeFileSync(file, JSON.stringify({ refreshToken: "rt", clientId: "c", accessTokenExpiresAt: 5, accessToken: access + "x", extra: 1 }));
    expect(readTokenCache(file)).toEqual({ refreshToken: "rt", clientId: "c", accessToken: access + "x", accessTokenExpiresAt: 5 });
    writeFileSync(file, JSON.stringify({ refreshToken: "rt", clientId: "c", accessTokenExpiresAt: "soon", accessToken: access }));
    expect(readTokenCache(file)).toEqual({ refreshToken: "rt", clientId: "c", accessToken: access });
    expect(readTokenCache(join(dir, "missing.json"))).toBeUndefined();
  });

  it("says why a cache cannot be used", () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-tokens-"));
    const file = join(dir, "tokens.json");
    expect(inspectTokenCache(file)).toEqual({ problem: "does not exist", missing: true });
    writeTokenCache(file, tokens);
    expect(inspectTokenCache(file, "client-invented")).toEqual({ tokens });
    expect(inspectTokenCache(file, "another-client")).toEqual({ problem: "was written for another Suunto app (another SUUNTO_CLIENT_ID)", missing: false });
    writeFileSync(file, "[]");
    expect(inspectTokenCache(file)).toEqual({ problem: "is not a valid token cache (not JSON; it may be damaged)", missing: false });
    expect(inspectTokenCache(dir)).toEqual({ problem: "cannot be read (EISDIR)", missing: false });
  });

  it("reads the file again on load(): tokens saved by another process or by --login", () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-tokens-"));
    const file = join(dir, "tokens.json");
    const sink = fileTokenSink(file, () => {}, "client-invented");
    expect(sink.load?.()).toBeUndefined();
    sink.save(tokens);
    expect(sink.load?.()).toEqual(tokens);
    // Another process rotated the refresh token.
    writeTokenCache(file, { refreshToken: "rt-newer", clientId: "client-invented" });
    expect(sink.load?.()).toEqual({ refreshToken: "rt-newer", clientId: "client-invented" });
    // A sign-in of another app is not offered to the session.
    writeTokenCache(file, { refreshToken: "rt-other-app", clientId: "another-client" });
    expect(sink.load?.()).toBeUndefined();
    writeFileSync(file, "not json");
    expect(sink.load?.()).toBeUndefined();
  });

  it("logs a failed write without the token, and an invalid sign-in", () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-tokens-"));
    writeFileSync(join(dir, "file"), "x");
    const logs: string[] = [];
    // A path below a regular file cannot be created.
    const sink = fileTokenSink(join(dir, "file", "tokens.json"), (m) => logs.push(m));
    sink.save(tokens);
    sink.invalid("Suunto refused the refresh token");
    expect(logs.join("\n")).toMatch(/Could not write the Suunto token cache .*\((ENOTDIR|EEXIST)\)/);
    expect(logs.at(-1)).toBe(
      `The saved Suunto sign-in no longer works (Suunto refused the refresh token). Run suunto-mcp --login again to connect Suunto (or delete ${join(dir, "file", "tokens.json")} and restart with a new SUUNTO_REFRESH_TOKEN).`,
    );
    expect(logs.join("\n")).not.toContain(tokens.refreshToken);
    expect(logs.join("\n")).not.toContain(access);
  });
});

describe("command line", () => {
  const run = promisify(execFile);
  const cli = (args: string[], env: Record<string, string> = {}) =>
    run(process.execPath, ["--import", "tsx", "src/index.ts", ...args], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env } }).then(
      (r) => ({ code: 0, ...r }),
      (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
    );

  it("prints the help with the settings and the trademark notice", async () => {
    const { code, stdout } = await cli(["--help"]);
    expect(code).toBe(0);
    for (const word of [
      "SUUNTO_CLIENT_ID",
      "SUUNTO_CLIENT_SECRET",
      "SUUNTO_SUBSCRIPTION_KEY",
      "SUUNTO_REFRESH_TOKEN",
      "SUUNTO_TOKEN_CACHE",
      "SUUNTO_REDIRECT_URI",
      "SUUNTO_UNITS",
      "SUUNTO_READ_ONLY",
      "SUUNTO_TIMEZONE",
      "SUUNTO_CALLS_PER_MINUTE",
      "SUUNTO_CALLS_PER_USER_PER_DAY",
      "SUUNTO_CALLS_PER_USER_PER_WEEK",
      "~/.config/suunto-mcp/tokens.json",
      "--login",
      "--check",
      "--web",
      "MCP_HTTP_TOKEN",
      "http://localhost:8723/callback",
    ]) {
      expect(stdout).toContain(word);
    }
    expect(stdout).toContain("not made by, affiliated with, or endorsed by Suunto");
    expect(stdout).toContain("not medical advice");
    expect(stdout).not.toMatch(/padi/i);
    expect(stdout).not.toContain("\u2014");
  });

  it("explains configuration errors and unknown arguments", async () => {
    const bad = await cli(["--bogus"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/\[suunto-mcp\] Unknown argument: --bogus/);
    const both = await cli(["--login", "--check"]);
    expect(both.code).toBe(2);
    // --web would start the web service and never exit: --check with it is refused.
    for (const args of [["--web", "--check"], ["--check", "--web"], ["--web", "--http"], ["--web", "--stdio"]]) {
      const web = await cli(args);
      expect(web.code, args.join(" ")).toBe(2);
      expect(web.stderr).toMatch(/\[suunto-mcp\] --web cannot be combined with --check, --http or --stdio\./);
    }
    const noConfig = await cli(["--check"]);
    expect(noConfig.code).toBe(1);
    expect(noConfig.stderr).toMatch(/configuration error: SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set/);
    const noCache = await cli(["--login"], KEYS);
    expect(noCache.code).toBe(1);
    expect(noCache.stderr).toMatch(/SUUNTO_TOKEN_CACHE is not set/);
  });

  it("--check fails cleanly when Suunto cannot be reached, without printing secrets", async () => {
    const { code, stdout, stderr } = await cli(["--check"], {
      ...base,
      // Closed local ports: nothing is ever sent to Suunto from a test.
      SUUNTO_OAUTH_URL: "http://127.0.0.1:1",
      SUUNTO_API_URL: "http://127.0.0.1:1",
    });
    expect(code).toBe(1);
    const result = JSON.parse(stdout);
    expect(result.account).toMatchObject({ connected: false, demo: false, time_zone: "Europe/Zurich", check: { ok: false } });
    expect(result.account.check.error).toMatch(/Could not reach Suunto/);
    expect(result.config).toMatchObject({ app_keys: "set", custom_endpoints: ["SUUNTO_OAUTH_URL", "SUUNTO_API_URL"] });
    for (const secret of [base.SUUNTO_CLIENT_SECRET, base.SUUNTO_SUBSCRIPTION_KEY, base.SUUNTO_REFRESH_TOKEN]) {
      expect(stdout).not.toContain(secret);
      expect(stderr).not.toContain(secret);
    }
  });
});
