import type { CalendarDay } from "./calendar";
import type { UpcomingGame } from "./types";

export const GRID_DAY_VISIBLE_CAP = 4;
export const GRID_WEEK_ROW_WEIGHT_CAP = 2;

export interface CalendarCellLayout {
  columnWeight: number;
  visibleCount: number;
  hiddenCount: number;
}

export function computeCalendarColumnWeights(
  grid: CalendarDay[],
  byDate: Map<string, UpcomingGame[]>
): number[] {
  const weights = Array.from({ length: 7 }, () => 1);

  grid.forEach((cell, index) => {
    const gameCount = byDate.get(cell.iso)?.length ?? 0;
    const visibleCount = Math.min(gameCount, GRID_DAY_VISIBLE_CAP);
    const columnIndex = index % 7;

    weights[columnIndex] = Math.max(weights[columnIndex], visibleCount);
  });

  return weights;
}

export function computeCalendarCellLayouts(
  grid: CalendarDay[],
  byDate: Map<string, UpcomingGame[]>,
  columnWeights = computeCalendarColumnWeights(grid, byDate)
): CalendarCellLayout[] {
  return grid.map((cell, index) => {
    const gameCount = byDate.get(cell.iso)?.length ?? 0;
    const visibleCount = Math.min(gameCount, GRID_DAY_VISIBLE_CAP);
    return {
      columnWeight: columnWeights[index % 7],
      visibleCount,
      hiddenCount: gameCount - visibleCount,
    };
  });
}

export function computeCalendarColumnOccupancy(
  grid: CalendarDay[],
  byDate: Map<string, UpcomingGame[]>
): boolean[] {
  const occupied = Array.from({ length: 7 }, () => false);

  grid.forEach((cell, index) => {
    if ((byDate.get(cell.iso)?.length ?? 0) > 0) {
      occupied[index % 7] = true;
    }
  });

  return occupied;
}

function occupiedColumnMinTrack(weight: number): string {
  const safeWeight = Math.max(1, weight);
  return `calc(${safeWeight} * (var(--calendar-game-card-min-track) + var(--calendar-day-card-gap)) - var(--calendar-day-card-gap))`;
}

export function computeCalendarColumnTracks(weights: number[], occupiedColumns: boolean[]): string[] {
  return weights.map((weight, index) => {
    if (!occupiedColumns[index]) return "minmax(0, 1fr)";
    return `minmax(${occupiedColumnMinTrack(weight)}, ${Math.max(1, weight)}fr)`;
  });
}

export function computeCalendarRowsMinWidth(weights: number[], occupiedColumns: boolean[]): string {
  const occupiedMins = weights.flatMap((weight, index) =>
    occupiedColumns[index] ? [occupiedColumnMinTrack(weight)] : []
  );

  if (occupiedMins.length === 0) return "0px";
  return `calc(${occupiedMins.join(" + ")})`;
}

export function computeCalendarRowWeights(
  grid: CalendarDay[],
  byDate: Map<string, UpcomingGame[]>,
  cellLayouts = computeCalendarCellLayouts(grid, byDate)
): number[] {
  const weights: number[] = [];

  for (let index = 0; index < grid.length; index += 7) {
    let hasCards = false;
    for (let cellIndex = index; cellIndex < index + 7 && cellIndex < grid.length; cellIndex += 1) {
      if ((cellLayouts[cellIndex]?.visibleCount ?? 0) > 0) {
        hasCards = true;
        break;
      }
    }

    weights.push(hasCards ? GRID_WEEK_ROW_WEIGHT_CAP : 1);
  }

  return weights;
}
