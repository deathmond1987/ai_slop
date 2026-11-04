import { createHash } from "node:crypto";
import type { CacheGet, CacheSet } from "./cached-dedupe";
import type { IdentifiedSession } from "./types";

export const UPCOMING_CACHE_PREFIX = "upcoming:v5:";
export const UPCOMING_CACHE_TTL_MS = 60_000;

export interface UpcomingCacheContext {
  steamId: string;
  apiKey?: string | null;
  rawgApiKey?: string | null;
  today: string;
}

export interface LoadUpcomingWithCacheOptions<T> {
  context: UpcomingCacheContext;
  cacheGet: CacheGet;
  cacheSet: CacheSet;
  factory: (cacheKey: string, apiKeyHash: string, rawgKeyHash: string) => Promise<T>;
  pending?: Map<string, Promise<T>>;
  ttlMs?: number;
}

export function shortHash(value?: string | null): string {
  if (!value) return "none";
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function upcomingCacheKeyFromHashes(
  steamId: string,
  apiKeyHash: string,
  rawgKeyHash: string,
  today: string
): string {
  return `${UPCOMING_CACHE_PREFIX}${steamId}:${apiKeyHash}:${rawgKeyHash}:${today}`;
}

export function upcomingCacheKeyFromContext(context: UpcomingCacheContext): string {
  return upcomingCacheKeyFromHashes(
    context.steamId,
    shortHash(context.apiKey),
    shortHash(context.rawgApiKey),
    context.today
  );
}

export function upcomingCacheKey(
  session: Pick<IdentifiedSession, "steamId" | "apiKey">,
  rawgKey: string | undefined,
  today: string
): string {
  return upcomingCacheKeyFromHashes(
    session.steamId,
    shortHash(session.apiKey),
    shortHash(rawgKey),
    today
  );
}

export async function loadUpcomingWithCache<T>({
  context,
  cacheGet,
  cacheSet,
  factory,
  pending,
  ttlMs,
}: LoadUpcomingWithCacheOptions<T>): Promise<T> {
  const apiKeyHash = shortHash(context.apiKey);
  const rawgKeyHash = shortHash(context.rawgApiKey);
  const cacheKey = upcomingCacheKeyFromHashes(
    context.steamId,
    apiKeyHash,
    rawgKeyHash,
    context.today
  );

  const cached = await cacheGet<T>(cacheKey);
  if (cached !== undefined) return cached;

  const ttl = ttlMs ?? UPCOMING_CACHE_TTL_MS;
  const run = async (): Promise<T> => {
    const value = await factory(cacheKey, apiKeyHash, rawgKeyHash);
    await cacheSet(cacheKey, value, ttl);
    return value;
  };

  if (!pending) return run();

  const inflight = pending.get(cacheKey);
  if (inflight) return inflight;

  const promise = run().finally(() => {
    pending.delete(cacheKey);
  });
  pending.set(cacheKey, promise);
  return promise;
}
