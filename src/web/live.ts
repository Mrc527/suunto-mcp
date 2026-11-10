/**
 * Live activity for the "Connected apps" page, pushed with Server-Sent Events.
 *
 * SSE fits better than a WebSocket here: the data only goes from server to browser, browsers
 * reconnect by themselves, no extra library is needed, and it passes reverse proxies as plain
 * HTTP. An idle stream costs one open socket; one shared timer sends keep-alive comments to all
 * streams and closes those whose session ended.
 */

import type { Response } from "express";

export interface ActivityEvent {
  id: number;
  at: number;
  tool: string;
  ok: boolean;
  durationMs: number;
}

interface Subscriber {
  userId: string;
  sessionHash: string;
  res: Response;
}

export interface LiveOptions {
  /** Open streams per user (several tabs or devices). */
  maxPerUser?: number;
  /** Open streams on the whole server. */
  maxTotal?: number;
  /** Keep-alive and session check interval. */
  heartbeatMs?: number;
  /** Whether a session (by its stored hash) is still valid and its user still active. */
  sessionActive: (sessionHash: string) => boolean;
}

/** A slow client whose unsent data grows past this is disconnected (it reconnects and catches up). */
const MAX_BUFFERED = 64 * 1024;

export class ActivityHub {
  private readonly byUser = new Map<string, Set<Subscriber>>();
  private total = 0;
  private readonly maxPerUser: number;
  private readonly maxTotal: number;
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly opts: LiveOptions) {
    this.maxPerUser = opts.maxPerUser ?? 5;
    this.maxTotal = opts.maxTotal ?? 500;
    this.timer = setInterval(() => this.heartbeat(), opts.heartbeatMs ?? 25_000);
    this.timer.unref();
  }

  get size(): number {
    return this.total;
  }

  /**
   * Start a stream on `res`. Returns false (and sends nothing) when the limits are reached.
   * `replay()` is only called once the stream is accepted; its events are sent first, so a
   * reconnecting page catches up on what it missed. Loading it in the same tick as the
   * subscription means no event can fall between the two.
   */
  open(userId: string, sessionHash: string, res: Response, replay: () => ActivityEvent[]): boolean {
    const set = this.byUser.get(userId) ?? new Set<Subscriber>();
    if (set.size >= this.maxPerUser || this.total >= this.maxTotal) return false;
    // A pipelined request waits behind another response and has no socket yet: it would never
    // report 'close', so it is not accepted.
    if (!res.socket) return false;
    const sub: Subscriber = { userId, sessionHash, res };
    set.add(sub);
    this.byUser.set(userId, set);
    this.total++;
    res.status(200);
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    // Tell nginx-style proxies not to buffer the stream.
    res.setHeader("x-accel-buffering", "no");
    res.flushHeaders();
    res.socket?.setNoDelay(true);
    // Browsers wait this long before reconnecting after a dropped connection.
    res.write("retry: 10000\n\n");
    res.on("close", () => this.remove(sub));
    res.on("error", () => this.drop(sub));
    res.req.on("close", () => this.remove(sub));
    for (const event of replay()) this.send(sub, event);
    return true;
  }

  publish(userId: string, event: ActivityEvent): void {
    for (const sub of this.byUser.get(userId) ?? []) this.send(sub, event);
  }

  /** End every stream (server shutdown). */
  closeAll(): void {
    clearInterval(this.timer);
    for (const set of [...this.byUser.values()]) for (const sub of [...set]) this.drop(sub);
  }

  /** Write unless the stream is gone; a client that does not keep up is disconnected. */
  private write(sub: Subscriber, chunk: string): void {
    const res = sub.res;
    if (res.writableEnded || res.destroyed) {
      this.drop(sub);
      return;
    }
    res.write(chunk);
    // end() would wait for a reader that never reads; destroy() frees the socket right away.
    if (res.writableLength > MAX_BUFFERED) this.drop(sub);
  }

  private send(sub: Subscriber, event: ActivityEvent): void {
    this.write(sub, `id: ${event.id}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`);
  }

  private heartbeat(): void {
    for (const set of [...this.byUser.values()]) {
      for (const sub of [...set]) {
        let active = false;
        try {
          active = this.opts.sessionActive(sub.sessionHash);
        } catch {
          active = false;
        }
        if (!active) {
          // Signed out, expired or disabled: tell the page to stop instead of reconnecting.
          if (!sub.res.writableEnded && !sub.res.destroyed) {
            sub.res.end("event: end\ndata: signed-out\n\n");
            // Free the socket even if the client never reads the last message.
            const res = sub.res;
            setTimeout(() => res.destroy(), 5000).unref();
          }
          this.remove(sub);
          continue;
        }
        this.write(sub, ": ping\n\n");
      }
    }
  }

  private drop(sub: Subscriber): void {
    this.remove(sub);
    if (!sub.res.destroyed) sub.res.destroy();
  }

  private remove(sub: Subscriber): void {
    const set = this.byUser.get(sub.userId);
    if (!set?.delete(sub)) return;
    this.total--;
    if (set.size === 0) this.byUser.delete(sub.userId);
  }
}
