/**
 * The demo accounts of the web service, for app reviewers (for example the Claude Connectors
 * Directory) who must not test with a real PADI account.
 *
 * A demo account has no PADI account behind it: its logbook is the in-memory store of logbook.ts,
 * filled with invented sample dives (logbook-data.ts: diver "Alex Demo", time zone
 * Europe/Zurich). The registry keeps one store per demo user for the life of the process. Nothing
 * is written to disk and nothing is sent to PADI, so a restart starts from fresh sample data, and
 * every store is reset to fresh sample data every day at 04:00 in Europe/Zurich: one timer for all
 * accounts, plus a check on every use in case the timer was late (for example after the machine
 * was suspended).
 */

import { addDays, parseDateOnly, todayInZone, wallTimeToDate } from "../util/dates.js";
import { DemoLogbookStore, type DemoSeed } from "./logbook.js";
import { DEMO_INSTRUCTOR_NUMBER } from "./logbook-data.js";

export { DEMO_ADDRESS, DEMO_AFFILIATE_ID, DEMO_INSTRUCTOR_NUMBER, DEMO_NAME } from "./logbook-data.js";

export const DEMO_TIME_ZONE = "Europe/Zurich";
/** Hour of the daily reset, in DEMO_TIME_ZONE. */
export const DEMO_RESET_HOUR = 4;

/** What the AI app is told about a demo account (server instructions and padi_account_info). */
export const DEMO_NOTICE =
  "This is a demo account: its logbook is invented sample data built into this server, not a real PADI account. " +
  "Adding, changing and deleting dives works, but nothing is sent to PADI or to any PADI Pro. " +
  `PADI Pro number ${DEMO_INSTRUCTOR_NUMBER} is an invented instructor for trying the verification request. ` +
  `Changes are kept in memory only and reset to fresh sample data every day at ${String(DEMO_RESET_HOUR).padStart(2, "0")}:00 (${DEMO_TIME_ZONE}).`;

export interface DemoAccount {
  readonly userId: string;
  readonly logbook: DemoLogbookStore;
  /** Grows with every reset, so services built on the old data are rebuilt. */
  readonly generation: number;
  /** When the current sample data was generated. */
  readonly resetAt: Date;
}

interface Entry {
  userId: string;
  logbook: DemoLogbookStore;
  generation: number;
  resetAt: Date;
}

function resetOn(day: string, timeZone: string, hour: number): Date {
  const d = parseDateOnly(day);
  return wallTimeToDate({ year: d.year, month: d.month, day: d.day, hour, minute: 0, second: 0 }, timeZone);
}

/** The latest daily reset at or before `now`. */
export function lastDemoReset(now: Date, timeZone = DEMO_TIME_ZONE, hour = DEMO_RESET_HOUR): Date {
  const today = todayInZone(timeZone, now);
  const at = resetOn(today, timeZone, hour);
  return at.getTime() <= now.getTime() ? at : resetOn(addDays(today, -1), timeZone, hour);
}

/** The next daily reset after `now`. */
export function nextDemoReset(now: Date, timeZone = DEMO_TIME_ZONE, hour = DEMO_RESET_HOUR): Date {
  const today = todayInZone(timeZone, now);
  const at = resetOn(today, timeZone, hour);
  return at.getTime() > now.getTime() ? at : resetOn(addDays(today, 1), timeZone, hour);
}

export interface DemoRegistryOptions {
  /** Clock for the sample data and the daily reset (tests). */
  clock?: () => Date;
  timeZone?: string;
  resetHour?: number;
  /** The sample dives (default: those of logbook.ts). */
  seed?: DemoSeed;
}

/** The demo store of every demo user, and their daily reset. */
export class DemoRegistry {
  readonly timeZone: string;
  readonly resetHour: number;
  private readonly clock: () => Date;
  private readonly seed: DemoSeed | undefined;
  private readonly entries = new Map<string, Entry>();
  private timer: NodeJS.Timeout | undefined;

  constructor(opts: DemoRegistryOptions = {}) {
    this.clock = opts.clock ?? (() => new Date());
    this.timeZone = opts.timeZone ?? DEMO_TIME_ZONE;
    this.resetHour = opts.resetHour ?? DEMO_RESET_HOUR;
    this.seed = opts.seed;
  }

  /** Number of demo accounts with stores in memory. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * The demo store of a user, created with fresh sample data on first use. A daily reset that is
   * due (the timer was late) is done first.
   */
  account(userId: string): DemoAccount {
    const now = this.clock();
    const existing = this.entries.get(userId);
    if (existing) {
      this.resetIfDue(existing, now);
      return existing;
    }
    const logbook = new DemoLogbookStore({ now, clock: this.clock, timeZone: this.timeZone, ...(this.seed ? { seed: this.seed } : {}) });
    const entry: Entry = { userId, logbook, generation: 1, resetAt: now };
    this.entries.set(userId, entry);
    this.schedule();
    return entry;
  }

  /** The demo stores of a user if they are in memory (nothing is created). */
  peek(userId: string): DemoAccount | undefined {
    return this.entries.get(userId);
  }

  /**
   * Throw away every change: one user's demo data, or every demo account's. Returns how many
   * accounts were reset. An account that is not in memory needs nothing: it starts fresh anyway.
   */
  reset(userId?: string): number {
    const now = this.clock();
    const targets = userId === undefined ? [...this.entries.values()] : [this.entries.get(userId)].filter((e): e is Entry => !!e);
    for (const entry of targets) this.resetEntry(entry, now);
    return targets.length;
  }

  /** Reset every account whose data is older than the latest daily reset. Returns how many. */
  resetDue(now: Date = this.clock()): number {
    let n = 0;
    for (const entry of this.entries.values()) if (this.resetIfDue(entry, now)) n++;
    return n;
  }

  /** Drop a user's store (the account was deleted or is no longer a demo account). */
  forget(userId: string): void {
    this.entries.delete(userId);
    if (this.entries.size === 0) this.stop();
  }

  /** Drop every store and stop the timer. */
  clear(): void {
    this.entries.clear();
    this.stop();
  }

  /** When the next daily reset happens. */
  nextReset(now: Date = this.clock()): Date {
    return nextDemoReset(now, this.timeZone, this.resetHour);
  }

  private resetIfDue(entry: Entry, now: Date): boolean {
    if (entry.resetAt.getTime() >= lastDemoReset(now, this.timeZone, this.resetHour).getTime()) return false;
    this.resetEntry(entry, now);
    return true;
  }

  private resetEntry(entry: Entry, now: Date): void {
    entry.logbook.reset(now);
    entry.generation++;
    entry.resetAt = now;
  }

  /** One timer for all accounts, only while there are any. It never keeps the process alive. */
  private schedule(): void {
    if (this.timer || this.entries.size === 0) return;
    const now = this.clock();
    // At least a second (a timer that fires a moment early tries again soon), at most a day.
    const delay = Math.min(Math.max(this.nextReset(now).getTime() - now.getTime(), 1000), 86_400_000);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.resetDue();
      this.schedule();
    }, delay);
    this.timer.unref();
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

/** The registry the web service uses. */
export const demoRegistry = new DemoRegistry();

/** Reset one demo user's data (or every demo account's) to fresh sample data now. Returns how many. */
export function resetDemo(userId?: string): number {
  return demoRegistry.reset(userId);
}
