/**
 * SQLite storage using Node's built-in node:sqlite module (no native dependencies).
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Schema versions, applied in order (PRAGMA user_version counts the applied ones). A new version
 * is a new entry at the end; existing entries never change.
 */
const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER,
    -- The PADI connection (PadiAccountSettings), encrypted with the user id as associated data.
    service_enc TEXT,
    -- When the connection was saved or removed (refreshed tokens do not change it).
    service_updated_at INTEGER,
    -- The stored PADI sign-in stopped working: the user must sign in again.
    padi_needs_reconnect INTEGER NOT NULL DEFAULT 0,
    -- Access requests: accounts that wait for an administrator's approval (they are also disabled).
    pending INTEGER NOT NULL DEFAULT 0,
    request_note TEXT,
    -- Demo accounts (a sample logbook built into the server, for app reviewers) and their
    -- read-only switch (a demo account has no stored settings to keep it in).
    demo INTEGER NOT NULL DEFAULT 0,
    demo_read_only INTEGER NOT NULL DEFAULT 0,
    -- E-mails to administrators about new access requests: each administrator's choice and
    -- language, and which requests they were already told about.
    notify_requests INTEGER NOT NULL DEFAULT 1,
    lang TEXT,
    request_notified INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE invites (
    code_hash TEXT PRIMARY KEY,
    note TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_by TEXT,
    used_at INTEGER
  );
  CREATE TABLE oauth_clients (
    client_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    fetched_at INTEGER,
    -- When a user first approved the client.
    approved_at INTEGER
  );
  CREATE TABLE oauth_pending (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE oauth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE oauth_tokens (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family TEXT NOT NULL,
    scopes TEXT NOT NULL,
    resource TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER,
    -- When a refresh token was exchanged for a new pair (reuse grace period).
    rotated_at INTEGER
  );
  CREATE INDEX oauth_tokens_user ON oauth_tokens(user_id);
  CREATE INDEX oauth_tokens_family ON oauth_tokens(family);
  CREATE INDEX oauth_tokens_client ON oauth_tokens(client_id, revoked, expires_at);
  CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    tool TEXT NOT NULL,
    ok INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    client_id TEXT
  );
  CREATE INDEX activity_user ON activity(user_id, at);
  CREATE INDEX activity_user_id ON activity(user_id, id);
  `,
];

export type Db = DatabaseSync;

export function openDatabase(dataDir: string): Db {
  let file: string;
  if (dataDir === ":memory:") {
    file = ":memory:";
  } else {
    mkdirSync(dataDir, { recursive: true });
    file = path.join(dataDir, "padi-mcp.db");
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]!);
      version++;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

/** Run `fn` inside a transaction. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
