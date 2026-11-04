import test from "node:test";
import assert from "node:assert/strict";
import {
  applyKnownWishlistDate,
  applySteamDateInfo,
  hasKnownSteamDate,
  isPlaceholderYearEndDate,
  parseSteamDateInfo,
  parseSteamDateText,
  shouldRemovePastYearOnlySteamGame,
  type ReleaseDateGame,
} from "../lib/release-dates.ts";

function scratch(overrides: Partial<ReleaseDateGame>): ReleaseDateGame {
  return {
    releaseDate: null,
    dateSource: "unknown",
    ...overrides,
  };
}

test("parses common exact Steam date formats", () => {
  assert.equal(parseSteamDateText("May 28, 2026"), "2026-05-28");
  assert.equal(parseSteamDateText("28 May 2026"), "2026-05-28");
  assert.equal(parseSteamDateText("2026-05-28"), "2026-05-28");
  assert.equal(parseSteamDateText("March 19, 2026"), "2026-03-19");
  assert.equal(parseSteamDateText("April 23"), null);
  assert.equal(parseSteamDateText("May"), null);
  assert.equal(parseSteamDateText("TBA"), null);
  assert.equal(parseSteamDateText("2026-13-32"), null);
});

test("parses Steam release_date info", () => {
  const exact = parseSteamDateInfo("May 28, 2026");
  assert.equal(exact?.date, "2026-05-28");
  assert.equal(exact?.year, 2026);

  const year = parseSteamDateInfo("2027");
  assert.equal(year?.date, null);
  assert.equal(year?.year, 2027);

  const yearMonth = parseSteamDateInfo("May 2026");
  assert.equal(yearMonth?.date, null);
  assert.equal(yearMonth?.year, 2026);

  assert.equal(parseSteamDateInfo("TBA")?.date, null);
});

test("applies Steam date info without inventing exact dates", () => {
  const game = scratch({});
  applySteamDateInfo(game, parseSteamDateInfo("2027"));
  assert.equal(game.releaseDate, null);
  assert.equal(game.releaseYear, 2027);
  assert.equal(game.dateSource, "steamYear");
  assert.ok(hasKnownSteamDate(game));

  applySteamDateInfo(game, parseSteamDateInfo("May 28, 2026"));
  assert.equal(game.releaseDate, "2026-05-28");
  assert.equal(game.dateSource, "steam");
});

test("demotes known placeholder year-end exact wishlist dates", () => {
  const game = scratch({
    wishlistDateText: "2027-12-31",
  });
  assert.ok(isPlaceholderYearEndDate(game.wishlistDateText));
  applyKnownWishlistDate(game, "2027-12-31");
  assert.equal(game.releaseDate, null);
  assert.equal(game.dateSource, "steamYear");
  assert.equal(game.releaseYear, 2027);
});

test("removes year-only Steam games from past years only", () => {
  const game = scratch({ dateSource: "steamYear", releaseYear: 2026 });
  assert.equal(shouldRemovePastYearOnlySteamGame(game, 2027), true);
  assert.equal(shouldRemovePastYearOnlySteamGame(game, 2026), false);
});
