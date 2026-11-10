/**
 * Per-user configuration and service lifecycle for the multi-user web mode.
 *
 * A user's stored Suunto connection is turned into the same AppConfig the single-user mode uses,
 * by feeding a whitelisted set of SUUNTO_* variables to loadConfig(). The app keys (client id,
 * client secret, subscription key) and the Suunto hosts belong to the operator (process
 * environment), never to users, so nobody can make the server connect to other machines.
 */

import { randomBytes } from "node:crypto";
import type { UnitChoice } from "../activity/types.js";
import { loadConfig, type AppConfig } from "../config.js";
import { DEMO_TIME_ZONE, demoRegistry, type DemoRegistry } from "../demo/index.js";
import { closeServices, createServices, type Services } from "../server.js";
import { endpointEnv, endpointsFromEnv, type SuuntoEndpoints } from "../suunto/endpoints.js";
import type { StoredSuuntoTokens, SuuntoAppKeys } from "../suunto/oauth.js";
import { SuuntoSession, type TokenSink } from "../suunto/session.js";
import { ConfigError } from "../util/errors.js";
import type { ServerSettings, Store, SuuntoAccountSettings, User } from "./store.js";

/**
 * Operator-level settings that apply to every user: the Suunto hosts (overridden only for tests
 * against a local mock). They are checked here, at startup: a typo would otherwise only show up
 * later, as an error in every user's tool calls. Never holds the app keys.
 */
export function operatorOverrides(env: Record<string, string | undefined>): Record<string, string> {
  // Throws ConfigError for a value that is not an https URL (or http on a loopback host).
  endpointsFromEnv(env);
  const out: Record<string, string> = {};
  // Docker Compose passes unset variables as empty strings: those mean "not set".
  for (const [name, value] of Object.entries(endpointEnv(env))) if (value.trim()) out[name] = value.trim();
  return out;
}

/** The units a stored connection uses ("metric" for anything unexpected). */
function unitsOf(value: unknown): UnitChoice {
  return value === "imperial" ? "imperial" : "metric";
}

/**
 * Build the AppConfig for one user from their stored Suunto connection and the operator's app
 * keys. Throws ConfigError for invalid settings. The user's own time zone wins over the server's
 * default (it decides what "today" is).
 */
export function buildUserConfig(s: SuuntoAccountSettings, server: ServerSettings, operator: Record<string, string>, keys: SuuntoAppKeys): AppConfig {
  const env: Record<string, string | undefined> = {
    ...operator,
    SUUNTO_CLIENT_ID: keys.clientId,
    SUUNTO_CLIENT_SECRET: keys.clientSecret,
    SUUNTO_SUBSCRIPTION_KEY: keys.subscriptionKey,
    SUUNTO_REFRESH_TOKEN: s.refreshToken,
    SUUNTO_UNITS: unitsOf(s.units),
    SUUNTO_READ_ONLY: String(s.readOnly || server.forceReadOnly),
    SUUNTO_TIMEZONE: s.timeZone || server.defaultTimeZone,
  };
  return loadConfig(env);
}

/**
 * A demo account has no Suunto app keys and no sign-in; the configuration needs them. They are
 * random, so they can never be mistaken for (or redact) any other text, and the demo services
 * never send them anywhere.
 */
const DEMO_KEYS: SuuntoAppKeys = {
  clientId: `demo-${randomBytes(8).toString("hex")}`,
  clientSecret: randomBytes(18).toString("base64url"),
  subscriptionKey: randomBytes(16).toString("hex"),
};
const DEMO_TOKEN = randomBytes(18).toString("base64url");

/**
 * The fixed configuration of every demo account: "Alex Demo" in Europe/Zurich, metric. Neither
 * the user's stored settings nor the operator's Suunto settings apply: the services use the
 * in-memory demo store only and never talk to Suunto. The administrator's read-only switch still
 * applies.
 */
export function buildDemoConfig(server: ServerSettings, readOnly: boolean): AppConfig {
  return loadConfig({
    SUUNTO_CLIENT_ID: DEMO_KEYS.clientId,
    SUUNTO_CLIENT_SECRET: DEMO_KEYS.clientSecret,
    SUUNTO_SUBSCRIPTION_KEY: DEMO_KEYS.subscriptionKey,
    SUUNTO_REFRESH_TOKEN: DEMO_TOKEN,
    SUUNTO_TIMEZONE: DEMO_TIME_ZONE,
    SUUNTO_UNITS: "metric",
    SUUNTO_READ_ONLY: String(readOnly || server.forceReadOnly),
  });
}

/** The tokens of a stored connection, as a SuuntoSession takes them. */
export function storedTokens(s: SuuntoAccountSettings): StoredSuuntoTokens {
  return {
    refreshToken: s.refreshToken,
    clientId: s.clientId,
    ...(s.accessToken ? { accessToken: s.accessToken } : {}),
    ...(s.accessTokenExpiresAt !== undefined ? { accessTokenExpiresAt: s.accessTokenExpiresAt } : {}),
  };
}

/** How long a disconnect at Suunto may take before the connection is removed here anyway. */
export const DEAUTHORIZE_TIMEOUT_MS = 10_000;

/**
 * Tell Suunto that this user disconnects (when the user removes the connection or the account is
 * deleted). Best effort: never throws, and without app keys there is nothing to call.
 */
export async function deauthorizeAtSuunto(
  settings: SuuntoAccountSettings | undefined,
  opts: { keys?: SuuntoAppKeys; endpoints: SuuntoEndpoints; fetch?: typeof fetch; timeoutMs?: number },
): Promise<void> {
  if (!settings || !opts.keys) return;
  try {
    const session = new SuuntoSession({
      tokens: storedTokens(settings),
      keys: opts.keys,
      endpoints: opts.endpoints,
      timeoutMs: opts.timeoutMs ?? DEAUTHORIZE_TIMEOUT_MS,
      backoffMs: 0,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
    await session.deauthorize();
  } catch {
    // Best effort: the connection is removed here anyway.
  }
}

interface PoolEntry {
  config: AppConfig;
  services: Services;
  version: string;
  lastUsed: number;
}

export interface UserContext {
  config: AppConfig;
  services: Services;
}

export interface ServicePoolOptions {
  /** The operator's Suunto host overrides (SUUNTO_OAUTH_URL, SUUNTO_API_URL). */
  operator: Record<string, string>;
  /** The operator's Suunto app keys. Without them real users get no services (demo accounts do). */
  keys?: SuuntoAppKeys;
  /** Services unused for this long are closed (default 10 minutes). */
  idleMs?: number;
  /** The demo accounts' in-memory stores (default: the process-wide registry). */
  demo?: DemoRegistry;
  log?: (m: string) => void;
  /** fetch for every request to Suunto (tests pass a mock). */
  fetch?: typeof fetch;
  /** The sentence that tells a user how to connect again, e.g. "Connect Suunto again at <url>/account." */
  connectAgain?: string;
}

/**
 * Keeps services per user, rebuilt when the user's or the server's settings change and closed
 * after a period without use. Demo accounts get services on the in-memory demo stores of `demo`,
 * which outlive the services (they are rebuilt after every reset).
 */
export class ServicePool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly timer: NodeJS.Timeout;
  private readonly operator: Record<string, string>;
  private readonly keys: SuuntoAppKeys | undefined;
  private readonly idleMs: number;
  private readonly demo: DemoRegistry;
  private readonly log: (m: string) => void;

  constructor(
    private readonly store: Store,
    private readonly opts: ServicePoolOptions,
  ) {
    this.operator = opts.operator;
    this.keys = opts.keys;
    this.idleMs = opts.idleMs ?? 10 * 60_000;
    this.demo = opts.demo ?? demoRegistry;
    this.log = opts.log ?? (() => {});
    this.timer = setInterval(() => void this.sweep(), 60_000);
    this.timer.unref();
  }

  /** Whether the operator set the Suunto app keys (real users can connect and use Suunto). */
  get configured(): boolean {
    return this.keys !== undefined;
  }

  /**
   * Returns undefined when the user has not connected Suunto yet, or when the operator's app keys
   * are missing (never for a demo account). Throws ConfigError when the stored connection cannot
   * be decrypted.
   */
  get(user: User): UserContext | undefined {
    if (user.demo) return this.getDemo(user);
    if (!user.hasSuunto || !this.keys) return undefined;
    const keys = this.keys;
    const server = this.store.getSettings();
    const version = `${user.serviceUpdatedAt ?? 0}:${JSON.stringify(server)}`;
    const existing = this.current(user.id, version);
    if (existing) return existing;
    const { settings, unreadable } = this.store.readSuuntoSettings(user.id);
    if (unreadable) {
      throw new ConfigError("it cannot be decrypted (the server's encryption key changed).");
    }
    if (!settings) return undefined;
    const config = buildUserConfig(settings, server, this.operator, keys);
    const services = createServices(config, {
      // The stored tokens win over the configuration: they hold the newest refresh token.
      tokens: storedTokens(settings),
      tokenSink: this.tokenSink(user.id, settings.connectedAt),
      log: this.log,
      ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}),
      ...(this.opts.connectAgain ? { connectAgain: this.opts.connectAgain } : {}),
    });
    return this.add(user.id, { config, services, version, lastUsed: Date.now() });
  }

  /**
   * Where a user's session saves new tokens: into the store, without rebuilding the services (a
   * saved refresh also clears "needs reconnect"). A refresh token that Suunto refuses marks the
   * connection "needs reconnect". Both only for the connection the session belongs to, never for
   * one saved meanwhile (the user connected again while a call was running).
   */
  private tokenSink(userId: string, connectedAt: number): TokenSink {
    return {
      save: (tokens) => {
        try {
          this.store.saveSuuntoTokens(userId, tokens, connectedAt);
        } catch (error) {
          this.log(`Could not save refreshed Suunto tokens: ${(error as Error).message}`);
        }
      },
      invalid: () => {
        try {
          const current = this.store.getSuuntoSettings(userId);
          if (current && current.connectedAt === connectedAt) this.store.setSuuntoNeedsReconnect(userId, true);
        } catch (error) {
          this.log(`Could not mark a Suunto connection for reconnect: ${(error as Error).message}`);
        }
      },
    };
  }

  /** A demo account: the fixed demo configuration on the user's in-memory store. */
  private getDemo(user: User): UserContext {
    const account = this.demo.account(user.id);
    const server = this.store.getSettings();
    const readOnly = user.demoReadOnly === true;
    const version = `demo:${account.generation}:${readOnly}:${JSON.stringify(server)}`;
    const existing = this.current(user.id, version);
    if (existing) return existing;
    const config = buildDemoConfig(server, readOnly);
    const services = createServices(config, { demo: account.activity, log: this.log });
    return this.add(user.id, { config, services, version, lastUsed: Date.now() });
  }

  /** The cached entry when it is still current; an outdated one is closed. */
  private current(userId: string, version: string): PoolEntry | undefined {
    const existing = this.entries.get(userId);
    if (existing && existing.version === version) {
      existing.lastUsed = Date.now();
      return existing;
    }
    if (existing) {
      this.entries.delete(userId);
      void closeServices(existing.services).catch(() => undefined);
    }
    return undefined;
  }

  private add(userId: string, entry: PoolEntry): PoolEntry {
    this.entries.set(userId, entry);
    return entry;
  }

  async invalidate(userId: string): Promise<void> {
    const entry = this.entries.get(userId);
    if (!entry) return;
    this.entries.delete(userId);
    await closeServices(entry.services).catch(() => undefined);
  }

  async sweep(): Promise<void> {
    const cutoff = Date.now() - this.idleMs;
    for (const [userId, entry] of this.entries) {
      if (entry.lastUsed < cutoff) {
        this.entries.delete(userId);
        await closeServices(entry.services).catch(() => undefined);
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }

  async closeAll(): Promise<void> {
    clearInterval(this.timer);
    const all = [...this.entries.values()];
    this.entries.clear();
    await Promise.allSettled(all.map((e) => closeServices(e.services)));
  }
}
