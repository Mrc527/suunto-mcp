/**
 * The logo as files: favicon, app icons, web manifest, and the icons sent in the MCP serverInfo.
 *
 * AI apps differ in what they show. VS Code and Codex read serverInfo.icons (VS Code only from the
 * same host as the MCP address, and never SVG), browsers read the favicon and <link rel="icon">.
 */

import express, { type Router } from "express";
import type { Icon } from "@modelcontextprotocol/sdk/types.js";
import { FAVICON_ICO, ICON_PNG, LOGO_SMALL_SVG, LOGO_SVG } from "./brand-assets.js";

const CACHE = "public, max-age=86400";

/** Icons for the MCP serverInfo, served from this host. */
export function mcpIcons(base: string): Icon[] {
  return [
    { src: `${base}/icon-48.png`, mimeType: "image/png", sizes: ["48x48"] },
    { src: `${base}/icon-192.png`, mimeType: "image/png", sizes: ["192x192"] },
    { src: `${base}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
  ];
}

export function brandRoutes(): Router {
  const r = express.Router();
  const send = (path: string, type: string, body: Buffer | string) =>
    r.get(path, (_req, res) => {
      res.setHeader("cache-control", CACHE);
      res.setHeader("x-content-type-options", "nosniff");
      // An SVG opened on its own must not run anything.
      res.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.type(type).send(body);
    });
  send("/favicon.ico", "image/x-icon", FAVICON_ICO);
  send("/favicon.svg", "image/svg+xml", LOGO_SMALL_SVG);
  send("/icon.svg", "image/svg+xml", LOGO_SVG);
  send("/apple-touch-icon.png", "image/png", ICON_PNG[180]!);
  send("/apple-touch-icon-precomposed.png", "image/png", ICON_PNG[180]!);
  send("/icon-48.png", "image/png", ICON_PNG[48]!);
  send("/icon-192.png", "image/png", ICON_PNG[192]!);
  send(
    "/site.webmanifest",
    "application/manifest+json",
    JSON.stringify({
      name: "MCP for PADI",
      short_name: "MCP for PADI",
      start_url: "/",
      display: "browser",
      background_color: "#f5f5f7",
      theme_color: "#0f7fc9",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    }),
  );
  return r;
}
