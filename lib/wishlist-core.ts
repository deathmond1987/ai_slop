import * as cheerio from "cheerio";

export interface WishlistItem {
  appid: number;
  title: string;
  releaseDateText?: string;
  coverImage?: string;
}

export interface ApiWishlistItem {
  appid: number;
}

export interface ApiWishlistResult {
  ok: boolean;
  private: boolean;
  items: ApiWishlistItem[];
  count: number | null;
}

export interface WishlistPageResult {
  items: WishlistItem[];
  private: boolean;
  totalKnown?: number;
}

const STEAM_ASSET_BASE = "https://shared.fastly.steamstatic.com/store_item_assets/";
export const WISHLIST_PAGE_FALLBACK_DEFAULT_ENABLED = false;

function parseWishlistBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function wishlistPageFallbackEnabled(): boolean {
  return parseWishlistBooleanEnv(
    process.env.WISHLIST_PAGE_FALLBACK_ENABLED,
    WISHLIST_PAGE_FALLBACK_DEFAULT_ENABLED
  );
}

export function shouldFetchWishlistPage(api: ApiWishlistResult): boolean {
  if (api.private && api.items.length === 0) return false;
  if (api.items.length > 0) return wishlistPageFallbackEnabled();
  if (api.ok && (api.count ?? 0) === 0) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseQueries(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html);
  const element = $("#valve-ssr-data");
  const raw = element.text().trim() || element.html() || element.attr("data-valve-ssr-data");
  if (!raw) return [];

  let ssr: unknown;
  try {
    ssr = JSON.parse(raw);
  } catch {
    return [];
  }

  const renderContext = isRecord(ssr) ? ssr.renderContext : undefined;
  if (!isRecord(renderContext)) return [];

  let queryData: unknown;
  if (typeof renderContext.queryData === "string") {
    try {
      queryData = JSON.parse(renderContext.queryData);
    } catch {
      return [];
    }
  } else {
    queryData = renderContext.queryData;
  }

  if (!isRecord(queryData) || !Array.isArray(queryData.queries)) return [];
  return queryData.queries.filter(isRecord);
}

export function queryName(query: Record<string, unknown>): string {
  return Array.isArray(query.queryKey) && typeof query.queryKey[0] === "string"
    ? query.queryKey[0]
    : "";
}

export function querySlot(query: Record<string, unknown>, index: number): string | undefined {
  if (!Array.isArray(query.queryKey)) return undefined;
  const value = query.queryKey[index];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

export function getQueryState(query: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(query.state) ? query.state : null;
}

interface WishlistPageQueryIndex {
  wishlistQuery?: Record<string, unknown>;
  countQuery?: Record<string, unknown>;
  storeItemQueries: Map<string, Record<string, unknown>>;
}

export function storeItemCacheKey(appid: number, part: string): string {
  return `${appid}:${part}`;
}

export function appidFromAppSlot(value: unknown): number | null {
  if (typeof value !== "string" || !value.startsWith("app_")) return null;
  const appid = Number(value.slice(4));
  return Number.isSafeInteger(appid) && appid > 0 ? appid : null;
}

export function buildWishlistPageQueryIndex(
  queries: Record<string, unknown>[],
  steamId: string
): WishlistPageQueryIndex {
  const index: WishlistPageQueryIndex = {
    storeItemQueries: new Map<string, Record<string, unknown>>(),
  };

  for (const query of queries) {
    const name = queryName(query);
    const slot1 = querySlot(query, 1);

    if (!index.wishlistQuery && name === "WishlistSortedFiltered" && slot1 === steamId) {
      index.wishlistQuery = query;
    }

    if (!index.countQuery && name === "wishlistitemcount" && slot1 === steamId) {
      index.countQuery = query;
    }

    if (name === "StoreItem") {
      const appid = appidFromAppSlot(slot1);
      const part = querySlot(query, 2);
      if (appid !== null && part) {
        const key = storeItemCacheKey(appid, part);
        if (!index.storeItemQueries.has(key)) {
          index.storeItemQueries.set(key, query);
        }
      }
    }
  }

  return index;
}

export function getQueryData(query: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!query) return null;
  const state = getQueryState(query);
  if (!state || state.status === "error") return null;
  return isRecord(state.data) ? state.data : null;
}

export function getWishlistItems(
  query: Record<string, unknown> | undefined
): Record<string, unknown>[] {
  if (!query) return [];
  const state = getQueryState(query);
  if (!state || state.status !== "success") return [];
  if (!isRecord(state.data) || !Array.isArray(state.data.items)) return [];
  return state.data.items.filter(isRecord);
}

function getQueryCount(query: Record<string, unknown> | undefined): number | null {
  if (!query) return null;
  const state = getQueryState(query);
  if (!state || state.status === "error") return null;
  const directCount = asNumber(state.data);
  if (directCount !== null) return directCount;
  if (isRecord(state.data)) return asNumber(state.data.count);
  return null;
}

export function getCoverImage(data: Record<string, unknown> | null): string | undefined {
  if (!data) return undefined;
  const assetFormat = asString(data.asset_url_format);
  const filename =
    asString(data.header) ??
    asString(data.main_capsule) ??
    asString(data.small_capsule) ??
    asString(data.library_capsule);
  if (!assetFormat || !filename) return undefined;
  return `${STEAM_ASSET_BASE}${assetFormat.replace(/\$\{FILENAME\}/g, filename)}`;
}

export function getReleaseText(data: Record<string, unknown> | null): string | undefined {
  if (!data) return undefined;
  const customReleaseDateMessage = asString(data.custom_release_date_message);
  const steamReleaseDate = asNumber(data.steam_release_date);
  if (customReleaseDateMessage && /\b\d{4}\b/.test(customReleaseDateMessage)) {
    return customReleaseDateMessage;
  }
  if (steamReleaseDate !== null && steamReleaseDate > 0) {
    return new Date(steamReleaseDate * 1000).toISOString().slice(0, 10);
  }
  return customReleaseDateMessage;
}

function divideDecimalBy256(value: string): [string, number] {
  const quotient: string[] = [];
  let remainder = 0;
  for (const char of value) {
    const current = remainder * 10 + Number(char);
    const digit = Math.floor(current / 256);
    if (digit > 0 || quotient.length > 0) quotient.push(String(digit));
    remainder = current % 256;
  }
  return [quotient.length > 0 ? quotient.join("") : "0", remainder];
}

function fixed64Bytes(steamId: string): Buffer {
  const bytes = Buffer.alloc(8);
  let digits = steamId.replace(/\D/g, "");
  if (!digits || digits === "0") return bytes;
  for (let i = 0; i < 8 && digits !== "0"; i++) {
    const [quotient, remainder] = divideDecimalBy256(digits);
    bytes[i] = remainder;
    digits = quotient;
  }
  return bytes;
}

export function encodeWishlistRequest(steamId: string): string {
  const body = Buffer.concat([Buffer.from([9]), fixed64Bytes(steamId)]);
  return body.toString("base64");
}

function readVarint(buf: Buffer, pos: number): [number, number] | null {
  let value = 0;
  let shift = 0;
  let p = pos;
  while (p < buf.length) {
    const byte = buf[p++];
    value += (byte & 0x7f) * Math.pow(2, shift);
    if ((byte & 0x80) === 0) {
      return Number.isSafeInteger(value) ? [value, p] : null;
    }
    shift += 7;
    if (shift > 49) return null;
  }
  return null;
}

function skipField(buf: Buffer, pos: number, wire: number): number | null {
  if (wire === 0) return readVarint(buf, pos)?.[1] ?? null;
  if (wire === 1) return pos + 8 <= buf.length ? pos + 8 : null;
  if (wire === 2) {
    const lengthInfo = readVarint(buf, pos);
    if (!lengthInfo) return null;
    const [length, next] = lengthInfo;
    if (length < 0 || next + length > buf.length) return null;
    return next + length;
  }
  if (wire === 5) return pos + 4 <= buf.length ? pos + 4 : null;
  return null;
}

export function parseFirstField1Varint(buf: Buffer): number | null {
  let pos = 0;
  while (pos < buf.length) {
    const tagInfo = readVarint(buf, pos);
    if (!tagInfo) return null;
    const tag = tagInfo[0];
    pos = tagInfo[1];
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 1 && wire === 0) {
      return readVarint(buf, pos)?.[0] ?? null;
    }
    const next = skipField(buf, pos, wire);
    if (next === null) return null;
    pos = next;
  }
  return null;
}

function parseWishlistItem(buf: Buffer): ApiWishlistItem | null {
  let appid = 0;
  let pos = 0;
  while (pos < buf.length) {
    const tagInfo = readVarint(buf, pos);
    if (!tagInfo) return null;
    const tag = tagInfo[0];
    pos = tagInfo[1];
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 1 && wire === 0) {
      const value = readVarint(buf, pos);
      if (!value) return null;
      appid = value[0];
      pos = value[1];
      continue;
    }
    const next = skipField(buf, pos, wire);
    if (next === null) return null;
    pos = next;
  }
  return appid > 0 && Number.isSafeInteger(appid) ? { appid } : null;
}

export function parseGetWishlistResponse(buf: Buffer): ApiWishlistItem[] {
  const items: ApiWishlistItem[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const tagInfo = readVarint(buf, pos);
    if (!tagInfo) return items;
    const tag = tagInfo[0];
    pos = tagInfo[1];
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 1 && wire === 2) {
      const lengthInfo = readVarint(buf, pos);
      if (!lengthInfo) return items;
      const [length, start] = lengthInfo;
      if (length < 0 || start + length > buf.length) return items;
      const item = parseWishlistItem(buf.subarray(start, start + length));
      if (item) items.push(item);
      pos = start + length;
      continue;
    }
    const next = skipField(buf, pos, wire);
    if (next === null) return items;
    pos = next;
  }
  return items;
}

export function isPrivateApiResult(status: number, eresult: number | null): boolean {
  if (status === 401 || status === 402 || status === 403) return true;
  return eresult === 15;
}

export function parseJsonCountResponse(data: unknown): number | null {
  const response = isRecord(data) ? data.response : undefined;
  return isRecord(response) ? asNumber(response.count) : null;
}

export function parseJsonWishlistResponse(data: unknown): ApiWishlistItem[] {
  const response = isRecord(data) ? data.response : undefined;
  if (!isRecord(response) || !Array.isArray(response.items)) return [];
  return response.items
    .filter(isRecord)
    .map((item) => asNumber(item.appid))
    .filter((appid): appid is number => appid !== null && Number.isInteger(appid) && appid > 0)
    .map((appid) => ({ appid }));
}

export function parseWishlistPageResult(html: string, steamId: string): WishlistPageResult {
  const queries = parseQueries(html);
  if (queries.length === 0) {
    return { items: [], private: true };
  }

  const queryIndex = buildWishlistPageQueryIndex(queries, steamId);
  const totalKnown = getQueryCount(queryIndex.countQuery);
  const rawItems = getWishlistItems(queryIndex.wishlistQuery);

  if (rawItems.length === 0) {
    const privateFlag = (totalKnown ?? 0) > 0;
    return {
      items: [],
      private: privateFlag,
      totalKnown: totalKnown ?? undefined,
    };
  }

  const items = new Map<number, WishlistItem>();
  for (const rawItem of rawItems) {
    const appid = asNumber(rawItem.appid);
    if (appid === null || !Number.isInteger(appid)) continue;

    const defaultData = getQueryData(queryIndex.storeItemQueries.get(storeItemCacheKey(appid, "default_info")));
    const assetsData = getQueryData(queryIndex.storeItemQueries.get(storeItemCacheKey(appid, "include_assets")));
    const releaseData = getQueryData(queryIndex.storeItemQueries.get(storeItemCacheKey(appid, "include_release")));

    const title =
      asString(defaultData?.name) ??
      asString(defaultData?.store_url_slug)?.replace(/_/g, " ") ??
      `App ${appid}`;

    items.set(appid, {
      appid,
      title,
      releaseDateText: getReleaseText(releaseData),
      coverImage: getCoverImage(assetsData),
    });
  }

  const parsedItems = Array.from(items.values());
  return {
    items: parsedItems,
    private: false,
    totalKnown: totalKnown ?? undefined,
  };
}

export function parseWishlistDate(text?: string): {
  date: string | null;
  comingSoon: boolean;
} {
  if (!text) return { date: null, comingSoon: true };
  const cleaned = text.replace(/\u21b5/g, "").replace(/\s+/g, " ").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return { date: null, comingSoon: true };
  }

  const parsed = new Date(`${cleaned}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { date: null, comingSoon: true };
  }

  return { date: parsed.toISOString().slice(0, 10), comingSoon: false };
}
