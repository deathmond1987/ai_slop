export type Lang = "ru" | "en";

export type GameSource = "library" | "wishlist";

export type DateSource = "steam" | "steamYear" | "rawg" | "unknown";

export interface SteamFullGameRef {
  appid: number;
  name?: string;
}

export interface SteamPriceOverview {
  currency: string;
  initial?: number;
  final?: number;
  discount_percent?: number;
  initial_formatted?: string;
  final_formatted?: string;
}

export interface UpcomingGame {
  appid: number;
  name: string;
  headerImage?: string;
  sources: GameSource[];
  releaseDate: string | null;
  releaseYear?: number;
  dateSource: DateSource;
  dateSourceUrl?: string;
  steamUrl: string;
  steamType?: string;
  isFree?: boolean;
  fullgame?: SteamFullGameRef;
  genres?: string[];
  playtimeForever?: number;
  developer?: string;
  publisher?: string;
  price?: SteamPriceOverview;
  priceCc?: string;
}

export interface SteamSession {
  steamId?: string;
  displayName?: string;
  avatar?: string;
  apiKey?: string;
  rawgApiKey?: string;
  storeCc?: string;
  experimentalEarlyAccess?: boolean;
}

export type IdentifiedSession = SteamSession & { steamId: string };

export interface RawgHit {
  name: string;
  released: string | null;
  platforms: string[];
  slug: string;
}
