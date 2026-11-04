import test from "node:test";
import assert from "node:assert/strict";
import {
  addOwnedCandidates,
  applyAppDetails,
  applyReleaseFilters,
  initializeCandidatesFromWishlist,
  MAX_DETAIL_CANDIDATES,
  needsAppDetails,
  removeUnknownLibraryOnly,
  selectDetailCandidates,
  selectRawgTargets,
  SMALL_LIBRARY_BASE_SCORE,
  type ScratchGame,
} from "../lib/upcoming-candidates.ts";

function scratch(overrides: Partial<ScratchGame>): ScratchGame {
  return {
    appid: 1,
    name: "Game",
    sources: ["wishlist"],
    releaseDate: null,
    dateSource: "unknown",
    steamUrl: "https://store.steampowered.com/app/1/",
    ...overrides,
  };
}

test("wishlist placeholder year-end candidates are demoted and still selected for appdetails", () => {
  const result = initializeCandidatesFromWishlist({
    items: [
      {
        appid: 2439280,
        title: "Clockwork Revolution",
        releaseDateText: "2027-12-31",
        coverImage: "https://example.invalid/cover.jpg",
      },
    ],
    private: false,
    totalKnown: 1,
    details: [],
  });

  const game = result.map.get(2439280);
  assert.ok(game);
  assert.equal(game?.name, "Clockwork Revolution");
  assert.equal(game?.dateSource, "steamYear");
  assert.equal(game?.releaseYear, 2027);
  assert.equal(game?.releaseDate, null);
  assert.equal(game?.wishlistDateText, "2027-12-31");
  assert.ok(needsAppDetails(game, "2026-11-03"));
  assert.ok(selectDetailCandidates(result, "2026-11-03").includes(2439280));
});

test("Steam year-only appdetails keep candidates as year-only after placeholder demotion", () => {
  const result = initializeCandidatesFromWishlist({
    items: [
      {
        appid: 2439280,
        title: "Clockwork Revolution",
        releaseDateText: "2027-12-31",
        coverImage: "https://example.invalid/cover.jpg",
      },
    ],
    private: false,
    totalKnown: 1,
    details: [],
  });

  applyAppDetails(result.map, 2439280, {
    name: "Clockwork Revolution",
    type: "game",
    release_date: { date: "2027", coming_soon: true },
  });

  const game = result.map.get(2439280);
  assert.ok(game);
  assert.equal(game?.dateSource, "steamYear");
  assert.equal(game?.releaseYear, 2027);
  assert.equal(game?.releaseDate, null);
});

test("appdetails DLC entries are removed from candidates", () => {
  const map = new Map<number, ScratchGame>();
  map.set(123, scratch({ appid: 123, name: "Base Game" }));
  applyAppDetails(map, 123, { type: "DLC", name: "DLC" });
  assert.equal(map.size, 0);
});

test("release filters remove old Steam year-only candidates only", () => {
  const map = new Map<number, ScratchGame>();
  map.set(1, scratch({ appid: 1, dateSource: "steamYear", releaseYear: 2024 }));
  map.set(2, scratch({ appid: 2, dateSource: "steamYear", releaseYear: 2027 }));
  map.set(3, scratch({ appid: 3, dateSource: "rawg", releaseDate: "2024-05-01" }));

  applyReleaseFilters(map, "2027-01-01");
  assert.equal(map.has(1), false);
  assert.equal(map.has(2), true);
  assert.equal(map.has(3), true);
});

test("RAWG target selection only chooses unknown non-fallback candidates", () => {
  const result = initializeCandidatesFromWishlist({
    items: [
      { appid: 1, title: "Known Steam game", releaseDateText: "May 28, 2026" },
      { appid: 2, title: "App 2" },
      { appid: 3, title: "Unknown title" },
    ],
    private: false,
    totalKnown: 3,
    details: [],
  });

  const targets = selectRawgTargets(result.map, result.candidateScores);
  assert.deepEqual(
    targets.map((game) => game.appid),
    [3]
  );
});

test("small library owned candidates are ranked and capped by detail budget", () => {
  const nowMs = Date.parse("2026-11-03T00:00:00.000Z");
  const result = initializeCandidatesFromWishlist({
    items: Array.from({ length: 200 }, (_, index) => ({
      appid: index + 1,
      title: `Wishlist ${index + 1}`,
      releaseDateText: "May 28, 2027",
    })),
    private: false,
    totalKnown: 200,
    details: [],
  });

  const highAppidOwned = Array.from({ length: 50 }, (_, index) => ({
    appid: 2_100_000 + index,
    name: `High recent owned ${index}`,
    playtime_forever: 0,
    time_created: Math.floor(nowMs / 1000),
  }));
  const lowPlayedOwned = Array.from({ length: 100 }, (_, index) => ({
    appid: 1000 + index,
    name: `Old low played owned ${index}`,
    playtime_forever: 100,
    time_created: Math.floor((nowMs - 800 * 24 * 60 * 60 * 1000) / 1000),
  }));

  const addedAll = addOwnedCandidates(result, [...highAppidOwned, ...lowPlayedOwned], nowMs);

  assert.equal(addedAll, false);
  assert.equal(result.map.size, MAX_DETAIL_CANDIDATES);
  assert.equal(result.candidateScores.size, MAX_DETAIL_CANDIDATES);
  for (const owned of highAppidOwned) {
    assert.ok(result.map.has(owned.appid));
    assert.equal(result.candidateScores.get(owned.appid), 11000);
  }
  for (const owned of lowPlayedOwned) {
    assert.equal(result.map.has(owned.appid), false);
  }
});

test("small library owned candidates are added when they fit inside the detail budget", () => {
  const nowMs = Date.parse("2026-11-03T00:00:00.000Z");
  const result = initializeCandidatesFromWishlist({
    items: Array.from({ length: 50 }, (_, index) => ({
      appid: index + 1,
      title: `Wishlist ${index + 1}`,
    })),
    private: false,
    totalKnown: 50,
    details: [],
  });

  const lowPlayedOwned = Array.from({ length: 100 }, (_, index) => ({
    appid: 1000 + index,
    name: `Old low played owned ${index}`,
    playtime_forever: 100,
    time_created: Math.floor((nowMs - 800 * 24 * 60 * 60 * 1000) / 1000),
  }));

  const addedAll = addOwnedCandidates(result, lowPlayedOwned, nowMs);

  assert.equal(addedAll, true);
  assert.equal(result.map.size, 150);
  assert.equal(result.candidateScores.size, 150);
  assert.equal(result.candidateScores.get(1000), SMALL_LIBRARY_BASE_SCORE);
});

test("RAWG target selection excludes unknown library-only candidates", () => {
  const nowMs = Date.parse("2026-11-03T00:00:00.000Z");
  const result = initializeCandidatesFromWishlist({
    items: [{ appid: 2, title: "Unknown wishlist title" }],
    private: false,
    totalKnown: 1,
    details: [],
  });

  addOwnedCandidates(
    result,
    [
      {
        appid: 1,
        name: "Unknown library title",
        playtime_forever: 100,
        time_created: Math.floor((nowMs - 800 * 24 * 60 * 60 * 1000) / 1000),
      },
    ],
    nowMs
  );

  assert.ok(result.map.has(1));
  assert.ok(result.map.has(2));
  assert.deepEqual(
    selectRawgTargets(result.map, result.candidateScores).map((game) => game.appid),
    [2]
  );

  removeUnknownLibraryOnly(result.map);
  assert.equal(result.map.has(1), false);
  assert.equal(result.map.has(2), true);
});

test("future owned Warhammer candidate is selected and keeps future Steam date after cc fallback", () => {
  const today = "2026-11-03";
  const nowMs = Date.parse(`${today}T00:00:00.000Z`);
  const result = initializeCandidatesFromWishlist({
    items: [],
    private: false,
    totalKnown: 0,
    details: [],
  });

  const oldLowPlayedOwned = Array.from({ length: 300 }, (_, index) => ({
    appid: 1000 + index,
    name: `Old low played owned ${index}`,
    playtime_forever: 100,
    time_created: Math.floor((nowMs - 800 * 24 * 60 * 60 * 1000) / 1000),
  }));

  const warhammer = {
    appid: 2272360,
    name: "Warhammer 40,000: Dawn of War IV",
    playtime_forever: 0,
    time_created: Math.floor((nowMs - 10 * 24 * 60 * 60 * 1000) / 1000),
  };

  const addedAll = addOwnedCandidates(result, [...oldLowPlayedOwned, warhammer], nowMs);
  assert.equal(addedAll, true);
  assert.equal(result.map.size, 1);
  assert.equal(result.map.has(1000), false);
  assert.ok(selectDetailCandidates(result, today).includes(2272360));
  assert.equal(result.candidateScores.get(2272360), 11000);

  applyAppDetails(result.map, 2272360, null);
  const unknownAfterFailedDetails = result.map.get(2272360);
  assert.ok(unknownAfterFailedDetails);
  assert.equal(unknownAfterFailedDetails.releaseDate, null);
  assert.equal(unknownAfterFailedDetails.dateSource, "unknown");

  applyAppDetails(result.map, 2272360, {
    name: "Warhammer 40,000: Dawn of War IV",
    type: "game",
    header_image: "https://example.invalid/warhammer.jpg",
    release_date: { date: "Dec 3, 2026", coming_soon: true },
  });

  applyReleaseFilters(result.map, today);
  removeUnknownLibraryOnly(result.map);

  const game = result.map.get(2272360);
  assert.ok(game);
  assert.equal(game.sources.includes("library"), true);
  assert.equal(game.releaseDate, "2026-12-03");
  assert.equal(game.dateSource, "steam");
  assert.equal(selectDetailCandidates(result, today).includes(2272360), false);
});
