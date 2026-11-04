import type { RawgHit, UpcomingGame } from "./types";
import {
  applyKnownWishlistDate,
  applySteamDateInfo,
  hasKnownSteamDate,
  hasKnownReleasedSteamDate,
  isPlaceholderYearEndDate,
  parseSteamDateInfo,
  shouldRemoveKnownReleasedSteamGame,
  shouldRemovePastYearOnlySteamGame,
  shouldRemoveUnknownLibraryOnly,
  type ReleaseDateGame,
} from "./release-dates.ts";

export const DLC_TYPES = new Set([
  "dlc",
  "microtransaction",
  "config",
  "video",
  "hardware",
  "music",
  "series",
]);

export const SMALL_LIBRARY_LIMIT = 150;
export const SMALL_LIBRARY_BASE_SCORE = 1000;
export const MAX_DETAIL_CANDIDATES = 250;
export const MAX_RAWG_LOOKUPS = 50;
export const RAWG_CONCURRENCY = 4;
export const OWNED_RECENT_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
export const HIGH_APPID_UNRELEASED_THRESHOLD = 2_000_000;

export interface AppDetailsLike {
  name?: string;
  type?: string;
  is_free?: boolean;
  developer?: string[];
  publisher?: string[];
  header_image?: string;
  genres?: { type: string; description: string }[];
  release_date?: { date: string; coming_soon: boolean };
}

export interface OwnedGameLike {
  appid: number;
  name: string;
  playtime_forever: number;
  time_created?: number;
  has_community_visible_stats?: boolean;
}

export interface ScratchGame extends UpcomingGame {
  wishlistDateText?: string;
}

export interface WishlistItemLike {
  appid: number;
  title: string;
  releaseDateText?: string;
  coverImage?: string;
}

export interface WishlistDetailsEntryLike {
  appid: number;
  details: AppDetailsLike | null;
}

export interface WishlistResultLike {
  items: WishlistItemLike[];
  private: boolean;
  totalKnown?: number;
  details?: WishlistDetailsEntryLike[];
}

export interface OwnedCandidate {
  appid: number;
  owned: OwnedGameLike;
  score: number;
}

export interface CandidateBuildResult {
  map: Map<number, ScratchGame>;
  candidateScores: Map<number, number>;
  prefetchedAppDetails: Map<number, AppDetailsLike | null>;
  warnings: string[];
  libraryAvailable: boolean;
  wishlistPrivate: boolean;
  wishlistPartial: boolean;
  wishlistShown: number;
  wishlistTotalKnown?: number;
}

function setScore(candidateScores: Map<number, number>, appid: number, score: number): void {
  candidateScores.set(appid, Math.max(candidateScores.get(appid) ?? 0, score));
}

export function isFallbackTitle(name: string | undefined, appid: number): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (trimmed === `App ${appid}` || trimmed === `Steam App ${appid}`) return true;
  return /^(?:Steam\s+App|App)\s+\d+/i.test(trimmed);
}

export function needsAppDetails(game: ScratchGame, today: string): boolean {
  if (isFallbackTitle(game.name, game.appid)) return true;
  if (!game.headerImage) return true;
  if (hasKnownReleasedSteamDate(game, today)) return false;
  if (isPlaceholderYearEndDate(game.wishlistDateText)) return true;
  return !hasKnownSteamDate(game);
}

export function applyAppDetails(
  map: Map<number, ScratchGame>,
  appid: number,
  details: AppDetailsLike | null
): void {
  const game = map.get(appid);
  if (!game) return;

  if (details?.type && DLC_TYPES.has(details.type.toLowerCase())) {
    map.delete(appid);
    return;
  }

  if (details?.name) game.name = details.name;
  if (details?.header_image) game.headerImage = details.header_image;
  if (details?.genres?.length) {
    game.genres = details.genres.map((x) => x.description).filter(Boolean).slice(0, 6);
  }
  if (details?.developer?.length) game.developer = details.developer.join(", ");
  if (details?.publisher?.length) game.publisher = details.publisher.join(", ");

  if (details?.release_date?.date) {
    const knownPlaceholder = !game.releaseDate && isPlaceholderYearEndDate(game.wishlistDateText);
    if (!hasKnownSteamDate(game) || knownPlaceholder) {
      applySteamDateInfo(
        game,
        parseSteamDateInfo(details.release_date.date),
        { demotePlaceholder: details.release_date.coming_soon }
      );
    }
  }
}

export function emptyCandidateResult(): CandidateBuildResult {
  return {
    map: new Map<number, ScratchGame>(),
    candidateScores: new Map<number, number>(),
    prefetchedAppDetails: new Map<number, AppDetailsLike | null>(),
    warnings: [],
    libraryAvailable: false,
    wishlistPrivate: false,
    wishlistPartial: false,
    wishlistShown: 0,
    wishlistTotalKnown: undefined,
  };
}

export function initializeCandidatesFromWishlist(wishlist: WishlistResultLike): CandidateBuildResult {
  const result = emptyCandidateResult();
  result.wishlistPrivate = wishlist.private;
  result.wishlistShown = wishlist.items.length;
  result.wishlistTotalKnown = wishlist.private ? undefined : wishlist.totalKnown;

  if (wishlist.private) {
    result.warnings.push("wishlistHidden");
  } else if ((wishlist.totalKnown ?? 0) > wishlist.items.length) {
    result.wishlistPartial = true;
    result.warnings.push("wishlistPartial");
  }

  for (const item of wishlist.items) {
    if (!Number.isFinite(item.appid) || item.appid <= 0) continue;
    const existing = result.map.get(item.appid);
    if (existing) {
      if (!existing.sources.includes("wishlist")) existing.sources.push("wishlist");
      if (!existing.headerImage) existing.headerImage = item.coverImage;
      if (!existing.wishlistDateText) existing.wishlistDateText = item.releaseDateText;
      applyKnownWishlistDate(existing, item.releaseDateText);
    } else {
      const game: ScratchGame = {
        appid: item.appid,
        name: item.title || `App ${item.appid}`,
        headerImage: item.coverImage,
        sources: ["wishlist"],
        releaseDate: null,
        dateSource: "unknown",
        steamUrl: `https://store.steampowered.com/app/${item.appid}/`,
        wishlistDateText: item.releaseDateText,
      };
      applyKnownWishlistDate(game, item.releaseDateText);
      result.map.set(item.appid, game);
    }
    setScore(result.candidateScores, item.appid, 10000);
  }

  for (const entry of wishlist.details ?? []) {
    if (!Number.isFinite(entry.appid) || entry.appid <= 0) continue;
    if (!entry.details) continue;
    result.prefetchedAppDetails.set(entry.appid, entry.details);
    applyAppDetails(result.map, entry.appid, entry.details);
  }

  return result;
}

export function addOwnedCandidates(
  result: CandidateBuildResult,
  owned: OwnedGameLike[],
  nowMs: number
): boolean {
  result.libraryAvailable = true;
  const isSmallLibrary = owned.length <= SMALL_LIBRARY_LIMIT;
  const ownedCandidates: OwnedCandidate[] = [];

  for (const g of owned) {
    if (!Number.isFinite(g.appid) || g.appid <= 0) continue;
    const libraryName = g.name || `Steam App ${g.appid}`;
    const existing = result.map.get(g.appid);
    if (existing) {
      if (!existing.sources.includes("library")) existing.sources.push("library");
      if (
        !existing.name ||
        existing.name === `App ${g.appid}` ||
        existing.name === `Steam App ${g.appid}`
      ) {
        existing.name = libraryName;
      }
      existing.playtimeForever = g.playtime_forever;
      setScore(result.candidateScores, g.appid, 10000);
      continue;
    }

    const score = scoreOwnedCandidate(g, nowMs);
    if (isSmallLibrary) {
      ownedCandidates.push({
        appid: g.appid,
        owned: g,
        score: Math.max(score, SMALL_LIBRARY_BASE_SCORE),
      });
    } else if (score > 0) {
      ownedCandidates.push({ appid: g.appid, owned: g, score });
    }
  }

  if (!ownedCandidates.length) return true;

  const remaining = Math.max(0, MAX_DETAIL_CANDIDATES - result.candidateScores.size);
  const allOwnedCandidatesAdded = ownedCandidates.length <= remaining;

  if (remaining > 0) {
    ownedCandidates.sort((a, b) => b.score - a.score || b.appid - a.appid);
    for (const candidate of ownedCandidates.slice(0, remaining)) {
      const g = candidate.owned;
      const libraryName = g.name || `Steam App ${g.appid}`;
      result.map.set(candidate.appid, {
        appid: candidate.appid,
        name: libraryName,
        sources: ["library"],
        releaseDate: null,
        dateSource: "unknown",
        steamUrl: `https://store.steampowered.com/app/${candidate.appid}/`,
        playtimeForever: g.playtime_forever,
      });
      setScore(result.candidateScores, candidate.appid, candidate.score);
    }
  }

  return allOwnedCandidatesAdded;
}

export function scoreOwnedCandidate(g: OwnedGameLike, nowMs: number): number {
  let score = 0;
  const recentOwned =
    typeof g.time_created === "number" && g.time_created * 1000 > nowMs - OWNED_RECENT_WINDOW_MS;

  if (g.playtime_forever === 0) {
    if (recentOwned) {
      score += g.appid >= HIGH_APPID_UNRELEASED_THRESHOLD ? 11000 : 10000;
    } else if (g.appid >= HIGH_APPID_UNRELEASED_THRESHOLD) {
      score += 8000;
    }
  }

  return score;
}

export function selectDetailCandidates(
  result: CandidateBuildResult,
  today: string
): number[] {
  const detailCandidates: Array<[number, number]> = [];
  for (const [appid, score] of result.candidateScores) {
    const game = result.map.get(appid);
    if (!game) continue;
    if (!Number.isFinite(appid) || appid <= 0) continue;
    if (result.prefetchedAppDetails.has(appid)) continue;
    if (hasKnownReleasedSteamDate(game, today)) continue;
    if (!needsAppDetails(game, today)) continue;
    detailCandidates.push([appid, score]);
  }

  return detailCandidates
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .slice(0, MAX_DETAIL_CANDIDATES)
    .map(([appid]) => appid);
}

export function applyReleaseFilters(map: Map<number, ScratchGame>, today: string): void {
  const currentYear = Number(today.slice(0, 4));
  for (const [appid, game] of map) {
    if (shouldRemoveKnownReleasedSteamGame(game, today)) {
      map.delete(appid);
      continue;
    }
    if (shouldRemovePastYearOnlySteamGame(game, currentYear)) {
      map.delete(appid);
    }
  }
}

export function removeUnknownLibraryOnly(map: Map<number, ScratchGame>): void {
  for (const [appid, game] of map) {
    if (shouldRemoveUnknownLibraryOnly(game)) {
      map.delete(appid);
    }
  }
}

export function selectRawgTargets(
  map: Map<number, ScratchGame>,
  candidateScores: Map<number, number>
): ScratchGame[] {
  return Array.from(map.values())
    .filter(
      (game) =>
        game.dateSource === "unknown" &&
        !shouldRemoveUnknownLibraryOnly(game) &&
        !isFallbackTitle(game.name, game.appid)
    )
    .sort((a, b) => {
      const scoreDiff = (candidateScores.get(b.appid) ?? 0) - (candidateScores.get(a.appid) ?? 0);
      return scoreDiff || b.appid - a.appid;
    })
    .slice(0, MAX_RAWG_LOOKUPS);
}

export function applyRawgHit(game: ScratchGame, hit: RawgHit | null, today: string): void {
  if (hit?.released && hit.released > today) {
    game.releaseDate = hit.released;
    game.dateSource = "rawg";
    game.dateSourceUrl = `https://rawg.io/games/${hit.slug}`;
  }
}

export function buildUpcomingList(map: Map<number, ScratchGame>): UpcomingGame[] {
  const list: UpcomingGame[] = Array.from(map.values()).map((g) => ({
    appid: g.appid,
    name: g.name || `Steam App ${g.appid}`,
    headerImage: g.headerImage,
    sources: g.sources,
    releaseDate: g.releaseDate,
    releaseYear: g.releaseYear,
    dateSource: g.dateSource,
    dateSourceUrl: g.dateSourceUrl,
    steamUrl: g.steamUrl,
    genres: g.genres,
    playtimeForever: g.playtimeForever,
    developer: g.developer,
    publisher: g.publisher,
  }));

  list.sort((a, b) => {
    const aName = a.name || `Steam App ${a.appid}`;
    const bName = b.name || `Steam App ${b.appid}`;
    if (a.releaseDate && b.releaseDate) {
      if (a.releaseDate === b.releaseDate) return aName.localeCompare(bName);
      return a.releaseDate.localeCompare(b.releaseDate);
    }
    if (!a.releaseDate && !b.releaseDate) {
      const aYear = a.releaseYear ?? Number.MAX_SAFE_INTEGER;
      const bYear = b.releaseYear ?? Number.MAX_SAFE_INTEGER;
      if (aYear !== bYear) return aYear - bYear;
      return aName.localeCompare(bName);
    }
    if (!a.releaseDate) return 1;
    return -1;
  });

  return list;
}

export function toUpcomingResult(result: CandidateBuildResult, games: UpcomingGame[]) {
  return {
    games,
    warnings: result.warnings,
    libraryAvailable: result.libraryAvailable,
    wishlistPrivate: result.wishlistPrivate,
    wishlistPartial: result.wishlistPartial,
    wishlistShown: result.wishlistShown,
    wishlistTotalKnown: result.wishlistTotalKnown,
  };
}

export type { ReleaseDateGame };
