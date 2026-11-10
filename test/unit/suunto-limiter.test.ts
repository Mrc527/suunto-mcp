import { describe, expect, it } from "vitest";
import { SuuntoHttpError } from "../../src/suunto/http.js";
import { CallLimiter, DEFAULT_LIMITS, DEFAULT_MAX_WAIT_MS, MemoryCallUsage, withWaitBudget, type CallLimiterOptions } from "../../src/suunto/limiter.js";
import { UserFacingError } from "../../src/util/errors.js";

const T0 = Date.UTC(2026, 10, 10, 12, 0, 0);

/** A limiter on a fake clock: sleep() moves the clock and records the wait. */
function limiter(opts: Partial<CallLimiterOptions> = {}) {
  const clock = { now: T0 };
  const waits: number[] = [];
  const l = new CallLimiter({
    perMinute: 10,
    now: () => clock.now,
    sleep: async (ms) => {
      waits.push(ms);
    },
    ...opts,
  });
  return { l, clock, waits };
}

async function refusal(p: Promise<unknown>): Promise<SuuntoHttpError> {
  const e = await p.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(e).toBeInstanceOf(SuuntoHttpError);
  expect(e).toBeInstanceOf(UserFacingError);
  const err = e as SuuntoHttpError;
  expect(err.kind).toBe("rate_limit");
  expect(err.sent).toBe(false);
  return err;
}

describe("CallLimiter", () => {
  it("has Suunto's Developer limit as default and no daily cap", () => {
    expect(DEFAULT_LIMITS).toEqual({ perMinute: 10, perUserPerDay: 0, perUserPerWeek: 0 });
    expect(DEFAULT_MAX_WAIT_MS).toBe(45_000);
  });

  it("lets perMinute calls through at once, then waits for the oldest to leave the 60 s window", async () => {
    const { l, clock, waits } = limiter({ perMinute: 3 });
    await l.acquire("a");
    clock.now += 10_000;
    await l.acquire("a");
    clock.now += 10_000;
    await l.acquire("b");
    expect(waits).toEqual([]);
    // At T0 + 25 s, the first call (T0) frees its slot at T0 + 60 s.
    clock.now = T0 + 25_000;
    await l.acquire("a");
    expect(waits).toEqual([35_000]);
    // The window slides: at T0 + 70 s only the calls of T0 + 20 s and T0 + 60 s count, so one
    // more goes at once. Then the next slot is T0 + 20 s + 60 s.
    clock.now = T0 + 70_000;
    await l.acquire("a");
    expect(waits).toEqual([35_000]);
    clock.now = T0 + 75_000;
    await l.acquire("a");
    expect(waits).toEqual([35_000, 5_000]);
  });

  it("gives waiting callers different slots", async () => {
    const { l, waits } = limiter({ perMinute: 2, maxWaitMs: 90_000 });
    await Promise.all([l.acquire("a"), l.acquire("a"), l.acquire("a"), l.acquire("a")]);
    // Two go at once, two get the slots of T0 + 60 s (never the same slot twice in a window).
    expect(waits).toEqual([60_000, 60_000]);
    // The window is full until T0 + 60 s and again until T0 + 120 s: the next call would wait 120 s.
    const e = await refusal(l.acquire("a"));
    expect(e.message).toBe("Suunto's call limit for this service is reached. Try again in 2 minutes.");
  });

  it("fails at once when the wait would be longer than maxWaitMs, and counts nothing then", async () => {
    const { l, clock, waits } = limiter({ perMinute: 1, maxWaitMs: 30_000 });
    await l.acquire("a");
    clock.now = T0 + 20_000;
    const e = await refusal(l.acquire("a"));
    expect(e.message).toBe("Suunto's call limit for this service is reached. Try again in 40 seconds.");
    expect(waits).toEqual([]);
    // The refused call took no slot: 30 s later the wait is 10 s.
    clock.now = T0 + 50_000;
    await l.acquire("a");
    expect(waits).toEqual([10_000]);
  });

  it("waits up to 45 s by default", async () => {
    const { l, clock, waits } = limiter({ perMinute: 1 });
    await l.acquire("a");
    clock.now = T0 + 15_000;
    await l.acquire("a");
    expect(waits).toEqual([45_000]);
    await refusal(l.acquire("a"));
  });

  it("caps each key per UTC day", async () => {
    const { l, clock } = limiter({ perMinute: 0, perKeyPerDay: 2 });
    await l.acquire("user-1");
    await l.acquire("user-1");
    const e = await refusal(l.acquire("user-1"));
    expect(e.message).toBe("You reached this service's daily limit of 2 Suunto requests for your account. Try again tomorrow.");
    // Other keys have their own count.
    await l.acquire("user-2");
    await l.acquire("user-2");
    await refusal(l.acquire("user-2"));
    // A new UTC day starts again.
    clock.now = Date.UTC(2026, 10, 11, 0, 0, 0);
    await l.acquire("user-1");
    await l.acquire("user-1");
    await refusal(l.acquire("user-1"));
  });

  it("does not count a call against the day when the minute limit refuses it", async () => {
    const { l, clock } = limiter({ perMinute: 1, perKeyPerDay: 2, maxWaitMs: 0 });
    await l.acquire("a");
    await refusal(l.acquire("a"));
    clock.now += 60_000;
    await l.acquire("a");
    clock.now += 60_000;
    expect((await refusal(l.acquire("a"))).message).toMatch(/daily limit of 2/);
  });

  it("caps each key in any 7 days, across midnight, and says when one more fits", async () => {
    // 23:50 UTC: a daily cap alone would allow its share again ten minutes later.
    const start = Date.UTC(2026, 10, 10, 23, 50, 0);
    const clock = { now: start };
    const l2 = new CallLimiter({ perMinute: 0, perKeyPerDay: 100, perKeyPerWeek: 5, now: () => clock.now });
    for (let i = 0; i < 3; i++) await l2.acquire("user-1");
    clock.now = start + 20 * 60_000;
    for (let i = 0; i < 2; i++) await l2.acquire("user-1");
    const e = await refusal(l2.acquire("user-1"));
    expect(e.message).toBe("You reached this service's limit of 5 Suunto requests per week for your account. Try again in 7 days.");
    // The first request leaves the 7 days a week after it was sent.
    expect(e.waitMs).toBe(7 * 86_400_000 - 20 * 60_000);
    await l2.acquire("user-2");
    // A week later the 3 requests of 23:50 have left the 7 days; the 2 of 00:10 have not.
    clock.now = start + 7 * 86_400_000;
    for (let i = 0; i < 3; i++) await l2.acquire("user-1");
    await refusal(l2.acquire("user-1"));
  });

  it("keeps the counts per key and a block in its store, so a new limiter (a restart) goes on from them", async () => {
    const usage = new MemoryCallUsage();
    const clock = { now: T0 };
    const make = () => new CallLimiter({ perMinute: 0, perKeyPerDay: 2, usage, now: () => clock.now });
    const before = make();
    await before.acquire("user-1");
    await before.acquire("user-1");
    before.block(60_000);
    const after = make();
    expect((await refusal(after.acquire("user-2"))).message).toBe("Suunto's call limit for this service is reached. Try again in 60 seconds.");
    clock.now += 60_000;
    await after.acquire("user-2");
    expect((await refusal(after.acquire("user-1"))).message).toMatch(/daily limit of 2/);
  });

  it("refuses at once while blocked, never shortens a block, and tells the wait", async () => {
    const { l, clock } = limiter({ perMinute: 10 });
    l.block(3 * 86_400_000);
    l.block(60_000);
    const e = await refusal(l.acquire("a"));
    expect(e.message).toBe("Suunto's call limit for this service is reached. Try again in 3 days.");
    expect(e.waitMs).toBe(3 * 86_400_000);
    clock.now += 3 * 86_400_000;
    await l.acquire("a");
  });

  it("lets all requests of one tool call wait at most its budget together", async () => {
    const { l, clock, waits } = limiter({ perMinute: 2, maxWaitMs: 45_000 });
    await l.acquire("a");
    await l.acquire("a");
    // Each of these waits for a slot; the second would pass the budget of 50 s in all.
    clock.now = T0 + 20_000;
    await withWaitBudget(50_000, async () => {
      await l.acquire("b");
      expect(waits).toEqual([40_000]);
      const e = await refusal(l.acquire("b"));
      expect(e.message).toBe("Suunto's call limit for this service is reached. Try again in 40 seconds.");
    });
    // Outside a budget, only maxWaitMs counts.
    await l.acquire("c");
    expect(waits).toEqual([40_000, 40_000]);
  });

  it("has no limit with perMinute 0 and no daily cap", async () => {
    const { l, waits } = limiter({ perMinute: 0 });
    for (let i = 0; i < 1000; i++) await l.acquire("a");
    expect(waits).toEqual([]);
  });
});
