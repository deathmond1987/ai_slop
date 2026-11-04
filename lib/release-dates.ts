import type { GameSource, UpcomingGame } from "./types";

export interface SteamDateInfo {
  date: string | null;
  year: number | null;
}

export interface ReleaseDateGame extends Pick<UpcomingGame, "releaseDate" | "releaseYear" | "dateSource"> {
  wishlistDateText?: string;
}

export interface SourcedReleaseDateGame extends ReleaseDateGame {
  sources: GameSource[];
}

const DATE_LETTERS = "A-Za-z\u00C0-\u017F\u0400-\u04FF";
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;
const YEAR_ONLY_RE = /^(\d{4})$/;
const MONTH_DAY_YEAR_RE = new RegExp(
  `^([${DATE_LETTERS}]{3,})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})$`
);
const DAY_MONTH_YEAR_RE = new RegExp(
  `^(\\d{1,2})(?:st|nd|rd|th)?\\s+([${DATE_LETTERS}]{3,})\\s+(\\d{4})$`
);
const MONTH_YEAR_RE = new RegExp(`^([${DATE_LETTERS}]{3,})\\s+(\\d{4})$`);
const PLACEHOLDER_YEAR_END_RE = /^\d{4}-12-31$/;

const MONTH_BY_PREFIX = new Map<string, number>([
  ["jan", 1],
  ["feb", 2],
  ["mar", 3],
  ["apr", 4],
  ["may", 5],
  ["jun", 6],
  ["jul", 7],
  ["aug", 8],
  ["sep", 9],
  ["oct", 10],
  ["nov", 11],
  ["dec", 12],
  ["янв", 1],
  ["фев", 2],
  ["мар", 3],
  ["апр", 4],
  ["май", 5],
  ["июн", 6],
  ["июл", 7],
  ["авг", 8],
  ["сен", 9],
  ["окт", 10],
  ["ноя", 11],
  ["дек", 12],
]);

function monthNumber(value: string): number | undefined {
  return MONTH_BY_PREFIX.get(value.slice(0, 3).toLowerCase());
}

function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

export function isPlaceholderYearEndDate(value: string | null | undefined): boolean {
  return typeof value === "string" && PLACEHOLDER_YEAR_END_RE.test(value.trim());
}

export function parseSteamDateInfo(value: string | undefined, allowYear = false): SteamDateInfo {
  if (!value) return { date: null, year: null };
  const text = value.trim();
  if (!text) return { date: null, year: null };

  const iso = text.match(ISO_DATE_RE);
  if (iso) {
    const date = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return { date, year: date ? Number(iso[1]) : null };
  }

  const yearMonth = text.match(YEAR_MONTH_RE);
  if (yearMonth) {
    return { date: null, year: Number(yearMonth[1]) };
  }

  const yearOnly = text.match(YEAR_ONLY_RE);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    return { date: allowYear ? `${year}-01-01` : null, year };
  }

  const normalized = text.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

  const monthDayYear = normalized.match(MONTH_DAY_YEAR_RE);
  if (monthDayYear) {
    const month = monthNumber(monthDayYear[1]);
    if (month) {
      const year = Number(monthDayYear[3]);
      return { date: isoDate(year, month, Number(monthDayYear[2])), year };
    }
  }

  const dayMonthYear = normalized.match(DAY_MONTH_YEAR_RE);
  if (dayMonthYear) {
    const month = monthNumber(dayMonthYear[2]);
    if (month) {
      const year = Number(dayMonthYear[3]);
      return { date: isoDate(year, month, Number(dayMonthYear[1])), year };
    }
  }

  const monthYear = normalized.match(MONTH_YEAR_RE);
  if (monthYear && monthNumber(monthYear[1])) {
    return { date: null, year: Number(monthYear[2]) };
  }

  const fallbackYear = normalized.match(/\b(\d{4})\b/);
  if (fallbackYear) {
    const year = Number(fallbackYear[1]);
    if (year >= 1000 && year <= 2999) {
      return { date: null, year };
    }
  }

  return { date: null, year: null };
}

export function parseSteamDateText(value: string | undefined, allowYear = false): string | null {
  return parseSteamDateInfo(value, allowYear).date;
}

export function hasKnownSteamDate(game: ReleaseDateGame): boolean {
  if (game.dateSource !== "steam" && game.dateSource !== "steamYear") return false;
  return game.releaseDate !== null || typeof game.releaseYear === "number";
}

export function hasKnownReleasedSteamDate(game: ReleaseDateGame, today: string): boolean {
  return hasKnownSteamDate(game) && game.releaseDate !== null && game.releaseDate <= today;
}

export function applySteamDateInfo(
  game: ReleaseDateGame,
  info: SteamDateInfo,
  options: { demotePlaceholder?: boolean } = {}
): void {
  if (info.date) {
    if (options.demotePlaceholder && isPlaceholderYearEndDate(info.date)) {
      game.releaseYear = info.year ?? Number(info.date.slice(0, 4));
      game.dateSource = "steamYear";
      return;
    }

    game.releaseDate = info.date;
    game.releaseYear = info.year ?? Number(info.date.slice(0, 4));
    game.dateSource = "steam";
    return;
  }

  if (info.year !== null) {
    game.releaseYear = info.year;
    game.dateSource = "steamYear";
  }
}

export function applyKnownWishlistDate(game: ReleaseDateGame, releaseDateText?: string): void {
  if (!releaseDateText || hasKnownSteamDate(game)) return;
  applySteamDateInfo(game, parseSteamDateInfo(releaseDateText, false), { demotePlaceholder: true });
}

export function applyKnownWishlistDatesAfterDetails(games: Iterable<ReleaseDateGame>): void {
  for (const game of games) {
    if (game.dateSource !== "steam" && game.dateSource !== "steamYear" && game.wishlistDateText) {
      applySteamDateInfo(game, parseSteamDateInfo(game.wishlistDateText, false), {
        demotePlaceholder: true,
      });
    }
  }
}

export function shouldRemoveKnownReleasedSteamGame(game: ReleaseDateGame, today: string): boolean {
  return game.releaseDate !== null && game.releaseDate <= today && game.dateSource === "steam";
}

export function shouldRemovePastYearOnlySteamGame(
  game: ReleaseDateGame,
  currentYear: number
): boolean {
  return (
    !game.releaseDate &&
    game.dateSource === "steamYear" &&
    typeof game.releaseYear === "number" &&
    game.releaseYear < currentYear
  );
}

export function shouldRemoveUnknownLibraryOnly(game: SourcedReleaseDateGame): boolean {
  return (
    !game.releaseDate &&
    game.sources.includes("library") &&
    !game.sources.includes("wishlist") &&
    game.dateSource === "unknown"
  );
}
