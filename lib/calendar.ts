import type { UpcomingGame } from "./types";

export interface CalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

export function startOfMonthUTC(year: number, month1: number) {
  return new Date(Date.UTC(year, month1 - 1, 1));
}

export function buildMonthGrid(year: number, month1: number, todayISO: string): CalendarDay[] {
  const first = startOfMonthUTC(year, month1);
  const daysInMonth = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const dowFirst = (first.getUTCDay() + 6) % 7;

  const cells: CalendarDay[] = [];
  for (let i = 0; i < dowFirst; i++) {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() - (dowFirst - i));
    cells.push(toCell(d, false, todayISO));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toCell(new Date(Date.UTC(year, month1 - 1, d)), true, todayISO));
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const next = new Date(last.iso + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    cells.push(toCell(next, false, todayISO));
  }
  return cells;
}

function toCell(d: Date, inMonth: boolean, todayISO: string): CalendarDay {
  const iso = d.toISOString().slice(0, 10);
  return { iso, day: d.getUTCDate(), inMonth, isToday: iso === todayISO };
}

export function buildByDateMap(games: UpcomingGame[]): Map<string, UpcomingGame[]> {
  const map = new Map<string, UpcomingGame[]>();
  for (const game of games) {
    if (!game.releaseDate) continue;
    const arr = map.get(game.releaseDate) ?? [];
    arr.push(game);
    map.set(game.releaseDate, arr);
  }
  return map;
}

export interface ReleaseDateGroup {
  iso: string;
  games: UpcomingGame[];
}

export interface YearReleaseGroup {
  year: number;
  games: UpcomingGame[];
}

export function buildDateGroups(byDate: Map<string, UpcomingGame[]>): ReleaseDateGroup[] {
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, games]) => ({ iso, games }));
}

export function buildByYearMap(games: UpcomingGame[]): Map<number, UpcomingGame[]> {
  const map = new Map<number, UpcomingGame[]>();
  for (const game of games) {
    if (game.releaseDate || typeof game.releaseYear !== "number") continue;
    const arr = map.get(game.releaseYear) ?? [];
    arr.push(game);
    map.set(game.releaseYear, arr);
  }
  return map;
}

export function buildYearGroups(byYear: Map<number, UpcomingGame[]>): YearReleaseGroup[] {
  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, games]) => ({ year, games }));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseISO(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function shiftMonth(year: number, month1: number, delta: number) {
  const d = new Date(Date.UTC(year, month1 - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month1: d.getUTCMonth() + 1 };
}
