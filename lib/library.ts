import "server-only";
import { getEarlyAccessStatusBatch } from "./early-access-getitems";
import { earlyAccessStoreCc } from "./early-access-core.ts";
import type { GetItemsEarlyAccessItem } from "./early-access-getitems-core.ts";
import { keyHash } from "./key-hash.ts";
import { getOwnedGames, type OwnedGame } from "./steam";
import type { SteamSession } from "./types";

export interface LibrarySnapshot {
  owned: OwnedGame[];
  items: Map<number, GetItemsEarlyAccessItem>;
  storeCc: string;
  apiKeyHash: string;
}

/**
 * Owned games plus their Steam store items (release dates, Early Access flag).
 * Both layers are cached (owned 10 min, items 24 h), so repeat calls are cheap.
 */
export async function loadLibrary(session: SteamSession | null): Promise<LibrarySnapshot | null> {
  if (!session?.steamId || !session.apiKey) return null;

  const storeCc = earlyAccessStoreCc(session.storeCc);
  const apiKeyHash = keyHash(session.apiKey);
  const owned = await getOwnedGames(session.steamId, session.apiKey, apiKeyHash);
  const items = await getEarlyAccessStatusBatch(
    owned.map((game) => game.appid),
    storeCc
  );
  return { owned, items, storeCc, apiKeyHash };
}
