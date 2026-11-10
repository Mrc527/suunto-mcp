/**
 * Data access for the web mode: users, sessions, server settings, invites, OAuth state and activity.
 */

import { randomUUID } from "node:crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { UnitChoice } from "../logbook/types.js";
import type { LoginMethod, StoredPadiTokens } from "../padi/auth.js";
import { randomToken, SecretBox, sha256 } from "./crypto.js";
import { transaction, type Db } from "./db.js";

export interface User {
  id: string;
  email: string;
  isAdmin: boolean;
  disabled: boolean;
  /** Access request waiting for an administrator (such accounts are also disabled). */
  pending: boolean;
  requestNote?: string;
  createdAt: number;
  lastLoginAt?: number;
  /** A PADI account is connected (encrypted settings are stored). */
  hasPadi: boolean;
  /** When the PADI connection was last saved or removed (not when its tokens were refreshed). */
  serviceUpdatedAt?: number;
  /** The stored PADI sign-in stopped working: the user must sign in to PADI again. */
  padiNeedsReconnect: boolean;
  /**
   * Demo account: its logbook is sample data built into the server (src/demo), kept in memory
   * only. It never has PADI settings.
   */
  demo: boolean;
  /** A demo account's own read-only switch. */
  demoReadOnly?: boolean;
  /** An administrator wants an e-mail when someone requests access. */
  notifyRequests: boolean;
  /** The language of the user's last visit to the admin page (for the e-mails it sends them). */
  lang?: string;
}

/**
 * Per-user PADI connection (stored encrypted, AAD = user id). The PADI password is used once to
 * sign in and is never stored: only the refresh token is kept.
 */
export interface PadiAccountSettings {
  /** The PADI sign-in e-mail (lowercase). */
  email: string;
  refreshToken: string;
  /** The method that issued the refresh token. */
  loginMethod: LoginMethod;
  /** The app client the tokens were issued for. */
  clientId: string;
  /** custom:affiliate_id of the account. */
  affiliateId: string;
  /** The diver's name from the token, for display. */
  name?: string;
  units: UnitChoice;
  readOnly: boolean;
  /**
   * The diver's time zone (IANA name): it decides what "today" is, for example the newest date
   * a dive may have. Not set: the server's default time zone.
   */
  timeZone?: string;
  /** When the user signed in to PADI here (epoch ms). */
  connectedAt: number;
}

/**
 * open: anyone can create an account. approval: anyone can request one, an administrator approves
 * it. invite: only with an invite code. closed: nobody.
 */
export type RegistrationMode = "open" | "approval" | "invite" | "closed";

export interface ServerSettings {
  registration: RegistrationMode;
  /** Only e-mail addresses at these domains may sign up ([] = any). */
  allowedEmailDomains: string[];
  /** Force every account to read-only. */
  forceReadOnly: boolean;
  /** Hosts allowed in OAuth redirect URIs ([] = any). */
  allowedRedirectHosts: string[];
  allowDynamicRegistration: boolean;
  allowClientMetadataDocuments: boolean;
  defaultTimeZone: string;
  accessTokenTtlMinutes: number;
  refreshTokenTtlDays: number;
  sessionTtlDays: number;
}

export const DEFAULT_SETTINGS: ServerSettings = {
  registration: "approval",
  allowedEmailDomains: [],
  forceReadOnly: false,
  allowedRedirectHosts: [],
  allowDynamicRegistration: true,
  allowClientMetadataDocuments: true,
  defaultTimeZone: "UTC",
  accessTokenTtlMinutes: 60,
  refreshTokenTtlDays: 60,
  sessionTtlDays: 14,
};

export interface TokenRecord {
  tokenHash: string;
  kind: "access" | "refresh";
  clientId: string;
  userId: string;
  family: string;
  scopes: string[];
  resource?: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
  /** When a refresh token was exchanged for a new pair. */
  rotatedAt?: number;
}

export interface PendingAuthorization {
  id: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
  /** Set once approved, so a repeated approval returns the same redirect. */
  approvedRedirect?: string;
  /** Who approved it: only they get that redirect again (it holds their authorization code). */
  approvedBy?: string;
}

export interface Grant {
  clientId: string;
  clientName: string;
  family: string;
  createdAt: number;
  lastUsedAt?: number;
}

function now(): number {
  return Date.now();
}

type Row = Record<string, unknown>;

export interface ActivityEntry {
  id: number;
  at: number;
  tool: string;
  ok: boolean;
  durationMs: number;
}

function toActivity(r: Row): ActivityEntry {
  return { id: Number(r.id), at: Number(r.at), tool: String(r.tool), ok: Number(r.ok) === 1, durationMs: Number(r.duration_ms) };
}

function toUser(r: Row): User {
  return {
    id: String(r.id),
    email: String(r.email),
    isAdmin: Number(r.is_admin) === 1,
    disabled: Number(r.disabled) === 1,
    // A request is waiting only while it is also disabled: an older version of this server that
    // enables the account leaves pending = 1 behind, and that account is then a normal user.
    pending: Number(r.pending) === 1 && Number(r.disabled) === 1,
    ...(r.request_note != null ? { requestNote: String(r.request_note) } : {}),
    createdAt: Number(r.created_at),
    ...(r.last_login_at != null ? { lastLoginAt: Number(r.last_login_at) } : {}),
    hasPadi: r.service_enc != null,
    ...(r.service_updated_at != null ? { serviceUpdatedAt: Number(r.service_updated_at) } : {}),
    padiNeedsReconnect: r.service_enc != null && Number(r.padi_needs_reconnect) === 1,
    demo: Number(r.demo) === 1,
    ...(Number(r.demo) === 1 && Number(r.demo_read_only) === 1 ? { demoReadOnly: true } : {}),
    notifyRequests: Number(r.notify_requests ?? 1) === 1,
    ...(r.lang != null ? { lang: String(r.lang) } : {}),
  };
}

export class Store {
  private settingsCache: ServerSettings | undefined;

  constructor(
    readonly db: Db,
    private readonly box: SecretBox,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------------------------

  /** Number of users whose stored PADI settings cannot be decrypted with the current key. */
  countUnreadableSettings(): number {
    return this.unreadablePadiUserIds().size;
  }

  /**
   * Users whose stored PADI settings cannot be decrypted with the current key (for example after
   * the master key changed). They have a connection on record (hasPadi) that cannot be used.
   */
  unreadablePadiUserIds(): Set<string> {
    const rows = this.db.prepare("SELECT id FROM users WHERE service_enc IS NOT NULL").all() as Row[];
    return new Set(rows.map((r) => String(r.id)).filter((id) => this.readPadiSettings(id).unreadable));
  }

  countUsers(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as Row).n);
  }

  /** Create an account. With `request`, it is an access request: disabled until approved. */
  createUser(email: string, passwordHash: string, isAdmin: boolean, request?: { note: string }): User {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO users (id, email, password_hash, is_admin, disabled, pending, request_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, email.trim().toLowerCase(), passwordHash, isAdmin ? 1 : 0, request ? 1 : 0, request ? 1 : 0, request ? request.note : null, now());
    return this.getUser(id)!;
  }

  /** Create a demo account: approved, not an administrator, with sample data instead of PADI. */
  createDemoUser(email: string, passwordHash: string): User {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO users (id, email, password_hash, is_admin, disabled, pending, demo, created_at) VALUES (?, ?, ?, 0, 0, 0, 1, ?)")
      .run(id, email.trim().toLowerCase(), passwordHash, now());
    return this.getUser(id)!;
  }

  listDemoUsers(): User[] {
    return (this.db.prepare("SELECT * FROM users WHERE demo = 1 ORDER BY created_at").all() as Row[]).map(toUser);
  }

  /**
   * Turn an account into a demo account or back. A demo account never keeps a PADI connection: it
   * is deleted. Administrators cannot be demo accounts. Returns false when nothing changed.
   */
  setDemo(id: string, demo: boolean): boolean {
    const res = demo
      ? this.db
          .prepare("UPDATE users SET demo = 1, demo_read_only = 0, service_enc = NULL, padi_needs_reconnect = 0, service_updated_at = ? WHERE id = ? AND is_admin = 0 AND demo = 0")
          .run(now(), id)
      : this.db.prepare("UPDATE users SET demo = 0, demo_read_only = 0, service_updated_at = ? WHERE id = ? AND demo = 1").run(now(), id);
    return Number(res.changes) === 1;
  }

  setDemoReadOnly(id: string, readOnly: boolean): void {
    this.db.prepare("UPDATE users SET demo_read_only = ? WHERE id = ? AND demo = 1").run(readOnly ? 1 : 0, id);
  }

  /** Open access requests, oldest first. */
  listAccessRequests(): User[] {
    return (this.db.prepare("SELECT * FROM users WHERE pending = 1 AND disabled = 1 ORDER BY created_at").all() as Row[]).map(toUser);
  }

  countAccessRequests(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE pending = 1 AND disabled = 1").get() as Row).n);
  }

  /** Approve an access request. Returns false when the account is not waiting for approval. */
  approveAccessRequest(id: string): boolean {
    const res = this.db.prepare("UPDATE users SET pending = 0, disabled = 0, request_note = NULL WHERE id = ? AND pending = 1 AND disabled = 1").run(id);
    return Number(res.changes) === 1;
  }

  /** Reject (delete) an access request. Returns false when the account is not waiting for approval. */
  rejectAccessRequest(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM users WHERE id = ? AND pending = 1 AND disabled = 1").run(id).changes) === 1;
  }

  /** Open access requests the administrators were not told about by e-mail yet, oldest first. */
  listUnnotifiedAccessRequests(): User[] {
    return (
      this.db.prepare("SELECT * FROM users WHERE pending = 1 AND disabled = 1 AND request_notified = 0 ORDER BY created_at").all() as Row[]
    ).map(toUser);
  }

  /** Remember that the administrators were told about these requests. */
  markAccessRequestsNotified(ids: string[]): void {
    if (!ids.length) return;
    const stmt = this.db.prepare("UPDATE users SET request_notified = 1 WHERE id = ?");
    transaction(this.db, () => {
      for (const id of ids) stmt.run(id);
    });
  }

  /**
   * Administrators who want an e-mail about new access requests: active, not demo accounts. The
   * e-mail goes to the address they sign in here with, through the operator's SMTP server.
   */
  listRequestNoticeRecipients(): User[] {
    return (
      this.db.prepare("SELECT * FROM users WHERE is_admin = 1 AND disabled = 0 AND demo = 0 AND notify_requests = 1 ORDER BY created_at").all() as Row[]
    ).map(toUser);
  }

  setNotifyRequests(id: string, on: boolean): void {
    this.db.prepare("UPDATE users SET notify_requests = ? WHERE id = ?").run(on ? 1 : 0, id);
  }

  setLang(id: string, lang: string): void {
    this.db.prepare("UPDATE users SET lang = ? WHERE id = ?").run(lang, id);
  }

  /** Reject (delete) every open access request. Returns how many were deleted. */
  rejectAllAccessRequests(): number {
    return Number(this.db.prepare("DELETE FROM users WHERE pending = 1 AND disabled = 1").run().changes);
  }


  getUser(id: string): User | undefined {
    const r = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
    return r ? toUser(r) : undefined;
  }

  getUserByEmail(email: string): (User & { passwordHash: string }) | undefined {
    const r = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as Row | undefined;
    return r ? { ...toUser(r), passwordHash: String(r.password_hash) } : undefined;
  }

  getPasswordHash(id: string): string | undefined {
    const r = this.db.prepare("SELECT password_hash FROM users WHERE id = ?").get(id) as Row | undefined;
    return r ? String(r.password_hash) : undefined;
  }

  listUsers(): User[] {
    return (this.db.prepare("SELECT * FROM users ORDER BY created_at").all() as Row[]).map(toUser);
  }

  setPassword(id: string, passwordHash: string): void {
    this.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
  }

  /** A demo account is never made an administrator. */
  setAdmin(id: string, isAdmin: boolean): void {
    if (isAdmin) this.db.prepare("UPDATE users SET is_admin = 1 WHERE id = ? AND demo = 0").run(id);
    else this.db.prepare("UPDATE users SET is_admin = 0 WHERE id = ?").run(id);
  }

  setDisabled(id: string, disabled: boolean): void {
    transaction(this.db, () => {
      // Enabling an account that waits for approval approves it.
      if (disabled) this.db.prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(id);
      else this.db.prepare("UPDATE users SET disabled = 0, pending = 0, request_note = NULL WHERE id = ?").run(id);
      if (disabled) {
        this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
        this.db.prepare("UPDATE oauth_tokens SET revoked = 1 WHERE user_id = ?").run(id);
      }
    });
  }

  deleteUser(id: string): void {
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }

  countAdmins(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND disabled = 0").get() as Row).n);
  }

  touchLogin(id: string): void {
    this.db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now(), id);
  }

  /** Stored PADI settings; undefined when none are stored or they cannot be decrypted. */
  getPadiSettings(userId: string): PadiAccountSettings | undefined {
    return this.readPadiSettings(userId).settings;
  }

  /**
   * Like getPadiSettings, but also tells whether stored settings exist that cannot be read
   * (for example after the server's master key changed). Never throws.
   */
  readPadiSettings(userId: string): { settings?: PadiAccountSettings; unreadable: boolean } {
    const r = this.db.prepare("SELECT service_enc FROM users WHERE id = ?").get(userId) as Row | undefined;
    if (!r || r.service_enc == null) return { unreadable: false };
    try {
      return { settings: JSON.parse(this.box.open(String(r.service_enc), userId)) as PadiAccountSettings, unreadable: false };
    } catch {
      return { unreadable: true };
    }
  }

  /**
   * Save or remove a user's PADI connection. This changes service_updated_at (the user's services
   * are rebuilt) and clears "needs reconnect". A demo account never gets one (nothing is saved).
   */
  savePadiSettings(userId: string, settings: PadiAccountSettings | undefined): void {
    const enc = settings ? this.box.seal(JSON.stringify(settings), userId) : null;
    this.db
      .prepare("UPDATE users SET service_enc = ?, service_updated_at = ?, padi_needs_reconnect = 0 WHERE id = ? AND (demo = 0 OR ? IS NULL)")
      .run(enc, now(), userId, enc);
  }

  /**
   * Keep the tokens of a refresh (the PADI auth API may hand out a new refresh token) without
   * changing service_updated_at, so the user's running services are not rebuilt. With
   * `connectedAt`, nothing is saved when the stored connection is another one (the user signed
   * in again meanwhile). Returns whether anything was saved.
   */
  savePadiTokens(userId: string, tokens: Pick<StoredPadiTokens, "refreshToken" | "loginMethod" | "clientId">, connectedAt?: number): boolean {
    return transaction(this.db, () => {
      const { settings } = this.readPadiSettings(userId);
      if (!settings) return false;
      if (connectedAt !== undefined && settings.connectedAt !== connectedAt) return false;
      const next: PadiAccountSettings = { ...settings, refreshToken: tokens.refreshToken, loginMethod: tokens.loginMethod, clientId: tokens.clientId };
      this.db.prepare("UPDATE users SET service_enc = ?, padi_needs_reconnect = 0 WHERE id = ?").run(this.box.seal(JSON.stringify(next), userId), userId);
      return true;
    });
  }

  /**
   * Change the units, read-only switch and time zone of the saved PADI connection. The sign-in
   * stays as it is (also its "needs reconnect" mark), but the user's services are rebuilt,
   * because read-only changes the tools an AI app gets. A time zone that is not given stays as
   * it is. Returns false when no readable connection is saved.
   */
  savePadiPreferences(userId: string, prefs: Pick<PadiAccountSettings, "units" | "readOnly" | "timeZone">): boolean {
    return transaction(this.db, () => {
      const { settings } = this.readPadiSettings(userId);
      if (!settings) return false;
      const next: PadiAccountSettings = { ...settings, units: prefs.units, readOnly: prefs.readOnly, ...(prefs.timeZone ? { timeZone: prefs.timeZone } : {}) };
      this.db.prepare("UPDATE users SET service_enc = ?, service_updated_at = ? WHERE id = ?").run(this.box.seal(JSON.stringify(next), userId), now(), userId);
      return true;
    });
  }

  /** Mark (or clear) that the stored PADI sign-in no longer works. Keeps service_updated_at. */
  setPadiNeedsReconnect(userId: string, needsReconnect: boolean): void {
    this.db.prepare("UPDATE users SET padi_needs_reconnect = ? WHERE id = ? AND service_enc IS NOT NULL").run(needsReconnect ? 1 : 0, userId);
  }

  // -------------------------------------------------------------------------------------------
  // Sessions (cookie value is random; only its hash is stored)
  // -------------------------------------------------------------------------------------------

  createSession(userId: string, ttlDays: number): { cookie: string; csrf: string; expiresAt: number } {
    const cookie = randomToken("", 32);
    const csrf = randomToken("", 24);
    const expiresAt = now() + ttlDays * 86_400_000;
    this.db
      .prepare("INSERT INTO sessions (id_hash, user_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(sha256(cookie), userId, csrf, now(), expiresAt);
    return { cookie, csrf, expiresAt };
  }

  getSession(cookie: string): { user: User; csrf: string; idHash: string } | undefined {
    const idHash = sha256(cookie);
    const r = this.db
      .prepare("SELECT s.csrf, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?")
      .get(idHash) as Row | undefined;
    if (!r) return undefined;
    if (Number(r.expires_at) < now() || Number(r.disabled) === 1) {
      this.db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(idHash);
      return undefined;
    }
    return { user: toUser(r), csrf: String(r.csrf), idHash };
  }

  /** Whether the session with this stored hash is still valid and its user active. */
  sessionActive(idHash: string): boolean {
    const r = this.db
      .prepare("SELECT s.expires_at, u.disabled FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?")
      .get(idHash) as Row | undefined;
    return !!r && Number(r.expires_at) >= now() && Number(r.disabled) !== 1;
  }

  deleteSession(idHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(idHash);
  }

  deleteUserSessions(userId: string, exceptIdHash?: string): void {
    if (exceptIdHash) this.db.prepare("DELETE FROM sessions WHERE user_id = ? AND id_hash != ?").run(userId, exceptIdHash);
    else this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  // -------------------------------------------------------------------------------------------
  // Server settings
  // -------------------------------------------------------------------------------------------

  getSettings(): ServerSettings {
    if (this.settingsCache) return this.settingsCache;
    const r = this.db.prepare("SELECT value FROM settings WHERE key = 'server'").get() as Row | undefined;
    const stored = r ? (JSON.parse(String(r.value)) as Partial<ServerSettings>) : {};
    this.settingsCache = { ...DEFAULT_SETTINGS, ...stored };
    return this.settingsCache;
  }

  saveSettings(settings: ServerSettings): void {
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES ('server', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(settings));
    this.settingsCache = undefined;
  }

  // -------------------------------------------------------------------------------------------
  // Invites
  // -------------------------------------------------------------------------------------------

  createInvite(createdBy: string, note: string, ttlDays: number): string {
    const code = randomToken("inv_", 12);
    this.db
      .prepare("INSERT INTO invites (code_hash, note, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(sha256(code), note, createdBy, now(), now() + ttlDays * 86_400_000);
    return code;
  }

  listInvites(): { codeHash: string; note: string; createdAt: number; expiresAt: number; usedBy?: string; usedAt?: number }[] {
    return (this.db.prepare("SELECT * FROM invites ORDER BY created_at DESC").all() as Row[]).map((r) => ({
      codeHash: String(r.code_hash),
      note: String(r.note ?? ""),
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      ...(r.used_by != null ? { usedBy: String(r.used_by) } : {}),
      ...(r.used_at != null ? { usedAt: Number(r.used_at) } : {}),
    }));
  }

  /** Atomically mark an invite as used. Returns false when it is unknown, used or expired. */
  consumeInvite(code: string, userEmail: string): boolean {
    const res = this.db
      .prepare("UPDATE invites SET used_by = ?, used_at = ? WHERE code_hash = ? AND used_by IS NULL AND expires_at > ?")
      .run(userEmail, now(), sha256(code.trim()), now());
    return Number(res.changes) === 1;
  }

  inviteIsValid(code: string): boolean {
    const r = this.db
      .prepare("SELECT 1 FROM invites WHERE code_hash = ? AND used_by IS NULL AND expires_at > ?")
      .get(sha256(code.trim()), now());
    return !!r;
  }

  deleteInvite(codeHash: string): void {
    this.db.prepare("DELETE FROM invites WHERE code_hash = ?").run(codeHash);
  }

  // -------------------------------------------------------------------------------------------
  // OAuth clients
  // -------------------------------------------------------------------------------------------

  getClient(clientId: string): { client: OAuthClientInformationFull; kind: string; fetchedAt?: number } | undefined {
    const r = this.db.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").get(clientId) as Row | undefined;
    if (!r) return undefined;
    return {
      client: JSON.parse(String(r.data)) as OAuthClientInformationFull,
      kind: String(r.kind),
      ...(r.fetched_at != null ? { fetchedAt: Number(r.fetched_at) } : {}),
    };
  }

  saveClient(client: OAuthClientInformationFull, kind: "dcr" | "cimd"): void {
    this.db
      .prepare(
        `INSERT INTO oauth_clients (client_id, kind, data, created_at, fetched_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(client_id) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at`,
      )
      .run(client.client_id, kind, JSON.stringify(client), now(), kind === "cimd" ? now() : null);
  }

  countClients(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM oauth_clients").get() as Row).n);
  }

  listClients(limit = 200): { clientId: string; kind: string; name: string; redirectUris: string[]; createdAt: number; activeGrants: number }[] {
    const rows = this.db
      .prepare(
        `SELECT c.*, COALESCE(g.grants, 0) AS grants FROM oauth_clients c
         LEFT JOIN (SELECT client_id, COUNT(DISTINCT family) AS grants FROM oauth_tokens WHERE revoked = 0 AND expires_at > ? GROUP BY client_id) g
           ON g.client_id = c.client_id
         ORDER BY COALESCE(g.grants, 0) > 0 DESC, c.created_at DESC LIMIT ?`,
      )
      .all(now(), limit) as Row[];
    return rows.map((r) => {
      const c = JSON.parse(String(r.data)) as OAuthClientInformationFull;
      return {
        clientId: String(r.client_id),
        kind: String(r.kind),
        name: c.client_name ?? c.client_uri ?? String(r.client_id),
        redirectUris: c.redirect_uris.map(String),
        createdAt: Number(r.created_at),
        activeGrants: Number(r.grants),
      };
    });
  }

  markClientApproved(clientId: string): void {
    this.db.prepare("UPDATE oauth_clients SET approved_at = COALESCE(approved_at, ?) WHERE client_id = ?").run(now(), clientId);
  }

  deleteClient(clientId: string): void {
    transaction(this.db, () => {
      this.db.prepare("UPDATE oauth_tokens SET revoked = 1 WHERE client_id = ?").run(clientId);
      this.db.prepare("DELETE FROM oauth_codes WHERE client_id = ?").run(clientId);
      this.db.prepare("DELETE FROM oauth_clients WHERE client_id = ?").run(clientId);
    });
  }

  // -------------------------------------------------------------------------------------------
  // Pending authorization requests (between /authorize and the consent page)
  // -------------------------------------------------------------------------------------------

  savePending(p: Omit<PendingAuthorization, "id" | "expiresAt">): PendingAuthorization {
    const pending: PendingAuthorization = { ...p, id: randomToken("", 18), expiresAt: now() + 15 * 60_000 };
    this.db
      .prepare("INSERT INTO oauth_pending (id, client_id, data, expires_at) VALUES (?, ?, ?, ?)")
      .run(pending.id, pending.clientId, JSON.stringify(pending), pending.expiresAt);
    return pending;
  }

  getPending(id: string): PendingAuthorization | undefined {
    const r = this.db.prepare("SELECT data FROM oauth_pending WHERE id = ? AND expires_at > ?").get(id, now()) as Row | undefined;
    return r ? (JSON.parse(String(r.data)) as PendingAuthorization) : undefined;
  }

  deletePending(id: string): void {
    this.db.prepare("DELETE FROM oauth_pending WHERE id = ?").run(id);
  }

  /** Remember the approval result for a short time so double submissions get the same answer. */
  markPendingApproved(p: PendingAuthorization, redirect: string, keepMs: number, userId: string): void {
    const updated: PendingAuthorization = { ...p, approvedRedirect: redirect, approvedBy: userId, expiresAt: Date.now() + keepMs };
    this.db.prepare("UPDATE oauth_pending SET data = ?, expires_at = ? WHERE id = ?").run(JSON.stringify(updated), updated.expiresAt, p.id);
  }

  // -------------------------------------------------------------------------------------------
  // Authorization codes
  // -------------------------------------------------------------------------------------------

  createCode(p: PendingAuthorization, userId: string): string {
    const code = randomToken("pdm_code_", 24);
    this.db
      .prepare("INSERT INTO oauth_codes (code_hash, client_id, user_id, data, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(
        sha256(code),
        p.clientId,
        userId,
        JSON.stringify({ redirectUri: p.redirectUri, codeChallenge: p.codeChallenge, scopes: p.scopes, resource: p.resource }),
        now() + 10 * 60_000,
      );
    return code;
  }

  peekCode(code: string): { clientId: string; userId: string; codeChallenge: string; redirectUri: string; scopes: string[]; resource?: string } | undefined {
    const r = this.db.prepare("SELECT * FROM oauth_codes WHERE code_hash = ? AND expires_at > ?").get(sha256(code), now()) as Row | undefined;
    if (!r) return undefined;
    const data = JSON.parse(String(r.data)) as { redirectUri: string; codeChallenge: string; scopes: string[]; resource?: string };
    return { clientId: String(r.client_id), userId: String(r.user_id), ...data };
  }

  /** Delete a code; returns true only for the first caller (codes are single use). */
  consumeCode(code: string): boolean {
    return Number(this.db.prepare("DELETE FROM oauth_codes WHERE code_hash = ?").run(sha256(code)).changes) === 1;
  }

  // -------------------------------------------------------------------------------------------
  // Tokens
  // -------------------------------------------------------------------------------------------

  issueTokens(opts: { clientId: string; userId: string; scopes: string[]; resource?: string; family?: string; accessTtlMs: number; refreshTtlMs: number }) {
    const family = opts.family ?? randomToken("", 12);
    const access = randomToken("pdm_at_", 32);
    const refresh = randomToken("pdm_rt_", 32);
    const insert = this.db.prepare(
      `INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, family, scopes, resource, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const t = now();
    const scopes = opts.scopes.join(" ");
    insert.run(sha256(access), "access", opts.clientId, opts.userId, family, scopes, opts.resource ?? null, t, t + opts.accessTtlMs);
    insert.run(sha256(refresh), "refresh", opts.clientId, opts.userId, family, scopes, opts.resource ?? null, t, t + opts.refreshTtlMs);
    return { access, refresh, family, accessExpiresAt: t + opts.accessTtlMs };
  }

  getToken(token: string): TokenRecord | undefined {
    const r = this.db.prepare("SELECT * FROM oauth_tokens WHERE token_hash = ?").get(sha256(token)) as Row | undefined;
    if (!r) return undefined;
    return {
      tokenHash: String(r.token_hash),
      kind: String(r.kind) as "access" | "refresh",
      clientId: String(r.client_id),
      userId: String(r.user_id),
      family: String(r.family),
      scopes: String(r.scopes).split(" ").filter(Boolean),
      ...(r.resource != null ? { resource: String(r.resource) } : {}),
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      revoked: Number(r.revoked) === 1,
      ...(r.rotated_at != null ? { rotatedAt: Number(r.rotated_at) } : {}),
    };
  }

  /** Mark a refresh token as used (rotation). Returns false if it was already used/revoked. */
  useRefreshToken(tokenHash: string): boolean {
    const t = now();
    return Number(this.db.prepare("UPDATE oauth_tokens SET revoked = 1, rotated_at = ?, last_used_at = ? WHERE token_hash = ? AND revoked = 0").run(t, t, tokenHash).changes) === 1;
  }

  /** A rotated refresh token may be retried once (grace); afterwards any reuse means theft. */
  consumeGrace(tokenHash: string): boolean {
    return Number(this.db.prepare("UPDATE oauth_tokens SET rotated_at = NULL WHERE token_hash = ? AND rotated_at IS NOT NULL").run(tokenHash).changes) === 1;
  }

  /** True while the grant (token family) still has a live, unrevoked token. */
  familyActive(family: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM oauth_tokens WHERE family = ? AND revoked = 0 AND expires_at > ?").get(family, now());
  }

  revokeFamily(family: string): void {
    this.db.prepare("UPDATE oauth_tokens SET revoked = 1 WHERE family = ?").run(family);
  }

  revokeUserTokens(userId: string): void {
    this.db.prepare("UPDATE oauth_tokens SET revoked = 1 WHERE user_id = ?").run(userId);
  }

  touchToken(tokenHash: string): void {
    this.db.prepare("UPDATE oauth_tokens SET last_used_at = ? WHERE token_hash = ?").run(now(), tokenHash);
  }

  /** Active grants (token families) of a user, for the "Connected apps" page. */
  listGrants(userId: string): Grant[] {
    const rows = this.db
      .prepare(
        `SELECT t.family, t.client_id, MIN(t.created_at) AS created_at, MAX(t.last_used_at) AS last_used_at, c.data
         FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id = t.client_id
         WHERE t.user_id = ? AND t.revoked = 0 AND t.expires_at > ?
         GROUP BY t.family ORDER BY created_at DESC`,
      )
      .all(userId, now()) as Row[];
    return rows.map((r) => {
      const c = r.data ? (JSON.parse(String(r.data)) as OAuthClientInformationFull) : undefined;
      return {
        clientId: String(r.client_id),
        clientName: c?.client_name ?? String(r.client_id),
        family: String(r.family),
        createdAt: Number(r.created_at),
        ...(r.last_used_at != null ? { lastUsedAt: Number(r.last_used_at) } : {}),
      };
    });
  }

  revokeGrant(userId: string, family: string): void {
    this.db.prepare("UPDATE oauth_tokens SET revoked = 1 WHERE user_id = ? AND family = ?").run(userId, family);
  }

  // -------------------------------------------------------------------------------------------
  // Activity log
  // -------------------------------------------------------------------------------------------

  /** Record a tool call; returns the stored entry (for live updates). */
  logActivity(userId: string, tool: string, ok: boolean, durationMs: number, clientId?: string): ActivityEntry {
    const at = now();
    const ms = Math.round(durationMs);
    const res = this.db
      .prepare("INSERT INTO activity (user_id, at, tool, ok, duration_ms, client_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(userId, at, tool, ok ? 1 : 0, ms, clientId ?? null);
    return { id: Number(res.lastInsertRowid), at, tool, ok, durationMs: ms };
  }

  /** Newest entries first. */
  recentActivity(userId: string, limit = 50): ActivityEntry[] {
    return (this.db.prepare("SELECT * FROM activity WHERE user_id = ? ORDER BY id DESC LIMIT ?").all(userId, limit) as Row[]).map(toActivity);
  }

  /** Entries after `afterId`, oldest first (what a reconnecting page missed), at most `limit`. */
  activitySince(userId: string, afterId: number, limit = 50): ActivityEntry[] {
    const rows = this.db.prepare("SELECT * FROM activity WHERE user_id = ? AND id > ? ORDER BY id DESC LIMIT ?").all(userId, afterId, limit) as Row[];
    return rows.map(toActivity).reverse();
  }

  activityCounts(sinceMs: number): Map<string, number> {
    const rows = this.db.prepare("SELECT user_id, COUNT(*) AS n FROM activity WHERE at > ? GROUP BY user_id").all(sinceMs) as Row[];
    return new Map(rows.map((r) => [String(r.user_id), Number(r.n)]));
  }

  /** Remove expired rows. */
  cleanup(): void {
    const t = now();
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(t);
    this.db.prepare("DELETE FROM oauth_pending WHERE expires_at < ?").run(t);
    this.db.prepare("DELETE FROM oauth_codes WHERE expires_at < ?").run(t);
    this.db.prepare("DELETE FROM oauth_tokens WHERE expires_at < ?").run(t - 86_400_000);
    this.db.prepare("DELETE FROM activity WHERE at < ?").run(t - 90 * 86_400_000);
    // Access requests nobody answered within 30 days.
    this.db.prepare("DELETE FROM users WHERE pending = 1 AND disabled = 1 AND created_at < ?").run(t - 30 * 86_400_000);
    // Claude registers a new client for every fresh connection. Registrations nobody approved are
    // dropped after a day; approved clients only once they have had no live token for 90 days
    // (an app may still come back with its stored client id before that).
    const unused = `NOT EXISTS (SELECT 1 FROM oauth_tokens t WHERE t.client_id = oauth_clients.client_id AND t.expires_at > ?)
         AND NOT EXISTS (SELECT 1 FROM oauth_codes c WHERE c.client_id = oauth_clients.client_id)
         AND NOT EXISTS (SELECT 1 FROM oauth_pending p WHERE p.client_id = oauth_clients.client_id)`;
    this.db.prepare(`DELETE FROM oauth_clients WHERE approved_at IS NULL AND created_at < ? AND ${unused}`).run(t - 86_400_000, t);
    this.db.prepare(`DELETE FROM oauth_clients WHERE approved_at IS NOT NULL AND approved_at < ? AND ${unused}`).run(t - 90 * 86_400_000, t);
  }
}
