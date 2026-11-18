import type { EarlyAccessGame } from "./early-access-core.ts";

export const STEAM_GET_ITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
/**
 * Steam rejects 500 ids with HTTP 400, and ~250 seven-digit appids can already
 * hit 414 URI Too Long because input_json travels in the query string.
 */
export const STEAM_GET_ITEMS_BATCH_MAX = 200;
/** EResult 15 (AccessDenied): item is delisted or hidden in this store region. */
export const STEAM_GET_ITEMS_NOT_IN_STORE = 15;
export const STEAM_GET_ITEMS_ASSET_BASE = "https://shared.akamai.steamstatic.com/store_item_assets/";

/** EARLY_ACCESS_GETITEMS=0 forces the legacy search/genre path. */
export function earlyAccessGetItemsEnabled(): boolean {
  const raw = process.env.EARLY_ACCESS_GETITEMS?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

export interface GetItemsEarlyAccessItem {
  appid: number;
  /** null = Steam did not return a usable item (unknown, retry later). */
  earlyAccess: boolean | null;
  name?: string;
  headerImage?: string;
  /** Steam store item type: 0 = game, 4 = DLC-ish, 14 = tool/multiplayer client... */
  itemType?: number;
  /** First public release (unix seconds), Early Access start included. */
  releaseTs?: number;
  /** Full release out of Early Access (unix seconds), when Steam reports it. */
  fullReleaseTs?: number;
}

export function chunkAppids(appids: readonly number[], size = STEAM_GET_ITEMS_BATCH_MAX): number[][] {
  const unique = [...new Set(appids.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const out: number[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

export function buildGetItemsUrl(appids: readonly number[], countryCode: string): URL {
  const url = new URL(STEAM_GET_ITEMS_URL);
  url.searchParams.set(
    "input_json",
    JSON.stringify({
      ids: appids.map((appid) => ({ appid })),
      context: { language: "english", country_code: countryCode.toUpperCase() },
      data_request: { include_release: true, include_assets: true },
    })
  );
  return url;
}

function headerImageFromAssets(assets: unknown): string | undefined {
  if (!assets || typeof assets !== "object") return undefined;
  const record = assets as Record<string, unknown>;
  const format = record.asset_url_format;
  const header = record.header;
  if (typeof format !== "string" || typeof header !== "string" || !format.includes("${FILENAME}")) {
    return undefined;
  }
  return STEAM_GET_ITEMS_ASSET_BASE + format.replace("${FILENAME}", header);
}

function positiveTs(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function firstReleaseTs(release: Record<string, unknown> | undefined): number | undefined {
  if (!release) return undefined;
  return (
    positiveTs(release.original_release_date) ??
    positiveTs(release.original_steam_release_date) ??
    positiveTs(release.steam_release_date)
  );
}

/** Parses a GetItems response. Appids missing from the response are reported as unknown. */
export function parseGetItemsEarlyAccess(
  payload: unknown,
  requested: readonly number[]
): GetItemsEarlyAccessItem[] {
  const byAppid = new Map<number, GetItemsEarlyAccessItem>();
  const items = (payload as { response?: { store_items?: unknown } } | null)?.response?.store_items;

  if (Array.isArray(items)) {
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const appid = Number(item.appid);
      if (!Number.isSafeInteger(appid) || appid <= 0) continue;
      if (item.success === STEAM_GET_ITEMS_NOT_IN_STORE) {
        // Delisted or region-locked: not purchasable, so not an active Early Access title.
        byAppid.set(appid, { appid, earlyAccess: false });
        continue;
      }
      if (item.success !== 1) {
        byAppid.set(appid, { appid, earlyAccess: null });
        continue;
      }
      const release = item.release && typeof item.release === "object"
        ? (item.release as Record<string, unknown>)
        : undefined;
      byAppid.set(appid, {
        appid,
        earlyAccess: release?.is_early_access === true,
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : undefined,
        headerImage: headerImageFromAssets(item.assets),
        itemType: typeof item.type === "number" ? item.type : undefined,
        releaseTs: firstReleaseTs(release),
        fullReleaseTs: positiveTs(release?.release_from_early_access_date),
      });
    }
  }

  // Delisted items come back with appid 0 but keep request order; match them positionally.
  if (Array.isArray(items) && items.length === requested.length) {
    items.forEach((raw, index) => {
      const item = raw as Record<string, unknown> | null;
      const appid = requested[index];
      if (!item || byAppid.has(appid) || Number(item.appid) !== 0) return;
      if (item.success === STEAM_GET_ITEMS_NOT_IN_STORE) byAppid.set(appid, { appid, earlyAccess: false });
    });
  }

  return requested.map((appid) => byAppid.get(appid) ?? { appid, earlyAccess: null });
}

export function applyGetItemsToGame(game: EarlyAccessGame, item: GetItemsEarlyAccessItem): EarlyAccessGame {
  return {
    ...game,
    name: item.name ?? game.name,
    headerImage: item.headerImage ?? game.headerImage,
  };
}
