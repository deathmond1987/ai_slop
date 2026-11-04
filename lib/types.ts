export type Lang = "ru" | "en";

export type GameSource = "library" | "wishlist";

export type DateSource = "steam" | "steamYear" | "rawg" | "unknown";

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
  genres?: string[];
  playtimeForever?: number;
  developer?: string;
  publisher?: string;
}

export interface SteamSession {
  steamId?: string;
  displayName?: string;
  avatar?: string;
  apiKey?: string;
  rawgApiKey?: string;
}

export type IdentifiedSession = SteamSession & { steamId: string };

export interface RawgHit {
  name: string;
  released: string | null;
  platforms: string[];
  slug: string;
}
