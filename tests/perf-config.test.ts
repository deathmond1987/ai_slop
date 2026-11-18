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
  STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS,
  STEAM_APPDETAILS_RETRY_QUEUE_MAX,
  STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX,
  STEAM_APPDETAILS_TIMEOUT_MS,
  steamAppDetailsConcurrency,
  steamAppDetailsDebugParamsEnabled,
  steamAppDetailsDownloadParams,
  steamAppDetailsFallbackEnabled,
  steamAppDetailsFallbackTimeoutMs,
  steamAppDetailsMaxAttempts,
  steamAppDetailsMinIntervalMs,
  steamAppDetailsRetryEnabled,
  steamAppDetailsRetryMaxAttempts,
  steamAppDetailsRetryQueueMax,
  steamAppDetailsRetrySteamIdsMax,
  steamAppDetailsTimeoutMs,
  STEAM_STORE_RATE_LIMIT_COOLDOWN_MS,
  STEAM_STORE_RATE_LIMIT_MAX_REQUESTS,
  STEAM_STORE_RATE_LIMIT_MAX_WAIT_MS,
  STEAM_STORE_RATE_LIMIT_MIN_INTERVAL_MS,
  STEAM_STORE_RATE_LIMIT_WINDOW_MS,
  steamStoreRateLimitCooldownMs,
  steamStoreRateLimitEnabled,
  steamStoreRateLimitMaxRequests,
  steamStoreRateLimitMaxWaitMs,
  steamStoreRateLimitMinIntervalMs,
  steamStoreRateLimitWindowMs,
} from "../lib/steam-core.ts";
import {
  EARLY_ACCESS_DEFAULT_DETAILS_MAX,
  EARLY_ACCESS_DETAILS_MAX_LIMIT,
  earlyAccessDetailsMax,
} from "../lib/early-access-core.ts";
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

test("Steam Store rate limit defaults are conservative", () => {
  withEnv(
    {
      STEAM_STORE_RATE_LIMIT_MAX_REQUESTS: undefined,
      STEAM_STORE_RATE_LIMIT_WINDOW_MS: undefined,
      STEAM_STORE_RATE_LIMIT_MIN_INTERVAL_MS: undefined,
      STEAM_STORE_RATE_LIMIT_COOLDOWN_MS: undefined,
      STEAM_STORE_RATE_LIMIT_MAX_WAIT_MS: undefined,
    },
    () => {
      assert.equal(steamStoreRateLimitMaxRequests(), STEAM_STORE_RATE_LIMIT_MAX_REQUESTS);
      assert.equal(steamStoreRateLimitEnabled(), true);
      assert.equal(steamStoreRateLimitWindowMs(), STEAM_STORE_RATE_LIMIT_WINDOW_MS);
      assert.equal(steamStoreRateLimitMinIntervalMs(), STEAM_STORE_RATE_LIMIT_MIN_INTERVAL_MS);
      assert.equal(steamStoreRateLimitCooldownMs(), STEAM_STORE_RATE_LIMIT_COOLDOWN_MS);
      assert.equal(steamStoreRateLimitMaxWaitMs(), STEAM_STORE_RATE_LIMIT_MAX_WAIT_MS);
    }
  );
});

test("Steam Store rate limit env overrides are parsed and can disable pacing", () => {
  withEnv(
    {
      STEAM_STORE_RATE_LIMIT_MAX_REQUESTS: "25",
      STEAM_STORE_RATE_LIMIT_WINDOW_MS: "60000",
      STEAM_STORE_RATE_LIMIT_MIN_INTERVAL_MS: "2000",
      STEAM_STORE_RATE_LIMIT_COOLDOWN_MS: "10000",
      STEAM_STORE_RATE_LIMIT_MAX_WAIT_MS: "1200",
    },
    () => {
      assert.equal(steamStoreRateLimitMaxRequests(), 25);
      assert.equal(steamStoreRateLimitEnabled(), true);
      assert.equal(steamStoreRateLimitWindowMs(), 60000);
      assert.equal(steamStoreRateLimitMinIntervalMs(), 2000);
      assert.equal(steamStoreRateLimitCooldownMs(), 10000);
      assert.equal(steamStoreRateLimitMaxWaitMs(), 1200);
    }
  );

  withEnv(
    {
      STEAM_STORE_RATE_LIMIT_MAX_REQUESTS: "0",
    },
    () => {
      assert.equal(steamStoreRateLimitMaxRequests(), 0);
      assert.equal(steamStoreRateLimitEnabled(), false);
    }
  );
});

test("early access details max restores a finite bounded default", () => {
  withEnv({ EARLY_ACCESS_DETAILS_MAX: undefined }, () => {
    assert.equal(earlyAccessDetailsMax(), EARLY_ACCESS_DEFAULT_DETAILS_MAX);
  });

  withEnv({ EARLY_ACCESS_DETAILS_MAX: "120" }, () => {
    assert.equal(earlyAccessDetailsMax(), 120);
  });

  withEnv({ EARLY_ACCESS_DETAILS_MAX: String(EARLY_ACCESS_DETAILS_MAX_LIMIT + 1) }, () => {
    assert.equal(earlyAccessDetailsMax(), EARLY_ACCESS_DETAILS_MAX_LIMIT);
  });

  withEnv({ EARLY_ACCESS_DETAILS_MAX: "0" }, () => {
    assert.equal(earlyAccessDetailsMax(), EARLY_ACCESS_DEFAULT_DETAILS_MAX);
  });
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

test("Steam appdetails retry config defaults are bounded", () => {
  withEnv(
    {
      STEAM_APPDETAILS_FALLBACK: undefined,
      STEAM_APPDETAILS_RETRY: undefined,
      STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS: undefined,
      STEAM_APPDETAILS_RETRY_QUEUE_MAX: undefined,
      STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX: undefined,
    },
    () => {
      assert.equal(steamAppDetailsRetryEnabled(), true);
      assert.equal(steamAppDetailsRetryMaxAttempts(), STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS);
      assert.equal(steamAppDetailsRetryQueueMax(), STEAM_APPDETAILS_RETRY_QUEUE_MAX);
      assert.equal(steamAppDetailsRetrySteamIdsMax(), STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX);
      assert.equal(steamAppDetailsMaxAttempts("US"), 2);
      assert.equal(steamAppDetailsMaxAttempts(null), 3);
    }
  );
});

test("Steam appdetails retry max attempts follows fallback state", () => {
  withEnv(
    {
      STEAM_APPDETAILS_FALLBACK: "false",
      STEAM_APPDETAILS_RETRY: "true",
      STEAM_APPDETAILS_RETRY_MAX_ATTEMPTS: undefined,
      STEAM_APPDETAILS_RETRY_QUEUE_MAX: "50",
      STEAM_APPDETAILS_RETRY_STEAM_IDS_MAX: "5",
    },
    () => {
      assert.equal(steamAppDetailsFallbackEnabled(), false);
      assert.equal(steamAppDetailsMaxAttempts("US"), 1);
      assert.equal(steamAppDetailsMaxAttempts(null), 1);
      assert.equal(steamAppDetailsRetryQueueMax(), 50);
      assert.equal(steamAppDetailsRetrySteamIdsMax(), 5);
    }
  );
});

test("Steam appdetails download params hide debug state by default and expose when debug is enabled", () => {
  withEnv(
    {
      APP_DEBUG: undefined,
      DOWNLOAD_PARAMS_DEBUG: undefined,
    },
    () => {
      assert.equal(steamAppDetailsDebugParamsEnabled(), false);
      assert.equal(steamAppDetailsDownloadParams().debugEnabled, false);
    }
  );

  withEnv(
    {
      APP_DEBUG: "true",
      DOWNLOAD_PARAMS_DEBUG: undefined,
    },
    () => {
      assert.equal(steamAppDetailsDebugParamsEnabled(), true);
      assert.equal(steamAppDetailsDownloadParams().debugEnabled, true);
    }
  );

  withEnv(
    {
      APP_DEBUG: undefined,
      DOWNLOAD_PARAMS_DEBUG: "true",
    },
    () => {
      assert.equal(steamAppDetailsDebugParamsEnabled(), true);
      assert.equal(steamAppDetailsDownloadParams().debugEnabled, true);
    }
  );
});
