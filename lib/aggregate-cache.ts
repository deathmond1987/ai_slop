import { createHash } from "node:crypto";
import type { CacheGet, CacheSet } from "./cached-dedupe";
import { normalizeSteamStoreCc } from "./store-cc.ts";
import type { IdentifiedSession } from "./types";

export const UPCOMING_CACHE_PREFIX = "upcoming:v5:";
export const UPCOMING_CACHE_TTL_MS = 300_000;

function parsePositiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

export function upcomingCacheTtlMs(): number {
  const seconds = parsePositiveInt(process.env.UPCOMING_CACHE_TTL_SECONDS);
  if (seconds !== undefined) return seconds * 1000;
  const milliseconds = parsePositiveInt(process.env.UPCOMING_CACHE_TTL_MS);
  if (milliseconds !== undefined) return milliseconds;
  return UPCOMING_CACHE_TTL_MS;
}

export interface UpcomingCacheContext {
  steamId: string;
  apiKey?: string | null;
  rawgApiKey?: string | null;
  storeCc?: string | null;
  today: string;
}

export interface LoadUpcomingWithCacheOptions<T> {
  context: UpcomingCacheContext;
  cacheGet: CacheGet;
  cacheSet: CacheSet;
  factory: (
    cacheKey: string,
    apiKeyHash: string,
    rawgKeyHash: string,
    storeCcHash?: string
  ) => Promise<T>;
  pending?: Map<string, Promise<T>>;
  ttlMs?: number | ((value: T) => number);
}

export function shortHash(value?: string | null): string {
  if (!value) return "none";
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function upcomingStoreCcHash(storeCc?: string | null): string | undefined {
  const normalizedStoreCc = normalizeSteamStoreCc(storeCc);
  return normalizedStoreCc ? shortHash(normalizedStoreCc) : undefined;
}

export function upcomingCacheKeyFromHashes(
  steamId: string,
  apiKeyHash: string,
  rawgKeyHash: string,
  today: string,
  storeCcHash?: string
): string {
  const base = `${UPCOMING_CACHE_PREFIX}${steamId}:${apiKeyHash}:${rawgKeyHash}:${today}`;
  return storeCcHash ? `${base}:${storeCcHash}` : base;
}

export function upcomingCacheKeyFromContext(context: UpcomingCacheContext): string {
  return upcomingCacheKeyFromHashes(
    context.steamId,
    shortHash(context.apiKey),
    shortHash(context.rawgApiKey),
    context.today,
    upcomingStoreCcHash(context.storeCc)
  );
}

export function upcomingCacheKey(
  session: Pick<IdentifiedSession, "steamId" | "apiKey" | "storeCc">,
  rawgKey: string | undefined,
  today: string
): string {
  return upcomingCacheKeyFromHashes(
    session.steamId,
    shortHash(session.apiKey),
    shortHash(rawgKey),
    today,
    upcomingStoreCcHash(session.storeCc)
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
  const storeCcHash = upcomingStoreCcHash(context.storeCc);
  const cacheKey = upcomingCacheKeyFromHashes(
    context.steamId,
    apiKeyHash,
    rawgKeyHash,
    context.today,
    storeCcHash
  );

  const cached = await cacheGet<T>(cacheKey);
  if (cached !== undefined) return cached;

  const resolveTtl = (value: T): number => {
    if (typeof ttlMs === "function") return ttlMs(value);
    return ttlMs ?? upcomingCacheTtlMs();
  };

  const run = async (): Promise<T> => {
    const value = await factory(cacheKey, apiKeyHash, rawgKeyHash, storeCcHash);
    await cacheSet(cacheKey, value, resolveTtl(value));
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
