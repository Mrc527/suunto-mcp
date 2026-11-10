/**
 * CallLimiter: keeps the data requests of this process under Suunto's call limit.
 *
 * - perMinute: at most this many requests in any 60 s (a sliding window), for the whole process.
 *   A request that has no free slot waits for one, up to maxWaitMs (default 45 s). When the wait
 *   would be longer, acquire() fails at once with a rate limit error. 0 means no limit. Inside
 *   withWaitBudget() (every tool call), all requests of the call wait at most that long in all.
 * - perKeyPerDay: at most this many requests per key (a user id) per UTC day. When they are used
 *   up, acquire() fails until the next UTC day. 0 or undefined means no limit.
 * - perKeyPerWeek: at most this many requests per key in any 7 days (a sliding window), so one
 *   user cannot use up the weekly quota that all users share. 0 or undefined means no limit.
 * - block(ms): Suunto answered with its own call limit. Its limits count every user of the app, so
 *   every request of the process fails at once, without being sent, until the wait is over.
 *
 * The counts per key and the end of a block are kept in a CallUsageStore: in memory by default;
 * the web service keeps them in its database, so a restart does not reset them.
 *
 * SuuntoHttp calls acquire() before every data request it sends, retries included. OAuth calls
 * are not counted. The Developer API allows 10 calls per minute and 200 per week for the whole
 * app (docs/suunto-api.md 1.3), so the defaults are 10 per minute and no cap per key.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { formatWait, realSleep, SuuntoHttpError } from "./http.js";

export interface CallLimits {
  /** Data requests per minute for the whole process. 0 = no limit. */
  perMinute: number;
  /** Data requests per user per UTC day. 0 = no limit. */
  perUserPerDay: number;
  /** Data requests per user in any 7 days. 0 or undefined = no limit. */
  perUserPerWeek?: number;
}

export const DEFAULT_LIMITS: CallLimits = { perMinute: 10, perUserPerDay: 0, perUserPerWeek: 0 };

/** The sliding window of the per-minute limit. */
const WINDOW_MS = 60_000;
const DAY_MS = 86_400_000;
/** The sliding window of the weekly limit. */
export const WEEK_MS = 7 * DAY_MS;
/** The longest wait for a free slot before acquire() fails. */
export const DEFAULT_MAX_WAIT_MS = 45_000;
/** The longest time all requests of one tool call wait for free slots together. */
export const TOOL_CALL_MAX_WAIT_MS = 45_000;

/**
 * Where a limiter keeps the requests of each key and the end of a block. Times are epoch ms.
 */
export interface CallUsageStore {
  /** The times of the key's requests at or after `sinceMs`, oldest first. */
  callTimes(key: string, sinceMs: number): number[];
  /** Count one request of `key`, sent at `at`. */
  recordCall(key: string, at: number): void;
  /** The end of the last block, if one was saved. */
  loadBlock(): number | undefined;
  saveBlock(until: number): void;
}

/** A CallUsageStore in memory (lost on restart). Requests older than 8 days are forgotten. */
export class MemoryCallUsage implements CallUsageStore {
  private readonly times = new Map<string, number[]>();
  private blockedUntil: number | undefined;

  callTimes(key: string, sinceMs: number): number[] {
    return (this.times.get(key) ?? []).filter((t) => t >= sinceMs);
  }

  recordCall(key: string, at: number): void {
    const list = this.times.get(key) ?? [];
    list.push(at);
    if (list.length > 1 && list[list.length - 2]! > at) list.sort((a, b) => a - b);
    while (list.length > 0 && list[0]! < at - WEEK_MS - DAY_MS) list.shift();
    this.times.set(key, list);
  }

  loadBlock(): number | undefined {
    return this.blockedUntil;
  }

  saveBlock(until: number): void {
    this.blockedUntil = until;
  }
}

export interface CallLimiterOptions {
  perMinute: number;
  perKeyPerDay?: number;
  perKeyPerWeek?: number;
  /** Where the counts per key and a block are kept (default: in memory). */
  usage?: CallUsageStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxWaitMs?: number;
}

function count(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The start of the UTC day of a time. */
function utcDayStart(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** The wait left to the tool call that runs now (withWaitBudget). */
const budgets = new AsyncLocalStorage<{ leftMs: number }>();

/**
 * Run `fn` (one tool call, or the test request of "Connect Suunto") so that all its requests
 * together wait for free slots at most `ms`. A request whose wait would be longer fails at once,
 * with nothing booked or counted.
 */
export function withWaitBudget<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return budgets.run({ leftMs: Math.max(0, ms) }, fn);
}

/** A refusal of the limiter: nothing was sent. */
function refusal(message: string, waitMs: number): SuuntoHttpError {
  return new SuuntoHttpError("rate_limit", message, { sent: false, waitMs: Math.max(0, waitMs) });
}

export class CallLimiter {
  private readonly perMinute: number;
  private readonly perKeyPerDay: number;
  private readonly perKeyPerWeek: number;
  private readonly usage: CallUsageStore;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxWaitMs: number;
  /** The times of the granted requests (sorted; a time can be in the future while a caller waits for it). */
  private granted: number[] = [];
  /** No request is granted before this time (Suunto refused one for its call limit). */
  private blockedUntil: number;

  constructor(opts: CallLimiterOptions) {
    this.perMinute = count(opts.perMinute);
    this.perKeyPerDay = count(opts.perKeyPerDay);
    this.perKeyPerWeek = count(opts.perKeyPerWeek);
    this.usage = opts.usage ?? new MemoryCallUsage();
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? realSleep;
    this.maxWaitMs = Math.max(0, opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS);
    this.blockedUntil = this.usage.loadBlock() ?? 0;
  }

  /** The per-minute limit (0 = none). */
  get requestsPerMinute(): number {
    return this.perMinute;
  }

  /**
   * Wait for a free slot for one request of `key` (a user id), and count it. Throws a rate limit
   * error (a SuuntoHttpError of kind "rate_limit", with `waitMs`) when a block is in force, the
   * daily or weekly limit of the key is used up, or the wait would be longer than maxWaitMs or
   * the tool call's wait budget. Nothing is counted then.
   */
  async acquire(key: string): Promise<void> {
    const now = this.now();
    const budget = budgets.getStore();
    // The slot is reserved at once (synchronously), so callers that wait at the same time never
    // get the same slot.
    const at = this.reserve(key, now, Math.min(this.maxWaitMs, budget?.leftMs ?? Number.POSITIVE_INFINITY));
    if (at > now) {
      if (budget) budget.leftMs -= at - now;
      await this.sleep(at - now);
    }
  }

  /**
   * Suunto refused a request for its call limit: refuse every request for the next `ms`
   * (measured on the limiter's clock). A block never gets shorter.
   */
  block(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const until = this.now() + ms;
    if (until <= this.blockedUntil) return;
    this.blockedUntil = until;
    this.usage.saveBlock(until);
  }

  /** Reserve a slot and return its time, or throw when there is none. */
  private reserve(key: string, now: number, maxWaitMs: number): number {
    if (this.blockedUntil > now) {
      const wait = this.blockedUntil - now;
      throw refusal(`Suunto's call limit for this service is reached. Try again in ${formatWait(wait)}.`, wait);
    }

    const counted = this.perKeyPerDay > 0 || this.perKeyPerWeek > 0;
    if (counted) {
      const today = utcDayStart(now);
      const times = this.usage.callTimes(key, this.perKeyPerWeek > 0 ? Math.min(today, now - WEEK_MS + 1) : today);
      if (this.perKeyPerDay > 0 && times.filter((t) => t >= today).length >= this.perKeyPerDay) {
        throw refusal(`You reached this service's daily limit of ${this.perKeyPerDay} Suunto requests for your account. Try again tomorrow.`, today + DAY_MS - now);
      }
      if (this.perKeyPerWeek > 0) {
        const week = times.filter((t) => t > now - WEEK_MS);
        if (week.length >= this.perKeyPerWeek) {
          // One more fits once the request perKeyPerWeek places back leaves the 7 days.
          const wait = week[week.length - this.perKeyPerWeek]! + WEEK_MS - now;
          throw refusal(
            `You reached this service's limit of ${this.perKeyPerWeek} Suunto requests per week for your account. Try again in ${formatWait(wait)}.`,
            wait,
          );
        }
      }
    }

    let at = now;
    if (this.perMinute > 0) {
      // Requests older than the window no longer count.
      while (this.granted.length > 0 && this.granted[0]! <= now - WINDOW_MS) this.granted.shift();
      if (this.granted.length >= this.perMinute) {
        // The slot frees up one window after the request that is perMinute places back.
        at = Math.max(now, this.granted[this.granted.length - this.perMinute]! + WINDOW_MS);
      }
      if (at - now > maxWaitMs) {
        throw refusal(`Suunto's call limit for this service is reached. Try again in ${formatWait(at - now)}.`, at - now);
      }
      this.granted.push(at);
    }
    if (counted) this.usage.recordCall(key, at);
    return at;
  }
}
