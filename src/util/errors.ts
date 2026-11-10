/**
 * Error types shared across services. `UserFacingError` messages are safe to show to the model
 * (they never include credentials); anything else is wrapped with a generic prefix.
 */

export class UserFacingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UserFacingError";
  }
}

export class NotFoundError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConfigError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * A write that may or may not have been saved: it reached Suunto, but no clear answer came back
 * (a timeout, a broken connection or an HTTP 5xx). Sending it again could add the route or point
 * of interest twice, so the message says to check first.
 */
export class UnconfirmedWriteError extends UserFacingError {
  readonly kind = "unconfirmed_write";

  constructor(
    message = "Suunto did not confirm the change, so it may have been saved anyway. Check in the Suunto App (or list the routes or points of interest) before you try again.",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "UnconfirmedWriteError";
  }
}

export class ReadOnlyError extends UserFacingError {
  constructor(action: string) {
    super(`This account is read-only (SUUNTO_READ_ONLY=true); "${action}" is not allowed.`);
    this.name = "ReadOnlyError";
  }
}

/**
 * A JWT (3 parts) or JWE (5 parts): base64url parts separated by dots, starting with an encoded
 * JSON header ("eyJ"). Suunto's access and refresh tokens are JWTs.
 */
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]*){2,4}/g;

/** JSON fields that hold a password, a token or a key (Suunto and OAuth spellings). */
const SECRET_JSON_FIELD =
  /("(?:password|PASSWORD|Password|refreshToken|refresh_token|REFRESH_TOKEN|RefreshToken|idToken|id_token|IdToken|accessToken|access_token|AccessToken|client_secret|clientSecret|subscriptionKey|subscription_key|SECRET_HASH)"\s*:\s*")(?:[^"\\]|\\.)*"/g;
/** The same in a query string or a form body (an authorization code included). */
const SECRET_PARAM = /\b((?:password|refresh_token|id_token|access_token|code_verifier|client_secret|code|subscription-key)=)[^&\s"']+/gi;
/** The API gateway's subscription key header ("Ocp-Apim-Subscription-Key: <key>"). */
const SUBSCRIPTION_HEADER = /(Ocp-Apim-Subscription-Key["']?\s*[:=]\s*["']?)[A-Za-z0-9_-]{6,}/gi;
/** "Bearer <token>" anywhere (headers, logs, echoed requests). */
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
/** "Basic <base64>" anywhere: the client id and secret of the token request. */
const BASIC = /\b(Basic\s+)([A-Za-z0-9+/]{8,}={0,2})/gi;

/** True for a value after "Basic " that looks encoded, not like an English word. */
function looksEncoded(value: string): boolean {
  return value.length >= 20 || /[0-9+/=]/.test(value);
}

/** Remove anything that looks like a secret from an error message before showing it. */
export function redact(message: string, secrets: readonly string[]): string {
  let out = message;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    out = out.split(secret).join("***");
    // The same secret as it appears in a URL or a form body.
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret) out = out.split(encoded).join("***");
  }
  // Basic auth values (base64 of client id and secret) that might appear in low level errors.
  out = out.replace(BASIC, (match: string, prefix: string, value: string) => (looksEncoded(value) ? `${prefix}***` : match));
  // Bearer tokens and anything shaped like a JWT (access and refresh tokens).
  out = out.replace(BEARER, "$1***");
  out = out.replace(JWT_LIKE, "***");
  out = out.replace(SUBSCRIPTION_HEADER, "$1***");
  // Passwords, tokens and codes in JSON bodies or query strings (for example a request echoed in an error).
  out = out.replace(SECRET_JSON_FIELD, '$1***"');
  out = out.replace(SECRET_PARAM, "$1***");
  return out;
}

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Mask e-mail addresses ("alex@example.com" -> "a***@example.com"). */
export function maskEmails(message: string): string {
  return message.replace(EMAIL, (email) => `${email[0]}***${email.slice(email.indexOf("@"))}`);
}

/** redact() plus masked e-mail addresses: for log lines, which must not hold personal data. */
export function redactForLog(message: string, secrets: readonly string[]): string {
  return maskEmails(redact(message, secrets));
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.message];
    const anyErr = error as Error & {
      responseText?: string;
      response?: string;
      code?: string;
      status?: number;
    };
    if (anyErr.status === 401 && !/connect suunto again|subscription key|app keys/i.test(error.message)) {
      parts.push("(Suunto refused the sign-in: connect Suunto again)");
    }
    if (anyErr.responseText && !error.message.includes(anyErr.responseText)) {
      parts.push(`(server said: ${anyErr.responseText})`);
    } else if (typeof anyErr.response === "string" && !error.message.includes(anyErr.response)) {
      parts.push(`(server said: ${anyErr.response})`);
    }
    if (anyErr.code && !error.message.includes(anyErr.code)) {
      parts.push(`[${anyErr.code}]`);
    }
    return parts.join(" ");
  }
  return String(error);
}
