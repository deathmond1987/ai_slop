import { isPlaceholderYearEndDate, parseSteamDateInfo } from "./release-dates.ts";
import { normalizeSteamStoreCc } from "./store-cc.ts";
import { APP_DETAILS_CACHE_PREFIX } from "./steam-core.ts";
import type { SteamPriceOverview, UpcomingGame } from "./types";

export const EARLY_ACCESS_TAG_ID = 493;
export const EARLY_ACCESS_SEARCH_BASE = "https://store.steampowered.com/search/results/";
export const EARLY_ACCESS_CATALOG_PREFIX = "earlyaccess:catalog:";
export const EARLY_ACCESS_DEFAULT_STORE_CC = "us";
export const EARLY_ACCESS_DEFAULT_PAGE_SIZE = 100;
export const EARLY_ACCESS_MAX_PAGE_SIZE = 100;
export const EARLY_ACCESS_DEFAULT_MAX_PAGES = 8;
export const EARLY_ACCESS_MAX_REQUEST_PAGES = 20;
export const EARLY_ACCESS_DEFAULT_FULL_MAX_PAGES = 260;
export const EARLY_ACCESS_MAX_PAGES_LIMIT = 400;
export const EARLY_ACCESS_DEFAULT_DELAY_MS = 600;
export const EARLY_ACCESS_MAX_DELAY_MS = 5000;
export const EARLY_ACCESS_DEFAULT_TIMEOUT_MS = 15000;
export const EARLY_ACCESS_MAX_TIMEOUT_MS = 60000;
export const EARLY_ACCESS_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
export const EARLY_ACCESS_NEGATIVE_TTL_MS = 60 * 1000;
export const EARLY_ACCESS_DEFAULT_SORT = "reviews_desc";
export const EARLY_ACCESS_GENRE_LABEL = "Early Access";
export const EARLY_ACCESS_DEFAULT_LOOKUP_VALIDATE_MAX = 100;
export const EARLY_ACCESS_LOOKUP_VALIDATE_MAX_LIMIT = 200;
export const EARLY_ACCESS_DEFAULT_DETAILS_MAX = 80;
export const EARLY_ACCESS_DETAILS_MAX_LIMIT = 200;
export const EARLY_ACCESS_OWNED_CACHE_PREFIX = "earlyaccess:owned:details:v4:";
export const EARLY_ACCESS_CATALOG_STATE_TABLE_NAME = "early_access_catalog_state";

export const EARLY_ACCESS_CATALOG_STATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${EARLY_ACCESS_CATALOG_STATE_TABLE_NAME} (
  store_cc TEXT PRIMARY KEY,
  indexed_count INTEGER NOT NULL DEFAULT 0,
  total_known INTEGER,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  complete INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
`;

export const EARLY_ACCESS_CATALOG_STATE_SELECT_SQL = `
SELECT store_cc, indexed_count, total_known, pages_fetched, complete, checked_at, updated_at
FROM ${EARLY_ACCESS_CATALOG_STATE_TABLE_NAME}
WHERE store_cc = ?
`;

export const EARLY_ACCESS_CATALOG_STATE_UPSERT_SQL = `
INSERT INTO ${EARLY_ACCESS_CATALOG_STATE_TABLE_NAME} (
  store_cc,
  indexed_count,
  total_known,
  pages_fetched,
  complete,
  checked_at,
  updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(store_cc) DO UPDATE SET
  indexed_count = CASE
    WHEN excluded.indexed_count >= 0 THEN excluded.indexed_count
    ELSE ${EARLY_ACCESS_CATALOG_STATE_TABLE_NAME}.indexed_count
  END,
  total_known = COALESCE(excluded.total_known, ${EARLY_ACCESS_CATALOG_STATE_TABLE_NAME}.total_known),
  pages_fetched = CASE
    WHEN excluded.pages_fetched >= ${EARLY_ACCESS_CATALOG_STATE_TABLE_NAME}.pages_fetched THEN excluded.pages_fetched
    ELSE ${EARLY_ACCESS_CATALOG_STATE_TABLE_NAME}.pages_fetched
  END,
  complete = excluded.complete,
  checked_at = CASE
    WHEN excluded.checked_at > ${EARLY_ACCESS_CATALOG_STATE_TABLE_NAME}.checked_at THEN excluded.checked_at
    ELSE ${EARLY_ACCESS_CATALOG_STATE_TABLE_NAME}.checked_at
  END,
  updated_at = excluded.updated_at
`;

export const EARLY_ACCESS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS early_access_appids (
  appid INTEGER NOT NULL,
  store_cc TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (appid, store_cc)
);
CREATE INDEX IF NOT EXISTS early_access_appids_store_cc_idx ON early_access_appids (store_cc, checked_at);
CREATE INDEX IF NOT EXISTS early_access_appids_checked_at_idx ON early_access_appids (checked_at);
`;

export const EARLY_ACCESS_EXPERIMENTAL_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS early_access_experimental_appids (
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  store_cc TEXT NOT NULL,
  appid INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (steam_id, store_cc, appid)
);
CREATE INDEX IF NOT EXISTS early_access_experimental_appids_steam_id_idx ON early_access_experimental_appids (steam_id, store_cc, checked_at);
CREATE INDEX IF NOT EXISTS early_access_experimental_appids_store_cc_idx ON early_access_experimental_appids (store_cc, checked_at);
`;

export const EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL = `
INSERT INTO early_access_experimental_appids (steam_id, store_cc, appid, checked_at)
VALUES (?, ?, ?, ?)
ON CONFLICT (steam_id, store_cc, appid) DO UPDATE SET checked_at = excluded.checked_at
`;

export const EARLY_ACCESS_EXPERIMENTAL_LIST_SQL = `
SELECT appid
FROM early_access_experimental_appids
WHERE steam_id = ? AND store_cc = ?
ORDER BY appid
`;

export const EARLY_ACCESS_EXPERIMENTAL_DELETE_SQL = `
DELETE FROM early_access_experimental_appids
WHERE steam_id = ?
`;

export const EARLY_ACCESS_EXPERIMENTAL_DELETE_ONE_SQL = `
DELETE FROM early_access_experimental_appids
WHERE steam_id = ? AND store_cc = ? AND appid = ?
`;

export const EARLY_ACCESS_NEGATIVE_TTL_DAYS_DEFAULT = 7;
export const EARLY_ACCESS_NEGATIVE_CHECK_TTL_MS = EARLY_ACCESS_NEGATIVE_TTL_DAYS_DEFAULT * 24 * 60 * 60 * 1000;

export const EARLY_ACCESS_NEGATIVE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS early_access_negative_appids (
  appid INTEGER NOT NULL,
  store_cc TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (appid, store_cc)
);
CREATE INDEX IF NOT EXISTS early_access_negative_appids_store_cc_idx ON early_access_negative_appids (store_cc, checked_at);
`;

export const EARLY_ACCESS_NEGATIVE_UPSERT_SQL = `
INSERT INTO early_access_negative_appids (appid, store_cc, checked_at)
VALUES (?, ?, ?)
ON CONFLICT (appid, store_cc) DO UPDATE SET checked_at = excluded.checked_at
`;

export const EARLY_ACCESS_NEGATIVE_LIST_SQL = `
SELECT appid
FROM early_access_negative_appids
WHERE store_cc = ? AND checked_at >= ?
`;

export const EARLY_ACCESS_NEGATIVE_DELETE_ONE_SQL = `
DELETE FROM early_access_negative_appids
WHERE appid = ? AND store_cc = ?
`;

/** Drops appids recently confirmed as not Early Access so validation advances through the library. */
export function excludeRecentlyNegativeAppids(
  appids: readonly number[],
  negativeAppids: ReadonlySet<number>
): number[] {
  if (negativeAppids.size === 0) return [...appids];
  return appids.filter((appid) => !negativeAppids.has(appid));
}

export const EARLY_ACCESS_BLACKLIST_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS early_access_blacklist (
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  appid INTEGER NOT NULL,
  name TEXT NOT NULL,
  header_image TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (steam_id, appid)
);
`;

export const EARLY_ACCESS_BLACKLIST_UPSERT_SQL = `
INSERT INTO early_access_blacklist (steam_id, appid, name, header_image, created_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT (steam_id, appid) DO UPDATE SET
  name = excluded.name,
  header_image = COALESCE(excluded.header_image, early_access_blacklist.header_image)
`;

export const EARLY_ACCESS_BLACKLIST_LIST_SQL = `
SELECT appid, name, header_image, created_at
FROM early_access_blacklist
WHERE steam_id = ?
ORDER BY created_at DESC, appid
`;

export const EARLY_ACCESS_BLACKLIST_DELETE_ONE_SQL = `
DELETE FROM early_access_blacklist
WHERE steam_id = ? AND appid = ?
`;

/** Bulk delete: placeholders are filled with one "?" per appid. */
export function earlyAccessBlacklistDeleteManySql(count: number): string {
  return `DELETE FROM early_access_blacklist WHERE steam_id = ? AND appid IN (${Array.from(
    { length: Math.max(1, count) },
    () => "?"
  ).join(",")})`;
}

export interface EarlyAccessBlacklistEntry {
  appid: number;
  name: string;
  headerImage?: string;
  createdAt: number;
}

/** Hides blacklisted games from an Early Access result without touching cached data. */
export function applyEarlyAccessBlacklist<T extends { games: EarlyAccessGame[] }>(
  result: T,
  blacklisted: ReadonlySet<number>
): T {
  if (blacklisted.size === 0 || result.games.length === 0) return result;
  return { ...result, games: result.games.filter((game) => !blacklisted.has(game.appid)) };
}

export const EARLY_ACCESS_UPSERT_SQL = `
INSERT INTO early_access_appids (appid, store_cc, checked_at)
VALUES (?, ?, ?)
ON CONFLICT (appid, store_cc) DO UPDATE SET checked_at = excluded.checked_at
`;

export const EARLY_ACCESS_LIST_SQL = `
SELECT appid
FROM early_access_appids
WHERE store_cc = ?
ORDER BY appid
`;

export const EARLY_ACCESS_META_SQL = `
SELECT COUNT(*) AS appid_count, MAX(checked_at) AS checked_at
FROM early_access_appids
WHERE store_cc = ?
`;

export interface EarlyAccessSearchPage {
  appids: number[];
  itemCount: number;
  totalCount?: number;
}

export interface EarlyAccessCatalogStatus {
  ready: boolean;
  storeCc: string;
  indexedCount: number;
  checkedAt: number;
  pagesFetched: number;
  totalKnown?: number;
  complete?: boolean;
  partial: boolean;
  warnings: string[];
}

export interface EarlyAccessIndexMetaRow {
  appid_count?: number | string;
  checked_at?: number | string;
}

export interface EarlyAccessCatalogStateRow {
  store_cc?: string;
  indexed_count?: number | string;
  total_known?: number | string | null;
  pages_fetched?: number | string;
  complete?: number | string | null;
  checked_at?: number | string;
  updated_at?: number | string;
}

export interface EarlyAccessGame {
  appid: number;
  name: string;
  steamUrl: string;
  playtimeForever?: number;
  headerImage?: string;
  steamType?: string;
  isFree?: boolean;
  releaseDate?: string;
  releaseYear?: number;
  price?: SteamPriceOverview;
  steamGenres?: string[];
}

export interface EarlyAccessAppDetailsInput {
  name?: string | null;
  type?: string | null;
  is_free?: boolean | null;
  header_image?: string | null;
  genres?: { id?: string; description?: string | null }[] | null;
  price_overview?: SteamPriceOverview | null;
  release_date?: { date?: string | null; coming_soon?: boolean | null } | null;
}

export interface EarlyAccessSessionResult {
  ready: boolean;
  reason?: "signed_out" | "no_api_key" | "no_index" | "steam_api" | "in_progress" | "error";
  storeCc: string;
  games: EarlyAccessGame[];
  indexedCount: number;
  checkedAt: number;
  totalKnown?: number;
  partial: boolean;
  warnings: string[];
}

export interface EarlyAccessLookupResult {
  ready: boolean;
  reason?: "no_index" | "invalid_appids";
  storeCc: string;
  appids: number[];
  earlyAccessAppids: number[];
  indexedCount: number;
  checkedAt: number;
  totalKnown?: number;
  partial: boolean;
  warnings: string[];
}

export interface EarlyAccessAppDetailsCacheKeyParts {
  appid: number;
  storeCc?: string;
}

export interface EarlyAccessCachedConfirmedAppid {
  appid: number;
  storeCc?: string;
  updatedAt?: number;
}

export interface SelectEarlyAccessExperimentalValidateAppidsInput {
  missingAppids: readonly number[];
  cachedAppids?: readonly EarlyAccessCachedConfirmedAppid[];
  uncachedValidateBudget?: number;
  validateBudget?: number;
  unboundedUncachedValidation?: boolean;
  preferredStoreCc?: string | null;
}

export interface SelectEarlyAccessExperimentalValidateAppidsResult {
  cachedAppids: number[];
  uncachedAppids: number[];
  appids: number[];
}

export interface EarlyAccessPageLoopInput {
  start: number;
  pageCount: number;
  itemCount: number;
  pageSize: number;
  totalCount?: number;
  maxPages: number;
}

export interface EarlyAccessCreateStatusInput {
  storeCc: string;
  indexedCount: number;
  checkedAt: number;
  pagesFetched: number;
  totalKnown?: number;
  complete?: boolean;
  reason?: string;
  warnings?: string[];
}

export interface EarlyAccessFetchCompletionInput {
  indexedCount: number;
  existingIndexedCount: number;
  totalKnown?: number;
  pagesFetched: number;
  maxPages: number;
  pageSize: number;
  lastItemCount?: number;
}

function readPositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  const value = Math.floor(parsed);
  return max ? Math.min(value, max) : value;
}

function readNonNegativeInt(raw: string | undefined, fallback: number, max?: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  const value = Math.floor(parsed);
  return max ? Math.min(value, max) : value;
}

function readBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function readInteger(raw: unknown, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function readOptionalInteger(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.floor(parsed));
}

function readFlag(raw: unknown): boolean | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed !== 0;
  }
  return undefined;
}

const APP_DETAILS_CACHE_KEY_PATTERN = new RegExp(
  `^${APP_DETAILS_CACHE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)(?::([a-z]{2}))?$`,
  "i"
);

function cachedAppDetailsCandidateRank(
  candidateStoreCc: string | undefined,
  preferredStoreCc: string | undefined
): number {
  if (!preferredStoreCc) return 0;
  if (candidateStoreCc === preferredStoreCc) return 0;
  if (!candidateStoreCc) return 1;
  return 2;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isPositiveAppid(value: number): value is number {
  return Number.isSafeInteger(value) && value > 0;
}

export function parseAppIdList(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? [value] : [value];
  const appids = new Set<number>();

  for (const raw of rawValues) {
    if (typeof raw === "number") {
      if (isPositiveAppid(raw)) appids.add(raw);
      continue;
    }
    if (typeof raw !== "string") continue;
    for (const part of raw.split(/[,\s]+/)) {
      const parsed = Number(part);
      if (isPositiveAppid(parsed)) appids.add(parsed);
    }
  }

  return [...appids];
}

export function earlyAccessStoreCc(value?: string | null): string {
  return (
    normalizeSteamStoreCc(value) ??
    normalizeSteamStoreCc(process.env.EARLY_ACCESS_STORE_CC) ??
    EARLY_ACCESS_DEFAULT_STORE_CC
  );
}

export function parseAppDetailsCacheKey(
  value: unknown
): EarlyAccessAppDetailsCacheKeyParts | undefined {
  if (typeof value !== "string") return undefined;

  const match = APP_DETAILS_CACHE_KEY_PATTERN.exec(value);
  if (!match) return undefined;

  const appid = Number(match[1]);
  if (!isPositiveAppid(appid)) return undefined;

  const storeCc = normalizeSteamStoreCc(match[2]);
  return storeCc ? { appid, storeCc } : { appid };
}

export function selectEarlyAccessExperimentalValidateAppids(
  input: SelectEarlyAccessExperimentalValidateAppidsInput
): SelectEarlyAccessExperimentalValidateAppidsResult {
  const uncachedValidateBudget = input.uncachedValidateBudget ?? input.validateBudget ?? 0;
  const uncachedLimit = input.unboundedUncachedValidation
    ? Number.POSITIVE_INFINITY
    : Number.isFinite(uncachedValidateBudget)
      ? Math.max(0, Math.floor(uncachedValidateBudget))
      : 0;

  const missingSet = new Set<number>();
  for (const appid of input.missingAppids) {
    if (isPositiveAppid(appid)) missingSet.add(appid);
  }

  const empty: SelectEarlyAccessExperimentalValidateAppidsResult = {
    cachedAppids: [],
    uncachedAppids: [],
    appids: [],
  };
  if (missingSet.size === 0) return empty;

  const preferredStoreCc = normalizeSteamStoreCc(input.preferredStoreCc);
  const cachedCandidates = (input.cachedAppids ?? []).filter((candidate) => {
    return isPositiveAppid(candidate.appid) && missingSet.has(candidate.appid);
  });

  cachedCandidates.sort((a, b) => {
    const rank =
      cachedAppDetailsCandidateRank(a.storeCc, preferredStoreCc) -
      cachedAppDetailsCandidateRank(b.storeCc, preferredStoreCc);
    if (rank !== 0) return rank;

    const updatedAt = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (updatedAt !== 0) return updatedAt;

    return a.appid - b.appid;
  });

  const cachedAppids: number[] = [];
  const uncachedAppids: number[] = [];
  const selected = new Set<number>();

  for (const candidate of cachedCandidates) {
    if (selected.has(candidate.appid)) continue;
    selected.add(candidate.appid);
    cachedAppids.push(candidate.appid);
  }

  if (uncachedLimit > 0) {
    for (const appid of input.missingAppids) {
      if (uncachedAppids.length >= uncachedLimit) break;
      if (!isPositiveAppid(appid) || selected.has(appid)) continue;
      selected.add(appid);
      uncachedAppids.push(appid);
    }
  }

  return {
    cachedAppids,
    uncachedAppids,
    appids: [...cachedAppids, ...uncachedAppids],
  };
}

export function earlyAccessCatalogCacheKey(value?: string | null): string {
  return `${EARLY_ACCESS_CATALOG_PREFIX}${earlyAccessStoreCc(value)}`;
}

export function earlyAccessPageSize(pageSizeInput?: number | string | null): number {
  if (typeof pageSizeInput === "number" && Number.isFinite(pageSizeInput) && pageSizeInput > 0) {
    return Math.max(1, Math.min(Math.floor(pageSizeInput), EARLY_ACCESS_MAX_PAGE_SIZE));
  }
  if (typeof pageSizeInput === "string" && pageSizeInput.trim()) {
    const parsed = Number(pageSizeInput);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.min(Math.floor(parsed), EARLY_ACCESS_MAX_PAGE_SIZE));
    }
  }
  return readPositiveInt(process.env.EARLY_ACCESS_PAGE_SIZE, EARLY_ACCESS_DEFAULT_PAGE_SIZE, EARLY_ACCESS_MAX_PAGE_SIZE);
}

export function earlyAccessMaxPages(): number {
  return readPositiveInt(process.env.EARLY_ACCESS_MAX_PAGES, EARLY_ACCESS_DEFAULT_MAX_PAGES, EARLY_ACCESS_MAX_REQUEST_PAGES);
}

export function earlyAccessLookupValidateMax(): number {
  return readPositiveInt(
    process.env.EARLY_ACCESS_LOOKUP_VALIDATE_MAX,
    EARLY_ACCESS_DEFAULT_LOOKUP_VALIDATE_MAX,
    EARLY_ACCESS_LOOKUP_VALIDATE_MAX_LIMIT
  );
}

export function earlyAccessDetailsMax(): number {
  return readPositiveInt(
    process.env.EARLY_ACCESS_DETAILS_MAX,
    EARLY_ACCESS_DEFAULT_DETAILS_MAX,
    EARLY_ACCESS_DETAILS_MAX_LIMIT
  );
}

export function earlyAccessFullMaxPages(): number {
  return readPositiveInt(process.env.EARLY_ACCESS_FULL_MAX_PAGES, EARLY_ACCESS_DEFAULT_FULL_MAX_PAGES, EARLY_ACCESS_MAX_PAGES_LIMIT);
}

export function earlyAccessSearchDelayMs(): number {
  return readNonNegativeInt(process.env.EARLY_ACCESS_SEARCH_DELAY_MS, EARLY_ACCESS_DEFAULT_DELAY_MS, EARLY_ACCESS_MAX_DELAY_MS);
}

export function earlyAccessTimeoutMs(): number {
  return readPositiveInt(process.env.EARLY_ACCESS_TIMEOUT_MS, EARLY_ACCESS_DEFAULT_TIMEOUT_MS, EARLY_ACCESS_MAX_TIMEOUT_MS);
}

export function earlyAccessSearchSort(value?: string | null): string {
  const raw = (value ?? process.env.EARLY_ACCESS_SEARCH_SORT ?? EARLY_ACCESS_DEFAULT_SORT).trim().toLowerCase();
  return /^[a-z0-9_]+$/.test(raw) ? raw : EARLY_ACCESS_DEFAULT_SORT;
}

export function earlyAccessDebugEnabled(): boolean {
  return readBoolean(process.env.EARLY_ACCESS_DEBUG ?? process.env.APP_DEBUG, false);
}

export function sleep(ms: number): Promise<void> {
  const safeMs = Math.max(0, Math.min(Math.floor(Number(ms) || 0), 5000));
  return new Promise((resolve) => setTimeout(resolve, safeMs));
}

export function earlyAccessSearchUrl(
  storeCcInput?: string | null,
  start = 0,
  pageSizeInput = earlyAccessPageSize(),
  options: { sort?: string | null; infinite?: boolean } = {}
): URL {
  const url = new URL(EARLY_ACCESS_SEARCH_BASE);
  url.searchParams.set("tags", String(EARLY_ACCESS_TAG_ID));
  url.searchParams.set("cc", earlyAccessStoreCc(storeCcInput));
  url.searchParams.set("l", "en");
  url.searchParams.set("count", String(earlyAccessPageSize(pageSizeInput)));
  url.searchParams.set("start", String(Math.max(0, Math.floor(Number(start) || 0))));
  if (options.infinite !== false) {
    url.searchParams.set("infinite", "1");
    url.searchParams.set("filters", earlyAccessSearchSort(options.sort));
  }
  return url;
}

function readTotalCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return undefined;
}

function addAppid(target: Set<number>, value: unknown): void {
  if (typeof value === "number") {
    if (isPositiveAppid(value)) target.add(value);
    return;
  }
  if (typeof value !== "string" || !value.trim()) return;
  for (const part of value.split(/[,\s]+/)) {
    const parsed = Number(part);
    if (isPositiveAppid(parsed)) target.add(parsed);
  }
}

function collectAppidsFromText(value: unknown, target: Set<number>): void {
  if (typeof value !== "string" || !value) return;
  const pattern = /\/app(?:s)?\/(\d+)\/?/g;
  for (const match of value.matchAll(pattern)) {
    const parsed = Number(match[1]);
    if (isPositiveAppid(parsed)) target.add(parsed);
  }
}

function collectDataAppids(value: unknown, target: Set<number>): void {
  if (typeof value !== "string" || !value) return;
  const pattern = /data-ds-appid="(\d+(?:\s*,\s*\d+)*)"/g;
  for (const match of value.matchAll(pattern)) {
    addAppid(target, match[1]);
  }
}

export function parseEarlyAccessSearchPage(data: unknown): EarlyAccessSearchPage {
  const record = asRecord(data);
  if (!record) return { appids: [], itemCount: 0 };

  const appids = new Set<number>();
  const items = record.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      const entry = asRecord(item);
      if (!entry) continue;
      const direct = entry.appid ?? entry.app_id ?? entry.appId;
      if (direct !== undefined) {
        addAppid(appids, direct);
        continue;
      }
      collectAppidsFromText(entry.logo, appids);
      collectAppidsFromText(entry.url, appids);
    }
  }

  for (const key of ["results_html", "search_html", "html", "results"]) {
    const value = record[key];
    if (typeof value === "string") {
      collectDataAppids(value, appids);
      collectAppidsFromText(value, appids);
    }
  }

  return {
    appids: [...appids],
    itemCount: appids.size,
    totalCount: readTotalCount(record.total_count ?? record.totalCount),
  };
}

export function shouldFetchNextEarlyAccessPage(input: EarlyAccessPageLoopInput): boolean {
  if (input.pageCount >= input.maxPages) return false;
  if (input.itemCount <= 0) return false;
  if (input.totalCount !== undefined && Number.isFinite(input.totalCount)) {
    return input.start + input.itemCount < input.totalCount;
  }
  return input.itemCount >= input.pageSize;
}

export function createEarlyAccessCatalogStatus(input: EarlyAccessCreateStatusInput): EarlyAccessCatalogStatus {
  const totalKnown = input.totalKnown;
  const complete = input.complete;
  const partial =
    complete === undefined
      ? totalKnown === undefined
        ? input.indexedCount === 0
        : input.indexedCount < totalKnown
      : !complete;
  const warnings = new Set<string>(input.warnings ?? []);
  if (partial) warnings.add("early_access_index_partial");
  if (input.reason) warnings.add(input.reason);

  return {
    ready: input.indexedCount > 0,
    storeCc: input.storeCc,
    indexedCount: input.indexedCount,
    checkedAt: input.checkedAt,
    pagesFetched: input.pagesFetched,
    totalKnown,
    complete: complete ?? !partial,
    partial,
    warnings: [...warnings],
  };
}

export function inferEarlyAccessFetchComplete(input: EarlyAccessFetchCompletionInput): boolean {
  if (input.totalKnown !== undefined) {
    return (
      input.indexedCount === input.totalKnown &&
      input.existingIndexedCount <= input.totalKnown &&
      input.pagesFetched > 0
    );
  }

  if (input.pagesFetched <= 0 || input.pagesFetched >= input.maxPages) return false;
  if (input.lastItemCount === undefined) return false;
  if (input.lastItemCount === 0) {
    return input.existingIndexedCount === 0 || input.pagesFetched > 1;
  }
  return input.lastItemCount < input.pageSize;
}

export function createEarlyAccessCatalogStatusFromDb(input: {
  storeCc: string;
  meta?: EarlyAccessIndexMetaRow;
  state?: EarlyAccessCatalogStateRow;
}): EarlyAccessCatalogStatus {
  const hasState = Boolean(input.state);
  const indexedCount = Math.max(
    readInteger(input.meta?.appid_count, 0),
    readInteger(input.state?.indexed_count, 0)
  );
  const checkedAt = Math.max(
    readInteger(input.meta?.checked_at, 0),
    readInteger(input.state?.checked_at, 0)
  );
  const pagesFetched = readInteger(input.state?.pages_fetched, 0);
  const totalKnown = input.state ? readOptionalInteger(input.state.total_known) : undefined;
  const persistedComplete = input.state ? readFlag(input.state.complete) : undefined;

  let complete: boolean;
  if (indexedCount === 0) {
    complete = persistedComplete === true && totalKnown === 0;
  } else if (!hasState || persistedComplete === false) {
    complete = false;
  } else if (persistedComplete === true) {
    complete = totalKnown === undefined ? true : indexedCount <= totalKnown;
  } else {
    complete = totalKnown !== undefined && indexedCount >= totalKnown;
  }

  return createEarlyAccessCatalogStatus({
    storeCc: input.storeCc,
    indexedCount,
    checkedAt,
    pagesFetched,
    totalKnown,
    complete,
    warnings: indexedCount === 0 ? ["early_access_index_empty"] : [],
  });
}

function normalizeGenreDescriptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const genres = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string") {
      const genre = entry.trim();
      if (genre) genres.add(genre);
      continue;
    }

    const entryRecord = asRecord(entry);
    const description = entryRecord?.description;
    if (typeof description !== "string") continue;
    const genre = description.trim();
    if (genre) genres.add(genre);
  }

  return [...genres];
}

export function hasEarlyAccessGenre(genres: readonly string[] | null | undefined): boolean {
  const label = EARLY_ACCESS_GENRE_LABEL.toLowerCase();
  return genres?.some((genre) => genre.trim().toLowerCase() === label) ?? false;
}

export function isEarlyAccessConfirmedAppDetails(
  details: EarlyAccessAppDetailsInput | null | undefined
): boolean | null {
  if (!details) return null;

  const genres = normalizeGenreDescriptions(details.genres);
  if (genres.length > 0) return hasEarlyAccessGenre(genres);
  return details.genres ? false : null;
}

export function isEarlyAccessConfirmedGame(game: EarlyAccessGame): boolean | null {
  if (game.steamGenres === undefined) return null;
  return hasEarlyAccessGenre(game.steamGenres);
}

export function applyEarlyAccessAppDetails(
  game: EarlyAccessGame,
  details: EarlyAccessAppDetailsInput | null | undefined
): EarlyAccessGame {
  if (!details) return game;

  const dateInfo = parseSteamDateInfo(details.release_date?.date ?? undefined);
  const releaseDate =
    details.release_date?.coming_soon === true || isPlaceholderYearEndDate(dateInfo.date)
      ? undefined
      : dateInfo.date ?? undefined;

  const steamGenres = details.genres ? normalizeGenreDescriptions(details.genres) : game.steamGenres;

  return {
    ...game,
    name: details.name?.trim() || game.name,
    headerImage: details.header_image?.trim() || game.headerImage,
    steamType: details.type?.trim() || game.steamType,
    isFree: typeof details.is_free === "boolean" ? details.is_free : game.isFree,
    releaseDate: releaseDate ?? game.releaseDate,
    releaseYear: dateInfo.year ?? game.releaseYear,
    price: details.price_overview ?? game.price,
    steamGenres,
  };
}

export function normalizeEarlyAccessGame(
  value: { appid: number; name?: string | null; playtime_forever?: number | null }
): EarlyAccessGame {
  return {
    appid: value.appid,
    name: value.name?.trim() || `Steam App ${value.appid}`,
    steamUrl: `https://store.steampowered.com/app/${value.appid}/`,
    playtimeForever: Number.isFinite(value.playtime_forever) ? Math.max(0, Math.floor(value.playtime_forever as number)) : 0,
  };
}

export function earlyAccessGameToUpcoming(game: EarlyAccessGame): UpcomingGame {
  return {
    appid: game.appid,
    name: game.name,
    headerImage: game.headerImage,
    sources: ["library"],
    releaseDate: game.releaseDate ?? null,
    releaseYear: game.releaseYear,
    dateSource: game.releaseDate
      ? "steam"
      : typeof game.releaseYear === "number"
        ? "steamYear"
        : "unknown",
    steamUrl: game.steamUrl,
    steamType: game.steamType,
    isFree: game.isFree,
    playtimeForever: game.playtimeForever,
    price: game.price,
  };
}
