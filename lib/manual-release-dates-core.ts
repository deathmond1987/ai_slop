import type { UpcomingGame } from "./types.ts";

export const MANUAL_RELEASE_DATES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS manual_release_dates (
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  appid INTEGER NOT NULL,
  release_date TEXT NOT NULL,
  name TEXT NOT NULL,
  header_image TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (steam_id, appid)
);
CREATE INDEX IF NOT EXISTS manual_release_dates_steam_id_idx ON manual_release_dates (steam_id, release_date);
`;

export const MANUAL_RELEASE_DATES_LIST_SQL = `
SELECT appid, release_date, name, header_image, created_at
FROM manual_release_dates
WHERE steam_id = ?
ORDER BY release_date DESC, appid
`;

export const MANUAL_RELEASE_DATES_UPSERT_SQL = `
INSERT INTO manual_release_dates (steam_id, appid, release_date, name, header_image, created_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (steam_id, appid) DO UPDATE SET
  release_date = excluded.release_date,
  name = excluded.name,
  header_image = COALESCE(excluded.header_image, manual_release_dates.header_image),
  created_at = excluded.created_at
`;

export const MANUAL_RELEASE_DATES_DELETE_ONE_SQL = `
DELETE FROM manual_release_dates
WHERE steam_id = ? AND appid = ?
`;

/** Bulk delete: placeholders are filled with one "?" per appid. */
export function manualReleaseDatesDeleteManySql(count: number): string {
  return `DELETE FROM manual_release_dates WHERE steam_id = ? AND appid IN (${Array.from(
    { length: Math.max(1, count) },
    () => "?"
  ).join(",")})`;
}

/**
 * A manual date is replaced once Steam reports the game actually released
 * (out of Early Access). While the game is still in Early Access the user's
 * date wins: Steam only has the Early Access start date in that case.
 */
export function realReleaseDateFor(
  item: { earlyAccess: boolean | null; releaseTs?: number; fullReleaseTs?: number } | undefined
): string | undefined {
  if (!item || item.earlyAccess !== false) return undefined;
  const ts = item.fullReleaseTs ?? item.releaseTs;
  if (!ts) return undefined;
  const date = new Date(ts * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

export interface ManualReleaseDateEntry {
  appid: number;
  releaseDate: string;
  name: string;
  headerImage?: string;
  createdAt: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidReleaseDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Release-day games the user placed on the calendar from the Early Access panel. */
export function manualEntryToUpcoming(entry: ManualReleaseDateEntry): UpcomingGame {
  return {
    appid: entry.appid,
    name: entry.name,
    headerImage: entry.headerImage,
    sources: ["library"],
    releaseDate: entry.releaseDate,
    dateSource: "manual",
    steamUrl: `https://store.steampowered.com/app/${entry.appid}/`,
    steamType: "game",
    fromEarlyAccess: true,
  };
}

/**
 * Adds manual release dates on top of the collected calendar: existing appids get
 * the manual date (and an Early Access marker), new appids are added.
 */
export function mergeManualReleaseDates(
  games: readonly UpcomingGame[],
  entries: readonly ManualReleaseDateEntry[]
): UpcomingGame[] {
  if (entries.length === 0) return [...games];
  const byAppid = new Map(entries.map((entry) => [entry.appid, entry]));
  const merged = games.map((game) => {
    const entry = byAppid.get(game.appid);
    if (!entry) return game;
    byAppid.delete(game.appid);
    return { ...game, releaseDate: entry.releaseDate, dateSource: "manual" as const, fromEarlyAccess: true };
  });
  for (const entry of byAppid.values()) merged.push(manualEntryToUpcoming(entry));
  return merged;
}
