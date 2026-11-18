import type { GetItemsEarlyAccessItem } from "./early-access-getitems-core.ts";

/** GetItems type 0 = game. Tools, soundtracks, standalone MP clients etc. are hidden. */
export const HISTORY_GAME_ITEM_TYPE = 0;

export interface HistoryGame {
  appid: number;
  name: string;
  headerImage?: string;
  steamUrl: string;
  /** YYYY-MM-DD (UTC) of first public release, Early Access start included. */
  releaseDate?: string;
  /** YYYY-MM-DD of the full release when the game left Early Access. */
  fullReleaseDate?: string;
  earlyAccess?: boolean;
  playtimeForever?: number;
}

export interface HistoryResult {
  ready: boolean;
  reason?: "signed_out" | "no_api_key" | "steam_api";
  games: HistoryGame[];
  ownedCount: number;
}

export function isoDateFromUnix(ts: number | undefined): string | undefined {
  if (!ts) return undefined;
  const date = new Date(ts * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

export function buildHistoryGames(
  owned: readonly { appid: number; name?: string | null; playtime_forever?: number | null }[],
  items: ReadonlyMap<number, GetItemsEarlyAccessItem>
): HistoryGame[] {
  const out: HistoryGame[] = [];
  for (const game of owned) {
    const item = items.get(game.appid);
    // Delisted/unknown items have no type; keep them only when they have a date.
    if (item?.itemType !== undefined && item.itemType !== HISTORY_GAME_ITEM_TYPE) continue;
    out.push({
      appid: game.appid,
      name: item?.name ?? (game.name?.trim() || `Steam App ${game.appid}`),
      headerImage: item?.headerImage,
      steamUrl: `https://store.steampowered.com/app/${game.appid}/`,
      releaseDate: isoDateFromUnix(item?.releaseTs),
      fullReleaseDate: isoDateFromUnix(item?.fullReleaseTs),
      earlyAccess: item?.earlyAccess === true || undefined,
      playtimeForever: Number.isFinite(game.playtime_forever) ? Number(game.playtime_forever) : undefined,
    });
  }
  return out;
}

export interface HistoryYearSummary {
  year: number;
  count: number;
}

export function summarizeHistoryYears(games: readonly HistoryGame[]): {
  years: HistoryYearSummary[];
  undatedCount: number;
} {
  const counts = new Map<number, number>();
  let undatedCount = 0;
  for (const game of games) {
    if (!game.releaseDate) {
      undatedCount += 1;
      continue;
    }
    const year = Number(game.releaseDate.slice(0, 4));
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  const years = [...counts.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year);
  return { years, undatedCount };
}

/** Groups a year's games by month (0-11), each month sorted by date then name. */
export function groupHistoryYearByMonth(games: readonly HistoryGame[], year: number): HistoryGame[][] {
  const months: HistoryGame[][] = Array.from({ length: 12 }, () => []);
  for (const game of games) {
    if (!game.releaseDate || Number(game.releaseDate.slice(0, 4)) !== year) continue;
    months[Number(game.releaseDate.slice(5, 7)) - 1]?.push(game);
  }
  for (const month of months) {
    month.sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "") || a.name.localeCompare(b.name));
  }
  return months;
}

export function matchesHistorySearch(game: HistoryGame, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || game.name.toLowerCase().includes(q);
}
