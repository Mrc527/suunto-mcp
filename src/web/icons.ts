/**
 * Small inline SVG glyphs drawn for this project (no Suunto artwork). Colors come from CSS: the
 * glyphs use currentColor and sit on colored tiles defined in assets.ts. The logo itself is in
 * assets/brand (see scripts/make-icons.mjs).
 */

import { createHash } from "node:crypto";
import { LOGO_SMALL_SVG, LOGO_SVG } from "./brand-assets.js";
import { html, raw, type SafeHtml } from "./html.js";

const svg = (paths: string, extra = "") =>
  raw(
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${paths}</svg>`,
  );

/** Changes with the logo, so browsers fetch a new logo right away. */
const LOGO_VERSION = createHash("sha256").update(LOGO_SVG).update(LOGO_SMALL_SVG).digest("hex").slice(0, 10);
const MARK_PX = { sm: 30, lg: 56, xl: 84 } as const;

const GLYPHS = {
  // A stopwatch: workouts.
  workouts: '<circle cx="12" cy="13.6" r="7.2"/><path d="M9.6 2.8h4.8M12 2.8v3.6M12 13.6l3.1-3.1M18.2 6.6l1.5-1.5"/>',
  // A heart with a pulse line: heart rate, sleep, recovery and daily activity.
  health: '<path d="M12 20.2s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6c0 5.9-8 10.6-8 10.6z"/><path d="M7.4 12.6h2.3l1.3-2.3 2 4.4 1.3-2.1h2.3" stroke-width="1.7"/>',
  // A winding route from a start point to a pin: routes and points of interest.
  routes: '<circle cx="5.6" cy="18.4" r="2"/><path d="M7.6 18.4h7.6a3 3 0 0 0 0-6H8.8a3 3 0 0 1 0-6h3.4"/><path d="M18 3.4a2.7 2.7 0 0 0-2.7 2.7c0 2 2.7 4.5 2.7 4.5s2.7-2.5 2.7-4.5A2.7 2.7 0 0 0 18 3.4z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
  device: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2.5 19.5h19"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  link: '<path d="M10 14a4.2 4.2 0 0 0 6 0l2.8-2.8a4.2 4.2 0 0 0-6-6L11.6 6.4"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-2.8 2.8a4.2 4.2 0 0 0 6 6l1.2-1.2"/>',
  person: '<circle cx="12" cy="8.2" r="3.7"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.2a5.5 5.5 0 0 1 3 4.8"/>',
} as const;

export type Glyph = keyof typeof GLYPHS;
/**
 * What the start page, the account page and the consent page show as tiles: workouts; heart
 * rate, sleep, recovery and daily activity; routes and points of interest.
 */
export type Service = "workouts" | "health" | "routes";

/** The services in the order the pages show them. */
export const SERVICES: readonly Service[] = ["workouts", "health", "routes"];

export function glyph(name: Glyph): SafeHtml {
  return svg(GLYPHS[name]);
}

/** The app's logo (the small version, drawn for 16-32 px, in the top bar). */
export function brandMark(size: "sm" | "lg" | "xl" = "sm"): SafeHtml {
  const src = `${size === "sm" ? "/favicon.svg" : "/icon.svg"}?v=${LOGO_VERSION}`;
  return html`<img class="mark mark-${size}" src="${src}" alt="" width="${MARK_PX[size]}" height="${MARK_PX[size]}">`;
}

/** A service tile icon (white glyph on a colored rounded square). */
export function serviceIcon(service: Service, size: "sm" | "lg" = "sm"): SafeHtml {
  return html`<span class="svc-icon svc-${service} svc-${size}">${glyph(service)}</span>`;
}

/** Initials for the avatar circle. */
export function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? (parts[0]![0] ?? "") + (parts[1]![0] ?? "") : local.slice(0, 1);
  return (letters || "?").toUpperCase();
}
