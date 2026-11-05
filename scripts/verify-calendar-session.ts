import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  addOwnedCandidates,
  applyAppDetails,
  applyReleaseFilters,
  buildUpcomingList,
  initializeCandidatesFromWishlist,
  removeUnknownLibraryOnly,
  scoreOwnedCandidate,
  selectDetailCandidates,
  toUpcomingResult,
  type AppDetailsLike,
  type OwnedGameLike,
} from "../lib/upcoming-candidates.ts";

type AttemptOutcome = "success" | "failure" | "error" | "skipped";

interface AppDetailsAttempt {
  success: boolean;
  details: AppDetailsLike | null;
}

interface AppDetailsVerification {
  success: boolean;
  usedFallback: boolean;
  first: AttemptOutcome;
  fallback: AttemptOutcome;
  details: AppDetailsLike | null;
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchJson(url: URL): Promise<unknown> {
  const timeoutMs = numberFromEnv("STEAM_FETCH_TIMEOUT_MS", 15000);
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "SteamCalendarCompanion/1.0",
      Accept: "application/json,text/plain,*/*",
    },
  });

  if (!response.ok) throw new Error(`Steam request failed: ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error("Steam request returned invalid JSON");
  }
}

function readSteamIdFromDatabase(dbPath: string): string | null {
  const resolved = path.resolve(process.cwd(), dbPath);
  if (!fs.existsSync(resolved)) return null;

  try {
    const db = new DatabaseSync(resolved);
    try {
      const row = db
        .prepare("SELECT steam_id FROM users ORDER BY rowid ASC LIMIT 1")
        .get() as { steam_id?: unknown } | undefined;
      return typeof row?.steam_id === "string" && row.steam_id ? row.steam_id : null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function fetchOwnedGames(steamId: string, apiKey: string): Promise<OwnedGameLike[]> {
  const params = new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    include_all_appids: "1",
    include_played_free_games: "1",
  });
  const url = new URL(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${params}`);
  const json = await fetchJson(url);
  const response = isRecord(json) ? json.response : undefined;
  const games = isRecord(response) ? response.games : undefined;
  if (!Array.isArray(games)) throw new Error("Steam GetOwnedGames returned no games array");

  const owned: OwnedGameLike[] = [];
  for (const game of games) {
    if (!isRecord(game)) continue;
    const appid = Number(game.appid);
    if (!Number.isFinite(appid) || appid <= 0) continue;
    owned.push({
      appid,
      name: typeof game.name === "string" && game.name ? game.name : `Steam App ${appid}`,
      playtime_forever: Number(game.playtime_forever ?? 0),
      time_created: typeof game.time_created === "number" ? game.time_created : undefined,
      has_community_visible_stats:
        typeof game.has_community_visible_stats === "boolean"
          ? game.has_community_visible_stats
          : undefined,
    });
  }

  return owned;
}

async function fetchAppDetailsAttempt(appid: number, cc?: string): Promise<AppDetailsAttempt> {
  const params = new URLSearchParams({
    appids: String(appid),
    filters: "basic,release_date",
    l: "en",
  });
  if (cc) params.set("cc", cc);

  const json = await fetchJson(
    new URL(`https://store.steampowered.com/api/appdetails?${params}`)
  );
  const entry = isRecord(json) ? json[String(appid)] : undefined;
  if (!isRecord(entry) || entry.success !== true || !isRecord(entry.data)) {
    return { success: false, details: null };
  }

  return { success: true, details: entry.data as AppDetailsLike };
}

async function fetchAppDetailsWithCcFallback(appid: number): Promise<AppDetailsVerification> {
  let first: AppDetailsAttempt | null = null;
  let firstOutcome: AttemptOutcome = "error";

  try {
    first = await fetchAppDetailsAttempt(appid);
    firstOutcome = first.success ? "success" : "failure";
    if (first.success) {
      return {
        success: true,
        usedFallback: false,
        first: firstOutcome,
        fallback: "skipped",
        details: first.details,
      };
    }
  } catch {
    firstOutcome = "error";
  }

  try {
    const fallback = await fetchAppDetailsAttempt(appid, "us");
    return {
      success: fallback.success,
      usedFallback: true,
      first: firstOutcome,
      fallback: fallback.success ? "success" : "failure",
      details: fallback.success ? fallback.details : null,
    };
  } catch {
    return {
      success: false,
      usedFallback: true,
      first: firstOutcome,
      fallback: "error",
      details: null,
    };
  }
}

async function main(): Promise<boolean> {
  const apiKey = getEnv("STEAM_API_KEY");
  if (!apiKey) {
    console.error("STEAM_API_KEY is required. Example: STEAM_API_KEY=... npm run verify:calendar-session");
    return false;
  }

  const dbPath = getEnv("STEAM_CALENDAR_DB_PATH") ?? "data/steam-calendar.sqlite";
  const steamId = getEnv("STEAM_ID") ?? readSteamIdFromDatabase(dbPath);
  if (!steamId) {
    console.error(
      `STEAM_ID is required, or users.steam_id must be present in ${dbPath}. Example: STEAM_API_KEY=... STEAM_ID=... npm run verify:calendar-session`
    );
    return false;
  }

  const verifyAppid = numberFromEnv("VERIFY_APPID", 2272360);
  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));

  const owned = await fetchOwnedGames(steamId, apiKey);
  const result = initializeCandidatesFromWishlist({
    items: [],
    private: false,
    totalKnown: 0,
    details: [],
  });
  addOwnedCandidates(result, owned, nowMs);

  const candidates = selectDetailCandidates(result, today);
  const maxFetch = numberFromEnv("VERIFY_MAX_DETAIL_CANDIDATES", 25);
  const fetchCandidates = new Set<number>(candidates.slice(0, maxFetch));
  const candidateRank = new Map<number, number>();
  candidates.forEach((appid, index) => {
    candidateRank.set(appid, index + 1);
  });

  const ownedGame = owned.find((game) => game.appid === verifyAppid);
  const selected = candidates.includes(verifyAppid);
  if (ownedGame && !selected) fetchCandidates.add(verifyAppid);

  const appDetailsByAppid = new Map<number, AppDetailsVerification>();
  for (const appid of fetchCandidates) {
    const details = await fetchAppDetailsWithCcFallback(appid);
    appDetailsByAppid.set(appid, details);
    applyAppDetails(result.map, appid, details.details);
  }

  applyReleaseFilters(result.map, today);
  removeUnknownLibraryOnly(result.map);

  const calendar = toUpcomingResult(result, buildUpcomingList(result.map));
  const upcomingGame = calendar.games.find((game) => game.appid === verifyAppid);
  const exactFuture = Boolean(upcomingGame?.releaseDate && upcomingGame.releaseDate > today);
  const yearOnlyFuture = Boolean(
    upcomingGame &&
      !upcomingGame.releaseDate &&
      typeof upcomingGame.releaseYear === "number" &&
      upcomingGame.releaseYear >= currentYear
  );
  const verification = appDetailsByAppid.get(verifyAppid);
  const passed = selected && Boolean(upcomingGame) && (exactFuture || yearOnlyFuture);

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        today,
        steamId,
        appid: verifyAppid,
        libraryAvailable: result.libraryAvailable,
        libraryCount: owned.length,
        candidateCount: candidates.length,
        selected,
        selectedCandidateRank: candidateRank.get(verifyAppid) ?? null,
        ownedFound: Boolean(ownedGame),
        ownedPlaytimeForever: ownedGame?.playtime_forever ?? null,
        ownedTimeCreated: ownedGame?.time_created ?? null,
        ownedCandidateScore:
          result.candidateScores.get(verifyAppid) ??
          (ownedGame ? scoreOwnedCandidate(ownedGame, nowMs) : 0),
        appDetails: verification
          ? {
              success: verification.success,
              usedFallback: verification.usedFallback,
              firstAttempt: verification.first,
              fallbackAttempt: verification.fallback,
              releaseDateText: verification.details?.release_date?.date ?? null,
              comingSoon: verification.details?.release_date?.coming_soon ?? null,
            }
          : null,
        upcomingGame: upcomingGame
          ? {
              appid: upcomingGame.appid,
              name: upcomingGame.name,
              sources: upcomingGame.sources,
              releaseDate: upcomingGame.releaseDate,
              releaseYear: upcomingGame.releaseYear,
              dateSource: upcomingGame.dateSource,
            }
          : null,
        remainingCalendarCount: calendar.games.length,
        warnings: calendar.warnings,
        passed,
      },
      null,
      2
    )
  );

  return passed;
}

main().then((passed) => {
  if (!passed) process.exitCode = 1;
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});