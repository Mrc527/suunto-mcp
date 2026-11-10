/**
 * Per-user configuration and service lifecycle for the multi-user web mode.
 *
 * A user's stored PADI connection is turned into the same AppConfig the single-user mode uses, by
 * feeding a whitelisted set of PADI_* variables to loadConfig(). The PADI hosts can only be
 * changed by the operator (process environment), never by users, so nobody can make the server
 * connect to other machines.
 */

import { randomBytes } from "node:crypto";
import { loadConfig, type AppConfig } from "../config.js";
import { DEMO_ADDRESS, DEMO_TIME_ZONE, demoRegistry, type DemoRegistry } from "../demo/index.js";
import { endpointEnv } from "../padi/endpoints.js";
import type { TokenSink } from "../padi/session.js";
import { ConfigError } from "../util/errors.js";
import { closeServices, createServices, type Services } from "../server.js";
import type { PadiAccountSettings, ServerSettings, Store, User } from "./store.js";

const API_MODES = ["proxy", "direct", "auto"] as const;

/**
 * Operator-level settings that apply to every user: the PADI endpoints (useful for tests against
 * a local mock) and the API transport. PADI_API_MODE is checked here, at startup, and lowercased:
 * a typo would otherwise only show up later, as an error in every user's tool calls, and the
 * account page compares the exact value.
 */
export function operatorOverrides(env: Record<string, string | undefined>): Record<string, string> {
  const out = endpointEnv(env);
  const mode = (env.PADI_API_MODE ?? "").trim().toLowerCase();
  if (mode) {
    if (!API_MODES.some((m) => m === mode)) throw new ConfigError(`PADI_API_MODE must be one of ${API_MODES.join(", ")} (got "${mode}")`);
    out.PADI_API_MODE = mode;
  }
  return out;
}

/**
 * Build the AppConfig for one user from their stored PADI connection. Throws ConfigError for
 * invalid settings. The client id the tokens were issued for wins over the operator's. The
 * user's own time zone wins over the server's default (it decides what "today" is).
 */
export function buildUserConfig(s: PadiAccountSettings, server: ServerSettings, operator: Record<string, string> = {}): AppConfig {
  const env: Record<string, string | undefined> = {
    ...operator,
    PADI_EMAIL: s.email,
    PADI_REFRESH_TOKEN: s.refreshToken,
    PADI_LOGIN_METHOD: s.loginMethod,
    PADI_CLIENT_ID: s.clientId,
    PADI_UNITS: s.units,
    PADI_READ_ONLY: String(s.readOnly || server.forceReadOnly),
    PADI_TIMEZONE: s.timeZone || server.defaultTimeZone,
  };
  return loadConfig(env);
}

/**
 * A demo account has no PADI sign-in; the configuration needs one. It is random, so it can never
 * be mistaken for (or redact) any other text.
 */
const DEMO_TOKEN = randomBytes(18).toString("base64url");

/**
 * The fixed configuration of every demo account: diver "Alex Demo" in Europe/Zurich. Neither the
 * user's stored settings nor the operator's PADI overrides apply: the services use the in-memory
 * demo store only and never talk to PADI. The administrator's read-only switch still applies.
 */
export function buildDemoConfig(server: ServerSettings, readOnly: boolean): AppConfig {
  return loadConfig({
    PADI_EMAIL: DEMO_ADDRESS,
    PADI_REFRESH_TOKEN: DEMO_TOKEN,
    PADI_TIMEZONE: DEMO_TIME_ZONE,
    PADI_UNITS: "auto",
    PADI_READ_ONLY: String(readOnly || server.forceReadOnly),
  });
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

/**
 * Keeps services per user, rebuilt when the user's or the server's settings change and closed
 * after a period without use. Demo accounts get services on the in-memory demo stores of `demo`,
 * which outlive the services (they are rebuilt after every reset).
 */
export class ServicePool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly store: Store,
    private readonly operator: Record<string, string>,
    private readonly idleMs = 10 * 60_000,
    private readonly demo: DemoRegistry = demoRegistry,
    private readonly log: (m: string) => void = () => {},
    /** fetch for every request to PADI (tests pass a mock). */
    private readonly padiFetch?: typeof fetch,
  ) {
    this.timer = setInterval(() => void this.sweep(), 60_000);
    this.timer.unref();
  }

  /** Returns undefined when the user has not connected PADI yet (never for a demo account). */
  get(user: User): UserContext | undefined {
    if (user.demo) return this.getDemo(user);
    if (!user.hasPadi) return undefined;
    const server = this.store.getSettings();
    const version = `${user.serviceUpdatedAt ?? 0}:${JSON.stringify(server)}`;
    const existing = this.current(user.id, version);
    if (existing) return existing;
    const { settings, unreadable } = this.store.readPadiSettings(user.id);
    if (unreadable) {
      throw new ConfigError("The stored PADI connection cannot be decrypted (the server's encryption key changed). Sign in to PADI again on the account page.");
    }
    if (!settings) return undefined;
    const config = buildUserConfig(settings, server, this.operator);
    const services = createServices(config, {
      tokenSink: this.tokenSink(user.id, settings.connectedAt),
      log: this.log,
      ...(this.padiFetch ? { fetch: this.padiFetch } : {}),
    });
    return this.add(user.id, { config, services, version, lastUsed: Date.now() });
  }

  /**
   * Where a user's session saves new tokens: into the store, without rebuilding the services. A
   * refresh token that stopped working marks the connection "needs reconnect".
   */
  private tokenSink(userId: string, connectedAt: number): TokenSink {
    return {
      save: (tokens) => {
        try {
          this.store.savePadiTokens(userId, tokens, connectedAt);
        } catch (error) {
          this.log(`Could not save refreshed PADI tokens: ${(error as Error).message}`);
        }
      },
      invalid: () => {
        try {
          const current = this.store.getPadiSettings(userId);
          // Only the connection this session belongs to (not one saved meanwhile).
          if (current && current.connectedAt === connectedAt) this.store.setPadiNeedsReconnect(userId, true);
        } catch (error) {
          this.log(`Could not mark a PADI connection for reconnect: ${(error as Error).message}`);
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
    const services = createServices(config, { demo: account.logbook, log: this.log });
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
      void closeServices(existing.services);
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
    await closeServices(entry.services);
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
