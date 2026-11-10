import { describe, expect, it } from "vitest";
import { describeError, maskEmails, redact, redactForLog, UnconfirmedWriteError, UserFacingError } from "../../src/util/errors.js";
import { fakeJwt, MOCK_CLIENT_SECRET, MOCK_SUBSCRIPTION_KEY } from "../helpers/mock-suunto.js";

describe("redact", () => {
  it("masks JWT-looking strings (access and refresh tokens)", () => {
    const jwt = fakeJwt();
    const out = redact(`token ${jwt} was refused`, []);
    expect(out).toBe("token *** was refused");
    expect(out).not.toContain(jwt.split(".")[1]!);
  });

  it("masks Bearer values, but not short words after Bearer", () => {
    expect(redact("Authorization: Bearer abcdefgh12345678", [])).toBe("Authorization: Bearer ***");
    expect(redact("Bearer token missing", [])).toBe("Bearer token missing");
  });

  it("masks Basic values (base64 of client id and secret), not English words", () => {
    const basic = Buffer.from(`client-id:${MOCK_CLIENT_SECRET}`).toString("base64");
    expect(redact(`header Authorization: Basic ${basic}`, [])).toBe("header Authorization: Basic ***");
    expect(redact("Basic authentication failed", [])).toBe("Basic authentication failed");
  });

  it("masks configured secrets, also in their URL-encoded form", () => {
    const secret = "s3cret/with+chars";
    const out = redact(`a ${secret} b ${encodeURIComponent(secret)} c`, [secret]);
    expect(out).toBe("a *** b *** c");
    // Very short values are not secrets worth masking (they would mask normal words).
    expect(redact("abc", ["abc"])).toBe("abc");
  });

  it("masks the subscription key header, JSON fields and query parameters", () => {
    expect(redact(`Ocp-Apim-Subscription-Key: ${MOCK_SUBSCRIPTION_KEY}`, [])).toBe("Ocp-Apim-Subscription-Key: ***");
    expect(redact('{"refresh_token":"abc.def","client_secret":"x","subscriptionKey":"k1"}', [])).toBe(
      '{"refresh_token":"***","client_secret":"***","subscriptionKey":"***"}',
    );
    expect(redact("grant_type=authorization_code&code=G5ahWs&redirect_uri=x", [])).toBe("grant_type=authorization_code&code=***&redirect_uri=x");
    expect(redact("refresh_token=abc&x=1 subscription-key=0123", [])).toBe("refresh_token=***&x=1 subscription-key=***");
    // Words that only end in "code" are left alone.
    expect(redact("error_code=42", [])).toBe("error_code=42");
  });
});

describe("e-mail masking and describeError", () => {
  it("masks e-mail addresses for logs", () => {
    expect(maskEmails("from river.tester@example.com.")).toBe("from r***@example.com.");
    expect(redactForLog(`river@example.com Bearer ${"x".repeat(20)}`, [])).toBe("r***@example.com Bearer ***");
  });

  it("adds a reconnect hint to a 401 that does not have one", () => {
    const plain = Object.assign(new Error("Request failed"), { status: 401 });
    expect(describeError(plain)).toContain("connect Suunto again");
    const clear = Object.assign(new UserFacingError("Suunto refused the sign-in. Connect Suunto again."), { status: 401 });
    expect(describeError(clear)).toBe("Suunto refused the sign-in. Connect Suunto again.");
    expect(describeError("text")).toBe("text");
  });

  it("UnconfirmedWriteError tells the user to check first", () => {
    const e = new UnconfirmedWriteError();
    expect(e).toBeInstanceOf(UserFacingError);
    expect(e.kind).toBe("unconfirmed_write");
    expect(e.message).toMatch(/before you try again/);
  });
});
