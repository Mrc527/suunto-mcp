/**
 * The Suunto hosts this server talks to.
 *
 * - OAuth (authorize, token, deauthorize): https://cloudapi-oauth.suunto.com
 * - data (workouts, 24/7 data, routes, points of interest): https://cloudapi.suunto.com
 *
 * The operator can change both through the environment, for tests against a local mock Suunto
 * API. Users never can: they cannot point the server at another host.
 */

import { ConfigError } from "../util/errors.js";

export interface SuuntoEndpoints {
  /** Base of /oauth/authorize, /oauth/token and /oauth/deauthorize. No trailing slash. */
  oauthUrl: string;
  /** Base of the data APIs (/v3/workouts, /247samples, /v2/route, /v2/poi). No trailing slash. */
  apiUrl: string;
}

export const DEFAULT_ENDPOINTS: Readonly<SuuntoEndpoints> = Object.freeze({
  oauthUrl: "https://cloudapi-oauth.suunto.com",
  apiUrl: "https://cloudapi.suunto.com",
});

/** The environment variable that overrides each endpoint (operator only). */
export const ENDPOINT_ENV: Readonly<Record<keyof SuuntoEndpoints, string>> = Object.freeze({
  oauthUrl: "SUUNTO_OAUTH_URL",
  apiUrl: "SUUNTO_API_URL",
});

const KEYS: readonly (keyof SuuntoEndpoints)[] = ["oauthUrl", "apiUrl"];

/** True for a host name that can only mean this machine. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1") return true;
  return /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * Check one endpoint URL: https, or plain http only on a loopback host (a local mock server).
 * Tokens and the client secret go to these hosts, so they must never travel unencrypted.
 */
function checkUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} is not a valid URL. Use a full https URL, for example ${name === ENDPOINT_ENV.oauthUrl ? DEFAULT_ENDPOINTS.oauthUrl : DEFAULT_ENDPOINTS.apiUrl}.`);
  }
  if (url.protocol === "http:") {
    if (!isLoopbackHost(url.hostname)) throw new ConfigError(`${name} must use https. Plain http is allowed only for a local test server (localhost or 127.0.0.1).`);
  } else if (url.protocol !== "https:") {
    throw new ConfigError(`${name} must be an https URL.`);
  }
  if (url.username || url.password) throw new ConfigError(`${name} must not contain a user name or password.`);
  if (url.search || url.hash) throw new ConfigError(`${name} must not contain a query or a fragment.`);
  return url.href.replace(/\/+$/, "");
}

/**
 * The endpoints with the operator's overrides from the environment (SUUNTO_OAUTH_URL,
 * SUUNTO_API_URL). Without overrides, the production Suunto hosts. Throws ConfigError for a value
 * that is not an https URL (or http on a loopback host).
 */
export function endpointsFromEnv(env: Record<string, string | undefined> = process.env): SuuntoEndpoints {
  const out: SuuntoEndpoints = { ...DEFAULT_ENDPOINTS };
  for (const key of KEYS) {
    const value = env[ENDPOINT_ENV[key]]?.trim();
    if (value) out[key] = checkUrl(ENDPOINT_ENV[key], value);
  }
  return out;
}

/** Names of the variables of the endpoints that differ from the production hosts (for diagnostics). */
export function customEndpoints(endpoints: SuuntoEndpoints): string[] {
  return KEYS.filter((key) => endpoints[key] !== DEFAULT_ENDPOINTS[key]).map((key) => ENDPOINT_ENV[key]);
}

/** The endpoint override variables that are set, for passing operator overrides on. */
export function endpointEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of Object.values(ENDPOINT_ENV)) {
    const value = env[name];
    if (value !== undefined && value !== "") out[name] = value;
  }
  return out;
}
