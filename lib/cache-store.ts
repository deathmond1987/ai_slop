import "server-only";
import { logDebug } from "./debug";
import { getStatementRow, runStatement } from "./sqlite";

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
