/**
 * OAuth 2.1 authorization server for MCP clients such as Claude (claude.ai custom connectors).
 *
 * - Dynamic Client Registration (RFC 7591) and Client ID Metadata Documents (client_id is an
 *   https URL pointing at the client's metadata, as in the MCP 2025-11-25 authorization spec).
 * - Authorization code flow with PKCE (S256, verified by the SDK token handler).
 * - The /authorize step stores the request and sends the browser to our consent page, where the
 *   user signs in and approves.
 * - Opaque tokens, stored as SHA-256 hashes. Refresh tokens rotate; reuse of a refresh token
 *   revokes the whole grant. Access tokens are bound to this server's MCP URL (RFC 8707).
 */

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
  AccessDeniedError,
  InvalidClientError,
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { sha256 } from "./crypto.js";
import type { Store } from "./store.js";

export const SCOPE = "padi";
/** A rotated refresh token is still accepted for this long (client retries after a timeout). */
const REFRESH_REUSE_GRACE_MS = 60_000;

export interface OAuthProviderOptions {
  store: Store;
  /** Issuer identifier exactly as published in the metadata (no trailing slash). */
  issuer: string;
  /** The protected resource (MCP endpoint) URL. */
  mcpUrl: URL;
  /** Allow client metadata documents on private/loopback addresses (tests only). */
  allowPrivateMetadataHosts?: boolean;
  log: (m: string) => void;
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/** Expand an IPv6 address (any notation, including embedded IPv4) to 8 16-bit groups. */
function ipv6Groups(ip: string): number[] | undefined {
  let v = ip.toLowerCase().split("%")[0]!;
  const v4 = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4[1]!.split(".").map(Number);
    if (n.some((x) => x > 255)) return undefined;
    v = v.slice(0, -v4[1]!.length) + `${((n[0]! << 8) | n[1]!).toString(16)}:${((n[2]! << 8) | n[3]!).toString(16)}`;
  }
  const halves = v.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return undefined;
  const groups = [...head, ...Array(Math.max(0, missing)).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : undefined;
}

/**
 * Is this an IP that must not be contacted when fetching client metadata documents (private,
 * loopback, link-local, multicast, or an IPv6 form that embeds such an IPv4 address)?
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateV4(ip);
  const g = ipv6Groups(ip);
  if (!g) return true; // unparseable: refuse
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  const zeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroPrefix(8)) return true; // ::
  if (zeroPrefix(7) && g[7] === 1) return true; // ::1
  if (zeroPrefix(5) && g[5] === 0xffff) return isPrivateV4(v4(g[6]!, g[7]!)); // ::ffff:a.b.c.d
  if (zeroPrefix(6)) return true; // ::a.b.c.d (deprecated IPv4-compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64 64:ff9b::/96 (and /48)
  if (g[0] === 0x2002) return true; // 6to4 embeds IPv4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  const first = g[0]!;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((first & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** GET a small JSON document, connecting only to an address that passed the private-address check. */
async function fetchMetadataDocument(url: URL, allowPrivate: boolean): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let address = host;
  let family = isIP(host);
  if (!family) {
    const addresses = await lookup(host, { all: true }).catch(() => []);
    if (!addresses.length) throw new Error("host cannot be resolved");
    if (!allowPrivate && addresses.some((a) => isPrivateAddress(a.address))) throw new Error("host resolves to a private address");
    address = addresses[0]!.address;
    family = addresses[0]!.family;
  } else if (!allowPrivate && isPrivateAddress(host)) {
    throw new Error("host is a private address");
  }
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<string>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: { accept: "application/json", "user-agent": "padi-mcp" },
        // Pin the connection to the address that was checked (no DNS rebinding between check and use).
        lookup: ((_h: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) =>
          opts && opts.all ? cb(null, [{ address, family }]) : cb(null, address, family)) as unknown as LookupFunction,
        timeout: 5000,
      },
      (res) => {
        if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}${res.statusCode && res.statusCode >= 300 && res.statusCode < 400 ? " (redirects are not followed)" : ""}`));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > CIMD_MAX_BYTES) {
            req.destroy(new Error("document too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    // Overall deadline (the socket timeout above only covers idle periods).
    const deadline = setTimeout(() => req.destroy(new Error("timed out")), 5000);
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
    req.end();
  });
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/** Redirect URIs must be https, http on loopback (native apps) or a private-use scheme. */
export function validateRedirectUri(uri: string): void {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    throw new InvalidClientMetadataError(`Invalid redirect_uri: ${uri}`);
  }
  if (u.hash) throw new InvalidClientMetadataError("redirect_uri must not contain a fragment");
  if (u.protocol === "https:") return;
  if (u.protocol === "http:" && isLoopbackHost(u.hostname)) return;
  // Private-use schemes for native apps (RFC 8252 7.1), e.g. com.example.app:/callback
  if (/^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/i.test(u.protocol)) return;
  throw new InvalidClientMetadataError(`redirect_uri must use https (got ${u.protocol}//${u.host})`);
}

/** Metadata documents are re-fetched after this time (Claude serves them with max-age=300). */
const CIMD_TTL_MS = 3600_000;

/**
 * Copies of Claude's published client metadata documents, used when fetching them fails (some
 * data centers get a bot challenge from claude.ai or chatgpt.com). Claude's fetched 2026-11-07,
 * ChatGPT's and Codex's 2026-11-08.
 */
const PINNED_METADATA: Record<string, Record<string, unknown>> = {
  "https://claude.ai/oauth/mcp-oauth-client-metadata": {
    client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "none",
  },
  "https://claude.ai/oauth/claude-code-client-metadata": {
    client_id: "https://claude.ai/oauth/claude-code-client-metadata",
    client_name: "Claude Code",
    redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "none",
  },
  "https://chatgpt.com/oauth/client.json": {
    client_id: "https://chatgpt.com/oauth/client.json",
    client_name: "ChatGPT",
    client_uri: "https://chatgpt.com/",
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
  },
  "https://chatgpt.com/oauth/codex/client.json": {
    client_id: "https://chatgpt.com/oauth/codex/client.json",
    client_name: "Codex",
    client_uri: "https://chatgpt.com/codex",
    redirect_uris: ["http://127.0.0.1/callback", "http://localhost/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "none",
  },
};
const CIMD_MAX_BYTES = 64 * 1024;

/** Recently fetched metadata documents and recent failures, kept in memory (bounded). */
class MetadataCache {
  private readonly ok = new Map<string, { client: OAuthClientInformationFull; at: number }>();
  private readonly failed = new Map<string, { error: string; at: number }>();
  constructor(private readonly max = 500) {}
  get(id: string): OAuthClientInformationFull | undefined {
    const e = this.ok.get(id);
    return e && Date.now() - e.at < CIMD_TTL_MS ? e.client : undefined;
  }
  stale(id: string): OAuthClientInformationFull | undefined {
    return this.ok.get(id)?.client;
  }
  set(id: string, client: OAuthClientInformationFull): void {
    this.ok.delete(id);
    if (this.ok.size >= this.max) this.ok.delete(this.ok.keys().next().value!);
    this.ok.set(id, { client, at: Date.now() });
    this.failed.delete(id);
  }
  recentFailure(id: string): string | undefined {
    const f = this.failed.get(id);
    return f && Date.now() - f.at < 60_000 ? f.error : undefined;
  }
  fail(id: string, error: string): void {
    if (this.failed.size >= this.max) this.failed.delete(this.failed.keys().next().value!);
    this.failed.set(id, { error, at: Date.now() });
  }
}

/** At most this many client metadata documents are fetched at the same time. */
const MAX_CONCURRENT_FETCHES = 4;

export class OAuthProvider implements OAuthServerProvider {
  private readonly metadata = new MetadataCache();
  private fetching = 0;

  constructor(private readonly opts: OAuthProviderOptions) {}

  private get store(): Store {
    return this.opts.store;
  }

  private redirectAllowed(uri: string): boolean {
    const hosts = this.store.getSettings().allowedRedirectHosts;
    if (!hosts.length) return true;
    try {
      const host = new URL(uri).hostname.toLowerCase();
      return hosts.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
    } catch {
      return false;
    }
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId: string) => this.getClient(clientId),
      registerClient: (client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) => this.registerClient(client),
    };
  }

  private async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    if (/^https?:\/\//i.test(clientId)) return this.getMetadataDocumentClient(clientId);
    return this.store.getClient(clientId)?.client;
  }

  private registerClient(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">): OAuthClientInformationFull {
    const settings = this.store.getSettings();
    if (!settings.allowDynamicRegistration) {
      throw new InvalidClientMetadataError("Dynamic client registration is disabled on this server");
    }
    if (!client.redirect_uris?.length) throw new InvalidClientMetadataError("redirect_uris is required");
    for (const uri of client.redirect_uris) {
      validateRedirectUri(String(uri));
      if (!this.redirectAllowed(String(uri))) {
        throw new InvalidClientMetadataError(`This server does not accept clients redirecting to ${new URL(String(uri)).host}`);
      }
    }
    if (client.redirect_uris.length > 10) throw new InvalidClientMetadataError("At most 10 redirect_uris are allowed");
    if (client.redirect_uris.some((u) => String(u).length > 2000)) throw new InvalidClientMetadataError("redirect_uri is too long");
    // Every client is public (PKCE protects the code exchange): no secret. Only the fields the
    // server needs are stored, with bounded sizes, so anonymous registrations stay small.
    const given = client as OAuthClientInformationFull;
    const short = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : undefined);
    const full = {
      client_id: given.client_id,
      client_id_issued_at: given.client_id_issued_at,
      redirect_uris: given.redirect_uris.map(String),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...(short(given.client_name, 200) ? { client_name: short(given.client_name, 200) } : {}),
      ...(short(given.client_uri, 500) ? { client_uri: short(given.client_uri, 500) } : {}),
      ...(short(given.logo_uri, 500) ? { logo_uri: short(given.logo_uri, 500) } : {}),
    } as OAuthClientInformationFull;
    if (!full.client_id) throw new InvalidClientMetadataError("client_id was not generated");
    this.store.saveClient(full, "dcr");
    this.opts.log(`Registered OAuth client "${full.client_name ?? full.client_id}"`);
    return full;
  }

  /** Client ID Metadata Document: fetch and validate the JSON published at the client_id URL. */
  private async getMetadataDocumentClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    if (!this.store.getSettings().allowClientMetadataDocuments) return undefined;
    // Documents are only persisted once a user approved the client (see approve()); until then
    // they live in a bounded memory cache, so anonymous requests cannot grow the database.
    const fresh = this.metadata.get(clientId);
    if (fresh) return fresh;
    const stored = this.store.getClient(clientId);
    if (stored && stored.fetchedAt && Date.now() - stored.fetchedAt < CIMD_TTL_MS) return stored.client;
    const cached = stored ?? (this.metadata.stale(clientId) ? { client: this.metadata.stale(clientId)! } : undefined);
    const recent = this.metadata.recentFailure(clientId);
    if (recent) {
      if (cached) return cached.client;
      throw new InvalidClientError(`Could not fetch the client metadata document: ${recent}`);
    }

    let url: URL;
    try {
      url = new URL(clientId);
    } catch {
      return undefined;
    }
    const insecureOk = this.opts.allowPrivateMetadataHosts && url.protocol === "http:";
    if ((url.protocol !== "https:" && !insecureOk) || url.hash || url.username || url.password || url.pathname === "/") {
      throw new InvalidClientError("client_id URL must be an https URL with a path");
    }
    let doc: Record<string, unknown>;
    try {
      if (this.fetching >= MAX_CONCURRENT_FETCHES) throw new Error("too many metadata documents are being fetched right now");
      this.fetching++;
      let text: string;
      try {
        text = await fetchMetadataDocument(url, !!this.opts.allowPrivateMetadataHosts);
      } finally {
        this.fetching--;
      }
      doc = JSON.parse(text) as Record<string, unknown>;
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("not a JSON object");
    } catch (error) {
      const busy = /too many metadata documents/.test((error as Error).message);
      // Remember real failures for a minute (but not "busy", which says nothing about the client).
      if (!busy) this.metadata.fail(clientId, (error as Error).message);
      if (cached) return cached.client; // keep working with the last good copy
      const pinned = PINNED_METADATA[clientId];
      if (!pinned) throw new InvalidClientError(`Could not fetch the client metadata document: ${(error as Error).message}`);
      this.opts.log(`Using the built-in copy of ${clientId} (fetch failed: ${(error as Error).message})`);
      doc = pinned;
    }
    if (doc.client_id !== clientId) throw new InvalidClientError("client metadata document client_id does not match its URL");
    const redirectUris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map(String) : [];
    if (!redirectUris.length) throw new InvalidClientError("client metadata document has no redirect_uris");
    for (const uri of redirectUris) {
      try {
        validateRedirectUri(uri);
      } catch {
        throw new InvalidClientError(`client metadata document has an invalid redirect_uri: ${uri}`);
      }
    }
    const authMethod = doc.token_endpoint_auth_method ? String(doc.token_endpoint_auth_method) : "none";
    // A client may prefer another method but also list "none" (ChatGPT does); it then signs in as a
    // public client, the only kind this server advertises.
    const alsoNone = Array.isArray(doc.token_endpoint_auth_methods_supported) && doc.token_endpoint_auth_methods_supported.includes("none");
    if (authMethod !== "none" && !alsoNone) throw new InvalidClientError("Only public clients (token_endpoint_auth_method none) are supported for metadata documents");
    if ("client_secret" in doc) throw new InvalidClientError("client metadata documents must not contain a client_secret");
    const client: OAuthClientInformationFull = {
      client_id: clientId,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...(typeof doc.client_name === "string" ? { client_name: doc.client_name.slice(0, 200) } : {}),
      ...(typeof doc.client_uri === "string" ? { client_uri: doc.client_uri } : {}),
      ...(typeof doc.logo_uri === "string" ? { logo_uri: doc.logo_uri } : {}),
    } as OAuthClientInformationFull;
    this.metadata.set(clientId, client);
    if (stored) this.store.saveClient(client, "cimd"); // refresh the persisted copy
    return client;
  }

  private checkResource(resource: URL | string | undefined): string {
    const expected = this.opts.mcpUrl.href;
    if (resource === undefined) return expected;
    const r = typeof resource === "string" ? resource : resource.href;
    const norm = (s: string) => s.replace(/\/+$/, "");
    // Accept the MCP URL itself or the server origin (some clients send the origin).
    if (norm(r) === norm(expected) || norm(r) === norm(this.opts.mcpUrl.origin)) return expected;
    throw new InvalidTargetError(`Unknown resource ${r}; this server only issues tokens for ${expected}`);
  }

  /** There is a single scope; unknown requested scopes (openid, offline_access, ...) are ignored. */
  private grantedScopes(_requested: string[] | undefined): string[] {
    return [SCOPE];
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (!this.redirectAllowed(params.redirectUri)) {
      throw new AccessDeniedError("This server does not accept this application");
    }
    const resource = this.checkResource(params.resource);
    const scopes = this.grantedScopes(params.scopes);
    const pending = this.store.savePending({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      ...(params.state !== undefined ? { state: params.state } : {}),
      scopes,
      resource,
    });
    res.redirect(302, `/oauth/consent?request=${encodeURIComponent(pending.id)}`);
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const code = this.store.peekCode(authorizationCode);
    if (!code || code.clientId !== client.client_id) throw new InvalidGrantError("Invalid or expired authorization code");
    return code.codeChallenge;
  }

  private tokenTtls() {
    const s = this.store.getSettings();
    return { accessTtlMs: s.accessTokenTtlMinutes * 60_000, refreshTtlMs: s.refreshTokenTtlDays * 86_400_000 };
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const code = this.store.peekCode(authorizationCode);
    if (!code || code.clientId !== client.client_id) throw new InvalidGrantError("Invalid or expired authorization code");
    if (redirectUri !== undefined && redirectUri !== code.redirectUri) throw new InvalidGrantError("redirect_uri does not match");
    if (resource !== undefined && this.checkResource(resource) !== code.resource) throw new InvalidTargetError("resource does not match");
    if (!this.store.consumeCode(authorizationCode)) throw new InvalidGrantError("Authorization code was already used");
    const user = this.store.getUser(code.userId);
    if (!user || user.disabled) throw new InvalidGrantError("The account is not active");
    const ttl = this.tokenTtls();
    const issued = this.store.issueTokens({ clientId: client.client_id, userId: user.id, scopes: code.scopes, resource: code.resource, ...ttl });
    return {
      access_token: issued.access,
      token_type: "bearer",
      expires_in: Math.floor(ttl.accessTtlMs / 1000),
      refresh_token: issued.refresh,
      scope: code.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    const record = this.store.getToken(refreshToken);
    if (!record || record.kind !== "refresh" || record.clientId !== client.client_id) throw new InvalidGrantError("Invalid refresh token");
    let graceReuse = false;
    if (record.revoked) {
      // A client whose refresh request timed out after we rotated may retry with the previous
      // token: allow that briefly. Any later reuse means the token leaked: revoke the grant.
      const recent = record.rotatedAt !== undefined && Date.now() - record.rotatedAt < REFRESH_REUSE_GRACE_MS;
      if (!recent || !this.store.familyActive(record.family)) {
        this.store.revokeFamily(record.family);
        this.opts.log(`Refresh token reuse detected for client ${client.client_id}; grant revoked`);
        throw new InvalidGrantError("Refresh token was already used");
      }
      // One retry only: further reuse is treated as theft. Revoke the pair the timed-out rotation
      // produced (the client never received it) and continue with a single new pair.
      if (!this.store.consumeGrace(record.tokenHash)) {
        this.store.revokeFamily(record.family);
        throw new InvalidGrantError("Refresh token was already used");
      }
      this.store.revokeFamily(record.family);
      graceReuse = true;
    }
    if (record.expiresAt < Date.now()) throw new InvalidGrantError("Refresh token expired");
    if (scopes?.length && !scopes.includes(SCOPE)) throw new InvalidScopeError(`Only the "${SCOPE}" scope can be granted`);
    if (resource !== undefined && this.checkResource(resource) !== (record.resource ?? this.opts.mcpUrl.href)) {
      throw new InvalidTargetError("resource does not match");
    }
    const user = this.store.getUser(record.userId);
    if (!user || user.disabled) throw new InvalidGrantError("The account is not active");
    if (!graceReuse && !this.store.useRefreshToken(record.tokenHash)) {
      this.store.revokeFamily(record.family);
      throw new InvalidGrantError("Refresh token was already used");
    }
    const ttl = this.tokenTtls();
    const issued = this.store.issueTokens({
      clientId: client.client_id,
      userId: user.id,
      scopes: record.scopes,
      ...(record.resource ? { resource: record.resource } : {}),
      family: record.family,
      ...ttl,
    });
    return {
      access_token: issued.access,
      token_type: "bearer",
      expires_in: Math.floor(ttl.accessTtlMs / 1000),
      refresh_token: issued.refresh,
      scope: record.scopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = this.store.getToken(token);
    if (!record || record.kind !== "access" || record.revoked) throw new InvalidTokenError("Invalid access token");
    if (record.expiresAt < Date.now()) throw new InvalidTokenError("Access token expired");
    const user = this.store.getUser(record.userId);
    if (!user || user.disabled) throw new InvalidTokenError("The account is not active");
    this.store.touchToken(record.tokenHash);
    return {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: Math.floor(record.expiresAt / 1000),
      resource: new URL(record.resource ?? this.opts.mcpUrl.href),
      extra: { userId: user.id },
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const record = this.store.getToken(request.token);
    // RFC 7009: respond with success even for unknown tokens.
    if (record && record.clientId === client.client_id) this.store.revokeFamily(record.family);
  }

  /** Called from the consent page once the signed-in user approved the request. */
  approve(pendingId: string, userId: string): string {
    const pending = this.store.getPending(pendingId);
    if (!pending) throw new InvalidRequestError("This authorization request has expired. Start again from your AI app.");
    // Double submissions (or a reopened consent page) get the same answer for a short time, but
    // only the person who approved: the answer holds their authorization code. Anyone else who
    // opens the same link (for example the person who sent it) finds it used.
    if (pending.approvedRedirect) {
      if (pending.approvedBy === userId) return pending.approvedRedirect;
      throw new InvalidRequestError("This authorization request has expired. Start again from your AI app.");
    }
    // Persist a metadata-document client once someone actually approved it.
    if (/^https?:\/\//i.test(pending.clientId) && !this.store.getClient(pending.clientId)) {
      const client = this.metadata.stale(pending.clientId);
      if (client) this.store.saveClient(client, "cimd");
    }
    this.store.markClientApproved(pending.clientId);
    const code = this.store.createCode(pending, userId);
    const target = new URL(pending.redirectUri);
    target.searchParams.set("code", code);
    if (pending.state !== undefined) target.searchParams.set("state", pending.state);
    target.searchParams.set("iss", this.opts.issuer);
    this.store.markPendingApproved(pending, target.href, 120_000, userId);
    return target.href;
  }

  deny(pendingId: string): string | undefined {
    const pending = this.store.getPending(pendingId);
    // An approved request cannot be turned into a refusal (by its approver or anyone else).
    if (!pending || pending.approvedRedirect) return undefined;
    this.store.deletePending(pendingId);
    const target = new URL(pending.redirectUri);
    target.searchParams.set("error", "access_denied");
    target.searchParams.set("error_description", "The user denied access");
    if (pending.state !== undefined) target.searchParams.set("state", pending.state);
    target.searchParams.set("iss", this.opts.issuer);
    return target.href;
  }
}

/** Stable short fingerprint for logs. */
export function fingerprint(value: string): string {
  return sha256(value).slice(0, 8);
}
