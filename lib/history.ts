import "server-only";
import { cacheGet, cacheSet } from "./cache-store";
import { logDebug, sanitizeDebugError } from "./debug";
import { buildHistoryGames, type HistoryResult } from "./history-core.ts";
import { loadLibrary } from "./library";
import type { SteamSession } from "./types";

const HISTORY_TTL_MS = 30 * 60 * 1000;

function cacheKey(apiKeyHash: string, storeCc: string): string {
  return `history:v1:${apiKeyHash}:${storeCc}`;
}

export async function getHistory(session: SteamSession | null): Promise<HistoryResult> {
  if (!session?.steamId) return { ready: false, reason: "signed_out", games: [], ownedCount: 0 };
  if (!session.apiKey) return { ready: false, reason: "no_api_key", games: [], ownedCount: 0 };

  const startedAt = Date.now();
  const library = await loadLibrary(session);
  if (!library) return { ready: false, reason: "no_api_key", games: [], ownedCount: 0 };

  const key = cacheKey(library.apiKeyHash, library.storeCc);
  const cached = await cacheGet<HistoryResult>(key);
  if (cached) {
    logDebug("history.cached", { games: cached.games.length });
    return cached;
  }

  try {
    const games = buildHistoryGames(library.owned, library.items);
    const result: HistoryResult = { ready: true, games, ownedCount: library.owned.length };
    await cacheSet(key, result, HISTORY_TTL_MS);
    logDebug("history.built", {
      storeCc: library.storeCc,
      ownedCount: result.ownedCount,
      games: games.length,
      undated: games.filter((game) => !game.releaseDate).length,
      ms: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    logDebug("history.failed", { error: sanitizeDebugError(error) });
    return { ready: false, reason: "steam_api", games: [], ownedCount: 0 };
  }
}
