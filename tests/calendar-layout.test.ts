import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeCalendarCellLayouts,
  computeCalendarColumnOccupancy,
  computeCalendarColumnTracks,
  computeCalendarColumnWeights,
  computeCalendarRowWeights,
  computeCalendarRowsMinWidth,
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

// Проверка новой раскладки строк: недели с играми имеют auto-высоту, пустые недели получают 1fr.
test("calendar week-row tracks keep card rows fixed and empty rows fill leftover height", () => {
  const gridSource = readFileSync("components/CalendarGrid.tsx", "utf8");
  const globalsSource = readFileSync("app/globals.css", "utf8");

  assert.match(gridSource, /if \(isCardRow\) return "minmax\(0, auto\)";/);
  assert.match(gridSource, /return "1fr";/);
  assert.doesNotMatch(gridSource, /const fill = "1fr";/);
  assert.doesNotMatch(gridSource, /return `minmax\(\$\{minVar\}, \$\{fill\}\)`;/);
  assert.doesNotMatch(gridSource, /calc\(\$\{weight\} \* var\(--calendar-row-track-fill\)\)/);
  assert.doesNotMatch(gridSource, /var\(--calendar-row-card-max\)/);
  assert.doesNotMatch(gridSource, /var\(--calendar-row-empty-max\)/);
  assert.doesNotMatch(globalsSource, /--calendar-row-track-fill:/);
  assert.doesNotMatch(globalsSource, /--calendar-row-card-max:/);
  assert.doesNotMatch(globalsSource, /--calendar-row-empty-max:/);
});

// Проверка персистентной высоты и неисчезающей ширины карточки: трек держит card-min-track, но не через --calendar-game-card-width.
test("calendar game cards use a persistent fixed vertical height and non-compressible track width", () => {
  const globalsSource = readFileSync("app/globals.css", "utf8");
  const cardRule = globalsSource.match(/\.calendar-game-card\s*{[^}]*}/)?.[0] ?? "";
  const dayCellRule = globalsSource.match(/\n\.calendar-day-cell\s*{[^}]*}/)?.[0] ?? "";

  assert.match(globalsSource, /--calendar-game-card-height: var\(--calendar-row-card-min\);/);
  assert.doesNotMatch(globalsSource, /--calendar-game-card-width:/);
  assert.match(globalsSource, /--calendar-day-card-gap: 1px;/);
  assert.match(cardRule, /min-width: 0;/);
  assert.match(cardRule, /height: var\(--calendar-game-card-height\);/);
  assert.match(cardRule, /min-height: var\(--calendar-game-card-height\);/);
  assert.doesNotMatch(cardRule, /height: auto;|width: var\(--calendar-game-card-width\);|min-width: var\(--calendar-game-card-width\);|aspect-ratio:/);
  assert.match(globalsSource, /\.calendar-day-content\s*{[\s\S]*grid-auto-columns: var\(--calendar-game-card-min-track\);/);
  assert.doesNotMatch(globalsSource, /grid-auto-columns: minmax\(var\(--calendar-game-card-min-track\), 1fr\);/);
  assert.match(globalsSource, /\.calendar-day-content\s*{[\s\S]*gap: var\(--calendar-day-card-gap\);/);
  assert.match(dayCellRule, /min-width: 0;/);
  assert.match(dayCellRule, /overflow: visible;/);
});

test("occupied calendar columns keep card width while empty columns can collapse", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[2].iso, games(2, 1));
  byDate.set(grid[9].iso, games(1, 10));

  const occupiedColumns = computeCalendarColumnOccupancy(grid, byDate);

  assert.deepEqual(occupiedColumns, [false, false, true, false, false, false, false]);
});

test("calendar column tracks use fixed occupied width and collapsible empty width", () => {
  const occupiedMin = `calc(${GRID_DAY_VISIBLE_CAP} * (var(--calendar-game-card-min-track) + var(--calendar-day-card-gap)) - var(--calendar-day-card-gap))`;
  const tracks = computeCalendarColumnTracks([1, 1, GRID_DAY_VISIBLE_CAP, 1, 1, 1, 1], [false, false, true, false, false, false, false]);

  assert.deepEqual(tracks, [
    "minmax(0, 1fr)",
    "minmax(0, 1fr)",
    `minmax(${occupiedMin}, ${GRID_DAY_VISIBLE_CAP}fr)`,
    "minmax(0, 1fr)",
    "minmax(0, 1fr)",
    "minmax(0, 1fr)",
    "minmax(0, 1fr)",
  ]);
});

test("calendar grid minimum width sums only occupied weekday columns", () => {
  const firstOccupiedMin = `calc(2 * (var(--calendar-game-card-min-track) + var(--calendar-day-card-gap)) - var(--calendar-day-card-gap))`;
  const secondOccupiedMin = `calc(4 * (var(--calendar-game-card-min-track) + var(--calendar-day-card-gap)) - var(--calendar-day-card-gap))`;
  const minWidth = computeCalendarRowsMinWidth([2, 1, GRID_DAY_VISIBLE_CAP, 1, 1, 1, 1], [true, false, true, false, false, false, false]);

  assert.equal(minWidth, `calc(${firstOccupiedMin} + ${secondOccupiedMin})`);
});

// Проверка горизонтальной раскладки: занятые будни держат неисчезаемую ширину, пустые будни могут сжиматься до 0.
test("calendar weekday column tracks preserve occupied weights and collapsible empty weights", () => {
  const gridSource = readFileSync("components/CalendarGrid.tsx", "utf8");
  const layoutSource = readFileSync("lib/calendar-layout.ts", "utf8");
  const globalsSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(gridSource, /computeCalendarColumnHasCards/);
  assert.match(gridSource, /const occupiedColumns = computeCalendarColumnOccupancy\(grid, byDate\);/);
  assert.match(gridSource, /const calendarColumns = computeCalendarColumnTracks\(columnWeights, occupiedColumns\)\.join\(" "\);/);
  assert.match(gridSource, /const calendarMinWidth = computeCalendarRowsMinWidth\(columnWeights, occupiedColumns\);/);
  assert.match(gridSource, /minWidth: calendarMinWidth,/);
  assert.match(gridSource, /repeat\(\$\{contentSlots\}, var\(--calendar-game-card-min-track\)\)/);
  assert.doesNotMatch(gridSource, /repeat\(\$\{contentSlots\}, var\(--calendar-game-card-width\)\)/);
  assert.doesNotMatch(gridSource, /repeat\(\$\{contentSlots\}, minmax\(var\(--calendar-game-card-min-track\), 1fr\)\)/);
  assert.match(layoutSource, /return "minmax\(0, 1fr\)";/);
  assert.match(layoutSource, /return `minmax\(\$\{occupiedColumnMinTrack\(weight\)\}, \$\{Math\.max\(1, weight\)\}fr\)`;/);
  assert.ok(layoutSource.includes('return `calc(${occupiedMins.join(" + ")})`;'));
  assert.doesNotMatch(globalsSource, /grid-auto-columns: var\(--calendar-game-card-width\);/);
  assert.match(globalsSource, /\.calendar-week-row,\s*\.calendar-grid-header\s*{[\s\S]*min-width: 0;[\s\S]*gap: 1px;/);
  assert.match(globalsSource, /html\.calendar-fit-viewport main \.calendar-week-row\s*{[\s\S]*min-width: 0;[\s\S]*}/);
  assert.match(globalsSource, /html\.calendar-fit-viewport main \.calendar-day-cell\s*{[\s\S]*min-width: 0;[\s\S]*}/);
});

test("calendar grid parent has no column gap so fractional columns share continuous width", () => {
  const globalsSource = readFileSync("app/globals.css", "utf8");

  assert.match(globalsSource, /\.calendar-grid-rows\s*{[\s\S]*column-gap: 0;[\s\S]*row-gap: 1px;/);
  assert.doesNotMatch(globalsSource, /\.calendar-grid-rows\s*{[\s\S]*column-gap: 1px;/);
});

test("weekday columns without cards still render normal calendar day cells", () => {
  const gridSource = readFileSync("components/CalendarGrid.tsx", "utf8");
  const globalsSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(gridSource, /className="calendar-day-cell calendar-day-cell-empty"/);
  assert.doesNotMatch(globalsSource, /\.calendar-day-cell\.calendar-day-cell-empty\s*{/);
  assert.match(gridSource, /"calendar-day-cell bg-white dark:bg-zinc-950"/);
});

test("calendar header and week rows share parent weekday column tracks", () => {
  const gridSource = readFileSync("components/CalendarGrid.tsx", "utf8");
  const globalsSource = readFileSync("app/globals.css", "utf8");

  assert.match(gridSource, /const calendarColumns = computeCalendarColumnTracks\(columnWeights, occupiedColumns\)\.join\(" "\);/);
  assert.match(gridSource, /const calendarRowsStyle = \{[\s\S]*gridTemplateColumns: calendarColumns,[\s\S]*gridTemplateRows:/);
  assert.doesNotMatch(gridSource, /style=\{gridStyle\}/);
  assert.match(globalsSource, /\.calendar-grid-rows\s*{[\s\S]*display: grid;[\s\S]*gap: 1px;/);
  assert.match(globalsSource, /\.calendar-week-row,\s*\.calendar-grid-header\s*{[\s\S]*grid-column: 1 \/ -1;[\s\S]*grid-template-columns: subgrid;/);
  assert.match(
    globalsSource,
    /@supports not \(grid-template-columns: subgrid\)\s*\{[\s\S]*\.calendar-week-row,\s*\.calendar-grid-header\s*\{[^}]*display: contents;[^}]*\}/
  );
});

test("calendar week rows and weekday headers are real CSS grids", () => {
  const globalsSource = readFileSync("app/globals.css", "utf8");

  assert.match(globalsSource, /\.calendar-week-row,\s*\.calendar-grid-header\s*{[\s\S]*display: grid;[\s\S]*gap: 1px;/);
});

test("calendar day content top-aligns fixed-height game cards", () => {
  const globalsSource = readFileSync("app/globals.css", "utf8");

  assert.match(globalsSource, /\.calendar-day-content\s*{[\s\S]*align-items: start;[\s\S]*align-content: start;/);
});

test("weekday header row is a fixed track so it cannot absorb leftover height", () => {
  const gridSource = readFileSync("components/CalendarGrid.tsx", "utf8");
  const globalsSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(gridSource, /gridTemplateRows:\s*`auto\b/);
  assert.match(
    gridSource,
    /gridTemplateRows:\s*`minmax\(var\(--calendar-row-header-min\), var\(--calendar-row-header-max\)\)/
  );
  assert.match(globalsSource, /--calendar-row-header-max: var\(--calendar-row-header-min\);/);
});

test("out-of-month cards still affect calendar row weights", () => {
  const grid = Array.from({ length: 14 }, (_, index) => cell(index, index !== 1));
  const byDate = new Map<string, UpcomingGame[]>();
  byDate.set(grid[1].iso, games(1, 1));

  const weights = computeCalendarRowWeights(grid, byDate);

  assert.deepEqual(weights, [2, 1]);
});
