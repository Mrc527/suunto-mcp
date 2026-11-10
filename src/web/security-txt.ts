/**
 * /.well-known/security.txt (RFC 9116): where to report a security problem.
 *
 * Update EXPIRES before it passes (at most a year ahead). Someone who runs their own copy changes
 * CONTACT_EMAIL in operator.ts and POLICY_URL here.
 */

import express, { type Router } from "express";
import { CONTACT_EMAIL } from "./operator.js";

/** When this file should be considered stale (RFC 3339 / ISO 8601, UTC). */
export const SECURITY_TXT_EXPIRES = "2027-11-08T00:00:00.000Z";

/**
 * A public page with the security policy (SECURITY.md), if there is one. The repository is
 * private for now, so its GitHub page would answer 404: the optional Policy field is left out.
 */
export const SECURITY_POLICY_URL: string | undefined = undefined;

const CACHE = "public, max-age=86400";

/** The file's text. The canonical address is built from the public URL of this server. */
export function securityTxt(publicUrl: URL): string {
  const base = publicUrl.href.endsWith("/") ? publicUrl.href : `${publicUrl.href}/`;
  const canonical = new URL(".well-known/security.txt", base).href;
  return [
    `Contact: mailto:${CONTACT_EMAIL}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    "Preferred-Languages: en, it, de",
    `Canonical: ${canonical}`,
    ...(SECURITY_POLICY_URL ? [`Policy: ${SECURITY_POLICY_URL}`] : []),
    "",
  ].join("\n");
}

export function securityTxtRoutes(publicUrl: URL): Router {
  const r = express.Router();
  const body = securityTxt(publicUrl);
  r.get("/.well-known/security.txt", (_req, res) => {
    res.setHeader("cache-control", CACHE);
    res.setHeader("x-content-type-options", "nosniff");
    res.type("text/plain; charset=utf-8").send(body);
  });
  return r;
}
