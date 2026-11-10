/** Test helpers: a cookie-jar browser and an OAuth client that behaves like Claude. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { expect } from "vitest";

let base = "";
export function setBase(url: string): void {
  base = url;
}

/** fetch with a cookie jar and no automatic redirects. */
export class Browser {
  jar = new Map<string, string>();
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.jar.size) headers.set("cookie", [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await fetch(path.startsWith("http") ? path : `${base}${path}`, { ...init, headers, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i);
      const value = pair!.slice(i + 1);
      if (/Max-Age=0/i.test(c) || value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return res;
  }
  async page(path: string): Promise<{ res: Response; html: string; csrf: string }> {
    const res = await this.fetch(path);
    const html = await res.text();
    const csrf = html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? "";
    return { res, html, csrf };
  }
  async post(path: string, form: Record<string, string>): Promise<Response> {
    return this.fetch(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
  }
  async signup(email: string, password: string, extra: Record<string, string> = {}): Promise<Response> {
    const { csrf } = await this.page("/signup");
    return this.post("/signup", { _csrf: csrf, email, password, password2: password, consent: "on", ...extra });
  }
  async login(email: string, password: string): Promise<Response> {
    const { csrf } = await this.page("/login");
    return this.post("/login", { _csrf: csrf, email, password });
  }
}

/** In-memory OAuth client provider that completes the consent page with a signed-in browser. */
export class TestOAuthClient implements OAuthClientProvider {
  info: OAuthClientInformationMixed | undefined;
  savedTokens: OAuthTokens | undefined;
  verifier = "";
  authCode: string | undefined;
  constructor(
    readonly browser: Browser,
    readonly decision: "allow" | "deny" = "allow",
  ) {}
  get redirectUrl() {
    return "https://claude.ai/api/mcp/auth_callback";
  }
  get clientMetadata(): OAuthClientMetadata {
    return { client_name: "Claude", redirect_uris: [this.redirectUrl], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
  }
  clientInformation() {
    return this.info;
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.info = info;
  }
  tokens() {
    return this.savedTokens;
  }
  saveTokens(tokens: OAuthTokens) {
    this.savedTokens = tokens;
  }
  saveCodeVerifier(v: string) {
    this.verifier = v;
  }
  codeVerifier() {
    return this.verifier;
  }
  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier") {
    if (scope === "all" || scope === "tokens") this.savedTokens = undefined;
    if (scope === "all" || scope === "client") this.info = undefined;
  }
  async redirectToAuthorization(url: URL) {
    const first = await this.browser.fetch(url.href);
    expect(first.status).toBe(302);
    const consentUrl = first.headers.get("location")!;
    expect(consentUrl).toMatch(/^\/oauth\/consent\?request=/);
    const consent = await this.browser.page(consentUrl);
    expect(consent.res.status).toBe(200);
    expect(consent.html).toContain("Allow access to your PADI logbook?");
    expect(consent.res.headers.get("content-security-policy")).toContain("form-action 'self' https://claude.ai");
    const request = consent.html.match(/name="request" value="([^"]+)"/)![1]!;
    const done = await this.browser.post("/oauth/consent", { _csrf: consent.csrf, request, decision: this.decision });
    expect(done.status).toBe(303);
    const target = new URL(done.headers.get("location")!);
    expect(target.origin + target.pathname).toBe(this.redirectUrl);
    expect(target.searchParams.get("iss")).toBe(base);
    this.authCode = target.searchParams.get("code") ?? undefined;
  }
}

export async function connectMcp(oauth: TestOAuthClient): Promise<Client> {
  const url = new URL(`${base}/mcp`);
  const first = new StreamableHTTPClientTransport(url, { authProvider: oauth });
  const client = new Client({ name: "claude-test", version: "1.0.0" });
  try {
    await client.connect(first);
    return client;
  } catch (error) {
    if (!oauth.authCode) throw error;
  }
  await first.finishAuth(oauth.authCode!);
  oauth.authCode = undefined;
  const client2 = new Client({ name: "claude-test", version: "1.0.0" });
  await client2.connect(new StreamableHTTPClientTransport(url, { authProvider: oauth }));
  return client2;
}

