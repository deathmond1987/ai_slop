import "server-only";
import { logDebug, sanitizeDebugError } from "./debug";
import { getEarlyAccessStatusBatch } from "./early-access-getitems";
import {
  MANUAL_RELEASE_DATES_DELETE_ONE_SQL,
  manualReleaseDatesDeleteManySql,
  MANUAL_RELEASE_DATES_LIST_SQL,
  MANUAL_RELEASE_DATES_UPSERT_SQL,
  isValidReleaseDate,
  realReleaseDateFor,
  type ManualReleaseDateEntry,
} from "./manual-release-dates-core.ts";
import { prepare, runStatement, withTransaction } from "./sqlite";

export async function listManualReleaseDates(steamId: string): Promise<ManualReleaseDateEntry[]> {
  const statement = await prepare(MANUAL_RELEASE_DATES_LIST_SQL);
  if (!statement) return [];
  try {
    const rows = statement.all(steamId) as {
      appid?: unknown;
      release_date?: unknown;
      name?: unknown;
      header_image?: unknown;
      created_at?: unknown;
    }[];
    const out: ManualReleaseDateEntry[] = [];
    for (const row of rows) {
      const appid = Number(row.appid);
      if (!Number.isSafeInteger(appid) || appid <= 0) continue;
      if (!isValidReleaseDate(row.release_date)) continue;
      out.push({
        appid,
        releaseDate: row.release_date,
        name: typeof row.name === "string" && row.name ? row.name : `Steam App ${appid}`,
        headerImage: typeof row.header_image === "string" && row.header_image ? row.header_image : undefined,
        createdAt: Number(row.created_at) || 0,
      });
    }
    return out;
  } catch (error) {
    logDebug("manualRelease.list.failed", { error: sanitizeDebugError(error) });
    return [];
  }
}

export async function setManualReleaseDate(
  steamId: string,
  entry: { appid: number; releaseDate: string; name?: string; headerImage?: string }
): Promise<boolean> {
  if (!Number.isSafeInteger(entry.appid) || entry.appid <= 0) return false;
  if (!isValidReleaseDate(entry.releaseDate)) return false;
  const name = (entry.name ?? "").trim().slice(0, 300) || `Steam App ${entry.appid}`;
  const headerImage =
    entry.headerImage?.startsWith("https://") ? entry.headerImage.slice(0, 1000) : null;
  const ok = await runStatement(
    MANUAL_RELEASE_DATES_UPSERT_SQL,
    steamId,
    entry.appid,
    entry.releaseDate,
    name,
    headerImage,
    Date.now()
  );
  logDebug("manualRelease.set", { appid: entry.appid, date: entry.releaseDate, ok });
  return ok;
}

export async function removeManualReleaseDate(steamId: string, appid: number): Promise<boolean> {
  if (!Number.isSafeInteger(appid) || appid <= 0) return false;
  return runStatement(MANUAL_RELEASE_DATES_DELETE_ONE_SQL, steamId, appid);
}

export async function removeManualReleaseDates(
  steamId: string,
  appids: readonly number[]
): Promise<number> {
  const valid = [
    ...new Set(appids.filter((appid) => Number.isSafeInteger(appid) && appid > 0)),
  ];
  if (valid.length === 0) return 0;

  const ok = await withTransaction((db) => {
    let removed = 0;
    for (let i = 0; i < valid.length; i += 400) {
      const chunk = valid.slice(i, i + 400);
      const statement = db.prepare(manualReleaseDatesDeleteManySql(chunk.length));
      const result = statement.run(steamId, ...chunk) as { changes?: number | bigint };
      removed += Number(result.changes) || 0;
    }
    return removed;
  });
  return ok ?? 0;
}

/**
 * Manual dates reconciled with Steam: once a game really released, its real
 * release date replaces the manual one (and is persisted), so the card moves
 * to the actual date instead of staying on the user's estimate.
 */
export async function reconcileManualReleaseDates(
  steamId: string,
  storeCc: string
): Promise<ManualReleaseDateEntry[]> {
  const entries = await listManualReleaseDates(steamId);
  if (entries.length === 0) return entries;

  let statuses: Awaited<ReturnType<typeof getEarlyAccessStatusBatch>>;
  try {
    statuses = await getEarlyAccessStatusBatch(
      entries.map((entry) => entry.appid),
      storeCc
    );
  } catch (error) {
    logDebug("manualRelease.reconcile.statuses_failed", { error: sanitizeDebugError(error) });
    return entries;
  }

  const out: ManualReleaseDateEntry[] = [];
  let updated = 0;
  for (const entry of entries) {
    const real = realReleaseDateFor(statuses.get(entry.appid));
    if (real && real !== entry.releaseDate) {
      const ok = await setManualReleaseDate(steamId, {
        appid: entry.appid,
        releaseDate: real,
        name: entry.name,
        headerImage: entry.headerImage,
      });
      if (ok) updated += 1;
      out.push({ ...entry, releaseDate: real });
      continue;
    }
    out.push(entry);
  }

  if (updated > 0) {
    logDebug("manualRelease.reconciled", { updated, total: entries.length });
  }
  return out;
}
