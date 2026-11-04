export interface CacheGet {
  <T>(key: string): Promise<T | undefined>;
}

export interface CacheSet {
  (key: string, value: unknown, ttlMs: number): Promise<void>;
}

export interface LoadWithCacheAndDedupeOptions<T> {
  cacheKey: string;
  pending: Map<string, Promise<T>>;
  cacheGet: CacheGet;
  cacheSet: CacheSet;
  factory: () => Promise<T>;
  ttlMs: number | ((value: T) => number);
}

export async function loadWithCacheAndDedupe<T>({
  cacheKey,
  pending,
  cacheGet,
  cacheSet,
  factory,
  ttlMs,
}: LoadWithCacheAndDedupeOptions<T>): Promise<T> {
  const cached = await cacheGet<T>(cacheKey);
  if (cached !== undefined) return cached;

  const inflight = pending.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const value = await factory();
    const ttl = typeof ttlMs === "function" ? ttlMs(value) : ttlMs;
    await cacheSet(cacheKey, value, ttl);
    return value;
  })().finally(() => {
    pending.delete(cacheKey);
  });

  pending.set(cacheKey, promise);
  return promise;
}
