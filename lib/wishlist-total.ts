import { normalizeSteamStoreCc } from "./store-cc.ts";
import {
  applySteamDateInfo,
  parseSteamDateInfo,
  type ReleaseDateGame,
  type SteamDateInfo,
} from "./release-dates.ts";
import type {
  DateSource,
  GameSource,
  SteamFullGameRef,
  SteamPriceOverview,
  UpcomingGame,
} from "./types";

export interface WishlistCardFields {
  headerImage?: string;
  releaseDate?: string | null;
  releaseYear?: number;
  dateSource?: DateSource;
  dateSourceUrl?: string;
  steamType?: string;
  isFree?: boolean;
  fullgame?: SteamFullGameRef;
  genres?: string[];
  developer?: string;
  publisher?: string;
}

export interface WishlistCacheDateInfoLike {
  date?: string;
  coming_soon?: boolean;
}

export interface WishlistCacheFullGameLike {
  appid?: string | number;
  name?: string;
}

export interface WishlistCacheGenreLike {
  description?: string;
}

export interface WishlistPriceCandidate extends WishlistCardFields {
  appid?: number;
  name?: string;
  steamUrl?: string;
  sources?: GameSource[];
  price?: SteamPriceOverview;
  priceCc?: string;
}

export interface WishlistItemEntry extends WishlistCardFields {
  appid: number;
  name: string;
  steamUrl: string;
  currency?: string | null;
  finalCents?: number;
  initialCents?: number;
  discountCents?: number;
  discountPercent?: number;
  finalFormatted?: string;
  initialFormatted?: string;
}

export interface WishlistDiscountEntry extends WishlistItemEntry {
  currency: string;
  finalCents: number;
  initialCents: number;
  discountCents: number;
  discountPercent: number;
}

export interface WishlistPriceTotal {
  totalCents: number;
  discountTotalCents: number;
  currency: string;
  count: number;
  discountCount: number;
  discounts: WishlistDiscountEntry[];
}

export interface WishlistTotalResponse {
  ready: boolean;
  totalCents?: number;
  discountTotalCents?: number;
  discountCount?: number;
  count?: number;
  currency?: string | null;
  items?: WishlistItemEntry[];
  discounts?: WishlistDiscountEntry[];
  reason?: string;
}

export interface WishlistCacheDetailsLike {
  name?: string;
  price_overview?: SteamPriceOverview;
  header_image?: string;
  release_date?: WishlistCacheDateInfoLike;
  type?: string;
  is_free?: boolean;
  fullgame?: WishlistCacheFullGameLike;
  genres?: WishlistCacheGenreLike[];
  developer?: string[];
  publisher?: string[];
}

export interface WishlistCacheDetailsEntryLike {
  appid?: number;
  details?: WishlistCacheDetailsLike | null;
}

export interface OwnedAppIdEntryLike {
  appid?: number;
}

export function ownedAppIdSet(entries: OwnedAppIdEntryLike[] | undefined): Set<number> {
  const owned = new Set<number>();
  for (const entry of entries ?? []) {
    const appid = Number(entry?.appid);
    if (Number.isFinite(appid) && appid > 0) owned.add(appid);
  }
  return owned;
}

export function steamAppUrl(appid: number): string {
  return `https://store.steampowered.com/app/${appid}/`;
}

export interface WishlistCacheItemLike {
  appid?: number;
  title?: string;
  coverImage?: string;
  releaseDateText?: string;
}

export interface WishlistCacheResultLike {
  items?: WishlistCacheItemLike[];
  details?: WishlistCacheDetailsEntryLike[];
}

export function wishlistAppIdSetFromCacheResult(
  result: WishlistCacheResultLike | undefined
): Set<number> {
  const appids = new Set<number>();

  for (const item of result?.items ?? []) {
    const appid = Number(item?.appid);
    if (Number.isFinite(appid) && appid > 0) appids.add(appid);
  }

  for (const entry of result?.details ?? []) {
    const appid = Number(entry?.appid);
    if (Number.isFinite(appid) && appid > 0) appids.add(appid);
  }

  return appids;
}

export function filterWishlistPriceCandidatesByCurrentWishlist(
  candidates: WishlistPriceCandidate[],
  currentWishlistAppids: Set<number> | undefined
): WishlistPriceCandidate[] {
  if (currentWishlistAppids === undefined) return candidates;

  return candidates.filter((candidate) => {
    if (!candidate.sources?.includes("wishlist")) return true;

    const appid = Number(candidate.appid);
    return Number.isFinite(appid) && appid > 0 && currentWishlistAppids.has(appid);
  });
}

function knownDateSource(value: DateSource | undefined): value is DateSource {
  return Boolean(value && value !== "unknown");
}

function cleanCardFields(fields: WishlistCardFields): WishlistCardFields {
  const card: WishlistCardFields = {};

  if (fields.headerImage) card.headerImage = fields.headerImage;
  if (fields.releaseDate) card.releaseDate = fields.releaseDate;
  if (typeof fields.releaseYear === "number") card.releaseYear = fields.releaseYear;
  if (knownDateSource(fields.dateSource)) card.dateSource = fields.dateSource;
  if (fields.dateSourceUrl) card.dateSourceUrl = fields.dateSourceUrl;
  if (fields.steamType) card.steamType = fields.steamType;
  if (fields.isFree === true) card.isFree = true;

  const fullgameAppid = Number(fields.fullgame?.appid);
  if (Number.isFinite(fullgameAppid) && fullgameAppid > 0) {
    card.fullgame = fields.fullgame?.name
      ? { appid: fullgameAppid, name: fields.fullgame.name }
      : { appid: fullgameAppid };
  }

  if (fields.genres?.length) {
    const genres = fields.genres.map((genre) => genre.trim()).filter(Boolean);
    if (genres.length) card.genres = genres.slice(0, 6);
  }

  if (fields.developer?.trim()) card.developer = fields.developer.trim();
  if (fields.publisher?.trim()) card.publisher = fields.publisher.trim();

  return card;
}

export function withWishlistCardFields(
  candidate: WishlistPriceCandidate,
  fields: WishlistCardFields
): WishlistPriceCandidate {
  const card = cleanCardFields(fields);
  return Object.keys(card).length ? { ...candidate, ...card } : candidate;
}

function applySteamDateFields(
  fields: WishlistCardFields,
  info: SteamDateInfo,
  options: { demotePlaceholder?: boolean; force?: boolean } = {}
): void {
  if (!options.force && fields.dateSource === "steam") return;

  const scratch: ReleaseDateGame = {
    releaseDate: fields.releaseDate ?? null,
    dateSource: fields.dateSource ?? "unknown",
  };
  if (typeof fields.releaseYear === "number") scratch.releaseYear = fields.releaseYear;

  applySteamDateInfo(scratch, info, options);

  if (scratch.releaseDate) fields.releaseDate = scratch.releaseDate;
  if (typeof scratch.releaseYear === "number") fields.releaseYear = scratch.releaseYear;
  if (knownDateSource(scratch.dateSource)) fields.dateSource = scratch.dateSource;
}

export function wishlistCardFieldsFromCacheItem(
  item: WishlistCacheItemLike
): WishlistCardFields {
  const fields: WishlistCardFields = {};
  if (item.coverImage) fields.headerImage = item.coverImage;
  if (item.releaseDateText) {
    applySteamDateFields(
      fields,
      parseSteamDateInfo(item.releaseDateText, false),
      { demotePlaceholder: true }
    );
  }
  return fields;
}

export function wishlistCardFieldsFromAppDetails(
  details: WishlistCacheDetailsLike | null | undefined
): WishlistCardFields {
  const fields: WishlistCardFields = {};
  if (!details) return fields;

  if (details.header_image) fields.headerImage = details.header_image;

  const type = details.type?.trim().toLowerCase();
  if (type) fields.steamType = type;

  if (details.is_free === true) fields.isFree = true;

  const fullgameAppid = Number(details.fullgame?.appid);
  if (Number.isFinite(fullgameAppid) && fullgameAppid > 0) {
    fields.fullgame = details.fullgame?.name
      ? { appid: fullgameAppid, name: details.fullgame.name }
      : { appid: fullgameAppid };
  }

  if (details.genres?.length) {
    const genres = details.genres
      .map((genre) => genre.description?.trim())
      .filter((genre): genre is string => Boolean(genre));
    if (genres.length) fields.genres = genres.slice(0, 6);
  }

  const developers = details.developer
    ?.map((developer) => developer.trim())
    .filter(Boolean)
    .join(", ");
  if (developers) fields.developer = developers;

  const publishers = details.publisher
    ?.map((publisher) => publisher.trim())
    .filter(Boolean)
    .join(", ");
  if (publishers) fields.publisher = publishers;

  const releaseDate = details.release_date?.date;
  if (releaseDate) {
    applySteamDateFields(
      fields,
      parseSteamDateInfo(releaseDate),
      { demotePlaceholder: details.release_date?.coming_soon }
    );
  }

  return fields;
}

export function wishlistCardFieldsFromUpcomingGame(
  game: UpcomingGame
): WishlistCardFields {
  return cleanCardFields({
    headerImage: game.headerImage,
    releaseDate: game.releaseDate,
    releaseYear: game.releaseYear,
    dateSource: game.dateSource,
    dateSourceUrl: game.dateSourceUrl,
    steamType: game.steamType,
    isFree: game.isFree,
    fullgame: game.fullgame,
    genres: game.genres,
    developer: game.developer,
    publisher: game.publisher,
  });
}

export function mergeWishlistCardFields(
  currentRaw: WishlistCardFields,
  secondaryRaw: WishlistCardFields
): WishlistCardFields {
  const current = cleanCardFields(currentRaw);
  const secondary = cleanCardFields(secondaryRaw);
  const merged: WishlistCardFields = {};

  if (current.headerImage) {
    merged.headerImage = current.headerImage;
  } else if (secondary.headerImage) {
    merged.headerImage = secondary.headerImage;
  }

  if (current.releaseDate) {
    merged.releaseDate = current.releaseDate;
    if (typeof current.releaseYear === "number") {
      merged.releaseYear = current.releaseYear;
    } else if (typeof secondary.releaseYear === "number") {
      merged.releaseYear = secondary.releaseYear;
    }
    if (knownDateSource(current.dateSource)) {
      merged.dateSource = current.dateSource;
    } else if (knownDateSource(secondary.dateSource)) {
      merged.dateSource = secondary.dateSource;
    }
  } else if (secondary.releaseDate) {
    merged.releaseDate = secondary.releaseDate;
    if (typeof secondary.releaseYear === "number") {
      merged.releaseYear = secondary.releaseYear;
    } else if (typeof current.releaseYear === "number") {
      merged.releaseYear = current.releaseYear;
    }
    if (knownDateSource(secondary.dateSource)) {
      merged.dateSource = secondary.dateSource;
    } else if (knownDateSource(current.dateSource)) {
      merged.dateSource = current.dateSource;
    }
  } else {
    if (typeof current.releaseYear === "number") {
      merged.releaseYear = current.releaseYear;
    } else if (typeof secondary.releaseYear === "number") {
      merged.releaseYear = secondary.releaseYear;
    }
    if (knownDateSource(current.dateSource)) {
      merged.dateSource = current.dateSource;
    } else if (knownDateSource(secondary.dateSource)) {
      merged.dateSource = secondary.dateSource;
    }
  }

  if (current.dateSourceUrl) {
    merged.dateSourceUrl = current.dateSourceUrl;
  } else if (secondary.dateSourceUrl) {
    merged.dateSourceUrl = secondary.dateSourceUrl;
  }

  if (current.steamType) {
    merged.steamType = current.steamType;
  } else if (secondary.steamType) {
    merged.steamType = secondary.steamType;
  }

  if (current.isFree === true || secondary.isFree === true) merged.isFree = true;

  if (current.fullgame) {
    merged.fullgame = current.fullgame;
  } else if (secondary.fullgame) {
    merged.fullgame = secondary.fullgame;
  }

  if (current.genres?.length) {
    merged.genres = current.genres;
  } else if (secondary.genres?.length) {
    merged.genres = secondary.genres;
  }

  if (current.developer) {
    merged.developer = current.developer;
  } else if (secondary.developer) {
    merged.developer = secondary.developer;
  }

  if (current.publisher) {
    merged.publisher = current.publisher;
  } else if (secondary.publisher) {
    merged.publisher = secondary.publisher;
  }

  return merged;
}

function applyAppCardFields(
  fields: WishlistCardFields,
  details: WishlistCacheDetailsLike | null | undefined
): void {
  const app = cleanCardFields(wishlistCardFieldsFromAppDetails(details));

  if (app.headerImage) fields.headerImage = app.headerImage;
  if (app.steamType) fields.steamType = app.steamType;
  if (app.isFree === true) fields.isFree = true;
  if (app.fullgame) fields.fullgame = app.fullgame;
  if (app.genres?.length) fields.genres = app.genres;
  if (app.developer) fields.developer = app.developer;
  if (app.publisher) fields.publisher = app.publisher;

  if (!fields.releaseDate) {
    if (app.releaseDate) fields.releaseDate = app.releaseDate;
    if (typeof app.releaseYear === "number") fields.releaseYear = app.releaseYear;
    if (knownDateSource(app.dateSource)) fields.dateSource = app.dateSource;
  } else if (typeof fields.releaseYear !== "number" && typeof app.releaseYear === "number") {
    fields.releaseYear = app.releaseYear;
  }
}

export function wishlistCandidatesFromCacheDetails(
  entries: WishlistCacheDetailsEntryLike[] | undefined,
  storeCc?: string | null
): WishlistPriceCandidate[] {
  const normalizedStoreCc = normalizeSteamStoreCc(storeCc);
  const candidates: WishlistPriceCandidate[] = [];

  for (const entry of entries ?? []) {
    const appid = Number(entry?.appid);
    if (!Number.isFinite(appid) || appid <= 0) continue;

    candidates.push(
      withWishlistCardFields(
        {
          appid,
          name: entry.details?.name || `App ${appid}`,
          steamUrl: steamAppUrl(appid),
          sources: ["wishlist"],
          price: entry.details?.price_overview,
          priceCc: normalizedStoreCc,
        },
        wishlistCardFieldsFromAppDetails(entry.details)
      )
    );
  }

  return candidates;
}

export function wishlistCandidatesFromCacheResult(
  result: WishlistCacheResultLike | undefined,
  storeCc?: string | null
): WishlistPriceCandidate[] {
  const normalizedStoreCc = normalizeSteamStoreCc(storeCc);
  const candidates: WishlistPriceCandidate[] = [];
  const seen = new Set<number>();
  const detailsByAppid = new Map<number, WishlistCacheDetailsEntryLike>();

  for (const entry of result?.details ?? []) {
    const appid = Number(entry?.appid);
    if (!Number.isFinite(appid) || appid <= 0) continue;
    if (!detailsByAppid.has(appid)) detailsByAppid.set(appid, entry);
  }

  for (const item of result?.items ?? []) {
    const appid = Number(item?.appid);
    if (!Number.isFinite(appid) || appid <= 0) continue;
    if (seen.has(appid)) continue;
    seen.add(appid);

    const detail = detailsByAppid.get(appid)?.details;
    const cardFields = wishlistCardFieldsFromCacheItem(item);
    applyAppCardFields(cardFields, detail);
    candidates.push(
      withWishlistCardFields(
        {
          appid,
          name: item.title || detail?.name || `App ${appid}`,
          steamUrl: steamAppUrl(appid),
          sources: ["wishlist"],
          price: detail?.price_overview,
          priceCc: normalizedStoreCc,
        },
        cardFields
      )
    );
  }

  for (const [appid, entry] of detailsByAppid) {
    if (seen.has(appid)) continue;
    seen.add(appid);

    candidates.push(
      withWishlistCardFields(
        {
          appid,
          name: entry.details?.name || `App ${appid}`,
          steamUrl: steamAppUrl(appid),
          sources: ["wishlist"],
          price: entry.details?.price_overview,
          priceCc: normalizedStoreCc,
        },
        wishlistCardFieldsFromAppDetails(entry.details)
      )
    );
  }

  return candidates;
}

export function markOwnedCandidates<T extends WishlistPriceCandidate>(
  candidates: T[],
  ownedAppIds: Set<number>
): T[] {
  if (ownedAppIds.size === 0) return candidates;
  return candidates.map((candidate) => {
    const appid = Number(candidate.appid);
    if (!Number.isFinite(appid) || !ownedAppIds.has(appid)) return candidate;
    const sources = new Set<GameSource>(candidate.sources ?? []);
    sources.add("library");
    return { ...candidate, sources: [...sources] };
  });
}

export function mergeWishlistPriceCandidates(
  primary: WishlistPriceCandidate[],
  secondary: WishlistPriceCandidate[]
): WishlistPriceCandidate[] {
  const merged = [...primary];
  const indexByAppid = new Map<number, number>();

  for (let i = 0; i < merged.length; i++) {
    const appid = Number(merged[i]?.appid);
    if (Number.isFinite(appid) && appid > 0) indexByAppid.set(appid, i);
  }

  for (const candidate of secondary) {
    const appid = Number(candidate.appid);
    const hasAppid = Number.isFinite(appid) && appid > 0;
    const currentIndex = hasAppid ? indexByAppid.get(appid) : undefined;

    if (currentIndex !== undefined) {
      const current = merged[currentIndex];
      const cardFields = mergeWishlistCardFields(current, candidate);
      merged[currentIndex] = withWishlistCardFields(
        {
          appid: current.appid ?? candidate.appid,
          name: current.name || candidate.name,
          steamUrl: current.steamUrl || candidate.steamUrl,
          sources: Array.from(new Set<GameSource>([
            ...(current.sources ?? []),
            ...(candidate.sources ?? []),
          ])),
          price: current.price ?? candidate.price,
          priceCc: current.priceCc ?? candidate.priceCc,
        },
        cardFields
      );
      continue;
    }

    if (hasAppid) indexByAppid.set(appid, merged.length);
    merged.push(candidate);
  }

  return merged;
}

export function discountPercentOf(price: SteamPriceOverview, initial: number, final: number): number {
  if (typeof price.discount_percent === "number" && price.discount_percent > 0) {
    return price.discount_percent;
  }
  if (initial > final && initial > 0) {
    return Math.round(((initial - final) / initial) * 100);
  }
  return 0;
}

export function wishlistItemEntriesFromCandidates(
  candidates: WishlistPriceCandidate[]
): WishlistItemEntry[] {
  const items: WishlistItemEntry[] = [];

  for (const candidate of candidates) {
    if (candidate.sources) {
      if (!candidate.sources.includes("wishlist")) continue;
      if (candidate.sources.includes("library")) continue;
    }

    const appid = Number(candidate.appid);
    if (!Number.isFinite(appid) || appid <= 0) continue;

    const price = candidate.price;
    const finalCents = price?.final;
    if (!price || typeof finalCents !== "number" || !Number.isFinite(finalCents) || finalCents < 0) {
      continue;
    }

    const entry: WishlistItemEntry = {
      appid,
      name: candidate.name || `App ${appid}`,
      steamUrl: candidate.steamUrl || steamAppUrl(appid),
      finalCents,
    };

    const currency = price.currency?.trim().toLowerCase();
    if (currency) entry.currency = currency;

    if (price.final_formatted) {
      entry.finalFormatted = price.final_formatted;
    }

    const initialCents = Number.isFinite(price.initial) ? price.initial : undefined;
    if (initialCents !== undefined) {
      entry.initialCents = initialCents;

      if (price.initial_formatted) {
        entry.initialFormatted = price.initial_formatted;
      }

      if (initialCents > finalCents) {
        const percent = discountPercentOf(price, initialCents, finalCents);
        if (percent > 0) {
          entry.discountCents = initialCents - finalCents;
          entry.discountPercent = percent;
        }
      }
    }

    const cardFields = cleanCardFields(candidate);
    items.push(Object.keys(cardFields).length ? { ...entry, ...cardFields } : entry);
  }

  return items;
}

export function computeWishlistPriceTotal(
  candidates: WishlistPriceCandidate[],
  storeCc?: string | null
): WishlistPriceTotal | undefined {
  const normalizedStoreCc = normalizeSteamStoreCc(storeCc);
  let totalCents = 0;
  let discountTotalCents = 0;
  let count = 0;
  let discountCount = 0;
  let currency: string | undefined;
  const discounts: WishlistDiscountEntry[] = [];

  for (const candidate of candidates) {
    if (candidate.sources) {
      if (!candidate.sources.includes("wishlist")) continue;
      if (candidate.sources.includes("library")) continue;
    }

    const price = candidate.price;
    if (!price || !Number.isFinite(price.final)) continue;

    const final = price.final ?? 0;
    if (final < 0) continue;

    const candidateCc = normalizeSteamStoreCc(candidate.priceCc);
    if (normalizedStoreCc && candidateCc !== normalizedStoreCc) continue;

    const priceCurrency = price.currency?.trim().toLowerCase();
    if (!priceCurrency) continue;

    if (currency && priceCurrency !== currency) continue;
    currency ??= priceCurrency;

    totalCents += final;
    count += 1;

    const initial = Number.isFinite(price.initial) ? (price.initial as number) : undefined;
    const discountPercent = initial !== undefined
      ? discountPercentOf(price, initial, final)
      : 0;

    if (initial !== undefined && initial > final && discountPercent > 0) {
      const discountCents = initial - final;
      discountTotalCents += discountCents;
      discountCount += 1;
      discounts.push({
        appid: candidate.appid ?? 0,
        name: candidate.name || `App ${candidate.appid ?? 0}`,
        steamUrl: candidate.steamUrl ||
          (candidate.appid ? steamAppUrl(candidate.appid) : ""),
        currency: priceCurrency,
        finalCents: final,
        initialCents: initial,
        discountCents,
        discountPercent,
        finalFormatted: price.final_formatted,
        initialFormatted: price.initial_formatted,
      });
    }
  }

  if (!currency) return undefined;

  return { totalCents, discountTotalCents, currency, count, discountCount, discounts };
}
