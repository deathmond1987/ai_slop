import "server-only";
import { logDebug } from "./debug";
import { getDb, getStatementRow, prepare, runStatement, withTransaction } from "./sqlite";

export interface CacheEntry<T> {
  key: string;
  value: T;
  updatedAt?: number;
}

const PRUNE_INTERVAL_MS = 60_000;
const SELECT_SQL = "SELECT value FROM cache_entries WHERE key = ? AND expires_at > ?";
const UPSERT_SQL = `INSERT INTO cache_entries (key, value, expires_at, updated_at)
 VALUES (?, ?, ?, ?)
 ON CONFLICT(key) DO UPDATE SET
   value = excluded.value,
   expires_at = excluded.expires_at,
   updated_at = excluded.updated_at`;
const DELETE_SQL = "DELETE FROM cache_entries WHERE key = ?";
const PRUNE_SQL = "DELETE FROM cache_entries WHERE expires_at <= ?";
const DELETE_BY_PREFIX_SQL = "DELETE FROM cache_entries WHERE key LIKE ? ESCAPE '\\'";
const DELETE_BY_EXACT_OR_PREFIX_SQL =
  "DELETE FROM cache_entries WHERE key = ? OR key LIKE ? ESCAPE '\\'";
const LIST_BY_EXACT_OR_PREFIX_SQL =
  "SELECT key, value, updated_at FROM cache_entries WHERE (key = ? OR key LIKE ? ESCAPE '\\') AND expires_at > ?";

let lastPruneAt = 0;

function pruneExpired(): void {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;

  void runStatement(PRUNE_SQL, now);
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  pruneExpired();

  const row = await getStatementRow<{ value?: unknown }>(SELECT_SQL, key, Date.now());
  if (!row || typeof row.value !== "string") return undefined;

  try {
    return JSON.parse(row.value) as T;
  } catch (error) {
    logDebug("cacheStore.get.parse_failed", { key, error: String(error) });
    await runStatement(DELETE_SQL, key);
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;

  let serialized: unknown;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    logDebug("cacheStore.set.serialize_failed", { key, error: String(error) });
    return;
  }

  if (typeof serialized !== "string") {
    logDebug("cacheStore.set.non_string_serialized", { key });
    return;
  }

  pruneExpired();

  const now = Date.now();
  await runStatement(UPSERT_SQL, key, serialized, now + ttlMs, now);
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function deleteCacheByPrefix(prefix: string): Promise<boolean> {
  if (!prefix) return false;

  pruneExpired();

  const likePattern = `${escapeLikePattern(prefix)}%`;
  const statement = await prepare(DELETE_BY_PREFIX_SQL);
  if (!statement) return false;

  try {
    statement.run(likePattern);
    return true;
  } catch (error) {
    logDebug("cacheStore.deleteByPrefix.failed", {
      prefix,
      error: String(error),
    });
    return false;
  }
}

export async function deleteCacheByExactOrPrefix(prefix: string): Promise<boolean> {
  if (!prefix) return false;

  pruneExpired();

  const escapedPrefix = escapeLikePattern(prefix);
  const likePattern = `${escapedPrefix}:%`;
  const statement = await prepare(DELETE_BY_EXACT_OR_PREFIX_SQL);
  if (!statement) return false;

  try {
    statement.run(prefix, likePattern);
    return true;
  } catch (error) {
    logDebug("cacheStore.deleteByExactOrPrefix.failed", {
      prefix,
      error: String(error),
    });
    return false;
  }
}

export async function listCacheEntriesByExactOrPrefix<T>(
  prefix: string
): Promise<CacheEntry<T>[]> {
  if (!prefix) return [];

  pruneExpired();

  const escapedPrefix = escapeLikePattern(prefix);
  const likePattern = `${escapedPrefix}:%`;
  const statement = await prepare(LIST_BY_EXACT_OR_PREFIX_SQL);
  if (!statement) return [];

  try {
    const rows = statement.all(prefix, likePattern, Date.now()) as {
      key?: unknown;
      value?: unknown;
      updated_at?: unknown;
    }[];
    const entries: CacheEntry<T>[] = [];
    for (const row of rows) {
      if (typeof row.key !== "string" || typeof row.value !== "string") continue;
      try {
        entries.push({
          key: row.key,
          value: JSON.parse(row.value) as T,
          updatedAt: Number.isFinite(Number(row.updated_at)) ? Number(row.updated_at) : 0,
        });
      } catch (error) {
        logDebug("cacheStore.list.parse_failed", {
          key: row.key,
          error: String(error),
        });
      }
    }
    return entries;
  } catch (error) {
    logDebug("cacheStore.listByExactOrPrefix.failed", {
      prefix,
      error: String(error),
    });
    return [];
  }
}

/**
 * Batch variant of cacheGet: one query per chunk instead of one query per key.
 * Missing/expired keys are simply absent from the result map.
 */
export async function cacheGetMany(keys: readonly string[]): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  const unique = [...new Set(keys)];
  if (unique.length === 0) return out;

  pruneExpired();
  const db = await getDb();
  if (!db) return out;

  const now = Date.now();
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const placeholders = chunk.map(() => "?").join(",");
    const sql = `SELECT key, value FROM cache_entries WHERE key IN (${placeholders}) AND expires_at > ?`;
    try {
      const rows = db.prepare(sql).all(...chunk, now) as {
        key?: unknown;
        value?: unknown;
      }[];
      for (const row of rows) {
        if (typeof row.key !== "string" || typeof row.value !== "string") continue;
        try {
          out.set(row.key, JSON.parse(row.value));
        } catch {
          // ignore unparsable rows; they are re-fetched by callers
        }
      }
    } catch (error) {
      logDebug("cacheStore.getMany.failed", { error: String(error) });
    }
  }
  return out;
}

/** Batch variant of cacheSet: all entries are written in one transaction. */
export async function cacheSetMany(entries: readonly { key: string; value: unknown; ttlMs: number }[]): Promise<void> {
  if (entries.length === 0) return;

  pruneExpired();
  const now = Date.now();
  await withTransaction((db) => {
    const statement = db.prepare(UPSERT_SQL);
    for (const entry of entries) {
      if (!Number.isFinite(entry.ttlMs) || entry.ttlMs <= 0) continue;
      let serialized: unknown;
      try {
        serialized = JSON.stringify(entry.value);
      } catch {
        continue;
      }
      if (typeof serialized !== "string") continue;
      statement.run(entry.key, serialized, now + entry.ttlMs, now);
    }
  });
}
