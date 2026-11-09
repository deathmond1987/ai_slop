import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCalendarCellLayouts,
  computeCalendarColumnWeights,
  computeCalendarRowWeights,
  GRID_DAY_VISIBLE_CAP,
  GRID_WEEK_ROW_WEIGHT_CAP,
} from "../lib/calendar-layout.ts";
import type { CalendarDay } from "../lib/calendar.ts";
import type { UpcomingGame } from "../lib/types.ts";

function cell(index: number, inMonth = true): CalendarDay {
  return {
    iso: `2026-11-${String(index + 1).padStart(2, "0")}`,
    day: index + 1,
    inMonth,
    isToday: false,
  };
}

function games(count: number, startAppid: number): UpcomingGame[] {
  return Array.from({ length: count }, (_, index) => ({
    appid: startAppid + index,
    name: `Game ${startAppid + index}`,
    sources: ["wishlist"],
    releaseDate: "2026-11-01",
    dateSource: "steam" as const,
    steamUrl: "https://store.steampowered.com/app/1/",
  }));
}

test("widens the weekday column that contains multi-game days", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[2].iso, games(2, 1));

  const weights = computeCalendarColumnWeights(grid, byDate);

  assert.deepEqual(weights, [1, 1, 2, 1, 1, 1, 1]);
});

test("uses the largest in-month game count for the whole weekday column", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[2].iso, games(2, 1));
  byDate.set(grid[9].iso, games(3, 10));

  const weights = computeCalendarColumnWeights(grid, byDate);

  assert.deepEqual(weights, [1, 1, 3, 1, 1, 1, 1]);
});

test("widens the weekday column from out-of-month game days too", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index, index !== 1));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[1].iso, games(GRID_DAY_VISIBLE_CAP + 1, 1));

  const weights = computeCalendarColumnWeights(grid, byDate);
  const layouts = computeCalendarCellLayouts(grid, byDate, weights);

  assert.equal(weights[1], GRID_DAY_VISIBLE_CAP);
  assert.deepEqual(layouts[1], {
    columnWeight: GRID_DAY_VISIBLE_CAP,
    visibleCount: GRID_DAY_VISIBLE_CAP,
    hiddenCount: 1,
  });
});

test("caps visible games and leaves the rest clickable", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[3].iso, games(GRID_DAY_VISIBLE_CAP + 4, 1));

  const weights = computeCalendarColumnWeights(grid, byDate);
  const layouts = computeCalendarCellLayouts(grid, byDate, weights);

  assert.equal(weights[3], GRID_DAY_VISIBLE_CAP);
  assert.deepEqual(layouts[3], {
    columnWeight: GRID_DAY_VISIBLE_CAP,
    visibleCount: GRID_DAY_VISIBLE_CAP,
    hiddenCount: 4,
  });
});

test("keeps every day of an expanded column inside its own weekday column", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[2].iso, games(4, 1));
  byDate.set(grid[9].iso, games(1, 10));

  const weights = computeCalendarColumnWeights(grid, byDate);
  const layouts = computeCalendarCellLayouts(grid, byDate, weights);

  assert.equal(weights[2], 4);
  assert.deepEqual(layouts[2], { columnWeight: 4, visibleCount: 4, hiddenCount: 0 });
  assert.deepEqual(layouts[9], { columnWeight: 4, visibleCount: 1, hiddenCount: 0 });
});

test("shrinks empty calendar rows and expands rows with game cards", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[2].iso, games(1, 1));

  const weights = computeCalendarRowWeights(grid, byDate);

  assert.deepEqual(weights, [2, 1]);
});

test("every calendar row with cards gets the same vertical expansion", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[2].iso, games(1, 1));
  byDate.set(grid[9].iso, games(2, 10));

  const weights = computeCalendarRowWeights(grid, byDate);

  assert.deepEqual(weights, [2, 2]);
});

test("multiple cards on one day do not make the row taller than other card rows", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[1].iso, games(1, 1));
  byDate.set(grid[2].iso, games(GRID_DAY_VISIBLE_CAP + 5, 10));

  const weights = computeCalendarRowWeights(grid, byDate);

  assert.equal(weights[0], GRID_WEEK_ROW_WEIGHT_CAP);
});

test("out-of-month cards still affect calendar row weights", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index, index !== 1));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[1].iso, games(1, 1));

  const weights = computeCalendarRowWeights(grid, byDate);

  assert.deepEqual(weights, [2, 1]);
});
