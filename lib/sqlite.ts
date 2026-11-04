import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { logDebug, sanitizeDebugError } from "./debug";

const DB_FILE =
  process.env.DB_SQLITE_PATH ||
  process.env.CACHE_SQLITE_PATH ||
  path.join(process.cwd(), "data", "steam-calendar.sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cache_entries (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cache_entries_expires_at_idx ON cache_entries (expires_at);

CREATE TABLE IF NOT EXISTS users (
  steam_id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  steam_id TEXT PRIMARY KEY REFERENCES users(steam_id) ON DELETE CASCADE,
  steam_api_key_cipher TEXT,
  rawg_api_key_cipher TEXT,
  calendar_view TEXT,
  lang TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_steam_id_idx ON sessions (steam_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS calendar_feeds (
  token_hash TEXT PRIMARY KEY,
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  token_cipher TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS calendar_feeds_steam_id_idx ON calendar_feeds (steam_id);
`;

let dbPromise: Promise<DatabaseSync | undefined> | undefined;
let dbUnavailable = false;
const statementCache = new Map<string, StatementSync>();

async function openDb(): Promise<DatabaseSync | undefined> {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const dir = path.dirname(DB_FILE);
    if (dir) mkdirSync(dir, { recursive: true });

    const db = new DatabaseSync(DB_FILE);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA temp_store = MEMORY");
    db.exec("PRAGMA cache_size = -20000");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA);

    return db;
  } catch (error) {
    logDebug("sqlite.open.failed", {
      path: DB_FILE,
      error: sanitizeDebugError(error),
    });
    dbUnavailable = true;
    return undefined;
  }
}

export async function getDb(): Promise<DatabaseSync | undefined> {
  if (dbUnavailable) return undefined;
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function prepare(sql: string): Promise<StatementSync | undefined> {
  const cached = statementCache.get(sql);
  if (cached) return cached;

  const db = await getDb();
  if (!db) return undefined;

  try {
    const statement = db.prepare(sql);
    statementCache.set(sql, statement);
    return statement;
  } catch (error) {
    logDebug("sqlite.prepare.failed", { error: sanitizeDebugError(error) });
    return undefined;
  }
}

export async function runStatement(sql: string, ...args: unknown[]): Promise<boolean> {
  try {
    const statement = await prepare(sql);
    if (!statement) return false;
    statement.run(...args);
    return true;
  } catch (error) {
    logDebug("sqlite.run.failed", { error: sanitizeDebugError(error) });
    return false;
  }
}

export async function getStatementRow<T>(
  sql: string,
  ...args: unknown[]
): Promise<T | undefined> {
  try {
    const statement = await prepare(sql);
    if (!statement) return undefined;
    return statement.get(...args) as T | undefined;
  } catch (error) {
    logDebug("sqlite.get.failed", { error: sanitizeDebugError(error) });
    return undefined;
  }
}
