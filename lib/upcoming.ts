import "server-only";
import type { IdentifiedSession, UpcomingGame } from "./types";
import { logDebug, sanitizeDebugError } from "./debug";
import { getOwnedGames, getAppDetails, type AppDetails } from "./steam";
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
const MAX_EARLY_OWNED_DETAIL_PREFETCH = 30;

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
  const collectStart = Date.now();
  let candidates: CandidateBuildResult = emptyCandidateResult();
  candidates.libraryAvailable = Boolean(session.apiKey);

  const wishlistStart = Date.now();
  const ownedStart = Date.now();
  let wishlistItems = 0;
  let ownedCount = 0;

  const wishlistPromise = fetchWishlist(session.steamId)
    .then((wl) => {
      wishlistItems = wl.items.length;
      const fromWishlist = initializeCandidatesFromWishlist(wl);
      candidates = {
        ...candidates,
        ...fromWishlist,
        warnings: [...candidates.warnings, ...fromWishlist.warnings],
        libraryAvailable: candidates.libraryAvailable || fromWishlist.libraryAvailable,
      };
    })
    .catch((error) => {
      logDebug("upcoming.wishlist.failed", {
        hasWishlistKey: Boolean(session.steamId),
        error: sanitizeDebugError(error),
      });
      candidates.wishlistPrivate = true;
      candidates.warnings.push("wishlistHidden");
    });

  let ownedPromise: Promise<Awaited<ReturnType<typeof getOwnedGames>> | null>;
  if (session.apiKey) {
    ownedPromise = getOwnedGames(session.steamId, session.apiKey, apiKeyHash)
      .then((owned) => {
        ownedCount = owned.length;
        return owned;
      })
      .catch((error) => {
        logDebug("upcoming.ownedGames.failed", { error: sanitizeDebugError(error) });
        candidates.warnings.push("steamApi");
        return null;
      });
  } else {
    candidates.warnings.push("noApiKey");
    ownedPromise = Promise.resolve(null);
  }

  const earlyCandidates = emptyCandidateResult();
  const earlyStart = Date.now();
  let earlyAppids: number[] = [];
  let earlyDetailsPromise: Promise<Map<number, AppDetails | null>> | null = null;

  const owned = await ownedPromise;
  if (owned) {
    addOwnedCandidates(earlyCandidates, owned, Date.now());
    earlyAppids = selectDetailCandidates(earlyCandidates, today).slice(
      0,
      MAX_EARLY_OWNED_DETAIL_PREFETCH
    );
    if (earlyAppids.length) {
      earlyDetailsPromise = getAppDetails(earlyAppids, {
        concurrency: 3,
        priority: "low",
      }).catch((error) => {
        logDebug("upcoming.earlyDetails.failed", {
          requested: earlyAppids.length,
          error: sanitizeDebugError(error),
        });
        return new Map<number, AppDetails | null>();
      });
    }
  }
  logDebug("upcoming.phase.earlyOwned", {
    ms: Date.now() - earlyStart,
    ownedCount,
    apiKeyPresent: Boolean(session.apiKey),
    earlyDetailCandidates: earlyAppids.length,
  });

  await wishlistPromise;
  logDebug("upcoming.phase.wishlist", {
    ms: Date.now() - wishlistStart,
    items: wishlistItems,
  });

  if (owned) {
    addOwnedCandidates(candidates, owned, Date.now());
  }
  logDebug("upcoming.phase.owned", {
    ms: Date.now() - ownedStart,
    ownedCount,
    apiKeyPresent: Boolean(session.apiKey),
  });

  if (earlyDetailsPromise) {
    const earlyDetailsStart = Date.now();
    const earlyDetails = await earlyDetailsPromise;
    let applied = 0;
    for (const [appid, detail] of earlyDetails) {
      if (!detail) continue;
      candidates.prefetchedAppDetails.set(appid, detail);
      if (candidates.map.has(appid)) {
        applyAppDetails(candidates.map, appid, detail);
        applied += 1;
      }
    }
    logDebug("upcoming.phase.earlyDetails", {
      requested: earlyAppids.length,
      applied,
      ms: Date.now() - earlyDetailsStart,
    });
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

  const detailsStart = Date.now();
  const appids = selectDetailCandidates(candidates, today);
  const fetchedDetails = await getAppDetails(appids);
  logDebug("upcoming.phase.details", {
    requested: appids.length,
    ms: Date.now() - detailsStart,
  });
  for (const [appid, detail] of fetchedDetails) {
    applyAppDetails(candidates.map, appid, detail);
  }

  applyKnownWishlistDatesAfterDetails(candidates.map.values());
  applyReleaseFilters(candidates.map, today);
  removeUnknownLibraryOnly(candidates.map);

  if (rawgKey) {
    const rawgStart = Date.now();
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
    logDebug("upcoming.phase.rawg", {
      targetCount: rawgTargets.length,
      ms: Date.now() - rawgStart,
    });
  }

  const finalResult = toUpcomingResult(candidates, buildUpcomingList(candidates.map));
  logDebug("upcoming.phase.total", {
    ms: Date.now() - collectStart,
    games: finalResult.games.length,
  });
  return finalResult as UpcomingResult;
}
