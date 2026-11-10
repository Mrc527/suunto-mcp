/**
 * Configuration loaded from environment variables (and a few CLI flags), for the single-user
 * modes (stdio, --http, --check, --login). The web service builds the same AppConfig per user.
 *
 * The Suunto app keys come from the person's own app in the Suunto API Zone (or the operator's,
 * in the web service): SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY. The
 * sign-in is a refresh token: SUUNTO_REFRESH_TOKEN, or the token cache written by
 * `suunto-mcp --login` (SUUNTO_TOKEN_CACHE). The Suunto hosts can be changed by the operator only
 * (see src/suunto/endpoints.ts).
 *
 * Docker Compose passes unset variables as empty strings, so an empty or whitespace-only value
 * means "not set" everywhere in this file.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { UnitChoice } from "./activity/types.js";
import { customEndpoints, endpointsFromEnv, type SuuntoEndpoints } from "./suunto/endpoints.js";
import { DEFAULT_LIMITS, type CallLimits } from "./suunto/limiter.js";
import type { StoredSuuntoTokens, SuuntoAppKeys } from "./suunto/oauth.js";
import { ConfigError } from "./util/errors.js";
import { isValidTimeZone, systemTimeZone } from "./util/dates.js";
import { parseBool, parseList } from "./util/text.js";

export interface SuuntoSettings {
  /** The app keys from the Suunto API Zone. Always set by loadConfig (single-user needs them). */
  keys?: SuuntoAppKeys;
  /** SUUNTO_REFRESH_TOKEN: a refresh token from an earlier sign-in. */
  refreshToken?: string;
  /**
   * File with the current tokens (mode 0600), written by --login and after every refresh. Unset:
   * memory only. An absolute path: a leading "~/" is the home folder.
   */
  tokenCache?: string;
  /** Where Suunto sends the browser back after the sign-in. Only used by --login. */
  redirectUri: string;
  endpoints: SuuntoEndpoints;
}

export interface HttpSettings {
  host: string;
  port: number;
  /** Bearer token required on every HTTP request. */
  token?: string;
  /** Extra Host header values accepted (DNS rebinding protection). */
  allowedHosts: string[];
  /** Allowed browser origins (CORS). Empty = no cross-origin browser access. */
  allowedOrigins: string[];
}

export interface AppConfig {
  suunto: SuuntoSettings;
  /** Units of answers and unit-bearing inputs (Suunto has no units setting we can read). */
  units: UnitChoice;
  readOnly: boolean;
  /** IANA time zone of the user: calendar dates, "today" and 24/7 times are in this zone. */
  timeZone: string;
  transport: "stdio" | "http";
  http: HttpSettings;
  /** Secrets that must never appear in output (client secret, subscription key, refresh token, HTTP token). */
  secrets: string[];
  /**
   * The Suunto call limits of this process (SUUNTO_CALLS_PER_MINUTE, SUUNTO_CALLS_PER_USER_PER_DAY,
   * SUUNTO_CALLS_PER_USER_PER_WEEK).
   * Set by loadConfig; single-user mode builds its limiter from them (default DEFAULT_LIMITS).
   */
  callLimits?: CallLimits;
}

type Env = Record<string, string | undefined>;

/** The redirect URI of `suunto-mcp --login` when SUUNTO_REDIRECT_URI is not set. */
export const DEFAULT_REDIRECT_URI = "http://localhost:8723/callback";

/** Where people find their app keys (for error messages). */
const KEYS_HELP =
  "Create an app in the Suunto API Zone (https://apizone.suunto.com) and copy the client id and client secret (OAuth settings) and the subscription key from your profile there.";

/** A trimmed value, or undefined when the variable is unset, empty or only whitespace. */
export function envValue(env: Env, name: string): string | undefined {
  const value = env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** A secret from NAME, or from the file named by NAME_FILE. */
export function readSecret(env: Env, name: string): string | undefined {
  const direct = envValue(env, name);
  if (direct) return direct;
  const file = envValue(env, `${name}_FILE`);
  if (file) {
    try {
      return readFileSync(file, "utf8").trim() || undefined;
    } catch (error) {
      throw new ConfigError(`Could not read ${name}_FILE (${file}): ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
    }
  }
  return undefined;
}

/**
 * The Suunto app keys from SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET (or _FILE) and
 * SUUNTO_SUBSCRIPTION_KEY (or _FILE). Undefined when none of the three is set (the web service
 * then starts without a Suunto connection); a ConfigError when only some are set.
 */
export function suuntoKeysFromEnv(env: Env): SuuntoAppKeys | undefined {
  const clientId = envValue(env, "SUUNTO_CLIENT_ID");
  const clientSecret = readSecret(env, "SUUNTO_CLIENT_SECRET");
  const subscriptionKey = readSecret(env, "SUUNTO_SUBSCRIPTION_KEY");
  if (clientId && clientSecret && subscriptionKey) {
    if (/\s/.test(clientId)) throw new ConfigError("SUUNTO_CLIENT_ID must not contain spaces. Copy the client id from the OAuth settings of your app in the Suunto API Zone.");
    return { clientId, clientSecret, subscriptionKey };
  }
  if (!clientId && !clientSecret && !subscriptionKey) return undefined;
  const missing = [
    ...(clientId ? [] : ["SUUNTO_CLIENT_ID"]),
    ...(clientSecret ? [] : ["SUUNTO_CLIENT_SECRET"]),
    ...(subscriptionKey ? [] : ["SUUNTO_SUBSCRIPTION_KEY"]),
  ];
  throw new ConfigError(
    `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set, but the other Suunto app keys are. Set all three (SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET, SUUNTO_SUBSCRIPTION_KEY) or none. ${KEYS_HELP}`,
  );
}

function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new ConfigError(`${name} must be a valid port, got "${value}"`);
  return n;
}

/** A whole number of 0 or more from NAME, or the fallback when it is unset. */
function limitValue(env: Env, name: string, fallback: number): number {
  const raw = envValue(env, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n)) {
    throw new ConfigError(`${name} must be a whole number of 0 or more (0 means no limit), got "${raw}"`);
  }
  return n;
}

/**
 * The Suunto call limits (DESIGN.md section 4, call limiter): SUUNTO_CALLS_PER_MINUTE (default
 * 10, Suunto's Developer limit) for the whole process, SUUNTO_CALLS_PER_USER_PER_DAY (default 0)
 * and SUUNTO_CALLS_PER_USER_PER_WEEK (default 0; any 7 days). 0 means no limit, an empty value
 * means unset. The web service passes its own defaults (it caps each user at 100 calls a day and
 * 100 in any 7 days unless the variables are set).
 */
export function callLimitsFromEnv(env: Env, defaults: Partial<CallLimits> = {}): CallLimits {
  return {
    perMinute: limitValue(env, "SUUNTO_CALLS_PER_MINUTE", defaults.perMinute ?? DEFAULT_LIMITS.perMinute),
    perUserPerDay: limitValue(env, "SUUNTO_CALLS_PER_USER_PER_DAY", defaults.perUserPerDay ?? DEFAULT_LIMITS.perUserPerDay),
    perUserPerWeek: limitValue(env, "SUUNTO_CALLS_PER_USER_PER_WEEK", defaults.perUserPerWeek ?? DEFAULT_LIMITS.perUserPerWeek ?? 0),
  };
}

/** A path with a leading "~" or "~/" in the home folder, made absolute (MCP apps do not expand "~"). */
export function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return resolve(path);
}

/** The JSON of a token cache file (src/server.ts writes it). */
interface TokenCacheFile {
  refreshToken: string;
  accessToken?: string;
  /** Epoch milliseconds. */
  accessTokenExpiresAt?: number;
  /** The app the tokens were issued to: a refresh needs the same app. */
  clientId: string;
  /** The Suunto App username, when known (for people who read the file). */
  username?: string;
}

/**
 * What a token cache file holds: the tokens, or why they cannot be used ("missing" when there is
 * no file). The reason fits after "The token cache <file> ..." and never holds a token or a
 * client id. A cache written for another app (client id) is not used: Suunto would refuse its
 * refresh token. Never throws.
 */
export function inspectTokenCache(file: string, clientId?: string): { tokens: StoredSuuntoTokens } | { problem: string; missing: boolean } {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { problem: "does not exist", missing: true };
    return { problem: `cannot be read (${code ?? "error"})`, missing: false };
  }
  let data: Partial<TokenCacheFile>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    data = parsed as Partial<TokenCacheFile>;
  } catch {
    return { problem: "is not a valid token cache (not JSON; it may be damaged)", missing: false };
  }
  if (typeof data.refreshToken !== "string" || !data.refreshToken.trim() || typeof data.clientId !== "string" || !data.clientId.trim()) {
    return { problem: "holds no Suunto sign-in", missing: false };
  }
  if (clientId && data.clientId !== clientId) {
    return { problem: "was written for another Suunto app (another SUUNTO_CLIENT_ID)", missing: false };
  }
  const access = typeof data.accessToken === "string" && data.accessToken.trim() ? data.accessToken : undefined;
  const expires = typeof data.accessTokenExpiresAt === "number" && Number.isFinite(data.accessTokenExpiresAt) ? data.accessTokenExpiresAt : undefined;
  return {
    tokens: {
      refreshToken: data.refreshToken,
      clientId: data.clientId,
      ...(access ? { accessToken: access } : {}),
      ...(access && expires !== undefined ? { accessTokenExpiresAt: expires } : {}),
    },
  };
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  try {
    return parseBool(env[name], fallback);
  } catch (error) {
    throw new ConfigError(`${name}: ${(error as Error).message}`);
  }
}

function choice<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = (envValue(env, name) ?? "").toLowerCase();
  if (!raw) return fallback;
  const found = allowed.find((a) => a === raw);
  if (!found) throw new ConfigError(`${name} must be one of ${allowed.join(", ")} (got "${raw}")`);
  return found;
}

/**
 * The user's time zone: SUUNTO_TIMEZONE, else TZ, else the system's. An invalid SUUNTO_TIMEZONE
 * is an error; TZ is only used when it is an IANA name (it can also be a POSIX rule or a path).
 */
function timeZoneFrom(env: Env, warn: (message: string) => void): string {
  const explicit = envValue(env, "SUUNTO_TIMEZONE");
  if (explicit) {
    if (!isValidTimeZone(explicit)) throw new ConfigError(`SUUNTO_TIMEZONE "${explicit}" is not a valid IANA time zone (for example Europe/Zurich)`);
    return explicit;
  }
  const tz = envValue(env, "TZ");
  if (tz && !tz.startsWith(":") && isValidTimeZone(tz)) return tz;
  if (tz) warn(`TZ "${tz}" is not an IANA time zone; using the system time zone. Set SUUNTO_TIMEZONE (for example Europe/Zurich).`);
  return systemTimeZone();
}

export interface CliOverrides {
  transport?: "stdio" | "http";
  port?: number;
  host?: string;
}

/** What a mode needs: the serving modes need a sign-in; --login creates one. */
type Mode = "serve" | "login";

function buildConfig(env: Env, cli: CliOverrides, warn: (message: string) => void, mode: Mode): AppConfig {
  const keys = suuntoKeysFromEnv(env);
  if (!keys) {
    throw new ConfigError(`SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set. ${KEYS_HELP}`);
  }
  const refreshToken = readSecret(env, "SUUNTO_REFRESH_TOKEN");
  const tokenCacheRaw = envValue(env, "SUUNTO_TOKEN_CACHE");
  const tokenCache = tokenCacheRaw ? expandPath(tokenCacheRaw) : undefined;
  const redirectRaw = envValue(env, "SUUNTO_REDIRECT_URI");

  let redirectUri = redirectRaw ?? DEFAULT_REDIRECT_URI;
  if (mode === "login") {
    if (!tokenCache) {
      throw new ConfigError(
        "SUUNTO_TOKEN_CACHE is not set. --login saves the Suunto sign-in to that file: set it to a file path, for example ~/.config/suunto-mcp/tokens.json, and use the same value when you run the server.",
      );
    }
    redirectUri = checkRedirectUri(redirectUri);
  } else if (!refreshToken && !(tokenCache && existsSync(tokenCache))) {
    throw new ConfigError(
      tokenCache
        ? `The token cache ${tokenCache} (SUUNTO_TOKEN_CACHE) does not exist yet. Run suunto-mcp --login once to sign in to Suunto and create it, or set SUUNTO_REFRESH_TOKEN.`
        : "No Suunto sign-in is set. Set SUUNTO_TOKEN_CACHE to a file path and run suunto-mcp --login once to sign in to Suunto, or set SUUNTO_REFRESH_TOKEN (or SUUNTO_REFRESH_TOKEN_FILE).",
    );
  } else if (tokenCache) {
    // A cache that is there but cannot be used is never skipped in silence.
    const cache = inspectTokenCache(tokenCache, keys.clientId);
    if ("problem" in cache && !cache.missing) {
      const text = `The token cache ${tokenCache} (SUUNTO_TOKEN_CACHE) ${cache.problem}.`;
      if (!refreshToken) throw new ConfigError(`${text} Run suunto-mcp --login again to sign in to Suunto and replace it.`);
      warn(`${text} Using SUUNTO_REFRESH_TOKEN instead; the next refresh replaces the file.`);
    }
  }

  if (mode === "serve" && refreshToken && !tokenCache) {
    // Suunto may hand out a new refresh token on a refresh; without a cache it lives in memory only.
    warn("SUUNTO_REFRESH_TOKEN is set without SUUNTO_TOKEN_CACHE. Suunto may replace the refresh token while the server runs, and the next start would then fail. Set SUUNTO_TOKEN_CACHE to a file path to keep the newest one.");
  }

  const units = choice(env, "SUUNTO_UNITS", ["metric", "imperial"] as const, "metric");
  const endpoints = endpointsFromEnv(env);
  const custom = customEndpoints(endpoints);
  if (custom.length) warn(`Using custom Suunto endpoints (${custom.join(", ")}). Only do this for tests.`);
  const timeZone = timeZoneFrom(env, warn);

  const transportRaw = (cli.transport ?? envValue(env, "MCP_TRANSPORT") ?? "stdio").toLowerCase();
  if (transportRaw !== "stdio" && transportRaw !== "http") {
    throw new ConfigError(`MCP_TRANSPORT must be "stdio" or "http" (got "${transportRaw}")`);
  }

  const httpToken = readSecret(env, "MCP_HTTP_TOKEN");

  const config: AppConfig = {
    suunto: {
      keys,
      ...(refreshToken ? { refreshToken } : {}),
      ...(tokenCache ? { tokenCache } : {}),
      redirectUri,
      endpoints,
    },
    units,
    readOnly: bool(env, "SUUNTO_READ_ONLY", false),
    timeZone,
    transport: transportRaw,
    http: {
      host: cli.host ?? envValue(env, "MCP_HTTP_HOST") ?? "127.0.0.1",
      port: cli.port ?? parsePort(envValue(env, "MCP_HTTP_PORT") ?? envValue(env, "PORT"), 3000, "MCP_HTTP_PORT"),
      ...(httpToken ? { token: httpToken } : {}),
      allowedHosts: parseList(env.MCP_HTTP_ALLOWED_HOSTS),
      allowedOrigins: parseList(env.MCP_HTTP_ALLOWED_ORIGINS),
    },
    secrets: [keys.clientSecret, keys.subscriptionKey, refreshToken, httpToken].filter((s): s is string => !!s),
    callLimits: callLimitsFromEnv(env),
  };

  if (config.transport === "http" && !isLoopback(config.http.host) && !config.http.token) {
    throw new ConfigError(
      `Refusing to listen on ${config.http.host} without authentication. Set MCP_HTTP_TOKEN to a long random string, or bind to 127.0.0.1.`,
    );
  }

  return config;
}

/**
 * The configuration of the serving modes (stdio, --http, --check). Needs the three Suunto app
 * keys, and a sign-in: SUUNTO_REFRESH_TOKEN or an existing SUUNTO_TOKEN_CACHE file.
 */
export function loadConfig(env: Env = process.env, cli: CliOverrides = {}, warn: (message: string) => void = () => {}): AppConfig {
  return buildConfig(env, cli, warn, "serve");
}

/**
 * The configuration of `suunto-mcp --login`: the three app keys and SUUNTO_TOKEN_CACHE (where the
 * new sign-in is saved), but no sign-in yet. SUUNTO_REDIRECT_URI must be a loopback http URL.
 */
export function loadLoginConfig(env: Env = process.env, warn: (message: string) => void = () => {}): AppConfig {
  return buildConfig(env, { transport: "stdio" }, warn, "login");
}

/**
 * Check the redirect URI of --login: plain http on this machine (localhost, 127.0.0.1 or [::1]),
 * because --login listens there for Suunto's answer. It must also be registered in the Suunto app.
 */
export function checkRedirectUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`SUUNTO_REDIRECT_URI "${value}" is not a valid URL. Use for example ${DEFAULT_REDIRECT_URI}.`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "http:" || !isLoopback(host)) {
    throw new ConfigError(
      `SUUNTO_REDIRECT_URI must be a plain http address on this machine (localhost, 127.0.0.1 or [::1]), because --login listens there for Suunto's answer. Use for example ${DEFAULT_REDIRECT_URI}, and register the same address in your app's OAuth settings in the Suunto API Zone.`,
    );
  }
  if (url.username || url.password) throw new ConfigError("SUUNTO_REDIRECT_URI must not contain a user name or password.");
  if (url.hash) throw new ConfigError("SUUNTO_REDIRECT_URI must not contain a fragment (#...).");
  // As written, not normalized: Suunto may compare it with the registered address character by character.
  return value;
}

export function isLoopback(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "localhost" || h === "::1" || h === "[::1]" || /^127(\.\d{1,3}){3}$/.test(h);
}

/** Configuration summary that is safe to show (no secrets, no keys). */
export function describeConfig(config: AppConfig): Record<string, unknown> {
  const s = config.suunto;
  const custom = customEndpoints(s.endpoints);
  return {
    app_keys: s.keys ? "set" : "not set",
    sign_in: s.tokenCache ? (s.refreshToken ? "token cache, else SUUNTO_REFRESH_TOKEN" : "token cache") : s.refreshToken ? "SUUNTO_REFRESH_TOKEN" : "none",
    ...(s.tokenCache ? { token_cache: s.tokenCache } : {}),
    units: config.units,
    read_only: config.readOnly,
    time_zone: config.timeZone,
    ...(custom.length ? { custom_endpoints: custom } : {}),
  };
}
