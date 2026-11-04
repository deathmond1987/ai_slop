import process from "node:process";
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SESSION_SECRET_KEY = "session_secret";
const CIPHER_SALT = "steam-calendar:settings:v1";
const LEGACY_SECRET_FILE = path.join(process.cwd(), ".session-secret.local");
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

const GET_APP_SETTING_SQL = "SELECT value FROM app_settings WHERE key = ?";
const UPSERT_APP_SETTING_SQL = `INSERT INTO app_settings (key, value, updated_at)
 VALUES (?, ?, ?)
 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;

function readLegacySecret() {
  try {
    if (existsSync(LEGACY_SECRET_FILE)) {
      const existing = readFileSync(LEGACY_SECRET_FILE, "utf8").trim();
      if (existing.length >= 32) return existing;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function writeLegacySecret(secret) {
  try {
    writeFileSync(LEGACY_SECRET_FILE, `${secret}\n`, { mode: 0o600 });
  } catch {
    return undefined;
  }
  return undefined;
}

function deriveEncryptionKey(secret) {
  return scryptSync(secret, Buffer.from(CIPHER_SALT, "utf8"), 32);
}

async function prepareKeys() {
  const dir = path.dirname(DB_FILE);
  if (dir) mkdirSync(dir, { recursive: true });

  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB_FILE);

  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA temp_store = MEMORY");
    db.exec("PRAGMA cache_size = -20000");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA);

    const row = db.prepare(GET_APP_SETTING_SQL).get(SESSION_SECRET_KEY);
    let secret = typeof row?.value === "string" ? row.value : undefined;

    if (!secret) {
      secret = process.env.SESSION_PASSWORD || readLegacySecret() || randomBytes(32).toString("hex");
      db.prepare(UPSERT_APP_SETTING_SQL).run(SESSION_SECRET_KEY, secret, Date.now());
      writeLegacySecret(secret);
    }

    if (!process.env.DB_ENCRYPTION_KEY) {
      process.env.DB_ENCRYPTION_KEY = deriveEncryptionKey(secret).toString("hex");
    }
  } finally {
    db.close();
  }
}

async function main() {
  try {
    await prepareKeys();
    process.stdout.write(`Prepared keys for ${DB_FILE}\n`);
  } catch (error) {
    const uid = process.getuid ? process.getuid() : "unknown";
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      `Entrypoint failed to prepare ${DB_FILE}. Ensure the mounted data directory is writable by uid ${uid}: ${message}\n`
    );
    process.exitCode = 1;
    return;
  }

  const child = spawn(process.execPath, ["server.js"], {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });

  if (child.stdout) child.stdout.pipe(process.stdout);
  if (child.stderr) child.stderr.pipe(process.stdout);

  let closing = false;
  let exited = false;
  let closed = false;
  let exitStatus = 1;

  function shutdown(signal) {
    if (closing) return;
    closing = true;
    child.kill(signal);
  }

  function maybeFinish() {
    if (exited && closed) process.exitCode = exitStatus;
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  child.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Entrypoint failed to start server.js: ${message}\n`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    exited = true;
    if (signal === "SIGINT") {
      exitStatus = 130;
    } else if (signal === "SIGTERM") {
      exitStatus = 143;
    } else {
      exitStatus = code ?? 1;
    }
    maybeFinish();
  });

  child.on("close", () => {
    closed = true;
    maybeFinish();
  });
}

void main();
