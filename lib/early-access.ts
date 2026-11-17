import "server-only";
import { cacheGet, cacheSet, listCacheEntriesByExactOrPrefix } from "./cache-store";
import { loadWithCacheAndDedupe } from "./cached-dedupe.ts";
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
const EARLY_ACCESS_DETAILS_MAX = 80;
const COVERAGE_WARNINGS = new Set([
  "early_access_index_empty",
  "early_access_index_partial",
  "early_access_page_cap",
  "early_access_search_empty",
]);
const pendingCatalogStatuses = new Map<string, Promise<EarlyAccessCatalogStatus>>();
const pendingSessionResults = new Map<string, Promise<EarlyAccessSessionResult>>();

export interface EarlyAccessFetchOptions {
  refresh?: boolean;
  full?: boolean;
  pages?: number | null | undefined;
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

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const url = earlyAccessSearchUrl(storeCc, start, pageSize, { sort, infinite: true });
    const parsed = parseEarlyAccessSearchPage(await searchJson(url));
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


async function buildEarlyAccessSessionResult(
  session: {
    steamId: string;
    apiKey: string;
    storeCc?: string | null;
    experimentalEarlyAccess?: boolean;
  },
  storeCc: string,
  options: EarlyAccessFetchOptions
): Promise<EarlyAccessSessionResult> {
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
    const detailAppids = initialGames.slice(0, EARLY_ACCESS_DETAILS_MAX).map((game) => game.appid);
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
  }

  if (experimentalEarlyAccess) {
    const confirmedInitialAppids = new Set(confirmedGames.map((game) => game.appid));
    const missingOwnedAppids = [...new Set(ownedGames
      .filter((game) => !knownAppids.has(game.appid))
      .map((game) => game.appid))].sort((a, b) => {
      const timeA = ownedByAppid.get(a)?.time_created ?? 0;
      const timeB = ownedByAppid.get(b)?.time_created ?? 0;
      if (timeB !== timeA) return timeB - timeA;
      return b - a;
    });
    const validateMax = earlyAccessLookupValidateMax();
    const validateBudget = Math.max(0, validateMax - confirmedInitialAppids.size);
    const cachedConfirmedAppids = await loadCachedConfirmedEarlyAccessAppids(
      missingOwnedAppids
    );
    const missingValidateAppids = selectEarlyAccessExperimentalValidateAppids({
      missingAppids: missingOwnedAppids,
      cachedAppids: cachedConfirmedAppids,
      validateBudget,
      preferredStoreCc: storeCc,
    });

    if (missingOwnedAppids.length > missingValidateAppids.length) {
      warnings.add("early_access_experimental_validation_partial");
    }

    if (missingValidateAppids.length > 0) {
      try {
        const detailsById = await getAppDetails(missingValidateAppids, {
          priority: "low",
          storeCc,
          steamId: session.steamId,
        });
        const confirmedAppids: number[] = [];

        for (const appid of missingValidateAppids) {
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

          const write = await storeExperimentalEarlyAccessAppIds(session.steamId, storeCc, confirmedAppids);
          if (write.failed > 0) warnings.add("early_access_experimental_sql_write_failed");
          if (write.saved > 0) {
            warnings.add("early_access_experimental_validated");
            logDebug("earlyAccess.session.experimentalValidated", {
              storeCc,
              validatedCount: confirmedAppids.length,
              savedCount: write.saved,
            });
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

  confirmedGames.sort((a, b) => {
    const playtime = (b.playtimeForever ?? 0) - (a.playtimeForever ?? 0);
    if (playtime !== 0) return playtime;
    return a.name.localeCompare(b.name);
  });

  return {
    ready: true,
    storeCc,
    games: confirmedGames,
    indexedCount: status.indexedCount,
    checkedAt: status.checkedAt,
    totalKnown: status.totalKnown,
    partial: status.partial,
    warnings: [...warnings],
  };
}

export async function getEarlyAccessSessionResult(
  session: SteamSession | null,
  options: EarlyAccessFetchOptions = {}
): Promise<EarlyAccessSessionResult> {
  const storeCc = earlyAccessStoreCc(session?.storeCc);
  const steamId = session?.steamId;
  const apiKey = session?.apiKey;

  if (!steamId) {
    return {
      ready: false,
      reason: "signed_out",
      storeCc,
      games: [],
      indexedCount: 0,
      checkedAt: 0,
      partial: false,
      warnings: ["signed_out"],
    };
  }

  if (!apiKey) {
    return {
      ready: false,
      reason: "no_api_key",
      storeCc,
      games: [],
      indexedCount: 0,
      checkedAt: 0,
      partial: false,
      warnings: ["missing_steam_api_key"],
    };
  }

  const experimentalEarlyAccess = Boolean(session.experimentalEarlyAccess);
  const cacheKey = earlyAccessSessionCacheKey(steamId, apiKey, storeCc, experimentalEarlyAccess);
  if (!options.refresh) {
    return loadWithCacheAndDedupe({
      cacheKey,
      pending: pendingSessionResults,
      cacheGet,
      cacheSet,
      factory: () =>
        buildEarlyAccessSessionResult(
          { steamId, apiKey, storeCc, experimentalEarlyAccess },
          storeCc,
          options
        ),
      ttlMs: EARLY_ACCESS_OWNED_TTL_MS,
    });
  }

  const inflight = pendingSessionResults.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const result = await buildEarlyAccessSessionResult(
      { steamId, apiKey, storeCc, experimentalEarlyAccess },
      storeCc,
      options
    );
    await cacheSet(cacheKey, result, EARLY_ACCESS_OWNED_TTL_MS);
    return result;
  })().finally(() => {
    pendingSessionResults.delete(cacheKey);
  });

  pendingSessionResults.set(cacheKey, promise);
  return promise;
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
  const validateMax = earlyAccessLookupValidateMax();
  const validateBudget = experimentalEarlyAccess
    ? Math.max(0, validateMax - matchedAppids.length)
    : 0;
  const cachedConfirmedAppids =
    validateBudget > 0 && missingAppids.length > 0
      ? await loadCachedConfirmedEarlyAccessAppids(missingAppids)
      : [];
  const missingValidateAppids = selectEarlyAccessExperimentalValidateAppids({
    missingAppids,
    cachedAppids: cachedConfirmedAppids,
    validateBudget,
    preferredStoreCc: storeCc,
  });
  const candidates = [...matchedAppids, ...missingValidateAppids];
  const validationSkipped = candidates.length > validateMax;
  let validatedAppids = matchedAppids;

  if (
    experimentalEarlyAccess &&
    missingAppids.length > 0 &&
    missingValidateAppids.length < missingAppids.length
  ) {
    warnings.add("early_access_lookup_validation_partial");
  }

  if (candidates.length > 0) {
    if (!validationSkipped) {
      try {
        const detailsById = await getAppDetails(candidates, {
          priority: "low",
          storeCc,
          steamId: options.steamId ?? undefined,
        });
        const validatedSet = new Set<number>();
        const confirmedGenreBypassAppids: number[] = [];
        let confirmedMatchedCount = 0;
        let experimentalStaleFilteredCount = 0;

        for (const appid of matchedAppids) {
          const confirmed = isEarlyAccessConfirmedAppDetails(detailsById.get(appid));
          if (confirmed === false && experimentalAppids.has(appid)) {
            experimentalStaleFilteredCount += 1;
            await deleteExperimentalEarlyAccessAppId(options.steamId, storeCc, appid);
            continue;
          }

          if (confirmed !== false) {
            validatedSet.add(appid);
            confirmedMatchedCount += 1;
          }
        }

        for (const appid of missingValidateAppids) {
          if (isEarlyAccessConfirmedAppDetails(detailsById.get(appid)) === true) {
            validatedSet.add(appid);
            confirmedGenreBypassAppids.push(appid);
          }
        }

        validatedAppids = requestedAppids.filter((appid) => validatedSet.has(appid));

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
      } catch (error) {
        warnings.add("early_access_details_failed");
        logDebug("earlyAccess.lookup.appDetails.failed", {
          appidCount: candidates.length,
          storeCc,
          error: sanitizeDebugError(error),
        });
      }
    } else {
      warnings.add("early_access_lookup_validation_skipped");
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
