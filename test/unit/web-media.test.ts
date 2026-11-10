/**
 * The explainer video files: range requests, and errors that are not "no such video".
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mediaRoutes } from "../../src/web/media.js";

describe("video files", () => {
  const video = Buffer.alloc(1000, 7);
  let dir = "";
  let server: Server;
  let base = "";

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "padi-mcp-media-"));
    writeFileSync(join(dir, "intro-en.mp4"), video);
    const app = express();
    app.use(mediaRoutes(dir));
    app.use((_req, res) => void res.status(404).type("text").send("Not found"));
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  });

  it("are served whole or in parts", async () => {
    const whole = await fetch(`${base}/media/intro-en.mp4`);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("video/mp4");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(Buffer.from(await whole.arrayBuffer()).equals(video)).toBe(true);

    const part = await fetch(`${base}/media/intro-en.mp4`, { headers: { range: "bytes=0-9" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 0-9/1000");
    expect((await part.arrayBuffer()).byteLength).toBe(10);
  });

  it("answer a range past the end with 416, not 404", async () => {
    const res = await fetch(`${base}/media/intro-en.mp4`, { headers: { range: "bytes=5000-" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */1000");
    expect(res.headers.get("content-type")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("");
  });

  it("answer a failed precondition with 412, not 404", async () => {
    for (const headers of [{ "if-match": '"nope"' }, { "if-unmodified-since": "Mon, 01 Jan 2001 00:00:00 GMT" }]) {
      const res = await fetch(`${base}/media/intro-en.mp4`, { headers });
      expect(res.status, JSON.stringify(headers)).toBe(412);
      expect(res.headers.get("cache-control")).toBe("no-store");
      await res.arrayBuffer();
    }
  });

  it("leave videos that do not exist to the 404 page", async () => {
    for (const path of ["/media/intro-de.mp4", "/media/intro-xx.mp4", "/media/intro-en.jpg"]) {
      const res = await fetch(`${base}${path}`);
      expect(res.status, path).toBe(404);
      expect(await res.text()).toBe("Not found");
    }
  });
});
