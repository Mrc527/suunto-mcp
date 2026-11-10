import { execFile } from "node:child_process";
import { chmodSync, lstatSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { describeConfig, loadConfig, readSecret } from "../../src/config.js";
import { DEFAULT_ENDPOINTS, customEndpoints, endpointsFromEnv } from "../../src/padi/endpoints.js";
import { fileTokenSink, readTokenCache } from "../../src/server.js";

// Invented test data only.
const base = { PADI_EMAIL: "Diver.Test@Example.com", PADI_PASSWORD: "not-a-real-password", PADI_TIMEZONE: "Europe/Zurich" };

describe("loadConfig", () => {
  it("applies the PADI defaults", () => {
    const c = loadConfig(base);
    expect(c.padi).toMatchObject({ email: "diver.test@example.com", password: "not-a-real-password", loginMethod: "auto", apiMode: "proxy" });
    expect(c.padi.endpoints).toEqual(DEFAULT_ENDPOINTS);
    expect(c.units).toBe("auto");
    expect(c.readOnly).toBe(false);
    expect(c.timeZone).toBe("Europe/Zurich");
    expect(c.transport).toBe("stdio");
    expect(c.secrets).toEqual(["not-a-real-password"]);
  });

  it("accepts a refresh token instead of the password", () => {
    const c = loadConfig({ PADI_REFRESH_TOKEN: "rt-invented-value", PADI_UNITS: "Imperial", PADI_READ_ONLY: "yes" });
    expect(c.padi.refreshToken).toBe("rt-invented-value");
    expect(c.padi.password).toBeUndefined();
    expect(c.units).toBe("imperial");
    expect(c.readOnly).toBe(true);
    expect(c.secrets).toContain("rt-invented-value");
  });

  it("reads secrets from files", () => {
    const dir = mkdtempSync(join(tmpdir(), "padi-mcp-config-"));
    writeFileSync(join(dir, "pw"), "from-a-file\n");
    expect(readSecret({ X_FILE: join(dir, "pw") }, "X")).toBe("from-a-file");
    expect(loadConfig({ PADI_EMAIL: "a@example.com", PADI_PASSWORD_FILE: join(dir, "pw") }).padi.password).toBe("from-a-file");
    expect(() => readSecret({ X_FILE: join(dir, "missing") }, "X")).toThrow(/X_FILE/);
  });

  it("accepts a token cache file as the only sign-in", () => {
    const dir = mkdtempSync(join(tmpdir(), "padi-mcp-cache-"));
    const cache = join(dir, "token.json");
    expect(() => loadConfig({ PADI_TOKEN_CACHE: cache })).toThrow(/PADI_EMAIL is not set/);
    writeFileSync(cache, "{}");
    expect(loadConfig({ PADI_TOKEN_CACHE: cache }).padi.tokenCache).toBe(cache);
  });

  it("validates input", () => {
    expect(() => loadConfig({})).toThrow(/PADI_EMAIL is not set/);
    expect(() => loadConfig({ PADI_EMAIL: "a@example.com" })).toThrow(/PADI_PASSWORD is not set/);
    expect(() => loadConfig({ PADI_PASSWORD: "x" })).toThrow(/PADI_EMAIL/);
    expect(() => loadConfig({ ...base, PADI_EMAIL: "not an address" })).toThrow(/PADI_EMAIL/);
    expect(() => loadConfig({ ...base, PADI_LOGIN_METHOD: "sso" })).toThrow(/PADI_LOGIN_METHOD/);
    expect(() => loadConfig({ ...base, PADI_API_MODE: "graphql" })).toThrow(/PADI_API_MODE/);
    expect(() => loadConfig({ ...base, PADI_UNITS: "nautical" })).toThrow(/PADI_UNITS/);
    expect(() => loadConfig({ ...base, PADI_TIMEZONE: "Mars/Olympus" })).toThrow(/time zone/);
    expect(() => loadConfig({ ...base, PADI_READ_ONLY: "maybe" })).toThrow(/PADI_READ_ONLY/);
    expect(() => loadConfig({ ...base, MCP_HTTP_PORT: "99999" })).toThrow(/port/);
  });

  it("refuses unauthenticated public HTTP binds", () => {
    expect(() => loadConfig(base, { transport: "http", host: "0.0.0.0" })).toThrow(/MCP_HTTP_TOKEN/);
    const c = loadConfig({ ...base, MCP_HTTP_TOKEN: "long-random-token-value" }, { transport: "http", host: "0.0.0.0" });
    expect(c.http.token).toBe("long-random-token-value");
    expect(c.secrets).toContain("long-random-token-value");
    expect(loadConfig(base, { transport: "http" }).http.host).toBe("127.0.0.1");
  });

  it("never exposes secrets in the description", () => {
    const c = loadConfig({ ...base, PADI_REFRESH_TOKEN: "rt-invented-value", MCP_HTTP_TOKEN: "long-random-token-value" });
    const text = JSON.stringify(describeConfig(c));
    for (const secret of c.secrets) expect(text).not.toContain(secret);
    expect(describeConfig(c)).toMatchObject({ email: "diver.test@example.com", login_method: "auto", api_mode: "proxy", units: "auto", read_only: false });
  });
});

describe("PADI endpoints", () => {
  it("defaults to the production hosts", () => {
    expect(endpointsFromEnv({})).toEqual(DEFAULT_ENDPOINTS);
    expect(DEFAULT_ENDPOINTS.clientId).toBe("2arn5r23p0ugce89a5moe95v1l");
    expect(customEndpoints(DEFAULT_ENDPOINTS)).toEqual([]);
  });

  it("takes operator overrides and warns about them", () => {
    const e = endpointsFromEnv({ PADI_LOGBOOK_URL: "http://127.0.0.1:9999/api/Logbook/", PADI_CLIENT_ID: "local-client" });
    expect(e.logbookUrl).toBe("http://127.0.0.1:9999/api/Logbook");
    expect(e.clientId).toBe("local-client");
    expect(customEndpoints(e)).toEqual(["PADI_LOGBOOK_URL", "PADI_CLIENT_ID"]);
    const warnings: string[] = [];
    loadConfig({ ...base, PADI_LOGBOOK_URL: "http://127.0.0.1:9999/gql" }, {}, (w) => warnings.push(w));
    expect(warnings.join(" ")).toContain("PADI_LOGBOOK_URL");
  });

  it("follows the region for Cognito and rejects bad values", () => {
    expect(endpointsFromEnv({ PADI_COGNITO_REGION: "eu-central-1" }).cognitoUrl).toBe("https://cognito-idp.eu-central-1.amazonaws.com/");
    expect(endpointsFromEnv({ PADI_COGNITO_URL: "http://127.0.0.1:1/" }).cognitoUrl).toBe("http://127.0.0.1:1/");
    expect(() => endpointsFromEnv({ PADI_COGNITO_REGION: "moon" })).toThrow(/region/);
    expect(() => endpointsFromEnv({ PADI_AUTH_URL: "ftp://example.com" })).toThrow(/PADI_AUTH_URL/);
    expect(() => endpointsFromEnv({ PADI_DIRECT_URL: "not a url" })).toThrow(/PADI_DIRECT_URL/);
    expect(() => endpointsFromEnv({ PADI_IMAGES_URL: "https://user:pw@example.com/" })).toThrow(/PADI_IMAGES_URL/);
  });
});

describe("token cache (PADI_TOKEN_CACHE)", () => {
  const tokens = { refreshToken: "rt-invented-cache-value", loginMethod: "cognito" as const, clientId: "client-invented" };

  it("is written atomically, readable by the owner only, and read back", () => {
    const dir = mkdtempSync(join(tmpdir(), "padi-mcp-tokens-"));
    const file = join(dir, "sub", "token.json");
    const logs: string[] = [];
    fileTokenSink(file, "diver.test@example.com", (m) => logs.push(m)).save({ ...tokens, idToken: "eyJ.not.stored", idTokenExpiresAt: 1 });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    // Only the refresh token and how it was issued: never the ID token.
    expect(saved).toEqual({ ...tokens, email: "diver.test@example.com" });
    expect(readTokenCache(file, "diver.test@example.com")).toEqual(tokens);
    expect(readTokenCache(file)).toEqual(tokens);
    expect(logs).toEqual([]);
  });

  it("never writes through a file or symlink placed at a temporary path", () => {
    const dir = mkdtempSync(join(tmpdir(), "padi-mcp-tokens-"));
    const file = join(dir, "token.json");
    // The old predictable temporary name: a world-readable file, then a symlink to a file of someone else.
    const planted = `${file}.${process.pid}.tmp`;
    writeFileSync(planted, "");
    chmodSync(planted, 0o666);
    fileTokenSink(file, undefined, () => {}).save(tokens);
    expect(lstatSync(file).isFile()).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(planted, "utf8")).toBe("");

    const dir2 = mkdtempSync(join(tmpdir(), "padi-mcp-tokens-"));
    const file2 = join(dir2, "token.json");
    const target = join(dir2, "someone-elses-file");
    writeFileSync(target, "");
    symlinkSync(target, `${file2}.${process.pid}.tmp`);
    fileTokenSink(file2, undefined, () => {}).save(tokens);
    expect(lstatSync(file2).isFile()).toBe(true);
    expect(lstatSync(file2).isSymbolicLink()).toBe(false);
    expect(statSync(file2).mode & 0o777).toBe(0o600);
    expect(readFileSync(target, "utf8")).toBe("");
    // No temporary file of ours is left behind.
    expect(readdirSync(dir2).filter((n) => n.endsWith(".tmp") && n !== `token.json.${process.pid}.tmp`)).toEqual([]);
  });

  it("ignores a cache of another account, and broken or missing files", () => {
    const dir = mkdtempSync(join(tmpdir(), "padi-mcp-tokens-"));
    const file = join(dir, "token.json");
    fileTokenSink(file, "diver.test@example.com", () => {}).save(tokens);
    expect(readTokenCache(file, "someone.else@example.com")).toBeUndefined();
    writeFileSync(file, "not json");
    expect(readTokenCache(file)).toBeUndefined();
    writeFileSync(file, JSON.stringify({ ...tokens, loginMethod: "sso" }));
    expect(readTokenCache(file)).toBeUndefined();
    expect(readTokenCache(join(dir, "missing.json"))).toBeUndefined();
  });

  it("logs a failed write without the token, and an invalid sign-in", () => {
    const dir = mkdtempSync(join(tmpdir(), "padi-mcp-tokens-"));
    writeFileSync(join(dir, "file"), "x");
    const logs: string[] = [];
    // A path below a regular file cannot be created.
    const sink = fileTokenSink(join(dir, "file", "token.json"), undefined, (m) => logs.push(m));
    sink.save(tokens);
    sink.invalid("expired");
    expect(logs.join("\n")).toMatch(/Could not write the PADI token cache/);
    expect(logs.join("\n")).toMatch(/Sign in again/);
    expect(logs.join("\n")).not.toContain(tokens.refreshToken);
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
    for (const word of ["PADI_EMAIL", "PADI_PASSWORD", "PADI_REFRESH_TOKEN", "PADI_TOKEN_CACHE", "PADI_UNITS", "PADI_READ_ONLY", "PADI_TIMEZONE", "--check", "MCP_HTTP_TOKEN"]) {
      expect(stdout).toContain(word);
    }
    expect(stdout).toContain("not made by, affiliated with, or endorsed by PADI");
    expect(stdout).not.toContain("\u2014");
  });

  it("explains configuration errors and unknown arguments", async () => {
    const bad = await cli(["--bogus"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/Unknown argument: --bogus/);
    const noConfig = await cli(["--check"]);
    expect(noConfig.code).toBe(1);
    expect(noConfig.stderr).toMatch(/PADI_EMAIL is not set/);
  });

  it("--check fails cleanly when PADI cannot be reached, without printing secrets", async () => {
    const { code, stdout } = await cli(["--check"], {
      PADI_EMAIL: "diver.test@example.com",
      PADI_PASSWORD: "not-a-real-password",
      // Closed local ports: nothing is ever sent to PADI from a test.
      PADI_COGNITO_URL: "http://127.0.0.1:1/",
      PADI_AUTH_URL: "http://127.0.0.1:1/auth/api",
      PADI_LOGBOOK_URL: "http://127.0.0.1:1/api/Logbook",
    });
    expect(code).toBe(1);
    const result = JSON.parse(stdout);
    expect(result.logbook.ok).toBe(false);
    expect(result.config).toMatchObject({ email: "diver.test@example.com", custom_endpoints: expect.arrayContaining(["PADI_COGNITO_URL"]) });
    expect(stdout).not.toContain("not-a-real-password");
  });
});
