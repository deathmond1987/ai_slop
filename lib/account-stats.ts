import "server-only";
import { computeAccountStats, type AccountStats } from "./account-stats-core.ts";
import { logDebug, sanitizeDebugError } from "./debug";
import { cacheGet, cacheSet } from "./cache-store";
import { listEarlyAccessBlacklist } from "./early-access-blacklist";
import { loadLibrary } from "./library";
import { listManualReleaseDates } from "./manual-release-dates";
import type { SteamSession } from "./types";

const STATS_TTL_MS = 30 * 60 * 1000;

export async function getAccountStats(session: SteamSession | null): Promise<AccountStats> {
  const empty: AccountStats = {
    ready: false,
    ownedCount: 0,
    games: 0,
    dlc: 0,
    demos: 0,
    tools: 0,
    other: 0,
    earlyAccessNow: 0,
    withReleaseDate: 0,
    totalPlaytimeHours: 0,
    playedGames: 0,
    neverPlayed: 0,
    releasesByYear: [],
    blacklisted: 0,
    manualDates: 0,
  };
  if (!session?.steamId || !session.apiKey) return empty;

  try {
    const library = await loadLibrary(session);
    if (!library) return empty;

    const key = `accountstats:v1:${session.steamId}:${library.apiKeyHash}:${library.storeCc}`;
    const cached = await cacheGet<AccountStats>(key);
    if (cached) {
      logDebug("accountStats.cached", { owned: cached.ownedCount });
      return cached;
    }

    const [blacklist, manual] = await Promise.all([
      listEarlyAccessBlacklist(session.steamId),
      listManualReleaseDates(session.steamId),
    ]);
    const stats = computeAccountStats({
      owned: library.owned,
      items: library.items,
      blacklisted: blacklist.length,
      manualDates: manual.length,
    });
    await cacheSet(key, stats, STATS_TTL_MS);
    return stats;
  } catch (error) {
    logDebug("accountStats.failed", { error: sanitizeDebugError(error) });
    return empty;
  }
}
