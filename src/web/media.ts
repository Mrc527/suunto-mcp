/**
 * The explainer video on the start page: one MP4 (H.264) and one poster image per language in
 * assets/video/ (intro-<lang>.mp4 and intro-<lang>.jpg). A language without its own video gets
 * the English one. There is no video in v1: the start page leaves the section out. Served with
 * range requests, so browsers can seek and start playing early.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Router } from "express";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./i18n/locales.js";

/** assets/video next to src/ (development) or dist/ (build and Docker image). */
export const VIDEO_DIR = fileURLToPath(new URL("../../assets/video/", import.meta.url));

const file = (lang: Locale, ext: "mp4" | "jpg") => `intro-${lang}.${ext}`;

function available(lang: Locale): Locale | undefined {
  if (existsSync(VIDEO_DIR + file(lang, "mp4"))) return lang;
  if (existsSync(VIDEO_DIR + file(DEFAULT_LOCALE, "mp4"))) return DEFAULT_LOCALE;
  return undefined;
}

/** The video for a language (or English), or undefined when no video has been made. */
export function introVideo(lang: Locale): { mp4: string; poster: string; lang: Locale } | undefined {
  const found = available(lang);
  if (!found) return undefined;
  // The file's size and time in the address: a new render reaches browsers that cached the old one.
  const version = (name: string) => {
    try {
      const s = statSync(VIDEO_DIR + name);
      return `${s.size.toString(36)}${Math.floor(s.mtimeMs / 1000).toString(36)}`;
    } catch {
      return "0";
    }
  };
  const mp4 = file(found, "mp4");
  const jpg = file(found, "jpg");
  return { mp4: `/media/${mp4}?v=${version(mp4)}`, poster: `/media/${jpg}?v=${version(jpg)}`, lang: found };
}

/** The video files, from `dir` (assets/video unless a test gives another folder). */
export function mediaRoutes(dir = VIDEO_DIR): Router {
  const r = express.Router();
  r.get(/^\/media\/intro-([a-z]{2})\.(mp4|jpg)$/, (req, res, next) => {
    const params = req.params as unknown as Record<string, string>;
    const lang = params[0];
    const ext = params[1] as "mp4" | "jpg";
    if (!isLocale(lang)) return next();
    const name = file(lang, ext);
    if (!existsSync(join(dir, name))) return next();
    res.setHeader("x-content-type-options", "nosniff");
    res.sendFile(name, { root: dir, maxAge: 86_400_000, acceptRanges: true, dotfiles: "deny" }, (error) => {
      if (!error || res.headersSent) return;
      const status = (error as { status?: unknown }).status;
      // Gone since the check above: the same answer as any unknown address.
      if (status === 404) return next();
      // Not the video: no video type, and nothing a cache may keep in its place.
      res.removeHeader("content-type");
      res.setHeader("cache-control", "no-store");
      // A range past the end (416, with the Content-Range send has set), a failed precondition
      // (412), or the file could not be read.
      res.status(typeof status === "number" && status >= 400 && status < 600 ? status : 500).end();
    });
  });
  return r;
}
