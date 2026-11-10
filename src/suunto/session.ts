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
 * - when Suunto refuses the refresh token (invalid_grant), the session is over: sink.invalid() is
 *   called once, and every later call fails with "Your Suunto connection expired. Connect Suunto
 *   again." without a request (the user must connect again);
 * - network problems and a busy Suunto are not final: the next call tries again;
 * - deauthorize() is best effort and never throws.
 */

import type { SuuntoEndpoints } from "./endpoints.js";
import { decodeJwt, jwtExpiresAt, jwtUsername } from "./jwt.js";
import { deauthorize, refreshTokens, SuuntoAuthError, type OAuthOptions, type StoredSuuntoTokens, type SuuntoAppKeys, type TokenResult } from "./oauth.js";

export { SuuntoAuthError, type StoredSuuntoTokens, type SuuntoAppKeys, type SuuntoAuthErrorCode, type TokenResult } from "./oauth.js";

/** Where a session reports token changes (the web store, a cache file, or nothing). */
export interface TokenSink {
  /** A refresh produced new tokens: keep them (they replace the stored ones). */
  save(tokens: StoredSuuntoTokens): void;
  /** The stored refresh token no longer works: the user must connect Suunto again. */
  invalid(reason: string): void;
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
}

/** Refresh when less than this is left of the access token. */
export const REFRESH_MARGIN_MS = 5 * 60_000;
/** A token just received is used even when it is short-lived (clock skew), for this long. */
const JUST_RENEWED_MS = 30_000;

interface CurrentToken {
  accessToken: string;
  expiresAt: number;
  /** When this session received it (0 for a stored token). */
  renewedAt: number;
  username: string | undefined;
}

export class SuuntoSession {
  private tokens: StoredSuuntoTokens;
  private current: CurrentToken | undefined;
  private inflight: Promise<string> | undefined;
  /** Set when Suunto refused the refresh token: the user must connect again. */
  private fatal: SuuntoAuthError | undefined;
  private readonly now: () => number;
  /** The sentence that tells the user how to connect again. */
  readonly connectAgain: string;

  constructor(private readonly opts: SuuntoSessionOptions) {
    this.now = opts.now ?? Date.now;
    this.connectAgain = opts.connectAgain?.trim() || "Connect Suunto again.";
    this.tokens = { ...opts.tokens };
    // Stored tokens may still hold a valid access token (for example right after connecting).
    const access = opts.tokens.accessToken;
    if (access) {
      const payload = decodeJwt(access);
      const expiresAt = opts.tokens.accessTokenExpiresAt ?? (payload ? jwtExpiresAt(payload) : undefined);
      if (expiresAt) this.current = { accessToken: access, expiresAt, renewedAt: 0, username: payload ? jwtUsername(payload) : undefined };
    }
  }

  /** A valid access token (refreshes first when needed). */
  async accessToken(): Promise<string> {
    if (this.fatal) throw this.fatal;
    if (this.isFresh()) return this.current!.accessToken;
    return this.renew();
  }

  /**
   * Refresh now (after an HTTP 401) and return the new access token. With `staleToken`, the token
   * that was refused: when another caller already replaced it, the current token is returned
   * without a new refresh.
   */
  async refreshNow(staleToken?: string): Promise<string> {
    if (this.fatal) throw this.fatal;
    if (this.inflight) return this.inflight;
    if (staleToken && this.current && this.current.accessToken !== staleToken && this.isUsable()) return this.current.accessToken;
    return this.renew();
  }

  /** The Suunto username (the access token's "user" claim); refreshes first when it is not known. */
  async username(): Promise<string> {
    if (this.fatal) throw this.fatal;
    if (this.current?.username && this.isUsable()) return this.current.username;
    await this.renew();
    const name = this.current?.username;
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

  /** True once Suunto refused the refresh token (the user must connect again). */
  get expired(): boolean {
    return this.fatal !== undefined;
  }

  /**
   * Tell Suunto to disconnect this user from the app (when the user removes the connection).
   * Best effort: it never throws, and it refreshes the access token first only when needed.
   */
  async deauthorize(): Promise<void> {
    if (this.fatal) return;
    try {
      const token = this.isUsable() ? this.current!.accessToken : await this.renew();
      await deauthorize(token, this.oauthOptions());
    } catch {
      // Best effort: the connection is removed here anyway.
    }
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
  private renew(): Promise<string> {
    if (this.fatal) return Promise.reject(this.fatal);
    if (this.inflight) return this.inflight;
    const run = this.doRenew().finally(() => {
      if (this.inflight === run) this.inflight = undefined;
    });
    this.inflight = run;
    return run;
  }

  private apply(result: TokenResult): string {
    this.tokens = { ...result.tokens };
    this.current = { accessToken: result.tokens.accessToken, expiresAt: result.tokens.accessTokenExpiresAt, renewedAt: this.now(), username: result.username };
    return result.tokens.accessToken;
  }

  private async doRenew(): Promise<string> {
    let result: TokenResult;
    try {
      result = await refreshTokens(this.tokens.refreshToken, this.oauthOptions());
    } catch (error) {
      if (error instanceof SuuntoAuthError && error.code === "invalid_grant") {
        this.current = undefined;
        this.fatal = new SuuntoAuthError("invalid_grant", `Your Suunto connection expired. ${this.connectAgain}`, { cause: error, ...(error.status !== undefined ? { status: error.status } : {}) });
        try {
          this.opts.sink?.invalid("Suunto refused the refresh token");
        } catch {
          // A sink that cannot record it must not hide the real error.
        }
        throw this.fatal;
      }
      throw error;
    }
    const token = this.apply(result);
    try {
      this.opts.sink?.save({ ...this.tokens });
    } catch {
      // A sink that cannot save must not break the request; the token still works in memory.
    }
    return token;
  }
}
