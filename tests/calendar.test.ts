import test from "node:test";
import assert from "node:assert/strict";
import {
  buildByDateMap,
  buildByYearMap,
  buildCombinedReleaseGroups,
  buildDateGroups,
  buildMonthGrid,
  buildYearGroups,
  parseISO,
  startOfMonthUTC,
  shiftMonth,
} from "../lib/calendar.ts";
import type { UpcomingGame } from "../lib/types.ts";

function game(appid: number, releaseDate: string | null, releaseYear?: number): UpcomingGame {
  return {
    appid,
    name: `Game ${appid}`,
    sources: ["wishlist"],
    releaseDate,
    releaseYear,
    dateSource: releaseDate ? "steam" : releaseYear ? "steamYear" : "unknown",
    steamUrl: `https://store.steampowered.com/app/${appid}/`,
  };
}

test("buildMonthGrid returns a Monday-first grid padded to complete weeks", () => {
  const grid = buildMonthGrid(2026, 11, "2026-11-03");
  const firstMonthCell = grid.findIndex((cell) => cell.inMonth);

  assert.equal(grid.length % 7, 0);
  assert.equal(grid[0].iso, "2026-10-26");
  assert.equal(grid[0].day, 26);
  assert.equal(grid[0].inMonth, false);
  assert.equal(grid[0].isToday, false);
  assert.equal(firstMonthCell, 6);
  assert.equal(grid[firstMonthCell].iso, "2026-11-01");
  assert.equal(grid[firstMonthCell].day, 1);
  assert.equal(grid[firstMonthCell].isToday, false);
  assert.equal(grid[36].iso, "2026-12-01");
  assert.equal(grid[36].inMonth, false);
  assert.equal(grid[grid.length - 1].iso, "2026-12-06");
  assert.equal(grid[grid.length - 1].inMonth, false);

  const today = grid.find((cell) => cell.iso === "2026-11-03");
  assert.ok(today);
  assert.equal(today.isToday, true);
});

test("date groups keep exact dates only and sort by ISO date", () => {
  const byDate = buildByDateMap([
    game(2, "2027-02-01"),
    game(1, "2027-01-15"),
    game(3, null, 2027),
    game(4, null),
  ]);

  const groups = buildDateGroups(byDate);

  assert.equal(byDate.size, 2);
  assert.deepEqual(
    groups.map((group) => group.iso),
    ["2027-01-15", "2027-02-01"]
  );
  assert.equal(groups[0].games[0].appid, 1);
  assert.equal(groups[1].games[0].appid, 2);
});

test("year groups keep year-only games only and sort by year", () => {
  const byYear = buildByYearMap([
    game(2, null, 2028),
    game(1, null, 2027),
    game(3, "2027-05-20", 2027),
    game(4, null),
  ]);

  const groups = buildYearGroups(byYear);

  assert.equal(byYear.size, 2);
  assert.deepEqual(
    groups.map((group) => group.year),
    [2027, 2028]
  );
  assert.equal(groups[0].games[0].appid, 1);
  assert.equal(groups[1].games[0].appid, 2);
});

test("combined release groups put year-only games after exact dates in the same year", () => {
  const games = [
    game(1, "2027-02-01", 2027),
    game(2, null, 2027),
    game(3, "2026-11-01", 2026),
    game(4, null, 2026),
    game(5, "2027-01-15", 2027),
    game(6, null, 2028),
  ];
  const groups = buildCombinedReleaseGroups(
    buildDateGroups(buildByDateMap(games)),
    buildYearGroups(buildByYearMap(games))
  );

  assert.deepEqual(
    groups.map((group) => group.key),
    ["2026-11", "2026-year-only", "2027-01", "2027-02", "2027-year-only", "2028-year-only"]
  );
  assert.deepEqual(
    groups.map((group) => group.kind),
    ["month", "yearOnly", "month", "month", "yearOnly", "yearOnly"]
  );
  assert.equal(groups[1].kind === "yearOnly" ? groups[1].games[0].appid : null, 4);
  assert.equal(groups[4].kind === "yearOnly" ? groups[4].games[0].appid : null, 2);
});

test("calendar date helpers parse UTC month starts and shift months across year boundaries", () => {
  assert.equal(startOfMonthUTC(2027, 1).toISOString(), "2027-01-01T00:00:00.000Z");
  assert.deepEqual(parseISO("2027-01-15")?.toISOString(), "2027-01-15T00:00:00.000Z");
  assert.equal(parseISO("2027-13-01"), null);
  assert.equal(parseISO(""), null);
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month1: 1 });
  assert.deepEqual(shiftMonth(2027, 1, -1), { year: 2026, month1: 12 });
});
