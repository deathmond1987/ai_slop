import type { GetItemsEarlyAccessItem } from "./early-access-getitems-core.ts";
import { isoDateFromUnix } from "./history-core.ts";

/** Steam store item types as returned by IStoreBrowseService/GetItems. */
const TYPE_DLC = 4;

export interface AccountStats {
  ready: boolean;
  ownedCount: number;
  games: number;
  dlc: number;
  demos: number;
  tools: number;
  other: number;
  earlyAccessNow: number;
  withReleaseDate: number;
  earliestRelease?: string;
  latestRelease?: string;
  totalPlaytimeHours: number;
  playedGames: number;
  neverPlayed: number;
  releasesByYear: { year: number; count: number }[];
  blacklisted: number;
  manualDates: number;
  wishlistItems?: number;
}

interface OwnedGameLike {
  appid: number;
  playtime_forever?: number | null;
}

export function computeAccountStats(input: {
  owned: readonly OwnedGameLike[];
  items: ReadonlyMap<number, GetItemsEarlyAccessItem>;
  blacklisted: number;
  manualDates: number;
  wishlistItems?: number;
}): AccountStats {
  let games = 0;
  let dlc = 0;
  let demos = 0;
  let tools = 0;
  let other = 0;
  let earlyAccessNow = 0;
  let withReleaseDate = 0;
  let earliestTs: number | undefined;
  let latestTs: number | undefined;
  let totalSeconds = 0;
  let playedGames = 0;
  let neverPlayed = 0;
  const byYear = new Map<number, number>();

  for (const owned of input.owned) {
    const item = input.items.get(owned.appid);
    switch (item?.itemType) {
      // Delisted items carry no type; they are bought games far more often than not.
      case 0:
      case undefined:
        games += 1;
        break;
      case TYPE_DLC:
        dlc += 1;
        break;
      case 12:
        demos += 1;
        break;
      case 6:
        tools += 1;
        break;
      default:
        other += 1;
    }

    if (item?.earlyAccess) earlyAccessNow += 1;
    if (item?.releaseTs) {
      withReleaseDate += 1;
      earliestTs = earliestTs === undefined ? item.releaseTs : Math.min(earliestTs, item.releaseTs);
      latestTs = latestTs === undefined ? item.releaseTs : Math.max(latestTs, item.releaseTs);
      const year = Number(isoDateFromUnix(item.releaseTs)?.slice(0, 4));
      if (Number.isFinite(year)) byYear.set(year, (byYear.get(year) ?? 0) + 1);
    }

    const playtime = Number(owned.playtime_forever) || 0;
    totalSeconds += playtime * 60;
    if (playtime > 0) playedGames += 1;
    else neverPlayed += 1;
  }

  return {
    ready: true,
    ownedCount: input.owned.length,
    games,
    dlc,
    demos,
    tools,
    other,
    earlyAccessNow,
    withReleaseDate,
    earliestRelease: isoDateFromUnix(earliestTs),
    latestRelease: isoDateFromUnix(latestTs),
    totalPlaytimeHours: Math.round(totalSeconds / 3600),
    playedGames,
    neverPlayed,
    releasesByYear: [...byYear.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year),
    blacklisted: input.blacklisted,
    manualDates: input.manualDates,
    wishlistItems: input.wishlistItems,
  };
}
