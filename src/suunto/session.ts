/**
 * SuuntoSession: the token manager of one Suunto connection.
 *
 * It starts from stored tokens (a refresh token, maybe a still valid access token), hands out a
 * valid access token, refreshes it when less than 5 minutes are left (one refresh at a time,
 * shared by concurrent callers), and tells the TokenSink about every new token set.
 *
 * Rules:
 * - after each refresh, sink.save() gets the new tokens (access token, expiry, newest refresh
 *   token): Suunto may rotate the refresh token, and the next start must not use a dead one;
 * - another process or session may have refreshed with the same refresh token and stored a new
 *   one (Suunto may end a refresh token after its first use). So right before a refresh, and
 *   after an invalid_grant, the session asks sink.load() for the stored tokens. When they hold
 *   another refresh token of the same app, the session takes them over (with their access token
 *   while it is still valid) instead of using its old refresh token. After an invalid_grant it
 *   tries the stored refresh token once before it gives up;
 * - when Suunto refuses the refresh token (invalid_grant), sink.invalid() is called and every call
 *   fails with "Your Suunto connection expired. Connect Suunto again." without a request. Suunto
 *   has sent false invalid_grant answers during outages, so after a cool-down (10 minutes) the
 *   next call tries the same refresh token once more; when that works, sink.save() gets the
 *   tokens as after any refresh (the sink can clear its "needs reconnect" mark there). New tokens
 *   in the sink (the user connected again) end the cool-down at once;
 * - network problems and a busy Suunto are not final: the next call tries again. While the old
 *   access token has not expired yet, accessToken() keeps using it;
 * - deauthorize() is best effort and never throws.
 */

import type { SuuntoEndpoints } from "./endpoints.js";
import { decodeJwt, jwtExpiresAt, jwtUsername } from "./jwt.js";
import { deauthorize, refreshTokens, SuuntoAuthError, type OAuthOptions, type RefreshResult, type StoredSuuntoTokens, type SuuntoAppKeys } from "./oauth.js";

export { SuuntoAuthError, type RefreshResult, type StoredSuuntoTokens, type SuuntoAppKeys, type SuuntoAuthErrorCode, type TokenResult } from "./oauth.js";

/** Where a session reports token changes (the web store, a cache file, or nothing). */
export interface TokenSink {
  /** A refresh produced new tokens: keep them (they replace the stored ones). */
  save(tokens: StoredSuuntoTokens): void;
  /** The stored refresh token no longer works: the user must connect Suunto again. */
  invalid(reason: string): void;
  /**
   * The tokens stored now (they may be newer than the session's: another process or session
   * refreshed, or the user connected again), or undefined. Called right before a refresh and
   * after an invalid_grant, so it must be cheap and must not throw.
   */
  load?(): StoredSuuntoTokens | undefined;
}

export interface SuuntoSessionOptions {
  tokens: StoredSuuntoTokens;
  keys: SuuntoAppKeys;
  endpoints: SuuntoEndpoints;
  sink?: TokenSink;
  fetch?: typeof fetch;
  /** Per OAuth request, default 20 s. */
  timeoutMs?: number;
  /** The clock (epoch ms), for tests. */
  now?: () => number;
  /**
   * The sentence that tells the user how to connect again, for example "Connect Suunto again at
   * https://suunto.mcp.example/account." Default "Connect Suunto again."
   */
  connectAgain?: string;
  /** First backoff step of a refresh whose connection never opened (tests use 0). */
  backoffMs?: number;
  /** How long to wait after an invalid_grant before the refresh token is tried again (default 10 minutes). */
  invalidGrantCooldownMs?: number;
}

/** Refresh when less than this is left of the access token. */
export const REFRESH_MARGIN_MS = 5 * 60_000;
/** A token just received is used even when it is short-lived (clock skew), for this long. */
const JUST_RENEWED_MS = 30_000;
/** After an invalid_grant, the refresh token is tried again after this long (DESIGN section 4). */
export const INVALID_GRANT_COOLDOWN_MS = 10 * 60_000;

interface CurrentToken {
  accessToken: string;
  expiresAt: number;
  /** When this session received it (0 for a stored token). */
  renewedAt: number;
  username: string | undefined;
}

/** The current token of stored tokens, when they hold an access token with a known expiry. */
function storedCurrent(tokens: StoredSuuntoTokens): CurrentToken | undefined {
  const access = tokens.accessToken;
  if (!access) return undefined;
  const payload = decodeJwt(access);
  const expiresAt = tokens.accessTokenExpiresAt ?? (payload ? jwtExpiresAt(payload) : undefined);
  if (!expiresAt) return undefined;
  return { accessToken: access, expiresAt, renewedAt: 0, username: payload ? jwtUsername(payload) : undefined };
}

export class SuuntoSession {
  private tokens: StoredSuuntoTokens;
  private current: CurrentToken | undefined;
  /** The Suunto username, once known (a refresh answer may not carry it). */
  private knownUsername: string | undefined;
  private inflight: Promise<string> | undefined;
  /** Set when Suunto refused the refresh token: the user must connect again (or wait for the cool-down). */
  private refused: { error: SuuntoAuthError; at: number } | undefined;
  private readonly now: () => number;
  /** The sentence that tells the user how to connect again. */
  readonly connectAgain: string;

  constructor(private readonly opts: SuuntoSessionOptions) {
    this.now = opts.now ?? Date.now;
    this.connectAgain = opts.connectAgain?.trim() || "Connect Suunto again.";
    this.tokens = { ...opts.tokens };
    // Stored tokens may still hold a valid access token (for example right after connecting).
    this.current = storedCurrent(this.tokens);
    this.knownUsername = this.current?.username;
  }

  /** A valid access token (refreshes first when needed). */
  async accessToken(): Promise<string> {
    this.throwIfRefused();
    if (this.isFresh()) return this.current!.accessToken;
    try {
      return await this.renew();
    } catch (error) {
      // Suunto's sign-in service is down or busy, but the current token still works for a few minutes.
      if (!this.refused && this.isUsable()) return this.current!.accessToken;
      throw error;
    }
  }

  /**
   * Refresh now (after an HTTP 401) and return the new access token. With `staleToken`, the token
   * that was refused: when another caller already replaced it, the current token is returned
   * without a new refresh.
   */
  async refreshNow(staleToken?: string): Promise<string> {
    this.throwIfRefused();
    if (this.inflight) return this.inflight;
    if (staleToken && this.current && this.current.accessToken !== staleToken && this.isUsable()) return this.current.accessToken;
    return this.renew(staleToken);
  }

  /** The Suunto username (the access token's "user" claim); refreshes first when it is not known. */
  async username(): Promise<string> {
    this.throwIfRefused();
    if (this.current?.username && this.isUsable()) return this.current.username;
    await this.renew();
    const name = this.current?.username ?? this.knownUsername;
    if (!name) throw new SuuntoAuthError("unknown", "The Suunto sign-in has no Suunto username.");
    return name;
  }

  /** When the current access token expires (epoch milliseconds), once known. */
  get tokenExpiresAt(): number | undefined {
    return this.current?.expiresAt ?? this.tokens.accessTokenExpiresAt;
  }

  /** The current tokens (what a sink would store). */
  get storedTokens(): StoredSuuntoTokens {
    return { ...this.tokens };
  }

  /** True while Suunto's last answer to the refresh token was invalid_grant (the user must connect again). */
  get expired(): boolean {
    return this.refused !== undefined;
  }

  /**
   * Tell Suunto to disconnect this user from the app (when the user removes the connection).
   * Best effort: it never throws, and it refreshes the access token first only when needed.
   */
  async deauthorize(): Promise<void> {
    // With a refused refresh token there is no token to disconnect with.
    if (this.refused) return;
    try {
      const token = this.isUsable() ? this.current!.accessToken : await this.renew();
      await deauthorize(token, this.oauthOptions());
    } catch {
      // Best effort: the connection is removed here anyway.
    }
  }

  /**
   * During the cool-down after an invalid_grant, fail at once without a request. New tokens in
   * the sink (the user connected again, or another process refreshed) end the cool-down.
   */
  private throwIfRefused(): void {
    const r = this.refused;
    if (!r || this.now() - r.at >= (this.opts.invalidGrantCooldownMs ?? INVALID_GRANT_COOLDOWN_MS)) return;
    if (this.newerStored()) return;
    throw r.error;
  }

  /**
   * The sink's stored tokens when they hold another refresh token of the same app. Tokens that are
   * older than the session's own (their access token expires earlier, for example because saving
   * the last refresh failed) are not taken.
   */
  private newerStored(): StoredSuuntoTokens | undefined {
    let stored: StoredSuuntoTokens | undefined;
    try {
      stored = this.opts.sink?.load?.();
    } catch {
      // A sink that cannot read must not hide the real state; the session goes on with its own tokens.
      return undefined;
    }
    const refreshToken = stored?.refreshToken?.trim();
    if (!stored || !refreshToken || stored.clientId !== this.tokens.clientId || refreshToken === this.tokens.refreshToken) return undefined;
    const theirs = storedCurrent(stored)?.expiresAt;
    const ours = storedCurrent(this.tokens)?.expiresAt;
    if (theirs !== undefined && ours !== undefined && theirs < ours) return undefined;
    return { ...stored, refreshToken };
  }

  /**
   * Take over newer stored tokens (see newerStored), with their access token while it is valid.
   * Returns true when it did. The tokens came from the sink, so they are not saved again.
   */
  private adoptStored(): boolean {
    const stored = this.newerStored();
    if (!stored) return false;
    this.tokens = stored;
    // Without a stored access token, the session's own one stays usable until it expires.
    this.current = storedCurrent(stored) ?? this.current;
    if (this.current?.username) this.knownUsername = this.current.username;
    this.refused = undefined;
    return true;
  }

  /** The adopted (stored) access token, when it is fresh and not the one Suunto just refused. */
  private adoptedToken(staleToken: string | undefined): string | undefined {
    const c = this.current;
    return c && c.accessToken === this.tokens.accessToken && this.isFresh() && c.accessToken !== staleToken ? c.accessToken : undefined;
  }

  /** Fresh: more than the margin left, or received a moment ago and not expired yet. */
  private isFresh(): boolean {
    const c = this.current;
    if (!c) return false;
    const now = this.now();
    if (now < c.expiresAt - REFRESH_MARGIN_MS) return true;
    return now - c.renewedAt < JUST_RENEWED_MS && now < c.expiresAt;
  }

  /** Usable: not expired yet (a request may still pass). */
  private isUsable(): boolean {
    return !!this.current && this.now() < this.current.expiresAt;
  }

  private oauthOptions(): OAuthOptions {
    return {
      endpoints: this.opts.endpoints,
      keys: { clientId: this.opts.keys.clientId, clientSecret: this.opts.keys.clientSecret },
      ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}),
      ...(this.opts.timeoutMs ? { timeoutMs: this.opts.timeoutMs } : {}),
      ...(this.opts.backoffMs !== undefined ? { backoffMs: this.opts.backoffMs } : {}),
      now: this.now,
    };
  }

  /** One refresh at a time; concurrent callers share it. */
  private renew(staleToken?: string): Promise<string> {
    if (this.inflight) return this.inflight;
    const run = this.doRenew(staleToken).finally(() => {
      if (this.inflight === run) this.inflight = undefined;
    });
    this.inflight = run;
    return run;
  }

  private apply(result: RefreshResult): string {
    // A refresh answer may not carry the username: the one known from before stays.
    const username = result.username ?? this.current?.username ?? this.knownUsername;
    this.tokens = { ...result.tokens };
    this.current = { accessToken: result.tokens.accessToken, expiresAt: result.tokens.accessTokenExpiresAt, renewedAt: this.now(), username };
    if (username) this.knownUsername = username;
    return result.tokens.accessToken;
  }

  private isInvalidGrant(error: unknown): error is SuuntoAuthError {
    return error instanceof SuuntoAuthError && error.code === "invalid_grant";
  }

  private async doRenew(staleToken?: string): Promise<string> {
    // Another process or session may have refreshed already: its stored tokens are newer.
    if (this.adoptStored()) {
      const adopted = this.adoptedToken(staleToken);
      if (adopted) return adopted;
    }
    let result: RefreshResult;
    try {
      result = await refreshTokens(this.tokens.refreshToken, this.oauthOptions());
    } catch (error) {
      if (!this.isInvalidGrant(error)) throw error;
      // The refresh token may have been used up by another process that stored a new one.
      if (!this.adoptStored()) throw this.refuse(error);
      const adopted = this.adoptedToken(staleToken);
      if (adopted) return adopted;
      try {
        result = await refreshTokens(this.tokens.refreshToken, this.oauthOptions());
      } catch (again) {
        if (this.isInvalidGrant(again)) throw this.refuse(again);
        throw again;
      }
    }
    this.refused = undefined;
    const token = this.apply(result);
    try {
      this.opts.sink?.save({ ...this.tokens });
    } catch {
      // A sink that cannot save must not break the request; the token still works in memory.
    }
    return token;
  }

  /** Suunto refused the refresh token: tell the sink and start the cool-down. */
  private refuse(error: SuuntoAuthError): SuuntoAuthError {
    this.current = undefined;
    const expired = new SuuntoAuthError("invalid_grant", `Your Suunto connection expired. ${this.connectAgain}`, { cause: error, ...(error.status !== undefined ? { status: error.status } : {}) });
    this.refused = { error: expired, at: this.now() };
    try {
      this.opts.sink?.invalid("Suunto refused the refresh token");
    } catch {
      // A sink that cannot record it must not hide the real error.
    }
    return expired;
  }
}
