import "server-only";
import {
  earlyAccessBlacklistDeleteManySql,
  EARLY_ACCESS_BLACKLIST_LIST_SQL,
  EARLY_ACCESS_BLACKLIST_UPSERT_SQL,
  type EarlyAccessBlacklistEntry,
} from "./early-access-core.ts";
import { logDebug, sanitizeDebugError } from "./debug";
import { prepare, runStatement, withTransaction } from "./sqlite";

function isAppid(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function listEarlyAccessBlacklist(steamId: string): Promise<EarlyAccessBlacklistEntry[]> {
  const statement = await prepare(EARLY_ACCESS_BLACKLIST_LIST_SQL);
  if (!statement) return [];
  try {
    const rows = statement.all(steamId) as {
      appid?: unknown;
      name?: unknown;
      header_image?: unknown;
      created_at?: unknown;
    }[];
    const out: EarlyAccessBlacklistEntry[] = [];
    for (const row of rows) {
      const appid = Number(row.appid);
      if (!isAppid(appid)) continue;
      out.push({
        appid,
        name: typeof row.name === "string" && row.name ? row.name : `Steam App ${appid}`,
        headerImage: typeof row.header_image === "string" && row.header_image ? row.header_image : undefined,
        createdAt: Number(row.created_at) || 0,
      });
    }
    return out;
  } catch (error) {
    logDebug("earlyAccess.blacklist.list.failed", { error: sanitizeDebugError(error) });
    return [];
  }
}

export async function loadEarlyAccessBlacklistSet(steamId: string): Promise<Set<number>> {
  return new Set((await listEarlyAccessBlacklist(steamId)).map((entry) => entry.appid));
}

export async function addEarlyAccessBlacklist(
  steamId: string,
  entry: { appid: number; name?: string; headerImage?: string }
): Promise<boolean> {
  if (!isAppid(entry.appid)) return false;
  const name = (entry.name ?? "").trim().slice(0, 300) || `Steam App ${entry.appid}`;
  const headerImage = entry.headerImage?.startsWith("https://") ? entry.headerImage.slice(0, 1000) : null;
  return runStatement(EARLY_ACCESS_BLACKLIST_UPSERT_SQL, steamId, entry.appid, name, headerImage, Date.now());
}

export async function removeEarlyAccessBlacklist(steamId: string, appids: readonly number[]): Promise<number> {
  const valid = [...new Set(appids.filter(isAppid))];
  if (valid.length === 0) return 0;

  const ok = await withTransaction((db) => {
    let removed = 0;
    for (let i = 0; i < valid.length; i += 400) {
      const chunk = valid.slice(i, i + 400);
      const statement = db.prepare(earlyAccessBlacklistDeleteManySql(chunk.length));
      const result = statement.run(steamId, ...chunk) as { changes?: number | bigint };
      removed += Number(result.changes) || 0;
    }
    return removed;
  });
  return ok ?? 0;
}
