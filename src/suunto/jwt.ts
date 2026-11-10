/**
 * Read the payload of a JWT (the Suunto access token). There is no signature check: the token
 * comes straight from Suunto's token endpoint over HTTPS, Suunto checks it on every request, and
 * the signing key is not documented. We only read the expiry ("exp") and the Suunto username
 * ("user").
 */

export type JwtPayload = Record<string, unknown>;

/** The payload of a JWT, or undefined when the text is not a JWT with a JSON object payload. */
export function decodeJwt(token: string): JwtPayload | undefined {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
    return payload as JwtPayload;
  } catch {
    return undefined;
  }
}

function str(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** When the token expires (epoch milliseconds), from the "exp" claim (seconds since the epoch). */
export function jwtExpiresAt(payload: JwtPayload): number | undefined {
  const exp = payload.exp;
  const n = typeof exp === "number" ? exp : typeof exp === "string" && exp.trim() ? Number(exp) : NaN;
  return Number.isFinite(n) && n > 0 ? n * 1000 : undefined;
}

/**
 * The Suunto App username: the custom claim "user" (documented). "user_name" (the Spring OAuth
 * spelling) and "sub" are fallbacks in case Suunto ever moves it.
 */
export function jwtUsername(payload: JwtPayload): string | undefined {
  return str(payload.user) ?? str(payload.user_name) ?? str(payload.sub);
}

/** The expiry of a token (epoch ms), or undefined when it is not a JWT or has no "exp". */
export function tokenExpiresAt(token: string): number | undefined {
  const payload = decodeJwt(token);
  return payload ? jwtExpiresAt(payload) : undefined;
}

/** The Suunto username of a token, or undefined when it is not a JWT or has no user claim. */
export function tokenUsername(token: string): string | undefined {
  const payload = decodeJwt(token);
  return payload ? jwtUsername(payload) : undefined;
}
