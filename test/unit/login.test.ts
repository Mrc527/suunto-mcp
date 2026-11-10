import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, loadLoginConfig, type AppConfig } from "../../src/config.js";
import { closeServices, createServices, readTokenCache, runLogin, type LoginResult } from "../../src/server.js";
import { SuuntoAuthError } from "../../src/suunto/oauth.js";
import { startMockSuunto, type MockSuunto } from "../helpers/mock-suunto.js";

let mock: MockSuunto;

beforeAll(async () => {
  mock = await startMockSuunto();
});

afterAll(async () => {
  await mock.close();
});

beforeEach(() => {
  mock.deny = false;
});

/** A port that was free a moment ago. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function setup(host = "127.0.0.1"): Promise<{ config: AppConfig; cache: string; redirectUri: string }> {
  const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-login-"));
  const cache = join(dir, "tokens.json");
  const redirectUri = `http://${host}:${await freePort()}/callback`;
  const config = loadLoginConfig({ ...mock.env(), SUUNTO_TOKEN_CACHE: cache, SUUNTO_REDIRECT_URI: redirectUri, SUUNTO_TIMEZONE: "Europe/Zurich" });
  return { config, cache, redirectUri };
}

/** What a browser does with the authorize URL: Suunto's page answers with a redirect to us. */
async function browse(authorizeUrl: string): Promise<{ status: number; text: string; headers: Headers }> {
  const suunto = await fetch(authorizeUrl, { redirect: "manual" });
  const location = suunto.headers.get("location");
  if (!location) throw new Error(`no redirect from the mock (HTTP ${suunto.status})`);
  const back = await fetch(location);
  return { status: back.status, text: await back.text(), headers: back.headers };
}

/** Run the login; `browser` runs once the local server listens. */
async function login(config: AppConfig, browser: (url: string) => Promise<unknown>, timeoutMs?: number) {
  const lines: string[] = [];
  let page: Promise<unknown> = Promise.resolve();
  const result = runLogin(config, {
    print: (line) => lines.push(line),
    onListening: (url) => {
      page = browser(url);
    },
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
  const outcome = await result.then(
    (ok: LoginResult) => ({ ok }),
    (error: unknown) => ({ error }),
  );
  return { ...outcome, page: await page, lines };
}

describe("suunto-mcp --login", () => {
  it("prints the authorize URL, exchanges the code and writes the token cache", async () => {
    const { config, cache, redirectUri } = await setup();
    const run = await login(config, browse);
    expect("ok" in run).toBe(true);
    const result = (run as { ok: LoginResult }).ok;
    expect(result.username).toBe(mock.username);
    expect(result.tokenCache).toBe(cache);
    expect(result.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    expect(run.page).toMatchObject({ status: 200 });
    const page = run.page as { text: string; headers: Headers };
    expect(page.text).toContain(`Signed in to Suunto as ${mock.username}`);
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("cache-control")).toBe("no-store");

    // The printed address is Suunto's authorize page with this app, the redirect URI and a random state.
    const printed = run.lines.find((l) => l.includes("/oauth/authorize?"))!;
    const url = new URL(printed);
    expect(url.origin + url.pathname).toBe(`${mock.oauthUrl}/oauth/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(mock.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(run.lines.join("\n")).toMatch(/at most 10 minutes/);

    // The code was used once, with the same redirect URI (the mock refuses another one); the cache
    // is private and holds the newest tokens.
    expect(mock.state.codes.at(-1)).toMatchObject({ redirectUri, used: true });
    expect(statSync(cache).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(readFileSync(cache, "utf8"));
    expect(saved).toMatchObject({ clientId: mock.clientId, username: mock.username });
    expect(saved.refreshToken).toBeTruthy();
    expect(saved.accessToken).toBeTruthy();
    expect(saved.accessTokenExpiresAt).toBe(result.accessTokenExpiresAt);
    // Nothing secret in the printed lines.
    expect(run.lines.join("\n")).not.toContain(saved.refreshToken);
    expect(run.lines.join("\n")).not.toContain(mock.clientSecret);

    // The server then starts from the cache and reads data without signing in again.
    const served = loadConfig({ ...mock.env(), SUUNTO_TOKEN_CACHE: cache, SUUNTO_TIMEZONE: "Europe/Zurich" });
    expect(readTokenCache(cache, mock.clientId)?.refreshToken).toBe(saved.refreshToken);
    const services = createServices(served);
    const before = mock.count("/oauth/token");
    expect(await services.activity!.account()).toMatchObject({ username: mock.username });
    expect((await services.activity!.check()).ok).toBe(true);
    expect(mock.count("/oauth/token")).toBe(before);
    await closeServices(services);
  });

  it("answers 400 to a callback of another sign-in and keeps waiting", async () => {
    const { config, cache, redirectUri } = await setup();
    const answers: Array<{ status: number; text: string }> = [];
    const run = await login(config, async (url) => {
      const base = new URL(redirectUri);
      for (const query of ["?state=wrong&code=abc", "?code=abc", "?state=wrong&error=access_denied"]) {
        const res = await fetch(`${base.origin}${base.pathname}${query}`);
        answers.push({ status: res.status, text: await res.text() });
      }
      const other = await fetch(`${base.origin}/elsewhere?state=x`);
      answers.push({ status: other.status, text: await other.text() });
      return browse(url);
    });
    expect(answers.map((a) => a.status)).toEqual([400, 400, 400, 404]);
    expect(answers[0]!.text).toContain("does not belong to the sign-in");
    expect("ok" in run && run.ok.username).toBe(mock.username);
    expect(run.lines.join("\n")).toMatch(/Ignored a callback with a state that does not belong/);
    expect(run.lines.join("\n")).toMatch(/Ignored a callback without a state/);
    expect(existsSync(cache)).toBe(true);
  });

  it("ends with the error when Suunto sends the browser back with ?error=", async () => {
    const { config, cache } = await setup();
    mock.deny = true;
    const run = await login(config, browse);
    expect("error" in run).toBe(true);
    const error = (run as { error: unknown }).error;
    expect(error).toBeInstanceOf(SuuntoAuthError);
    expect((error as SuuntoAuthError).code).toBe("denied");
    expect((error as Error).message).toMatch(/You did not allow access/);
    expect(run.page).toMatchObject({ status: 400 });
    expect(existsSync(cache)).toBe(false);
  });

  it("ends with a clear error when the code exchange fails, and writes nothing", async () => {
    const { config, cache } = await setup();
    mock.failNext("/oauth/token", 400, { error: "invalid_grant", error_description: "Invalid authorization code" });
    const run = await login(config, browse);
    expect((run as { error: Error }).error.message).toMatch(/Suunto did not accept the sign-in/);
    expect(run.page).toMatchObject({ status: 502 });
    expect((run.page as { text: string }).text).toMatch(/Suunto did not accept the sign-in/);
    expect(existsSync(cache)).toBe(false);
  });

  it("gives up after the time limit", async () => {
    const { config } = await setup();
    const run = await login(config, async () => undefined, 150);
    expect((run as { error: Error }).error.message).toBe("No answer from Suunto within 1 minute. Run suunto-mcp --login again.");
  });

  it("explains a port that is in use", async () => {
    const { config, redirectUri } = await setup();
    const blocker: Server = createServer();
    await new Promise<void>((resolve) => blocker.listen(Number(new URL(redirectUri).port), "127.0.0.1", resolve));
    try {
      await expect(runLogin(config, { print: () => {} })).rejects.toThrow(/is in use.*SUUNTO_REDIRECT_URI/);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it("listens on localhost", async () => {
    const { config } = await setup("localhost");
    const run = await login(config, browse);
    expect("ok" in run && run.ok.username).toBe(mock.username);
  });
});

describe("suunto-mcp --login (command line)", () => {
  /** Start the CLI, open the printed address like a browser, and wait for the exit. */
  async function cli(env: Record<string, string>): Promise<{ code: number | null; stderr: string; page?: { status: number; text: string } }> {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts", "--login"], {
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let page: Promise<{ status: number; text: string }> | undefined;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      const line = stderr.split("\n").find((l) => l.includes("/oauth/authorize?"));
      if (line && !page) page = browse(line.trim()).catch((error: Error) => ({ status: 0, text: error.message }));
    });
    const code = await new Promise<number | null>((resolve) => child.on("exit", (c) => resolve(c)));
    return { code, stderr, ...(page ? { page: await page } : {}) };
  }

  it("signs in, prints the username and exits 0; a refusal exits 1", async () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-login-cli-"));
    const cache = join(dir, "tokens.json");
    const env = { ...mock.env(), SUUNTO_TOKEN_CACHE: cache, SUUNTO_REDIRECT_URI: `http://127.0.0.1:${await freePort()}/callback` };
    const ok = await cli(env);
    expect(ok.code, ok.stderr).toBe(0);
    expect(ok.stderr).toContain(`[suunto-mcp] Signed in to Suunto as ${mock.username}.`);
    expect(ok.page?.status).toBe(200);
    expect(readTokenCache(cache, mock.clientId)).toBeTruthy();
    expect(ok.stderr).not.toContain(mock.clientSecret);
    expect(ok.stderr).not.toContain(mock.subscriptionKey);

    mock.deny = true;
    const refused = await cli({ ...env, SUUNTO_REDIRECT_URI: `http://127.0.0.1:${await freePort()}/callback` });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/\[suunto-mcp\] login failed: You did not allow access/);
  });
});
