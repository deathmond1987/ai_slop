import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logDebug, sanitizeDebugError } from "./debug";
import { getStatementRow, runStatement } from "./sqlite";
import type { Lang } from "./types";

const SESSION_SECRET_KEY = "session_secret";
const SESSION_TTL_MS = 60 * 60 * 24 * 30 * 1000;
const LEGACY_SECRET_FILE = path.join(process.cwd(), ".session-secret.local");
const CIPHER_SALT = "steam-calendar:settings:v1";

let cachedSessionSecret: string | undefined;
let cachedEncryptionKey: Buffer | undefined;

const GET_APP_SETTING_SQL = "SELECT value FROM app_settings WHERE key = ?";
const UPSERT_APP_SETTING_SQL = `INSERT INTO app_settings (key, value, updated_at)
 VALUES (?, ?, ?)
 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;

const UPSERT_USER_SQL = `INSERT INTO users (steam_id, display_name, avatar, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?)
 ON CONFLICT(steam_id) DO UPDATE SET
   display_name = COALESCE(excluded.display_name, users.display_name),
   avatar = COALESCE(excluded.avatar, users.avatar),
   updated_at = excluded.updated_at`;

const INSERT_USER_SETTINGS_SQL = `INSERT INTO user_settings (steam_id, updated_at)
 VALUES (?, ?)
 ON CONFLICT(steam_id) DO NOTHING`;

const UPDATE_USER_SETTINGS_SQL = `UPDATE user_settings
 SET steam_api_key_cipher = ?, rawg_api_key_cipher = ?, updated_at = ?
 WHERE steam_id = ?`;

const GET_USER_SQL = `SELECT u.steam_id, u.display_name, u.avatar,
 us.steam_api_key_cipher, us.rawg_api_key_cipher, us.calendar_view, us.lang
FROM users u
LEFT JOIN user_settings us ON us.steam_id = u.steam_id
WHERE u.steam_id = ?`;

const INSERT_SESSION_SQL = `INSERT INTO sessions (token_hash, steam_id, expires_at, created_at, last_seen_at)
 VALUES (?, ?, ?, ?, ?)`;

const SELECT_SESSION_SQL = "SELECT steam_id FROM sessions WHERE token_hash = ? AND expires_at > ?";
const TOUCH_SESSION_SQL = "UPDATE sessions SET last_seen_at = ? WHERE token_hash = ? AND expires_at > ?";
const DELETE_SESSION_SQL = "DELETE FROM sessions WHERE token_hash = ?";
const PURGE_SESSIONS_SQL = "DELETE FROM sessions WHERE expires_at <= ?";
const UPDATE_CALENDAR_VIEW_SQL = "UPDATE user_settings SET calendar_view = ?, updated_at = ? WHERE steam_id = ?";
const UPDATE_LANG_SQL = "UPDATE user_settings SET lang = ?, updated_at = ? WHERE steam_id = ?";
const SELECT_FEED_CIPHER_SQL = `SELECT token_cipher FROM calendar_feeds
 WHERE steam_id = ?
 ORDER BY updated_at DESC
 LIMIT 1`;
const SELECT_FEED_STEAM_SQL = "SELECT steam_id FROM calendar_feeds WHERE token_hash = ?";
const DELETE_FEED_SQL = "DELETE FROM calendar_feeds WHERE steam_id = ?";
const INSERT_FEED_SQL = `INSERT INTO calendar_feeds (token_hash, steam_id, token_cipher, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?)`;

export interface ProfileInput {
  steamId: string;
  displayName?: string;
  avatar?: string;
}

export interface UserSettingsUpdate {
  steamApiKey?: string | null;
  rawgApiKey?: string | null;
}

export interface UserPreferences {
  calendarView?: "grid" | "list";
  lang?: Lang;
}

interface UserRow {
  steam_id?: string;
  display_name?: string | null;
  avatar?: string | null;
  steam_api_key_cipher?: string | null;
  rawg_api_key_cipher?: string | null;
  calendar_view?: string | null;
  lang?: string | null;
}

interface SessionTokenRow {
  steam_id?: string;
}

interface FeedCipherRow {
  token_cipher?: string;
}

interface SettingValueRow {
  value?: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function readLocalSecret(): string | undefined {
  try {
    if (existsSync(LEGACY_SECRET_FILE)) {
      const existing = readFileSync(LEGACY_SECRET_FILE, "utf8").trim();
      if (existing.length >= 32) return existing;
    }
  } catch (error) {
    logDebug("authStore.readLocalSecret.failed", {
      path: LEGACY_SECRET_FILE,
      error: sanitizeDebugError(error),
    });
    return undefined;
  }
  return undefined;
}

function writeLocalSecret(secret: string): void {
  try {
    writeFileSync(LEGACY_SECRET_FILE, `${secret}\n`, { mode: 0o600 });
  } catch (error) {
    logDebug("authStore.writeLocalSecret.failed", {
      path: LEGACY_SECRET_FILE,
      error: sanitizeDebugError(error),
    });
    return;
  }
}

async function getAppSetting(key: string): Promise<string | undefined> {
  const row = await getStatementRow<SettingValueRow>(GET_APP_SETTING_SQL, key);
  if (!row || typeof row.value !== "string") return undefined;
  return row.value;
}

async function setAppSetting(key: string, value: string): Promise<boolean> {
  return runStatement(UPSERT_APP_SETTING_SQL, key, value, Date.now());
}

export async function getOrCreateSessionSecret(): Promise<string> {
  if (cachedSessionSecret) return cachedSessionSecret;

  const fromDb = await getAppSetting(SESSION_SECRET_KEY);
  if (fromDb) {
    cachedSessionSecret = fromDb;
    logDebug("authStore.sessionSecret.source", { source: "db" });
    return cachedSessionSecret;
  }

  const candidates = [
    { source: "env" as const, value: process.env.SESSION_PASSWORD },
    { source: "local-file" as const, value: readLocalSecret() },
  ];
  for (const candidate of candidates) {
    if (!candidate.value) continue;
    cachedSessionSecret = candidate.value;
    const saved = await setAppSetting(SESSION_SECRET_KEY, candidate.value);
    logDebug("authStore.sessionSecret.source", { source: candidate.source, savedToDb: saved });
    return cachedSessionSecret;
  }

  const generated = randomBytes(32).toString("hex");
  cachedSessionSecret = generated;
  const saved = await setAppSetting(SESSION_SECRET_KEY, generated);
  if (!saved) writeLocalSecret(generated);
  logDebug("authStore.sessionSecret.source", {
    source: "generated",
    savedToDb: saved,
    savedToLocalFile: !saved,
  });
  return cachedSessionSecret;
}

function normalizeEncryptionKey(rawKey: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }
  return scryptSync(rawKey, Buffer.from(CIPHER_SALT, "utf8"), 32);
}

async function getEncryptionKey(): Promise<Buffer> {
  if (cachedEncryptionKey) return cachedEncryptionKey;

  const envKey = process.env.DB_ENCRYPTION_KEY;
  if (envKey) {
    cachedEncryptionKey = normalizeEncryptionKey(envKey);
    logDebug("authStore.encryptionKey.source", { source: "env" });
    return cachedEncryptionKey;
  }

  cachedEncryptionKey = scryptSync(
    await getOrCreateSessionSecret(),
    Buffer.from(CIPHER_SALT, "utf8"),
    32
  );
  logDebug("authStore.encryptionKey.source", { source: "session-secret" });
  return cachedEncryptionKey;
}

async function encryptString(value: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

async function decryptString(value?: string | null): Promise<string | undefined> {
  if (!value || !value.includes(".")) return undefined;

  const parts = value.split(".");
  if (parts.length !== 3) return undefined;

  try {
    const key = await getEncryptionKey();
    const iv = Buffer.from(parts[0], "base64url");
    const tag = Buffer.from(parts[1], "base64url");
    const encrypted = Buffer.from(parts[2], "base64url");
    if (iv.length !== 12 || tag.length !== 16) return undefined;

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (error) {
    logDebug("authStore.decryptString.failed", {
      valueLength: value?.length ?? 0,
      error: sanitizeDebugError(error),
    });
    return undefined;
  }
}

async function ensureUserRow(profile: ProfileInput): Promise<boolean> {
  const now = Date.now();
  return runStatement(
    UPSERT_USER_SQL,
    profile.steamId,
    profile.displayName ?? null,
    profile.avatar ?? null,
    now,
    now
  );
}

async function ensureUserSettingsRow(steamId: string): Promise<boolean> {
  const userOk = await runStatement(
    UPSERT_USER_SQL,
    steamId,
    null,
    null,
    Date.now(),
    Date.now()
  );
  if (!userOk) return false;
  return runStatement(INSERT_USER_SETTINGS_SQL, steamId, Date.now());
}

async function getUserRow(steamId: string): Promise<UserRow | undefined> {
  return getStatementRow<UserRow>(GET_USER_SQL, steamId);
}

async function readDecryptedSettings(
  row: UserRow
): Promise<{ apiKey?: string; rawgApiKey?: string }> {
  const apiKey = await decryptString(row.steam_api_key_cipher);
  const rawgApiKey = await decryptString(row.rawg_api_key_cipher);
  return { apiKey, rawgApiKey };
}

export async function saveUserSettings(
  steamId: string,
  updates: UserSettingsUpdate
): Promise<boolean> {
  const currentRow = await getUserRow(steamId);
  const currentSettings = currentRow ? await readDecryptedSettings(currentRow) : {};
  let apiKey = currentSettings.apiKey;
  let rawgApiKey = currentSettings.rawgApiKey;

  if ("steamApiKey" in updates) apiKey = updates.steamApiKey ?? undefined;
  if ("rawgApiKey" in updates) rawgApiKey = updates.rawgApiKey ?? undefined;

  const ok = await ensureUserSettingsRow(steamId);
  if (!ok) return false;

  const steamApiKeyCipher = apiKey ? await encryptString(apiKey) : null;
  const rawgApiKeyCipher = rawgApiKey ? await encryptString(rawgApiKey) : null;

  return runStatement(
    UPDATE_USER_SETTINGS_SQL,
    steamApiKeyCipher,
    rawgApiKeyCipher,
    Date.now(),
    steamId
  );
}

export async function getUserPreferences(steamId: string): Promise<UserPreferences | undefined> {
  const row = await getUserRow(steamId);
  if (!row) return undefined;

  return {
    calendarView:
      row.calendar_view === "grid" || row.calendar_view === "list" ? row.calendar_view : undefined,
    lang: row.lang === "ru" || row.lang === "en" ? row.lang : undefined,
  };
}

export async function saveUserCalendarView(
  steamId: string,
  calendarView: "grid" | "list"
): Promise<boolean> {
  const ok = await ensureUserSettingsRow(steamId);
  if (!ok) return false;
  return runStatement(UPDATE_CALENDAR_VIEW_SQL, calendarView, Date.now(), steamId);
}

export async function saveUserLang(steamId: string, lang: Lang): Promise<boolean> {
  const ok = await ensureUserSettingsRow(steamId);
  if (!ok) return false;
  return runStatement(UPDATE_LANG_SQL, lang, Date.now(), steamId);
}

export async function getCalendarFeedToken(steamId: string): Promise<string | undefined> {
  const row = await getStatementRow<FeedCipherRow>(SELECT_FEED_CIPHER_SQL, steamId);
  if (!row?.token_cipher) return undefined;
  return decryptString(row.token_cipher);
}

export async function createCalendarFeedToken(steamId: string): Promise<string | undefined> {
  const ok = await ensureUserRow({ steamId });
  if (!ok) return undefined;

  await runStatement(DELETE_FEED_SQL, steamId);

  const token = randomBytes(24).toString("base64url");
  const tokenCipher = await encryptString(token);
  const now = Date.now();

  const inserted = await runStatement(
    INSERT_FEED_SQL,
    hashToken(token),
    steamId,
    tokenCipher,
    now,
    now
  );

  return inserted ? token : undefined;
}

export async function revokeCalendarFeedToken(steamId: string): Promise<boolean> {
  return runStatement(DELETE_FEED_SQL, steamId);
}

export async function getSteamIdFromCalendarFeedToken(token: string): Promise<string | undefined> {
  const row = await getStatementRow<SessionTokenRow>(SELECT_FEED_STEAM_SQL, hashToken(token));
  return row?.steam_id;
}

export async function getSteamSessionData(
  steamId: string
): Promise<ProfileInput & { apiKey?: string; rawgApiKey?: string } | undefined> {
  const row = await getUserRow(steamId);
  if (!row?.steam_id) return undefined;

  const settings = await readDecryptedSettings(row);
  return {
    steamId: row.steam_id,
    displayName: row.display_name ?? undefined,
    avatar: row.avatar ?? undefined,
    apiKey: settings.apiKey,
    rawgApiKey: settings.rawgApiKey,
  };
}

export async function createDbSession(
  profile: ProfileInput
): Promise<string | undefined> {
  const now = Date.now();
  await runStatement(PURGE_SESSIONS_SQL, now);

  const ok = await ensureUserRow(profile);
  if (!ok) return undefined;

  const token = randomBytes(32).toString("base64url");
  const inserted = await runStatement(
    INSERT_SESSION_SQL,
    hashToken(token),
    profile.steamId,
    now + SESSION_TTL_MS,
    now,
    now
  );

  return inserted ? token : undefined;
}

export async function getSteamSessionDataFromToken(
  token: string
): Promise<ProfileInput & { apiKey?: string; rawgApiKey?: string } | undefined> {
  const tokenHash = hashToken(token);
  const row = await getStatementRow<SessionTokenRow>(SELECT_SESSION_SQL, tokenHash, Date.now());
  if (!row?.steam_id) return undefined;

  void runStatement(TOUCH_SESSION_SQL, Date.now(), tokenHash);
  return getSteamSessionData(row.steam_id);
}

export async function destroyDbSession(token: string): Promise<boolean> {
  return runStatement(DELETE_SESSION_SQL, hashToken(token));
}
