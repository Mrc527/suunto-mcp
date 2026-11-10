/**
 * CallLimiter: keeps the data requests of this process under Suunto's call limit.
 *
 * - perMinute: at most this many requests in any 60 s (a sliding window), for the whole process.
 *   A request that has no free slot waits for one, up to maxWaitMs (default 45 s). When the wait
 *   would be longer, acquire() fails at once with a rate limit error. 0 means no limit.
 * - perKeyPerDay: at most this many requests per key (a user id) per UTC day. When they are used
 *   up, acquire() fails until the next UTC day. 0 or undefined means no limit.
 *
 * SuuntoHttp calls acquire() before every data request it sends, retries included. OAuth calls
 * are not counted. The Developer API allows 10 calls per minute and 200 per week for the whole
 * app (docs/suunto-api.md 1.3), so the defaults are 10 per minute and no daily cap.
 */

import { formatWait, realSleep, SuuntoHttpError } from "./http.js";

export interface CallLimits {
  /** Data requests per minute for the whole process. 0 = no limit. */
  perMinute: number;
  /** Data requests per user per UTC day. 0 = no limit. */
  perUserPerDay: number;
}

export const DEFAULT_LIMITS: CallLimits = { perMinute: 10, perUserPerDay: 0 };

/** The sliding window of the per-minute limit. */
const WINDOW_MS = 60_000;
/** The longest wait for a free slot before acquire() fails. */
export const DEFAULT_MAX_WAIT_MS = 45_000;

export interface CallLimiterOptions {
  perMinute: number;
  perKeyPerDay?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxWaitMs?: number;
}

function count(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The UTC day of a time, as "YYYY-MM-DD". */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export class CallLimiter {
  private readonly perMinute: number;
  private readonly perKeyPerDay: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxWaitMs: number;
  /** The times of the granted requests (sorted; a time can be in the future while a caller waits for it). */
  private granted: number[] = [];
  /** Requests per key on `day`. */
  private perKey = new Map<string, number>();
  private day = "";

  constructor(opts: CallLimiterOptions) {
    this.perMinute = count(opts.perMinute);
    this.perKeyPerDay = count(opts.perKeyPerDay);
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? realSleep;
    this.maxWaitMs = Math.max(0, opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS);
  }

  /**
   * Wait for a free slot for one request of `key` (a user id), and count it. Throws a rate limit
   * error (a SuuntoHttpError of kind "rate_limit") when the daily limit of the key is used up or
   * the wait would be longer than maxWaitMs. Nothing is counted then.
   */
  async acquire(key: string): Promise<void> {
    const now = this.now();
    // The slot is reserved at once (synchronously), so callers that wait at the same time never
    // get the same slot.
    const at = this.reserve(key, now);
    if (at > now) await this.sleep(at - now);
  }

  /** Reserve a slot and return its time, or throw when there is none. */
  private reserve(key: string, now: number): number {
    const day = utcDay(now);
    if (day !== this.day) {
      this.day = day;
      this.perKey.clear();
    }
    const used = this.perKey.get(key) ?? 0;
    if (this.perKeyPerDay > 0 && used >= this.perKeyPerDay) {
      throw new SuuntoHttpError(
        "rate_limit",
        `You reached this service's daily limit of ${this.perKeyPerDay} Suunto requests for your account. Try again tomorrow.`,
        { sent: false },
      );
    }

    let at = now;
    if (this.perMinute > 0) {
      // Requests older than the window no longer count.
      while (this.granted.length > 0 && this.granted[0]! <= now - WINDOW_MS) this.granted.shift();
      if (this.granted.length >= this.perMinute) {
        // The slot frees up one window after the request that is perMinute places back.
        at = Math.max(now, this.granted[this.granted.length - this.perMinute]! + WINDOW_MS);
      }
      if (at - now > this.maxWaitMs) {
        throw new SuuntoHttpError("rate_limit", `Suunto's call limit for this service is reached. Try again in ${formatWait(at - now)}.`, { sent: false });
      }
      this.granted.push(at);
    }
    if (this.perKeyPerDay > 0) this.perKey.set(key, used + 1);
    return at;
  }
}
