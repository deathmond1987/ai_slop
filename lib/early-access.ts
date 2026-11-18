import "server-only";
import { cacheGet, cacheSet, listCacheEntriesByExactOrPrefix } from "./cache-store";
import {
  applyEarlyAccessAppDetails,
  createEarlyAccessCatalogStatus,
  earlyAccessCatalogCacheKey,
  earlyAccessDebugEnabled,
  earlyAccessFullMaxPages,
  earlyAccessLookupValidateMax,
  earlyAccessMaxPages,
  earlyAccessPageSize,
  earlyAccessSearchDelayMs,
  earlyAccessSearchSort,
  earlyAccessSearchUrl,
  earlyAccessStoreCc,
  earlyAccessTimeoutMs,
  createEarlyAccessCatalogStatusFromDb,
  inferEarlyAccessFetchComplete,
  EARLY_ACCESS_CATALOG_STATE_SELECT_SQL,
  EARLY_ACCESS_CATALOG_STATE_UPSERT_SQL,
  EARLY_ACCESS_CATALOG_TTL_MS,
  EARLY_ACCESS_EXPERIMENTAL_DELETE_ONE_SQL,
  EARLY_ACCESS_EXPERIMENTAL_LIST_SQL,
  EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL,
  EARLY_ACCESS_LIST_SQL,
  EARLY_ACCESS_META_SQL,
  EARLY_ACCESS_NEGATIVE_TTL_MS,
  EARLY_ACCESS_OWNED_CACHE_PREFIX,
  EARLY_ACCESS_UPSERT_SQL,
  isEarlyAccessConfirmedAppDetails,
  isEarlyAccessConfirmedGame,
  normalizeEarlyAccessGame,
  parseAppDetailsCacheKey,
  parseAppIdList,
  parseEarlyAccessSearchPage,
  selectEarlyAccessExperimentalValidateAppids,
  shouldFetchNextEarlyAccessPage,
  sleep,
  type EarlyAccessAppDetailsInput,
  type EarlyAccessCachedConfirmedAppid,
  type EarlyAccessCatalogStateRow,
  type EarlyAccessCatalogStatus,
  type EarlyAccessGame,
  type EarlyAccessIndexMetaRow,
  type EarlyAccessLookupResult,
  type EarlyAccessSearchPage,
  type EarlyAccessSessionResult,
} from "./early-access-core.ts";
import { keyHash } from "./key-hash.ts";
import { logDebug, sanitizeDebugError, sanitizeDebugText } from "./debug";
import { APP_DETAILS_CACHE_PREFIX } from "./steam-core.ts";
import { getAppDetails, getOwnedGames } from "./steam";
import { getStatementRow, prepare, runStatement } from "./sqlite";
import type { SteamSession } from "./types";

const EARLY_ACCESS_OWNED_TTL_MS = 10 * 60 * 1000;
const EARLY_ACCESS_PARTIAL_TTL_MS = 6 * 60 * 60 * 1000;
const EARLY_ACCESS_PROGRESS_TTL_MS = 2 * 60 * 1000;
const EARLY_ACCESS_VALIDATE_CHUNK = 20;
const COVERAGE_WARNINGS = new Set([
  "early_access_index_empty",
  "early_access_index_partial",
  "early_access_page_cap",
  "early_access_search_empty",
]);
const pendingCatalogStatuses = new Map<string, Promise<EarlyAccessCatalogStatus>>();
const pendingSessionResults = new Map<string, Promise<EarlyAccessSessionResult>>();
const sessionProgressResults = new Map<string, EarlyAccessSessionResult>();

export interface EarlyAccessFetchOptions {
  refresh?: boolean;
  full?: boolean;
  pages?: number | null | undefined;
}

interface EarlyAccessBuildOptions extends EarlyAccessFetchOptions {
  onProgress?: (result: EarlyAccessSessionResult) => Promise<void> | void;
}

export interface EarlyAccessLookupOptions extends EarlyAccessFetchOptions {
  storeCc?: string | null;
  steamId?: string | null;
  experimentalEarlyAccess?: boolean;
}

function catalogCacheTtl(status: EarlyAccessCatalogStatus): number {
  if (!status.ready) return EARLY_ACCESS_NEGATIVE_TTL_MS;
  return status.partial ? EARLY_ACCESS_PARTIAL_TTL_MS : EARLY_ACCESS_CATALOG_TTL_MS;
}

function clampPositiveInt(value: number | null | undefined, max: number): number | undefined {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(1, Math.min(Math.floor(value), max));
}

function maxPagesForOptions(options: EarlyAccessFetchOptions): number {
  if (options.full) {
    const maxPages = earlyAccessFullMaxPages();
    return clampPositiveInt(options.pages, maxPages) ?? maxPages;
  }

  const maxPages = earlyAccessMaxPages();
  return clampPositiveInt(options.pages, maxPages) ?? maxPages;
}

async function searchJson(url: URL): Promise<unknown> {
  const safeUrl = sanitizeDebugText(url.toString());
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(earlyAccessTimeoutMs()),
      headers: {
        "User-Agent": "SteamCalendarCompanion/1.0",
        Accept: "application/json,text/plain,*/*",
      },
    });
    if (!res.ok) throw new Error(`Steam search ${res.status}: ${safeUrl}`);
    return res.json();
  } catch (error) {
    logDebug("earlyAccess.search.failed", {
      url: safeUrl,
      error: sanitizeDebugError(error),
    });
    throw error;
  }
}

async function loadCatalogStatusFromDb(storeCc: string): Promise<EarlyAccessCatalogStatus> {
  const meta = await getStatementRow<EarlyAccessIndexMetaRow>(EARLY_ACCESS_META_SQL, storeCc);
  const state = await getStatementRow<EarlyAccessCatalogStateRow>(EARLY_ACCESS_CATALOG_STATE_SELECT_SQL, storeCc);
  return createEarlyAccessCatalogStatusFromDb({ storeCc, meta, state });
}

async function persistEarlyAccessCatalogStatus(status: EarlyAccessCatalogStatus): Promise<void> {
  if (status.indexedCount <= 0 && status.totalKnown === undefined && status.pagesFetched <= 0) return;

  await runStatement(
    EARLY_ACCESS_CATALOG_STATE_UPSERT_SQL,
    status.storeCc,
    status.indexedCount,
    status.totalKnown ?? null,
    status.pagesFetched,
    status.complete ?? !status.partial ? 1 : 0,
    status.checkedAt,
    Date.now()
  );
}

async function refreshCatalogStatusAfterGlobalBackfill(
  storeCc: string
): Promise<EarlyAccessCatalogStatus> {
  const status = await loadCatalogStatusFromDb(storeCc);
  await persistEarlyAccessCatalogStatus(status);
  await cacheSet(earlyAccessCatalogCacheKey(storeCc), status, catalogCacheTtl(status));
  return status;
}

function syncCoverageWarnings(warnings: Set<string>, status: EarlyAccessCatalogStatus): void {
  for (const warning of [...warnings]) {
    if (COVERAGE_WARNINGS.has(warning)) warnings.delete(warning);
  }
  for (const warning of status.warnings) {
    if (COVERAGE_WARNINGS.has(warning)) warnings.add(warning);
  }
}

async function storeGlobalEarlyAccessAppIds(
  storeCc: string,
  appids: readonly number[]
): Promise<{ saved: number; failed: number }> {
  if (appids.length === 0) return { saved: 0, failed: 0 };

  const checkedAt = Date.now();
  let saved = 0;
  let failed = 0;

  for (const appid of appids) {
    if (!Number.isSafeInteger(appid) || appid <= 0) continue;
    try {
      const savedRow = await runStatement(EARLY_ACCESS_UPSERT_SQL, appid, storeCc, checkedAt);
      if (savedRow) saved += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      logDebug("earlyAccess.storeGlobalAppid.failed", {
        appid,
        storeCc,
        error: sanitizeDebugError(error),
      });
    }
  }

  return { saved, failed };
}

async function fetchEarlyAccessCatalog(
  storeCc: string,
  options: EarlyAccessFetchOptions
): Promise<EarlyAccessCatalogStatus> {
  const pageSize = earlyAccessPageSize();
  const sort = earlyAccessSearchSort();
  const delayMs = earlyAccessSearchDelayMs();
  const maxPages = maxPagesForOptions(options);
  const warnings = new Set<string>();
  const checkedAt = Date.now();
  const dbBefore = await loadCatalogStatusFromDb(storeCc);
  let start = 0;
  let pagesFetched = 0;
  let inserted = 0;
  let totalKnown: number | undefined;
  let lastItemCount: number | undefined;

  async function persistProgressStatus(): Promise<void> {
    if (pagesFetched <= 0) return;

    const progressMeta = await getStatementRow<EarlyAccessIndexMetaRow>(
      EARLY_ACCESS_META_SQL,
      storeCc
    );
    const progressIndexedCount = Number.isFinite(Number(progressMeta?.appid_count))
      ? Number(progressMeta?.appid_count)
      : dbBefore.indexedCount + inserted;
    const progressCheckedAt = Number.isFinite(Number(progressMeta?.checked_at))
      ? Number(progressMeta?.checked_at)
      : checkedAt;

    await persistEarlyAccessCatalogStatus(
      createEarlyAccessCatalogStatus({
        storeCc,
        indexedCount: progressIndexedCount,
        checkedAt: progressCheckedAt,
        pagesFetched,
        totalKnown,
        complete: false,
        warnings: [...warnings],
      })
    );
  }

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const url = earlyAccessSearchUrl(storeCc, start, pageSize, { sort, infinite: true });

    let parsed: EarlyAccessSearchPage;
    try {
      parsed = parseEarlyAccessSearchPage(await searchJson(url));
    } catch (error) {
      await persistProgressStatus();
      throw error;
    }

    pagesFetched += 1;
    lastItemCount = parsed.itemCount;

    if (parsed.totalCount !== undefined) totalKnown = parsed.totalCount;

    if (parsed.appids.length === 0) {
      warnings.add("early_access_search_empty");
      break;
    }

    for (const appid of parsed.appids) {
      const saved = await runStatement(EARLY_ACCESS_UPSERT_SQL, appid, storeCc, checkedAt);
      if (saved) inserted += 1;
      else warnings.add("early_access_sql_write_failed");
    }

    if (earlyAccessDebugEnabled()) {
      logDebug("earlyAccess.page.saved", {
        storeCc,
        start,
        pageSize,
        itemCount: parsed.itemCount,
        totalCount: parsed.totalCount,
        inserted,
      });
    }

    await persistProgressStatus();

    if (
      !shouldFetchNextEarlyAccessPage({
        start,
        pageCount: pagesFetched,
        itemCount: parsed.itemCount,
        pageSize,
        totalCount: totalKnown,
        maxPages,
      })
    ) {
      break;
    }

    start += pageSize;
    if (delayMs > 0) await sleep(delayMs);
  }

  const meta = await getStatementRow<EarlyAccessIndexMetaRow>(EARLY_ACCESS_META_SQL, storeCc);
  const indexedCount = Number.isFinite(Number(meta?.appid_count))
    ? Number(meta?.appid_count)
    : dbBefore.indexedCount + inserted;
  const checkedAtResult = Number.isFinite(Number(meta?.checked_at)) ? Number(meta?.checked_at) : checkedAt;
  const complete = inferEarlyAccessFetchComplete({
    indexedCount,
    existingIndexedCount: dbBefore.indexedCount,
    totalKnown,
    pagesFetched,
    maxPages,
    pageSize,
    lastItemCount,
  });

  if (pagesFetched >= maxPages && totalKnown !== undefined && indexedCount < totalKnown) {
    warnings.add("early_access_page_cap");
  }

  const status = createEarlyAccessCatalogStatus({
    storeCc,
    indexedCount,
    checkedAt: checkedAtResult,
    pagesFetched,
    totalKnown,
    complete,
    warnings: [...warnings],
  });

  await persistEarlyAccessCatalogStatus(status);
  return status;
}

export async function ensureEarlyAccessCatalog(
  storeCcInput: string | null | undefined,
  options: EarlyAccessFetchOptions = {}
): Promise<EarlyAccessCatalogStatus> {
  const storeCc = earlyAccessStoreCc(storeCcInput);
  const cacheKey = earlyAccessCatalogCacheKey(storeCc);
  const dbStatus = await loadCatalogStatusFromDb(storeCc);

  if (!options.refresh && dbStatus.ready) {
    await cacheSet(cacheKey, dbStatus, catalogCacheTtl(dbStatus));
    return dbStatus;
  }

  if (options.refresh && dbStatus.ready && !options.full && !options.pages) {
    return dbStatus;
  }

  if (!options.refresh) {
    const cached = await cacheGet<EarlyAccessCatalogStatus>(cacheKey);
    if (cached) return cached;
  }

  const inflight = pendingCatalogStatuses.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    let status: EarlyAccessCatalogStatus;
    try {
      status = await fetchEarlyAccessCatalog(storeCc, options);
    } catch (error) {
      const fallback = await loadCatalogStatusFromDb(storeCc);
      status = createEarlyAccessCatalogStatus({
        storeCc,
        indexedCount: fallback.indexedCount,
        checkedAt: fallback.checkedAt,
        pagesFetched: fallback.pagesFetched,
        totalKnown: fallback.totalKnown,
        complete: fallback.complete,
        warnings: [...fallback.warnings, "early_access_fetch_failed"],
      });
      logDebug("earlyAccess.catalog.failed", {
        storeCc,
        error: sanitizeDebugError(error),
      });
    }

    await cacheSet(cacheKey, status, catalogCacheTtl(status));
    return status;
  })().finally(() => {
    pendingCatalogStatuses.delete(cacheKey);
  });

  pendingCatalogStatuses.set(cacheKey, promise);
  return promise;
}

async function loadEarlyAccessAppIdSet(storeCc: string): Promise<Set<number>> {
  const appids = new Set<number>();
  const statement = await prepare(EARLY_ACCESS_LIST_SQL);
  if (!statement) return appids;

  try {
    const rows = statement.all(storeCc) as { appid?: unknown }[];
    for (const row of rows) {
      const appid = Number(row.appid);
      if (Number.isSafeInteger(appid) && appid > 0) appids.add(appid);
    }
  } catch (error) {
    logDebug("earlyAccess.loadAppids.failed", {
      storeCc,
      error: sanitizeDebugError(error),
    });
  }

    return appids;
}

async function loadExperimentalEarlyAccessAppIdSet(
  steamId: string | null | undefined,
  storeCc: string
): Promise<Set<number>> {
  const appids = new Set<number>();
  if (!steamId) return appids;

  const statement = await prepare(EARLY_ACCESS_EXPERIMENTAL_LIST_SQL);
  if (!statement) return appids;

  try {
    const rows = statement.all(steamId, storeCc) as { appid?: unknown }[];
    for (const row of rows) {
      const appid = Number(row.appid);
      if (Number.isSafeInteger(appid) && appid > 0) appids.add(appid);
    }
  } catch (error) {
    logDebug("earlyAccess.loadExperimentalAppids.failed", {
      hasSteamId: true,
      storeCc,
      error: sanitizeDebugError(error),
    });
  }

  return appids;
}

async function storeExperimentalEarlyAccessAppIds(
  steamId: string | null | undefined,
  storeCc: string,
  appids: readonly number[]
): Promise<{ saved: number; failed: number }> {
  if (!steamId || appids.length === 0) return { saved: 0, failed: 0 };

  const checkedAt = Date.now();
  let saved = 0;
  let failed = 0;

  for (const appid of appids) {
    if (!Number.isSafeInteger(appid) || appid <= 0) continue;
    try {
      const savedRow = await runStatement(
        EARLY_ACCESS_EXPERIMENTAL_UPSERT_SQL,
        steamId,
        storeCc,
        appid,
        checkedAt
      );
      if (savedRow) saved += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      logDebug("earlyAccess.storeExperimentalAppid.failed", {
        appid,
        hasSteamId: true,
        storeCc,
        error: sanitizeDebugError(error),
      });
    }
  }

  return { saved, failed };
}

async function deleteExperimentalEarlyAccessAppId(
  steamId: string | null | undefined,
  storeCc: string,
  appid: number
): Promise<boolean> {
  if (!steamId || !Number.isSafeInteger(appid) || appid <= 0) return false;

  try {
    return Boolean(
      await runStatement(EARLY_ACCESS_EXPERIMENTAL_DELETE_ONE_SQL, steamId, storeCc, appid)
    );
  } catch (error) {
    logDebug("earlyAccess.deleteExperimentalAppid.failed", {
      appid,
      hasSteamId: true,
      storeCc,
      error: sanitizeDebugError(error),
    });
    return false;
  }
}

async function loadCachedConfirmedEarlyAccessAppids(
  missingAppids: readonly number[]
): Promise<EarlyAccessCachedConfirmedAppid[]> {
  const missingSet = new Set<number>();
  for (const appid of missingAppids) {
    if (Number.isSafeInteger(appid) && appid > 0) missingSet.add(appid);
  }
  if (missingSet.size === 0) return [];

  const entries = await listCacheEntriesByExactOrPrefix<EarlyAccessAppDetailsInput | null>(
    APP_DETAILS_CACHE_PREFIX.replace(/:$/, "")
  );
  const candidates: EarlyAccessCachedConfirmedAppid[] = [];

  for (const entry of entries) {
    const parsedKey = parseAppDetailsCacheKey(entry.key);
    if (!parsedKey || !missingSet.has(parsedKey.appid)) continue;
    if (isEarlyAccessConfirmedAppDetails(entry.value) !== true) continue;

    candidates.push({
      appid: parsedKey.appid,
      storeCc: parsedKey.storeCc,
      updatedAt: entry.updatedAt,
    });
  }

  return candidates;
}

function earlyAccessSessionCacheKey(
  steamId: string,
  apiKey: string,
  storeCc: string,
  experimentalEarlyAccess: boolean
): string {
  return `${EARLY_ACCESS_OWNED_CACHE_PREFIX}${steamId}:${keyHash(apiKey)}:${storeCc}:${
    experimentalEarlyAccess ? "1" : "0"
  }`;
}

function earlyAccessSessionProgressCacheKey(cacheKey: string): string {
  return `${cacheKey}:progress`;
}

function sortEarlyAccessGames(games: EarlyAccessGame[]): EarlyAccessGame[] {
  return [...games].sort((a, b) => {
    const playtime = (b.playtimeForever ?? 0) - (a.playtimeForever ?? 0);
    if (playtime !== 0) return playtime;
    return a.name.localeCompare(b.name);
  });
}

function createInProgressSessionResult(input: {
  storeCc: string;
  games?: EarlyAccessGame[];
  indexedCount?: number;
  checkedAt?: number;
  totalKnown?: number;
  partial?: boolean;
  warnings?: string[];
}): EarlyAccessSessionResult {
  return {
    ready: false,
    reason: "in_progress",
    storeCc: input.storeCc,
    games: sortEarlyAccessGames(input.games ?? []),
    indexedCount: input.indexedCount ?? 0,
    checkedAt: input.checkedAt ?? 0,
    totalKnown: input.totalKnown,
    partial: input.partial ?? true,
    warnings: input.warnings ?? [],
  };
}

type EarlyAccessSessionAuth =
  | { ok: false; result: EarlyAccessSessionResult }
  | { ok: true; steamId: string; apiKey: string; storeCc: string };

function sessionAuthResult(session: SteamSession | null): EarlyAccessSessionAuth {
  const storeCc = earlyAccessStoreCc(session?.storeCc);
  const steamId = session?.steamId;
  if (!steamId) {
    return {
      ok: false,
      result: {
        ready: false,
        reason: "signed_out",
        storeCc,
        games: [],
        indexedCount: 0,
        checkedAt: 0,
        partial: false,
        warnings: ["signed_out"],
      },
    };
  }

  const apiKey = session?.apiKey;
  if (!apiKey) {
    return {
      ok: false,
      result: {
        ready: false,
        reason: "no_api_key",
        storeCc,
        games: [],
        indexedCount: 0,
        checkedAt: 0,
        partial: false,
        warnings: ["missing_steam_api_key"],
      },
    };
  }

  return { ok: true, storeCc, steamId, apiKey };
}

async function publishSessionProgress(
  cacheKey: string,
  result: EarlyAccessSessionResult
): Promise<void> {
  sessionProgressResults.set(cacheKey, result);
  await cacheSet(earlyAccessSessionProgressCacheKey(cacheKey), result, EARLY_ACCESS_PROGRESS_TTL_MS);
}

async function readSessionProgress(cacheKey: string): Promise<EarlyAccessSessionResult | undefined> {
  return (
    sessionProgressResults.get(cacheKey) ??
    (await cacheGet<EarlyAccessSessionResult>(earlyAccessSessionProgressCacheKey(cacheKey)))
  );
}

function clearSessionProgress(cacheKey: string): void {
  sessionProgressResults.delete(cacheKey);
}

async function buildEarlyAccessSessionResult(
  session: {
    steamId: string;
    apiKey: string;
    storeCc?: string | null;
    experimentalEarlyAccess?: boolean;
  },
  storeCc: string,
  options: EarlyAccessBuildOptions
): Promise<EarlyAccessSessionResult> {
  const publish = async (
    games: EarlyAccessGame[],
    status: EarlyAccessCatalogStatus,
    warnings: Iterable<string>
  ): Promise<void> => {
    if (!options.onProgress) return;
    await options.onProgress(
      createInProgressSessionResult({
        storeCc,
        games,
        indexedCount: status.indexedCount,
        checkedAt: status.checkedAt,
        totalKnown: status.totalKnown,
        partial: status.partial,
        warnings: [...warnings],
      })
    );
  };

  await publish([], createEarlyAccessCatalogStatus({
    storeCc,
    indexedCount: 0,
    checkedAt: 0,
    pagesFetched: 0,
    complete: false,
  }), []);

  let status = await ensureEarlyAccessCatalog(storeCc, options);

  if (!status.ready) {
    return {
      ready: false,
      reason: "no_index",
      storeCc,
      games: [],
      indexedCount: status.indexedCount,
      checkedAt: status.checkedAt,
      totalKnown: status.totalKnown,
      partial: status.partial,
      warnings: status.warnings,
    };
  }

  const experimentalEarlyAccess = Boolean(session.experimentalEarlyAccess);
  const earlyAccessAppids = await loadEarlyAccessAppIdSet(storeCc);
  const experimentalAppids = experimentalEarlyAccess
    ? await loadExperimentalEarlyAccessAppIdSet(session.steamId, storeCc)
    : new Set<number>();

  const knownAppids = new Set<number>(earlyAccessAppids);
  for (const appid of experimentalAppids) knownAppids.add(appid);

  if (knownAppids.size === 0) {
    return {
      ready: false,
      reason: "no_index",
      storeCc,
      games: [],
      indexedCount: status.indexedCount,
      checkedAt: status.checkedAt,
      totalKnown: status.totalKnown,
      partial: true,
      warnings: [...status.warnings, "early_access_index_empty"],
    };
  }

  let ownedGames: Awaited<ReturnType<typeof getOwnedGames>>;
  try {
    ownedGames = await getOwnedGames(session.steamId, session.apiKey, keyHash(session.apiKey));
  } catch (error) {
    logDebug("earlyAccess.ownedGames.failed", {
      hasSteamId: true,
      hasApiKey: true,
      error: sanitizeDebugError(error),
    });
    return {
      ready: false,
      reason: "steam_api",
      storeCc,
      games: [],
      indexedCount: status.indexedCount,
      checkedAt: status.checkedAt,
      totalKnown: status.totalKnown,
      partial: status.partial,
      warnings: [...status.warnings, "steam_api"],
    };
  }

  const ownedByAppid = new Map(ownedGames.map((game) => [game.appid, game]));
  const initialGames = ownedGames
    .filter((game) => knownAppids.has(game.appid))
    .map((game) => normalizeEarlyAccessGame(game));
  const confirmedGames: EarlyAccessGame[] = [];
  const warnings = new Set<string>(status.warnings);

  if (initialGames.length > 0) {
    const detailAppids = initialGames.map((game) => game.appid);
    try {
      const detailsById = await getAppDetails(detailAppids, {
        priority: "low",
        storeCc,
        steamId: session.steamId,
      });
      let filteredCount = 0;
      let experimentalFilteredCount = 0;

      for (const game of initialGames) {
        const enriched = applyEarlyAccessAppDetails(game, detailsById.get(game.appid));
        if (isEarlyAccessConfirmedGame(enriched) === false) {
          filteredCount += 1;
          if (experimentalEarlyAccess && experimentalAppids.has(game.appid)) {
            experimentalFilteredCount += 1;
            await deleteExperimentalEarlyAccessAppId(session.steamId, storeCc, game.appid);
          }
          continue;
        }
        confirmedGames.push(enriched);
      }

      if (filteredCount > 0) {
        warnings.add("early_access_nonconfirmed_filtered");
        logDebug("earlyAccess.session.filtered", {
          storeCc,
          filteredCount,
        });
      }

      if (experimentalFilteredCount > 0) {
        warnings.add("early_access_experimental_stale_filtered");
        logDebug("earlyAccess.session.experimentalFiltered", {
          storeCc,
          filteredCount: experimentalFilteredCount,
        });
      }
    } catch (error) {
      warnings.add("early_access_details_failed");
      logDebug("earlyAccess.appDetails.failed", {
        appidCount: detailAppids.length,
        storeCc,
        error: sanitizeDebugError(error),
      });
      confirmedGames.push(...initialGames);
    }

    await publish(confirmedGames, status, warnings);
  }

  if (experimentalEarlyAccess) {
    const missingOwnedAppids = [...new Set(ownedGames
      .filter((game) => !knownAppids.has(game.appid))
      .map((game) => game.appid))].sort((a, b) => {
      const timeA = ownedByAppid.get(a)?.time_created ?? 0;
      const timeB = ownedByAppid.get(b)?.time_created ?? 0;
      if (timeB !== timeA) return timeB - timeA;
      return b - a;
    });
    const cachedConfirmedAppids = await loadCachedConfirmedEarlyAccessAppids(
      missingOwnedAppids
    );
    const experimentalCandidates = selectEarlyAccessExperimentalValidateAppids({
      missingAppids: missingOwnedAppids,
      cachedAppids: cachedConfirmedAppids,
      uncachedValidateBudget: Number.POSITIVE_INFINITY,
      unboundedUncachedValidation: true,
      preferredStoreCc: storeCc,
    });
    const missingValidateAppids = experimentalCandidates.appids;

    if (missingValidateAppids.length > 0) {
      let validatedCount = 0;
      let savedCount = 0;

      try {
        for (let offset = 0; offset < missingValidateAppids.length; offset += EARLY_ACCESS_VALIDATE_CHUNK) {
          const chunk = missingValidateAppids.slice(offset, offset + EARLY_ACCESS_VALIDATE_CHUNK);
          const detailsById = await getAppDetails(chunk, {
            priority: "low",
            storeCc,
            steamId: session.steamId,
          });
          const confirmedAppids: number[] = [];

          for (const appid of chunk) {
            if (isEarlyAccessConfirmedAppDetails(detailsById.get(appid)) === true) {
              confirmedAppids.push(appid);
            }
          }

          if (confirmedAppids.length > 0) {
            const globalWrite = await storeGlobalEarlyAccessAppIds(storeCc, confirmedAppids);
            if (globalWrite.failed > 0) warnings.add("early_access_global_sql_write_failed");
            if (globalWrite.saved > 0) {
              warnings.add("early_access_catalog_backfilled");
              status = await refreshCatalogStatusAfterGlobalBackfill(storeCc);
              syncCoverageWarnings(warnings, status);
            }

            const write = await storeExperimentalEarlyAccessAppIds(
              session.steamId,
              storeCc,
              confirmedAppids
            );
            if (write.failed > 0) warnings.add("early_access_experimental_sql_write_failed");
            if (write.saved > 0) {
              warnings.add("early_access_experimental_validated");
              validatedCount += confirmedAppids.length;
              savedCount += write.saved;
            }

            for (const appid of confirmedAppids) {
              knownAppids.add(appid);
              const ownedGame = ownedByAppid.get(appid);
              if (!ownedGame) continue;
              confirmedGames.push(
                applyEarlyAccessAppDetails(
                  normalizeEarlyAccessGame(ownedGame),
                  detailsById.get(appid)
                )
              );
            }

            await publish(confirmedGames, status, warnings);
          }
        }

        if (validatedCount > 0) {
          logDebug("earlyAccess.session.experimentalValidated", {
            storeCc,
            validatedCount,
            savedCount,
          });
        }
      } catch (error) {
        warnings.add("early_access_details_failed");
        logDebug("earlyAccess.experimentalAppDetails.failed", {
          appidCount: missingValidateAppids.length,
          storeCc,
          error: sanitizeDebugError(error),
        });
      }
    }
  }

  return {
    ready: true,
    storeCc,
    games: sortEarlyAccessGames(confirmedGames),
    indexedCount: status.indexedCount,
    checkedAt: status.checkedAt,
    totalKnown: status.totalKnown,
    partial: status.partial,
    warnings: [...warnings],
  };
}

function startEarlyAccessSessionBuild(
  cacheKey: string,
  session: {
    steamId: string;
    apiKey: string;
    storeCc?: string | null;
    experimentalEarlyAccess?: boolean;
  },
  storeCc: string,
  options: EarlyAccessFetchOptions
): Promise<EarlyAccessSessionResult> {
  const inflight = pendingSessionResults.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const result = await buildEarlyAccessSessionResult(session, storeCc, {
        ...options,
        onProgress: (partial) => publishSessionProgress(cacheKey, partial),
      });
      await cacheSet(cacheKey, result, EARLY_ACCESS_OWNED_TTL_MS);
      clearSessionProgress(cacheKey);
      return result;
    } catch (error) {
      const failed: EarlyAccessSessionResult = {
        ready: false,
        reason: "error",
        storeCc,
        games: sessionProgressResults.get(cacheKey)?.games ?? [],
        indexedCount: sessionProgressResults.get(cacheKey)?.indexedCount ?? 0,
        checkedAt: sessionProgressResults.get(cacheKey)?.checkedAt ?? 0,
        totalKnown: sessionProgressResults.get(cacheKey)?.totalKnown,
        partial: true,
        warnings: ["early_access_session_failed"],
      };
      await cacheSet(cacheKey, failed, EARLY_ACCESS_NEGATIVE_TTL_MS);
      clearSessionProgress(cacheKey);
      logDebug("earlyAccess.session.failed", {
        storeCc,
        error: sanitizeDebugError(error),
      });
      return failed;
    } finally {
      pendingSessionResults.delete(cacheKey);
    }
  })();

  pendingSessionResults.set(cacheKey, promise);
  return promise;
}

export async function getEarlyAccessSessionSnapshot(
  session: SteamSession | null,
  options: EarlyAccessFetchOptions = {}
): Promise<EarlyAccessSessionResult> {
  const auth = sessionAuthResult(session);
  if (!auth.ok) return auth.result;

  const experimentalEarlyAccess = Boolean(session?.experimentalEarlyAccess);
  const cacheKey = earlyAccessSessionCacheKey(
    auth.steamId,
    auth.apiKey,
    auth.storeCc,
    experimentalEarlyAccess
  );

  if (!options.refresh) {
    const cached = await cacheGet<EarlyAccessSessionResult>(cacheKey);
    if (cached) {
      if (cached.ready) return cached;
      if (cached.reason && cached.reason !== "in_progress") return cached;
    }
  }

  void startEarlyAccessSessionBuild(
    cacheKey,
    {
      steamId: auth.steamId,
      apiKey: auth.apiKey,
      storeCc: auth.storeCc,
      experimentalEarlyAccess,
    },
    auth.storeCc,
    options
  ).catch(() => undefined);

  const progress = await readSessionProgress(cacheKey);
  if (progress) return progress;

  return createInProgressSessionResult({ storeCc: auth.storeCc });
}

export async function getEarlyAccessSessionResult(
  session: SteamSession | null,
  options: EarlyAccessFetchOptions = {}
): Promise<EarlyAccessSessionResult> {
  const auth = sessionAuthResult(session);
  if (!auth.ok) return auth.result;

  const experimentalEarlyAccess = Boolean(session?.experimentalEarlyAccess);
  const cacheKey = earlyAccessSessionCacheKey(
    auth.steamId,
    auth.apiKey,
    auth.storeCc,
    experimentalEarlyAccess
  );

  if (!options.refresh) {
    const cached = await cacheGet<EarlyAccessSessionResult>(cacheKey);
    if (cached) {
      if (cached.ready) return cached;
      if (cached.reason && cached.reason !== "in_progress") return cached;
    }
  }

  return startEarlyAccessSessionBuild(
    cacheKey,
    {
      steamId: auth.steamId,
      apiKey: auth.apiKey,
      storeCc: auth.storeCc,
      experimentalEarlyAccess,
    },
    auth.storeCc,
    options
  );
}

export async function lookupEarlyAccessAppIds(
  value: unknown,
  options: EarlyAccessLookupOptions = {}
): Promise<EarlyAccessLookupResult> {
  const requestedAppids = parseAppIdList(value);
  const storeCc = earlyAccessStoreCc(options.storeCc);

  if (requestedAppids.length === 0) {
    const status = await loadCatalogStatusFromDb(storeCc);
    return {
      ready: false,
      reason: "invalid_appids",
      storeCc,
      appids: [],
      earlyAccessAppids: [],
      indexedCount: status.indexedCount,
      checkedAt: status.checkedAt,
      totalKnown: status.totalKnown,
      partial: status.partial,
      warnings: [...status.warnings, "invalid_appids"],
    };
  }

  let status = await ensureEarlyAccessCatalog(storeCc, options);
  if (!status.ready) {
    return {
      ready: false,
      reason: "no_index",
      storeCc,
      appids: requestedAppids,
      earlyAccessAppids: [],
      indexedCount: status.indexedCount,
      checkedAt: status.checkedAt,
      totalKnown: status.totalKnown,
      partial: status.partial,
      warnings: status.warnings,
    };
  }

  const experimentalEarlyAccess = Boolean(options.experimentalEarlyAccess);
  const earlyAccessAppids = await loadEarlyAccessAppIdSet(storeCc);
  const experimentalAppids = experimentalEarlyAccess
    ? await loadExperimentalEarlyAccessAppIdSet(options.steamId, storeCc)
    : new Set<number>();

  const knownAppids = new Set<number>(earlyAccessAppids);
  for (const appid of experimentalAppids) knownAppids.add(appid);

  if (knownAppids.size === 0) {
    return {
      ready: false,
      reason: "no_index",
      storeCc,
      appids: requestedAppids,
      earlyAccessAppids: [],
      indexedCount: status.indexedCount,
      checkedAt: status.checkedAt,
      totalKnown: status.totalKnown,
      partial: true,
      warnings: [...status.warnings, "early_access_index_empty"],
    };
  }

  const warnings = new Set<string>(status.warnings);
  const matchedAppids = requestedAppids.filter((appid) => knownAppids.has(appid));
  const missingAppids = requestedAppids.filter((appid) => !knownAppids.has(appid));
  const validateMax = experimentalEarlyAccess
    ? Number.POSITIVE_INFINITY
    : earlyAccessLookupValidateMax();
  const uncachedValidateBudget = experimentalEarlyAccess ? Number.POSITIVE_INFINITY : 0;
  const cachedConfirmedAppids =
    experimentalEarlyAccess && missingAppids.length > 0
      ? await loadCachedConfirmedEarlyAccessAppids(missingAppids)
      : [];
  const lookupCandidates = selectEarlyAccessExperimentalValidateAppids({
    missingAppids,
    cachedAppids: cachedConfirmedAppids,
    uncachedValidateBudget,
    unboundedUncachedValidation: experimentalEarlyAccess,
    preferredStoreCc: storeCc,
  });
  const missingValidateAppids = lookupCandidates.appids;
  const validatedSet = new Set<number>(matchedAppids);
  let validatedAppids = matchedAppids;
  const confirmedGenreBypassAppids: number[] = [];
  const matchedValidationSkipped = matchedAppids.length > validateMax;

  if (missingValidateAppids.length > 0) {
    try {
      const detailsById = await getAppDetails(missingValidateAppids, {
        priority: "low",
        storeCc,
        steamId: options.steamId ?? undefined,
      });

      for (const appid of missingValidateAppids) {
        if (isEarlyAccessConfirmedAppDetails(detailsById.get(appid)) === true) {
          validatedSet.add(appid);
          confirmedGenreBypassAppids.push(appid);
        }
      }
    } catch (error) {
      warnings.add("early_access_details_failed");
      logDebug("earlyAccess.lookup.missingAppDetails.failed", {
        appidCount: missingValidateAppids.length,
        storeCc,
        error: sanitizeDebugError(error),
      });
    }
  }

  if (matchedAppids.length > 0) {
    if (matchedValidationSkipped) {
      warnings.add("early_access_lookup_validation_skipped");
    } else {
      try {
        const detailsById = await getAppDetails(matchedAppids, {
          priority: "low",
          storeCc,
          steamId: options.steamId ?? undefined,
        });
        let confirmedMatchedCount = 0;
        let experimentalStaleFilteredCount = 0;

        for (const appid of matchedAppids) {
          const confirmed = isEarlyAccessConfirmedAppDetails(detailsById.get(appid));
          if (confirmed === false && experimentalAppids.has(appid)) {
            experimentalStaleFilteredCount += 1;
            await deleteExperimentalEarlyAccessAppId(options.steamId, storeCc, appid);
            validatedSet.delete(appid);
            continue;
          }

          if (confirmed !== false) {
            validatedSet.add(appid);
            confirmedMatchedCount += 1;
          } else {
            validatedSet.delete(appid);
          }
        }

        const filteredCount = matchedAppids.length - confirmedMatchedCount;
        if (filteredCount > 0) {
          warnings.add("early_access_nonconfirmed_filtered");
          logDebug("earlyAccess.lookup.filtered", {
            storeCc,
            filteredCount,
          });
        }

        if (experimentalStaleFilteredCount > 0) {
          warnings.add("early_access_experimental_stale_filtered");
          logDebug("earlyAccess.lookup.experimentalFiltered", {
            storeCc,
            filteredCount: experimentalStaleFilteredCount,
          });
        }
      } catch (error) {
        warnings.add("early_access_details_failed");
        logDebug("earlyAccess.lookup.appDetails.failed", {
          appidCount: matchedAppids.length,
          storeCc,
          error: sanitizeDebugError(error),
        });
      }
    }
  }

  validatedAppids = requestedAppids.filter((appid) => validatedSet.has(appid));

  if (confirmedGenreBypassAppids.length > 0) {
    warnings.add("early_access_genre_validated");
    logDebug("earlyAccess.lookup.genreBypass", {
      storeCc,
      genreBypassCount: confirmedGenreBypassAppids.length,
    });

    const globalWrite = await storeGlobalEarlyAccessAppIds(storeCc, confirmedGenreBypassAppids);
    if (globalWrite.failed > 0) warnings.add("early_access_global_sql_write_failed");
    if (globalWrite.saved > 0) {
      warnings.add("early_access_catalog_backfilled");
      status = await refreshCatalogStatusAfterGlobalBackfill(storeCc);
      syncCoverageWarnings(warnings, status);
    }

    if (experimentalEarlyAccess && options.steamId) {
      const write = await storeExperimentalEarlyAccessAppIds(
        options.steamId,
        storeCc,
        confirmedGenreBypassAppids
      );
      if (write.failed > 0) warnings.add("early_access_experimental_sql_write_failed");
      if (write.saved > 0) {
        warnings.add("early_access_experimental_validated");
        logDebug("earlyAccess.lookup.experimentalValidated", {
          storeCc,
          validatedCount: confirmedGenreBypassAppids.length,
          savedCount: write.saved,
        });
      }
    }
  }

  return {
    ready: true,
    storeCc,
    appids: requestedAppids,
    earlyAccessAppids: validatedAppids,
    indexedCount: status.indexedCount,
    checkedAt: status.checkedAt,
    totalKnown: status.totalKnown,
    partial: status.partial,
    warnings: [...warnings],
  };
}
