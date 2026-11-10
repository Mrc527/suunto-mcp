/**
 * Cryptographic helpers for the web mode:
 * - scrypt password hashing
 * - random tokens stored only as SHA-256 hashes
 * - AES-256-GCM encryption of per-user PADI connections with a server master key
 */

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/**
 * At most two password hashes run at once: scrypt uses libuv's small thread pool, which also
 * serves DNS lookups and file access, so a flood of password checks must not occupy all of it.
 */
const MAX_SCRYPT = 2;
let running = 0;
const waiting: (() => void)[] = [];

async function withScryptSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_SCRYPT) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return withScryptSlot(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scrypt(password, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
      }),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, "base64");
  const key = await scryptAsync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A dummy hash used to keep login timing similar for unknown users. */
let dummyHash: string | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= await hashPassword("not-a-real-password");
  await verifyPassword(password, dummyHash);
}

export function randomToken(prefix = "", bytes = 32): string {
  return `${prefix}${randomBytes(bytes).toString("base64url")}`;
}

/** Letters and digits that cannot be mistaken for each other (no 0/O, 1/l/I). */
const READABLE = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A strong random password that is easy to read and type, like "k7Hq2m-Rz4wXe-pT9sNa-3bVcYd": 4
 * groups of 6 characters, about 139 bits.
 */
export function readablePassword(groups = 4, size = 6): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let part = "";
    for (let i = 0; i < size; i++) part += READABLE[randomInt(READABLE.length)];
    parts.push(part);
  }
  return parts.join("-");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Loads the 32-byte master key from MASTER_KEY (base64 or hex) or from <dataDir>/master.key,
 * creating that file (mode 0600) on first start.
 */
export function loadMasterKey(dataDir: string, envValue: string | undefined, log: (m: string) => void): Buffer {
  if (envValue && envValue.trim()) {
    const v = envValue.trim();
    const key = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
    if (key.length !== 32) throw new Error("MASTER_KEY must be 32 bytes (64 hex characters or 44 base64 characters)");
    return key;
  }
  const file = path.join(dataDir, "master.key");
  if (existsSync(file)) {
    const key = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
    if (key.length !== 32) throw new Error(`${file} does not contain a valid 32-byte key`);
    return key;
  }
  mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(file, `${key.toString("base64")}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // best effort on platforms without POSIX permissions
  }
  log(`Created a new master key in ${file}. Back it up: without it the stored PADI connections cannot be decrypted.`);
  return key;
}

export class SecretBox {
  private readonly key: Buffer;

  constructor(masterKey: Buffer) {
    this.key = Buffer.from(hkdfSync("sha256", masterKey, Buffer.alloc(0), Buffer.from("padi-mcp user settings v1"), 32));
  }

  /** Encrypt `plaintext`, binding it to `context` (e.g. the user id) as additional authenticated data. */
  seal(plaintext: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
  }

  open(sealed: string, context: string): string {
    if (!sealed.startsWith("v1:")) throw new Error("Unsupported encrypted value");
    const raw = Buffer.from(sealed.slice(3), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }
}
