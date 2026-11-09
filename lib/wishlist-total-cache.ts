import "server-only";

import { upcomingCacheKey } from "./aggregate-cache";
import { cacheGet } from "./cache-store";
import { todayISO } from "./calendar";
import { logDebug } from "./debug";
import { getOwnedGames } from "./steam";
import { ownedCacheKey } from "./steam-core";
import { normalizeSteamStoreCc } from "./store-cc";
import { collectUpcoming, type UpcomingResult } from "./upcoming";
import type { IdentifiedSession, SteamSession } from "./types";
import { wishlistCacheKey, wishlistStoreCcHash } from "./wishlist-cache-core";
import { aggregateWishlistGuardReason, wishlistTotalGuardReason } from "./wishlist-core.ts";
import type { WishlistResult } from "./wishlist";
import {
  computeWishlistPriceTotal,
  markOwnedCandidates,
  mergeWishlistPriceCandidates,
  ownedAppIdSet,
  wishlistCandidatesFromCacheResult,
  wishlistCardFieldsFromUpcomingGame,
  wishlistItemEntriesFromCandidates,
  withWishlistCardFields,
  type OwnedAppIdEntryLike,
  type WishlistPriceCandidate,
  type WishlistTotalResponse,
} from "./wishlist-total";

function emptyTotal(items: WishlistTotalResponse["items"] = []): WishlistTotalResponse {
  return {
    ready: true,
    totalCents: 0,
    discountTotalCents: 0,
    discountCount: 0,
    count: 0,
    currency: null,
    items,
    discounts: [],
  };
}


async function ownedAppIdsForSession(
  steamId: string,
  apiKey: string | undefined,
  refresh: boolean
): Promise<Set<number>> {
  if (!apiKey) return new Set<number>();

  try {
    if (refresh) {
      return ownedAppIdSet(await getOwnedGames(steamId, apiKey));
    }

    const owned = await cacheGet<OwnedAppIdEntryLike[]>(ownedCacheKey(steamId, apiKey));
    return ownedAppIdSet(owned);
  } catch (error) {
    logDebug("wishlistTotal.ownedCache.failed", { error: String(error) });
    return new Set<number>();
  }
}

function candidatesFromCaches(
  aggregate: UpcomingResult | undefined,
  wishlist: WishlistResult | undefined,
  normalizedStoreCc: string | undefined
): WishlistPriceCandidate[] {
  const aggregateCandidates: WishlistPriceCandidate[] = aggregate
    ? aggregate.games.map((game) =>
        withWishlistCardFields(
          {
            appid: game.appid,
            name: game.name,
            steamUrl: game.steamUrl,
            sources: game.sources,
            price: game.price,
            priceCc: game.priceCc,
          },
          wishlistCardFieldsFromUpcomingGame(game)
        )
      )
    : [];
  const wishlistCandidates = wishlist
    ? wishlistCandidatesFromCacheResult(wishlist, normalizedStoreCc)
    : [];

  return mergeWishlistPriceCandidates(aggregateCandidates, wishlistCandidates);
}

export async function getWishlistTotalForSession(
  session: SteamSession | null,
  options: { refresh?: boolean } = {}
): Promise<WishlistTotalResponse> {
  const steamId = session?.steamId;
  if (!session || !steamId) {
    return { ready: false, reason: "signed_out" };
  }

  const refresh = options.refresh ?? false;
  const normalizedStoreCc = normalizeSteamStoreCc(session.storeCc);
  const rawgKey = session.rawgApiKey ?? process.env.RAWG_API_KEY;
  const identifiedSession: IdentifiedSession = { ...session, steamId };
  const aggregateKey = upcomingCacheKey(
    {
      steamId,
      apiKey: session.apiKey,
      storeCc: session.storeCc,
    },
    rawgKey,
    todayISO()
  );
  const wishlistKey = wishlistCacheKey(steamId, wishlistStoreCcHash(normalizedStoreCc));

  try {
    let aggregate = await cacheGet<UpcomingResult>(aggregateKey);
    let wishlist = await cacheGet<WishlistResult>(wishlistKey);

    if (!aggregate && !wishlist) {
      if (!refresh) {
        logDebug("wishlistTotal.not_cached", {
          steamId,
          storeCc: normalizedStoreCc,
          hasAggregate: false,
          hasWishlist: false,
        });
        return { ready: false, reason: "not_cached" };
      }

      try {
        aggregate = await collectUpcoming(identifiedSession, rawgKey);
        wishlist = await cacheGet<WishlistResult>(wishlistKey);
      } catch (error) {
        logDebug("wishlistTotal.refresh.failed", {
          steamId,
          storeCc: normalizedStoreCc,
          error: String(error),
        });
        return { ready: false, reason: "not_cached" };
      }
    }

    const guardReason =
      wishlistTotalGuardReason(wishlist) ?? aggregateWishlistGuardReason(aggregate, wishlist);
    if (guardReason) {
      logDebug("wishlistTotal.guard", {
        steamId,
        storeCc: normalizedStoreCc,
        reason: guardReason,
        hasAggregate: Boolean(aggregate),
        hasWishlist: Boolean(wishlist),
        aggregatePrivate: aggregate?.wishlistPrivate ?? null,
        aggregateStatus: aggregate?.wishlistStatus ?? null,
        wishlistPrivate: wishlist?.private ?? null,
        wishlistStatus: wishlist?.status ?? null,
      });
      return { ready: false, reason: guardReason };
    }

    const ownedAppIds = await ownedAppIdsForSession(steamId, session.apiKey, refresh);
    const candidates = markOwnedCandidates(
      candidatesFromCaches(aggregate, wishlist, normalizedStoreCc),
      ownedAppIds
    );
    const items = wishlistItemEntriesFromCandidates(candidates);
    const total = computeWishlistPriceTotal(candidates, normalizedStoreCc);

    return total ? { ready: true, ...total, items } : emptyTotal(items);
  } catch (error) {
    logDebug("wishlistTotal.api.failed", { error: String(error) });
    return { ready: false, reason: "error" };
  }
}
