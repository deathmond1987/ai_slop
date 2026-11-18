import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import { resetSteamStoreRateLimitState } from "../lib/steam-rate-limit.ts";

register(new URL("./ts-extension-resolver.mjs", import.meta.url).href, import.meta.url);

test("refreshing wishlist total removes stale wishlist candidates removed from Steam", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "steam-calendar-wishlist-cache-"));
  const originalFetch = globalThis.fetch;
  const originalDbSqlitePath = process.env.DB_SQLITE_PATH;
  const originalRawgApiKey = process.env.RAWG_API_KEY;
  const originalAppDetailsMinIntervalMs = process.env.STEAM_APPDETAILS_MIN_INTERVAL_MS;
  const originalSteamStoreRateLimitMaxRequests =
    process.env.STEAM_STORE_RATE_LIMIT_MAX_REQUESTS;

  process.env.DB_SQLITE_PATH = path.join(tempDir, "cache.sqlite");
  delete process.env.RAWG_API_KEY;
  process.env.STEAM_APPDETAILS_MIN_INTERVAL_MS = "0";
  process.env.STEAM_STORE_RATE_LIMIT_MAX_REQUESTS = "0";
  resetSteamStoreRateLimitState();

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));

    if (url.pathname.includes("GetWishlistItemCount")) {
      return Response.json(
        { response: { count: 1 } },
        { status: 200, headers: { "x-eresult": "1" } }
      );
    }

    if (url.pathname.includes("GetWishlist")) {
      return Response.json(
        { response: { items: [{ appid: 200 }] } },
        { status: 200, headers: { "x-eresult": "1" } }
      );
    }

    if (url.pathname.includes("/api/appdetails")) {
      return Response.json({
        "200": {
          success: true,
          data: {
            name: "Current Game",
            type: "game",
            price_overview: {
              currency: "eur",
              initial: 2000,
              final: 2000,
              discount_percent: 0,
            },
            release_date: {
              date: "2025-01-01",
              coming_soon: false,
            },
          },
        },
      });
    }

    return new Response("not mocked", { status: 404 });
  };

  try {
    const { cacheGet, cacheSet } = await import("../lib/cache-store.ts");
    const { todayISO } = await import("../lib/calendar.ts");
    const { upcomingCacheKey, upcomingCacheTtlMs } = await import("../lib/aggregate-cache.ts");
    const { APP_DETAILS_CACHE_PREFIX } = await import("../lib/steam-core.ts");
    const { getWishlistTotalForSession } = await import("../lib/wishlist-total-cache.ts");

    const steamId = "10000000000000001";
    const storeCc = "DE";
    const session = { steamId, storeCc };
    const aggregateKey = upcomingCacheKey(
      { steamId, apiKey: undefined, storeCc },
      undefined,
      todayISO()
    );

    await cacheSet(
      aggregateKey,
      {
        games: [
          {
            appid: 100,
            name: "Removed from wishlist",
            sources: ["wishlist"],
            releaseDate: null,
            dateSource: "steam",
            steamUrl: "https://store.steampowered.com/app/100/",
            price: { currency: "eur", initial: 1000, final: 1000 },
            priceCc: "de",
          },
          {
            appid: 200,
            name: "Current Game",
            sources: ["wishlist"],
            releaseDate: null,
            dateSource: "steam",
            steamUrl: "https://store.steampowered.com/app/200/",
            price: { currency: "eur", initial: 2000, final: 2000 },
            priceCc: "de",
          },
        ],
        warnings: [],
        libraryAvailable: false,
        wishlistPrivate: false,
        wishlistPartial: false,
        wishlistShown: 2,
        wishlistTotalKnown: 2,
        wishlistStatus: "complete",
      },
      upcomingCacheTtlMs()
    );

    await cacheSet(
      `${APP_DETAILS_CACHE_PREFIX}100`,
      { success: true, data: { name: "Stale Game" } },
      upcomingCacheTtlMs()
    );
    await cacheSet(
      `${APP_DETAILS_CACHE_PREFIX}300`,
      { success: true, data: { name: "Unrelated Game" } },
      upcomingCacheTtlMs()
    );

    const result = await getWishlistTotalForSession(session, { force: true });

    assert.equal(result.ready, true);
    assert.equal(result.count, 1);
    assert.equal(result.totalCents, 2000);
    assert.equal(result.currency, "eur");
    assert.equal(result.items?.some((item) => item.appid === 100), false);
    assert.deepEqual(result.items?.map((item) => item.appid), [200]);
    assert.equal(await cacheGet(`${APP_DETAILS_CACHE_PREFIX}100`), undefined);
    assert.ok(await cacheGet(`${APP_DETAILS_CACHE_PREFIX}300`));
  } finally {
    globalThis.fetch = originalFetch;

    if (originalDbSqlitePath === undefined) {
      delete process.env.DB_SQLITE_PATH;
    } else {
      process.env.DB_SQLITE_PATH = originalDbSqlitePath;
    }

    if (originalRawgApiKey === undefined) {
      delete process.env.RAWG_API_KEY;
    } else {
      process.env.RAWG_API_KEY = originalRawgApiKey;
    }

    if (originalAppDetailsMinIntervalMs === undefined) {
      delete process.env.STEAM_APPDETAILS_MIN_INTERVAL_MS;
    } else {
      process.env.STEAM_APPDETAILS_MIN_INTERVAL_MS = originalAppDetailsMinIntervalMs;
    }

    if (originalSteamStoreRateLimitMaxRequests === undefined) {
      delete process.env.STEAM_STORE_RATE_LIMIT_MAX_REQUESTS;
    } else {
      process.env.STEAM_STORE_RATE_LIMIT_MAX_REQUESTS = originalSteamStoreRateLimitMaxRequests;
    }
    resetSteamStoreRateLimitState();

    rmSync(tempDir, { recursive: true, force: true });
  }
});
