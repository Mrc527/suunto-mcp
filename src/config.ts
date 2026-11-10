/**
 * Configuration loaded from environment variables (and a few CLI flags), for the single-user
 * modes (stdio, --http, --check). The web service builds the same AppConfig per user.
 *
 * One PADI account: PADI_EMAIL with PADI_PASSWORD (or PADI_PASSWORD_FILE), or a refresh token
 * (PADI_REFRESH_TOKEN or PADI_REFRESH_TOKEN_FILE, or a token cache written by an earlier run).
 * The PADI hosts can be changed by the operator only (see src/padi/endpoints.ts).
 */

import { existsSync, readFileSync } from "node:fs";
import type { ApiMode } from "./padi/api.js";
import type { LoginMethod } from "./padi/auth.js";
import { endpointsFromEnv, customEndpoints, type PadiEndpoints } from "./padi/endpoints.js";
import type { UnitChoice } from "./logbook/types.js";
import { ConfigError } from "./util/errors.js";
import { isValidTimeZone, systemTimeZone } from "./util/dates.js";
import { parseBool, parseList } from "./util/text.js";

export interface PadiSettings {
  email?: string;
  /** Used to sign in when there is no working refresh token. Never stored. */
  password?: string;
  refreshToken?: string;
  /** File where the current refresh token is cached (mode 0600). Unset: memory only. */
  tokenCache?: string;
  /** "auto": Cognito first, the PADI auth API only when Cognito fails for another reason than wrong credentials. */
  loginMethod: "auto" | LoginMethod;
  apiMode: ApiMode;
  endpoints: PadiEndpoints;
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
  padi: PadiSettings;
  /** Units of answers and unit-bearing inputs. "auto": the PADI logbook display setting. */
  units: UnitChoice;
  readOnly: boolean;
  /** IANA time zone for "today" (a dive date may not be in the future). */
  timeZone: string;
  transport: "stdio" | "http";
  http: HttpSettings;
  /** Secrets that must never appear in output (password, refresh token, HTTP token). */
  secrets: string[];
}

type Env = Record<string, string | undefined>;

/** A secret from NAME, or from the file named by NAME_FILE. */
export function readSecret(env: Env, name: string): string | undefined {
  const direct = env[name];
  if (direct && direct.trim()) return direct.trim();
  const file = env[`${name}_FILE`];
  if (file && file.trim()) {
    try {
      return readFileSync(file.trim(), "utf8").trim() || undefined;
    } catch (error) {
      throw new ConfigError(`Could not read ${name}_FILE (${file.trim()}): ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
    }
  }
  return undefined;
}

function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (!value || !value.trim()) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new ConfigError(`${name} must be a valid port, got "${value}"`);
  return n;
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  try {
    return parseBool(env[name], fallback);
  } catch (error) {
    throw new ConfigError(`${name}: ${(error as Error).message}`);
  }
}

function choice<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = (env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  const found = allowed.find((a) => a === raw);
  if (!found) throw new ConfigError(`${name} must be one of ${allowed.join(", ")} (got "${raw}")`);
  return found;
}

export interface CliOverrides {
  transport?: "stdio" | "http";
  port?: number;
  host?: string;
}

export function loadConfig(env: Env = process.env, cli: CliOverrides = {}, warn: (message: string) => void = () => {}): AppConfig {
  const email = (env.PADI_EMAIL ?? "").trim().toLowerCase() || undefined;
  const password = readSecret(env, "PADI_PASSWORD");
  const refreshToken = readSecret(env, "PADI_REFRESH_TOKEN");
  const tokenCache = (env.PADI_TOKEN_CACHE ?? "").trim() || undefined;

  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) throw new ConfigError(`PADI_EMAIL is not an e-mail address`);
  if (password && !email) throw new ConfigError("PADI_PASSWORD is set but PADI_EMAIL is not. Set PADI_EMAIL to the e-mail you sign in to PADI with.");
  const cached = tokenCache ? existsSync(tokenCache) : false;
  if (!refreshToken && !cached && !(email && password)) {
    throw new ConfigError(
      email
        ? "PADI_PASSWORD is not set. Set PADI_PASSWORD (or PADI_PASSWORD_FILE) to your PADI password, or give a refresh token in PADI_REFRESH_TOKEN."
        : "PADI_EMAIL is not set. Set PADI_EMAIL and PADI_PASSWORD (the e-mail and password you sign in to PADI with), or give a refresh token in PADI_REFRESH_TOKEN.",
    );
  }

  const loginMethod = choice(env, "PADI_LOGIN_METHOD", ["auto", "cognito", "padi"] as const, "auto");
  const apiMode = choice(env, "PADI_API_MODE", ["proxy", "direct", "auto"] as const, "proxy");
  const units = choice(env, "PADI_UNITS", ["auto", "metric", "imperial"] as const, "auto");
  const endpoints = endpointsFromEnv(env);
  const custom = customEndpoints(endpoints);
  if (custom.length) warn(`Using custom PADI endpoints (${custom.join(", ")}). Only do this for tests.`);

  const timeZone = (env.PADI_TIMEZONE ?? env.TZ ?? "").trim() || systemTimeZone();
  if (!isValidTimeZone(timeZone)) {
    throw new ConfigError(`PADI_TIMEZONE "${timeZone}" is not a valid IANA time zone (e.g. Europe/Zurich)`);
  }

  const transportRaw = (cli.transport ?? env.MCP_TRANSPORT ?? "stdio").trim().toLowerCase();
  if (transportRaw !== "stdio" && transportRaw !== "http") {
    throw new ConfigError(`MCP_TRANSPORT must be "stdio" or "http" (got "${transportRaw}")`);
  }

  const httpToken = readSecret(env, "MCP_HTTP_TOKEN");

  const config: AppConfig = {
    padi: {
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
      ...(refreshToken ? { refreshToken } : {}),
      ...(tokenCache ? { tokenCache } : {}),
      loginMethod,
      apiMode,
      endpoints,
    },
    units,
    readOnly: bool(env, "PADI_READ_ONLY", false),
    timeZone,
    transport: transportRaw,
    http: {
      host: cli.host ?? (env.MCP_HTTP_HOST?.trim() || "127.0.0.1"),
      port: cli.port ?? parsePort(env.MCP_HTTP_PORT ?? env.PORT, 3000, "MCP_HTTP_PORT"),
      token: httpToken,
      allowedHosts: parseList(env.MCP_HTTP_ALLOWED_HOSTS),
      allowedOrigins: parseList(env.MCP_HTTP_ALLOWED_ORIGINS),
    },
    secrets: [password, refreshToken, httpToken].filter((s): s is string => !!s),
  };

  if (config.transport === "http" && !isLoopback(config.http.host) && !config.http.token) {
    throw new ConfigError(
      `Refusing to listen on ${config.http.host} without authentication. Set MCP_HTTP_TOKEN to a long random string, or bind to 127.0.0.1.`,
    );
  }

  return config;
}

export function isLoopback(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "localhost" || h === "::1" || h === "[::1]" || /^127(\.\d{1,3}){3}$/.test(h);
}

/** Configuration summary that is safe to show to the model (no secrets). */
export function describeConfig(config: AppConfig): Record<string, unknown> {
  const custom = customEndpoints(config.padi.endpoints);
  return {
    ...(config.padi.email ? { email: config.padi.email } : {}),
    login_method: config.padi.loginMethod,
    api_mode: config.padi.apiMode,
    units: config.units,
    read_only: config.readOnly,
    time_zone: config.timeZone,
    ...(custom.length ? { custom_endpoints: custom } : {}),
  };
}
