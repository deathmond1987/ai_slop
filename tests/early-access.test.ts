import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEarlyAccessAppDetails,
  createEarlyAccessCatalogStatus,
  createEarlyAccessCatalogStatusFromDb,
  earlyAccessCatalogCacheKey,
  earlyAccessLookupValidateMax,
  earlyAccessMaxPages,
  earlyAccessPageSize,
  earlyAccessSearchSort,
  earlyAccessSearchUrl,
  earlyAccessStoreCc,
  inferEarlyAccessFetchComplete,
  EARLY_ACCESS_CATALOG_STATE_SELECT_SQL,
  EARLY_ACCESS_CATALOG_STATE_TABLE_NAME,
  EARLY_ACCESS_CATALOG_STATE_TABLE_SQL,
  EARLY_ACCESS_CATALOG_STATE_UPSERT_SQL,
  EARLY_ACCESS_EXPERIMENTAL_DELETE_ONE_SQL,
  EARLY_ACCESS_EXPERIMENTAL_DELETE_SQL,
  EARLY_ACCESS_EXPERIMENTAL_LIST_SQL,
  EARLY_ACCESS_EXPERIMENTAL_TABLE_SQL,
  EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL,
  EARLY_ACCESS_OWNED_CACHE_PREFIX,
  hasEarlyAccessGenre,
  isEarlyAccessConfirmedAppDetails,
  isEarlyAccessConfirmedGame,
  normalizeEarlyAccessGame,
  parseAppIdList,
  parseEarlyAccessSearchPage,
  shouldFetchNextEarlyAccessPage,
} from "../lib/early-access-core.ts";

function withEnv<T>(name: string, value: string, fn: () => T): T {
  const old = process.env[name];
  process.env[name] = value;
  try {
    return fn();
  } finally {
    if (old === undefined) delete process.env[name];
    else process.env[name] = old;
  }
}

test("earlyAccessStoreCc normalizes session storeCc before defaults", () => {
  assert.equal(earlyAccessStoreCc("DE"), "de");
  assert.equal(earlyAccessStoreCc("  kZ  "), "kz");
  assert.equal(earlyAccessStoreCc("invalid"), "us");
});

test("earlyAccessCatalogCacheKey is regionalized", () => {
  assert.equal(earlyAccessCatalogCacheKey("DE"), "earlyaccess:catalog:de");
  assert.equal(earlyAccessCatalogCacheKey(null), "earlyaccess:catalog:us");
});

test("earlyAccessPageSize clamps to Steam search limits", () => {
  assert.equal(earlyAccessPageSize(50), 50);
  assert.equal(earlyAccessPageSize("200"), 100);
  assert.equal(earlyAccessPageSize("0"), 100);
  assert.equal(earlyAccessPageSize(null), 100);
});

test("earlyAccessSearchSort keeps safe sort values and rejects injection", () => {
  assert.equal(earlyAccessSearchSort("REVIEW_DESC"), "review_desc");
  assert.equal(earlyAccessSearchSort("reviews_desc"), "reviews_desc");
  assert.equal(earlyAccessSearchSort("reviews desc"), "reviews_desc");
  assert.equal(earlyAccessSearchSort("reviews*"), "reviews_desc");
});

test("earlyAccessMaxPages respects bounded environment override", () => {
  assert.equal(
    withEnv("EARLY_ACCESS_MAX_PAGES", "3", () => earlyAccessMaxPages()),
    3
  );
  assert.equal(
    withEnv("EARLY_ACCESS_MAX_PAGES", "100", () => earlyAccessMaxPages()),
    20
  );
});

test("earlyAccessLookupValidateMax respects bounded environment override", () => {
  assert.equal(earlyAccessLookupValidateMax(), 100);
  assert.equal(
    withEnv("EARLY_ACCESS_LOOKUP_VALIDATE_MAX", "5", () => earlyAccessLookupValidateMax()),
    5
  );
  assert.equal(
    withEnv("EARLY_ACCESS_LOOKUP_VALIDATE_MAX", "1000", () => earlyAccessLookupValidateMax()),
    200
  );
});

test("early access genre helpers confirm current EA membership", () => {
  assert.equal(hasEarlyAccessGenre(["Action", " Early Access "]), true);
  assert.equal(hasEarlyAccessGenre(["Action"]), false);
  assert.equal(isEarlyAccessConfirmedAppDetails({ genres: [{ description: "Early Access" }] }), true);
  assert.equal(isEarlyAccessConfirmedAppDetails({ genres: [{ description: "Action" }] }), false);
  assert.equal(isEarlyAccessConfirmedAppDetails({ genres: [] }), false);
  assert.equal(isEarlyAccessConfirmedAppDetails({}), null);
  assert.equal(isEarlyAccessConfirmedAppDetails(null), null);
});

test("applyEarlyAccessAppDetails stores genres and lets non-EA entries be filtered", () => {
  const base = normalizeEarlyAccessGame({ appid: 362890, name: null, playtime_forever: 60 });
  const enriched = applyEarlyAccessAppDetails(base, {
    name: "Black Mesa",
    header_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/362890/header.jpg",
    genres: [
      { description: "Action" },
      { description: "Adventure" },
      { description: "Indie" },
    ],
  });

  assert.equal(enriched.name, "Black Mesa");
  assert.deepEqual(enriched.steamGenres, ["Action", "Adventure", "Indie"]);
  assert.equal(isEarlyAccessConfirmedGame(enriched), false);
  assert.equal(isEarlyAccessConfirmedGame(normalizeEarlyAccessGame({ appid: 1 })), null);
});

test("parseAppIdList parses numbers from query strings", () => {
  assert.deepEqual(parseAppIdList("123,456 789"), [123, 456, 789]);
  assert.deepEqual(parseAppIdList(["5", 10, "bad"]), [5, 10]);
  assert.deepEqual(parseAppIdList("0,-1,1.2"), []);
  assert.deepEqual(parseAppIdList("0,-1,1"), [1]);
  assert.deepEqual(parseAppIdList(null), []);
});

test("parseEarlyAccessSearchPage reads Steam search appids and total_count", () => {
  const page = parseEarlyAccessSearchPage({
    total_count: "19330",
    results_html: `
      <div class="search_result_row" data-ds-appid="892660">Valheim</div>
      <div class="search_result_row" data-ds-appid="252490">Rust</div>
      <a href="https://store.steampowered.com/app/17340">Enshrouded</a>
    `,
  });

  assert.deepEqual(page.appids, [892660, 252490, 17340]);
  assert.equal(page.itemCount, 3);
  assert.equal(page.totalCount, 19330);
});

test("parseEarlyAccessSearchPage supports structured item entries", () => {
  const page = parseEarlyAccessSearchPage({
    totalCount: 12,
    items: [{ appid: 10 }, { appId: 20 }, { logo: "https://cdn/.../capsule_616x353.jpg", url: "/app/30/game/" }],
  });

  assert.deepEqual(page.appids, [10, 20, 30]);
  assert.equal(page.totalCount, 12);
});

test("shouldFetchNextEarlyAccessPage stops at total_count and max pages", () => {
  assert.equal(
    shouldFetchNextEarlyAccessPage({
      start: 0,
      pageCount: 1,
      itemCount: 100,
      pageSize: 100,
      totalCount: 250,
      maxPages: 8,
    }),
    true
  );

  assert.equal(
    shouldFetchNextEarlyAccessPage({
      start: 200,
      pageCount: 3,
      itemCount: 100,
      pageSize: 100,
      totalCount: 250,
      maxPages: 8,
    }),
    false
  );

  assert.equal(
    shouldFetchNextEarlyAccessPage({
      start: 0,
      pageCount: 8,
      itemCount: 100,
      pageSize: 100,
      totalCount: undefined,
      maxPages: 8,
    }),
    false
  );

  assert.equal(
    shouldFetchNextEarlyAccessPage({
      start: 0,
      pageCount: 1,
      itemCount: 42,
      pageSize: 100,
      totalCount: undefined,
      maxPages: 8,
    }),
    false
  );
});

test("earlyAccessSearchUrl builds bounded tag 493 infinite search requests", () => {
  const url = earlyAccessSearchUrl("DE", 200, 100, { sort: "reviews_desc" });
  assert.equal(url.pathname, "/search/results/");
  assert.equal(url.searchParams.get("tags"), "493");
  assert.equal(url.searchParams.get("cc"), "de");
  assert.equal(url.searchParams.get("count"), "100");
  assert.equal(url.searchParams.get("start"), "200");
  assert.equal(url.searchParams.get("infinite"), "1");
  assert.equal(url.searchParams.get("filters"), "reviews_desc");
});

test("applyEarlyAccessAppDetails enriches fallback app names with appdetails", () => {
  const base = normalizeEarlyAccessGame({ appid: 2694490, name: null, playtime_forever: 12 });
  const enriched = applyEarlyAccessAppDetails(base, {
    name: " Path of Exile 2 ",
    type: "Game",
    is_free: false,
    header_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2694490/header.jpg",
    price_overview: { currency: "USD", final_formatted: "$39.99" },
    release_date: { date: "Dec 11, 2024", coming_soon: false },
  });

  assert.equal(enriched.name, "Path of Exile 2");
  assert.equal(enriched.steamType, "Game");
  assert.equal(enriched.isFree, false);
  assert.equal(enriched.headerImage, "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2694490/header.jpg");
  assert.equal(enriched.playtimeForever, 12);
  assert.equal(enriched.releaseDate, "2024-12-11");
  assert.equal(enriched.releaseYear, 2024);
  assert.deepEqual(enriched.price, { currency: "USD", final_formatted: "$39.99" });
});

test("applyEarlyAccessAppDetails leaves coming soon releases without exact date", () => {
  const base = normalizeEarlyAccessGame({ appid: 3230960, name: "Steam App 3230960", playtime_forever: 0 });
  const enriched = applyEarlyAccessAppDetails(base, {
    name: "Some Upcoming Game",
    header_image: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3230960/header.jpg",
    release_date: { date: "Nov 2026", coming_soon: true },
  });

  assert.equal(enriched.name, "Some Upcoming Game");
  assert.equal(enriched.headerImage, "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3230960/header.jpg");
  assert.equal(enriched.releaseDate, undefined);
  assert.equal(enriched.releaseYear, 2026);
});

test("createEarlyAccessCatalogStatus reports partial and merge warnings", () => {
  const status = createEarlyAccessCatalogStatus({
    storeCc: "de",
    indexedCount: 800,
    checkedAt: 123,
    pagesFetched: 8,
    totalKnown: 19330,
    warnings: ["early_access_page_cap"],
  });

  assert.equal(status.ready, true);
  assert.equal(status.partial, true);
  assert.deepEqual(status.warnings, [
    "early_access_page_cap",
    "early_access_index_partial",
  ]);
});

test("createEarlyAccessCatalogStatus honours explicit incomplete coverage", () => {
  const incomplete = createEarlyAccessCatalogStatus({
    storeCc: "kz",
    indexedCount: 798,
    checkedAt: 1000,
    pagesFetched: 0,
    complete: false,
  });

  assert.equal(incomplete.ready, true);
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.partial, true);
  assert.ok(incomplete.warnings.includes("early_access_index_partial"));
});

test("createEarlyAccessCatalogStatus honours explicit complete coverage", () => {
  const complete = createEarlyAccessCatalogStatus({
    storeCc: "kz",
    indexedCount: 798,
    checkedAt: 1000,
    pagesFetched: 8,
    totalKnown: 798,
    complete: true,
  });

  assert.equal(complete.complete, true);
  assert.equal(complete.partial, false);
  assert.ok(!complete.warnings.includes("early_access_index_partial"));
});

test("createEarlyAccessCatalogStatusFromDb treats legacy catalogs without state as partial", () => {
  const status = createEarlyAccessCatalogStatusFromDb({
    storeCc: "kz",
    meta: { appid_count: "798", checked_at: 1000 },
  });

  assert.equal(status.ready, true);
  assert.equal(status.indexedCount, 798);
  assert.equal(status.pagesFetched, 0);
  assert.equal(status.totalKnown, undefined);
  assert.equal(status.complete, false);
  assert.equal(status.partial, true);
  assert.ok(status.warnings.includes("early_access_index_partial"));
});

test("createEarlyAccessCatalogStatusFromDb keeps persisted incomplete coverage partial", () => {
  const status = createEarlyAccessCatalogStatusFromDb({
    storeCc: "kz",
    meta: { appid_count: 800, checked_at: 1000 },
    state: {
      indexed_count: 798,
      total_known: 1933,
      pages_fetched: 8,
      complete: 0,
      checked_at: 900,
    },
  });

  assert.equal(status.indexedCount, 800);
  assert.equal(status.checkedAt, 1000);
  assert.equal(status.totalKnown, 1933);
  assert.equal(status.pagesFetched, 8);
  assert.equal(status.complete, false);
  assert.equal(status.partial, true);
  assert.ok(status.warnings.includes("early_access_index_partial"));
});

test("createEarlyAccessCatalogStatusFromDb keeps complete coverage until counts drift", () => {
  const complete = createEarlyAccessCatalogStatusFromDb({
    storeCc: "kz",
    meta: { appid_count: 1933, checked_at: 1000 },
    state: {
      indexed_count: 1933,
      total_known: 1933,
      pages_fetched: 20,
      complete: 1,
      checked_at: 1000,
    },
  });

  assert.equal(complete.complete, true);
  assert.equal(complete.partial, false);
  assert.ok(!complete.warnings.includes("early_access_index_partial"));

  const backfilled = createEarlyAccessCatalogStatusFromDb({
    storeCc: "kz",
    meta: { appid_count: 2100, checked_at: 2000 },
    state: {
      indexed_count: 1933,
      total_known: 1933,
      pages_fetched: 20,
      complete: 1,
      checked_at: 1000,
    },
  });

  assert.equal(backfilled.indexedCount, 2100);
  assert.equal(backfilled.complete, false);
  assert.equal(backfilled.partial, true);
  assert.ok(backfilled.warnings.includes("early_access_index_partial"));
});

test("createEarlyAccessCatalogStatusFromDb reports empty catalogs without an index", () => {
  const status = createEarlyAccessCatalogStatusFromDb({ storeCc: "kz" });

  assert.equal(status.ready, false);
  assert.equal(status.indexedCount, 0);
  assert.equal(status.complete, false);
  assert.ok(status.warnings.includes("early_access_index_empty"));

  const confirmedEmpty = createEarlyAccessCatalogStatusFromDb({
    storeCc: "kz",
    state: {
      indexed_count: 0,
      total_known: 0,
      pages_fetched: 1,
      complete: 1,
      checked_at: 5,
    },
  });

  assert.equal(confirmedEmpty.ready, false);
  assert.equal(confirmedEmpty.complete, true);
  assert.equal(confirmedEmpty.partial, false);
});

test("inferEarlyAccessFetchComplete requires full coverage against Steam totals", () => {
  assert.equal(
    inferEarlyAccessFetchComplete({
      indexedCount: 1933,
      existingIndexedCount: 0,
      totalKnown: 1933,
      pagesFetched: 20,
      maxPages: 260,
      pageSize: 100,
      lastItemCount: 33,
    }),
    true
  );

  assert.equal(
    inferEarlyAccessFetchComplete({
      indexedCount: 798,
      existingIndexedCount: 0,
      totalKnown: 1933,
      pagesFetched: 8,
      maxPages: 8,
      pageSize: 100,
      lastItemCount: 100,
    }),
    false
  );

  assert.equal(
    inferEarlyAccessFetchComplete({
      indexedCount: 1933,
      existingIndexedCount: 2500,
      totalKnown: 1933,
      pagesFetched: 1,
      maxPages: 260,
      pageSize: 100,
      lastItemCount: 1,
    }),
    false
  );
});

test("inferEarlyAccessFetchComplete falls back to page signals without Steam totals", () => {
  assert.equal(
    inferEarlyAccessFetchComplete({
      indexedCount: 798,
      existingIndexedCount: 0,
      pagesFetched: 8,
      maxPages: 8,
      pageSize: 100,
      lastItemCount: 100,
    }),
    false
  );

  assert.equal(
    inferEarlyAccessFetchComplete({
      indexedCount: 798,
      existingIndexedCount: 0,
      pagesFetched: 8,
      maxPages: 260,
      pageSize: 100,
      lastItemCount: 42,
    }),
    true
  );

  assert.equal(
    inferEarlyAccessFetchComplete({
      indexedCount: 798,
      existingIndexedCount: 798,
      pagesFetched: 1,
      maxPages: 260,
      pageSize: 100,
      lastItemCount: 0,
    }),
    false
  );

  assert.equal(
    inferEarlyAccessFetchComplete({
      indexedCount: 798,
      existingIndexedCount: 798,
      pagesFetched: 2,
      maxPages: 260,
      pageSize: 100,
      lastItemCount: 0,
    }),
    true
  );
});

test("early access catalog state table is regional and idempotent", () => {
  assert.equal(EARLY_ACCESS_CATALOG_STATE_TABLE_NAME, "early_access_catalog_state");
  assert.match(
    EARLY_ACCESS_CATALOG_STATE_TABLE_SQL,
    /CREATE TABLE IF NOT EXISTS early_access_catalog_state/
  );
  assert.match(EARLY_ACCESS_CATALOG_STATE_TABLE_SQL, /store_cc TEXT PRIMARY KEY/);
  assert.match(EARLY_ACCESS_CATALOG_STATE_TABLE_SQL, /complete INTEGER NOT NULL DEFAULT 0/);
  assert.match(
    EARLY_ACCESS_CATALOG_STATE_SELECT_SQL,
    /FROM early_access_catalog_state\s+WHERE store_cc = \?/
  );
  assert.match(EARLY_ACCESS_CATALOG_STATE_UPSERT_SQL, /ON CONFLICT\(store_cc\) DO UPDATE SET/);
  assert.match(
    EARLY_ACCESS_CATALOG_STATE_UPSERT_SQL,
    /total_known = COALESCE\(excluded\.total_known, early_access_catalog_state\.total_known\)/
  );
});

test("experimental early access storage and cache constants are user-scoped", () => {
  assert.equal(EARLY_ACCESS_OWNED_CACHE_PREFIX, "earlyaccess:owned:details:v4:");
  assert.match(
    EARLY_ACCESS_EXPERIMENTAL_TABLE_SQL,
    /steam_id TEXT NOT NULL REFERENCES users\(steam_id\) ON DELETE CASCADE/
  );
  assert.match(
    EARLY_ACCESS_EXPERIMENTAL_TABLE_SQL,
    /PRIMARY KEY \(steam_id, store_cc, appid\)/
  );
  assert.match(
    EARLY_ACCESS_EXPERIMENTAL_LIST_SQL,
    /WHERE steam_id = \? AND store_cc = \?/
  );
  assert.match(EARLY_ACCESS_EXPERIMENTAL_DELETE_SQL, /WHERE steam_id = \?/);
  assert.match(
    EARLY_ACCESS_EXPERIMENTAL_DELETE_ONE_SQL,
    /WHERE steam_id = \? AND store_cc = \? AND appid = \?/
  );
  assert.match(
    EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL,
    /ON CONFLICT \(steam_id, store_cc, appid\)/
  );
});