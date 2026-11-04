import "server-only";
import type { IdentifiedSession, UpcomingGame } from "./types";
import { logDebug, sanitizeDebugError } from "./debug";
import { getOwnedGames, getAppDetails } from "./steam";
import { fetchWishlist } from "./wishlist";
import { searchRawg } from "./rawg";
import { todayISO } from "./calendar";
import { cacheGet, cacheSet } from "./cache-store";
import { loadUpcomingWithCache } from "./aggregate-cache";
import { applyKnownWishlistDatesAfterDetails } from "./release-dates.ts";
import {
  addOwnedCandidates,
  applyAppDetails,
  applyRawgHit,
  applyReleaseFilters,
  buildUpcomingList,
  emptyCandidateResult,
  initializeCandidatesFromWishlist,
  RAWG_CONCURRENCY,
  removeUnknownLibraryOnly,
  selectDetailCandidates,
  selectRawgTargets,
  toUpcomingResult,
  type CandidateBuildResult,
} from "./upcoming-candidates.ts";

export interface UpcomingResult {
  games: UpcomingGame[];
  warnings: string[];
  libraryAvailable: boolean;
  wishlistPrivate: boolean;
  wishlistPartial: boolean;
  wishlistShown: number;
  wishlistTotalKnown?: number;
}

const pendingUpcoming = new Map<string, Promise<UpcomingResult>>();

export async function collectUpcoming(
  session: IdentifiedSession,
  rawgKey?: string
): Promise<UpcomingResult> {
  const today = todayISO();

  return loadUpcomingWithCache<UpcomingResult>({
    context: {
      steamId: session.steamId,
      apiKey: session.apiKey,
      rawgApiKey: rawgKey,
      today,
    },
    cacheGet,
    cacheSet,
    pending: pendingUpcoming,
    factory: (_cacheKey, apiKeyHash, rawgKeyHash) =>
      collectUpcomingUncached(session, rawgKey, today, apiKeyHash, rawgKeyHash),
  });
}

async function collectUpcomingUncached(
  session: IdentifiedSession,
  rawgKey: string | undefined,
  today: string,
  apiKeyHash: string,
  rawgKeyHash: string
): Promise<UpcomingResult> {
  let candidates: CandidateBuildResult = emptyCandidateResult();
  candidates.libraryAvailable = Boolean(session.apiKey);

  try {
    const wl = await fetchWishlist(session.steamId);
    const fromWishlist = initializeCandidatesFromWishlist(wl);
    candidates = {
      ...candidates,
      ...fromWishlist,
      warnings: [...candidates.warnings, ...fromWishlist.warnings],
      libraryAvailable: candidates.libraryAvailable || fromWishlist.libraryAvailable,
    };
  } catch (error) {
    logDebug("upcoming.wishlist.failed", {
      hasWishlistKey: Boolean(session.steamId),
      error: sanitizeDebugError(error),
    });
    candidates.wishlistPrivate = true;
    candidates.warnings.push("wishlistHidden");
  }

  if (session.apiKey) {
    try {
      const owned = await getOwnedGames(session.steamId, session.apiKey, apiKeyHash);
      addOwnedCandidates(candidates, owned, Date.now());
    } catch (error) {
      logDebug("upcoming.ownedGames.failed", { error: sanitizeDebugError(error) });
      candidates.warnings.push("steamApi");
    }
  } else {
    candidates.warnings.push("noApiKey");
  }

  if (!candidates.map.size) {
    logDebug("upcoming.no_candidates", { warnings: candidates.warnings });
    return toUpcomingResult(candidates, []) as UpcomingResult;
  }

  logDebug("upcoming.candidates", {
    mapSize: candidates.map.size,
    warningCount: candidates.warnings.length,
    wishlistShown: candidates.wishlistShown,
    wishlistTotalKnown: candidates.wishlistTotalKnown,
  });

  const appids = selectDetailCandidates(candidates, today);
  const fetchedDetails = await getAppDetails(appids);
  for (const [appid, detail] of fetchedDetails) {
    applyAppDetails(candidates.map, appid, detail);
  }

  applyKnownWishlistDatesAfterDetails(candidates.map.values());
  applyReleaseFilters(candidates.map, today);
  removeUnknownLibraryOnly(candidates.map);

  if (rawgKey) {
    const activeRawgKey = rawgKey;
    const rawgTargets = selectRawgTargets(candidates.map, candidates.candidateScores);
    logDebug("upcoming.rawg.start", { targetCount: rawgTargets.length });
    let rawgCursor = 0;
    async function rawgWorker(): Promise<void> {
      while (rawgCursor < rawgTargets.length) {
        const game = rawgTargets[rawgCursor++];
        try {
          const hit = await searchRawg(game.name, activeRawgKey, rawgKeyHash);
          applyRawgHit(game, hit, today);
        } catch (error) {
          logDebug("upcoming.rawg.failed", {
            name: game.name,
            error: sanitizeDebugError(error),
          });
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(RAWG_CONCURRENCY, Math.max(1, rawgTargets.length)) },
        () => rawgWorker()
      )
    );
  }

  return toUpcomingResult(candidates, buildUpcomingList(candidates.map)) as UpcomingResult;
}
