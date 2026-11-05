import test from "node:test";
import assert from "node:assert/strict";
import {
  UPCOMING_CACHE_TTL_MS,
  upcomingCacheTtlMs,
} from "../lib/aggregate-cache.ts";
import {
  STEAM_APPDETAILS_CONCURRENCY,
  STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS,
  STEAM_APPDETAILS_MIN_INTERVAL_MS,
  STEAM_APPDETAILS_MIN_INTERVAL_MAX_MS,
  STEAM_APPDETAILS_TIMEOUT_MS,
  steamAppDetailsConcurrency,
  steamAppDetailsFallbackEnabled,
  steamAppDetailsFallbackTimeoutMs,
  steamAppDetailsMinIntervalMs,
  steamAppDetailsTimeoutMs,
} from "../lib/steam-core.ts";
import {
  WISHLIST_PAGE_FALLBACK_DEFAULT_ENABLED,
  shouldFetchWishlistPage,
  wishlistPageFallbackEnabled,
  type ApiWishlistResult,
} from "../lib/wishlist-core.ts";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("aggregate cache TTL defaults to the aggregate cache constant", () => {
  withEnv(
    { UPCOMING_CACHE_TTL_MS: undefined, UPCOMING_CACHE_TTL_SECONDS: undefined },
    () => assert.equal(upcomingCacheTtlMs(), UPCOMING_CACHE_TTL_MS)
  );
});

test("aggregate cache TTL accepts seconds and milliseconds env overrides", () => {
  withEnv({ UPCOMING_CACHE_TTL_MS: undefined, UPCOMING_CACHE_TTL_SECONDS: "45" }, () => {
    assert.equal(upcomingCacheTtlMs(), 45_000);
  });
  withEnv({ UPCOMING_CACHE_TTL_MS: "12000", UPCOMING_CACHE_TTL_SECONDS: undefined }, () => {
    assert.equal(upcomingCacheTtlMs(), 12_000);
  });
  withEnv({ UPCOMING_CACHE_TTL_MS: undefined, UPCOMING_CACHE_TTL_SECONDS: "0" }, () => {
    assert.equal(upcomingCacheTtlMs(), UPCOMING_CACHE_TTL_MS);
  });
  withEnv({ UPCOMING_CACHE_TTL_MS: "nope", UPCOMING_CACHE_TTL_SECONDS: undefined }, () => {
    assert.equal(upcomingCacheTtlMs(), UPCOMING_CACHE_TTL_MS);
  });
});

test("Steam appdetails timeouts and fallback default to conservative values", () => {
  withEnv(
    {
      STEAM_APPDETAILS_TIMEOUT_MS: undefined,
      STEAM_APPDETAILS_FALLBACK: undefined,
      STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS: undefined,
      STEAM_APPDETAILS_CONCURRENCY: undefined,
      STEAM_APPDETAILS_MIN_INTERVAL_MS: undefined,
    },
    () => {
      assert.equal(steamAppDetailsTimeoutMs(), STEAM_APPDETAILS_TIMEOUT_MS);
      assert.equal(steamAppDetailsFallbackTimeoutMs(), STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS);
      assert.equal(steamAppDetailsFallbackEnabled(), true);
      assert.equal(steamAppDetailsConcurrency(), STEAM_APPDETAILS_CONCURRENCY);
      assert.equal(steamAppDetailsMinIntervalMs(), STEAM_APPDETAILS_MIN_INTERVAL_MS);
    }
  );
});

test("Steam appdetails env overrides are bounded and parsed", () => {
  withEnv(
    {
      STEAM_APPDETAILS_TIMEOUT_MS: "7000",
      STEAM_APPDETAILS_FALLBACK: "false",
      STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS: "1500",
      STEAM_APPDETAILS_CONCURRENCY: "9",
      STEAM_APPDETAILS_MIN_INTERVAL_MS: "30",
    },
    () => {
      assert.equal(steamAppDetailsTimeoutMs(), 7000);
      assert.equal(steamAppDetailsFallbackEnabled(), false);
      assert.equal(steamAppDetailsFallbackTimeoutMs(), 1500);
      assert.equal(steamAppDetailsConcurrency(), 9);
      assert.equal(steamAppDetailsMinIntervalMs(), 30);
    }
  );

  withEnv(
    {
      STEAM_APPDETAILS_TIMEOUT_MS: "0",
      STEAM_APPDETAILS_FALLBACK: "nope",
      STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS: "-1",
      STEAM_APPDETAILS_CONCURRENCY: "99",
      STEAM_APPDETAILS_MIN_INTERVAL_MS: "-1",
    },
    () => {
      assert.equal(steamAppDetailsTimeoutMs(), STEAM_APPDETAILS_TIMEOUT_MS);
      assert.equal(steamAppDetailsFallbackEnabled(), true);
      assert.equal(steamAppDetailsFallbackTimeoutMs(), STEAM_APPDETAILS_FALLBACK_TIMEOUT_MS);
      assert.equal(steamAppDetailsConcurrency(), 10);
      assert.equal(steamAppDetailsMinIntervalMs(), STEAM_APPDETAILS_MIN_INTERVAL_MS);
    }
  );

  withEnv(
    {
      STEAM_APPDETAILS_MIN_INTERVAL_MS: "0",
    },
    () => {
      assert.equal(steamAppDetailsMinIntervalMs(), 0);
    }
  );

  withEnv(
    {
      STEAM_APPDETAILS_MIN_INTERVAL_MS: String(STEAM_APPDETAILS_MIN_INTERVAL_MAX_MS + 1),
    },
    () => {
      assert.equal(steamAppDetailsMinIntervalMs(), STEAM_APPDETAILS_MIN_INTERVAL_MAX_MS);
    }
  );
});

test("wishlist page fetch defaults to fallback only when JSON API is not usable", () => {
  withEnv({ WISHLIST_PAGE_FALLBACK_ENABLED: undefined }, () => {
    assert.equal(wishlistPageFallbackEnabled(), WISHLIST_PAGE_FALLBACK_DEFAULT_ENABLED);
    assert.equal(
      shouldFetchWishlistPage({ ok: true, private: false, items: [{ appid: 440 }], count: 1 }),
      false
    );
  });
});

test("wishlist page fallback can be explicitly enabled", () => {
  withEnv({ WISHLIST_PAGE_FALLBACK_ENABLED: "true" }, () => {
    assert.equal(wishlistPageFallbackEnabled(), true);
    assert.equal(
      shouldFetchWishlistPage({ ok: true, private: false, items: [{ appid: 440 }], count: 1 }),
      true
    );
  });
});

test("wishlist page fallback handles private, empty, and failed API states", () => {
  withEnv({ WISHLIST_PAGE_FALLBACK_ENABLED: undefined }, () => {
    const privateEmpty: ApiWishlistResult = {
      ok: true,
      private: true,
      items: [],
      count: 0,
    };
    const knownEmpty: ApiWishlistResult = {
      ok: true,
      private: false,
      items: [],
      count: 0,
    };
    const failed: ApiWishlistResult = {
      ok: false,
      private: false,
      items: [],
      count: null,
    };

    assert.equal(shouldFetchWishlistPage(privateEmpty), false);
    assert.equal(shouldFetchWishlistPage(knownEmpty), false);
    assert.equal(shouldFetchWishlistPage(failed), true);
  });
});
