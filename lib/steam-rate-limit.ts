import { processSingleton } from "./process-singleton.ts";
import {
  STEAM_STORE_RATE_LIMIT_COOLDOWN_MAX_MS,
  steamStoreRateLimitCooldownMs,
  steamStoreRateLimitEnabled,
  steamStoreRateLimitMaxRequests,
  steamStoreRateLimitMaxWaitMs,
  steamStoreRateLimitMinIntervalMs,
  steamStoreRateLimitWindowMs,
} from "./steam-core.ts";

export interface SteamStoreRateLimitReservation {
  allowed: boolean;
  waitedMs: number;
  blockedMs: number;
}

interface StoreRateLimitState {
  requests: number[];
  nextAllowedAtMs: number;
  blockedUntilMs: number;
}

const storeRateLimitStates = processSingleton("steamStoreRateLimit.states", () => new Map<string, StoreRateLimitState>());
const storeRateLimitStats = processSingleton("steamStoreRateLimit.stats", () => ({
  reservations: 0,
  waits: 0,
  blocked: 0,
  failures: 0,
}));

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function storeRateLimitKey(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "store.steampowered.com" ? "steam-store" : parsed.hostname;
  } catch {
    return "steam-store";
  }
}

function getStoreRateLimitState(key: string): StoreRateLimitState {
  const existing = storeRateLimitStates.get(key);
  if (existing) return existing;

  const state: StoreRateLimitState = {
    requests: [],
    nextAllowedAtMs: 0,
    blockedUntilMs: 0,
  };
  storeRateLimitStates.set(key, state);
  return state;
}

function pruneStoreRateLimitRequests(state: StoreRateLimitState, now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  while (state.requests.length > 0 && state.requests[0] <= cutoff) {
    state.requests.shift();
  }
}

function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.round(seconds * 1000);
}

export function resetSteamStoreRateLimitState(): void {
  storeRateLimitStates.clear();
  storeRateLimitStats.reservations = 0;
  storeRateLimitStats.waits = 0;
  storeRateLimitStats.blocked = 0;
  storeRateLimitStats.failures = 0;
}

export function steamStoreRateLimitStats(): {
  reservations: number;
  waits: number;
  blocked: number;
  failures: number;
  buckets: number;
} {
  return {
    ...storeRateLimitStats,
    buckets: storeRateLimitStates.size,
  };
}

export async function reserveSteamStoreRequest(
  url: string,
  maxWaitMs?: number
): Promise<SteamStoreRateLimitReservation> {
  if (!steamStoreRateLimitEnabled()) {
    return { allowed: true, waitedMs: 0, blockedMs: 0 };
  }

  const maxRequests = steamStoreRateLimitMaxRequests();
  const windowMs = steamStoreRateLimitWindowMs();
  const intervalMs = steamStoreRateLimitMinIntervalMs();
  const maxAllowedWaitMs = Math.max(
    0,
    Math.min(maxWaitMs ?? steamStoreRateLimitMaxWaitMs(), steamStoreRateLimitMaxWaitMs())
  );
  const state = getStoreRateLimitState(storeRateLimitKey(url));
  const now = Date.now();
  pruneStoreRateLimitRequests(state, now, windowMs);

  if (state.blockedUntilMs > now) {
    storeRateLimitStats.blocked += 1;
    return { allowed: false, waitedMs: 0, blockedMs: state.blockedUntilMs - now };
  }

  // Reserve a concrete start time synchronously so concurrent callers queue FIFO
  // instead of all waking at once and racing for the same slot.
  let startAtMs = Math.max(now, state.nextAllowedAtMs);
  if (state.requests.length >= maxRequests) {
    const windowSlot = state.requests[state.requests.length - maxRequests] ?? now;
    startAtMs = Math.max(startAtMs, windowSlot + windowMs);
  }

  const waitMs = startAtMs - now;
  if (waitMs > maxAllowedWaitMs) {
    storeRateLimitStats.blocked += 1;
    return { allowed: false, waitedMs: 0, blockedMs: waitMs };
  }

  state.requests.push(startAtMs);
  state.nextAllowedAtMs = startAtMs + intervalMs;
  storeRateLimitStats.reservations += 1;
  storeRateLimitStats.waits += waitMs;

  if (waitMs > 0) await sleep(waitMs);

  if (state.blockedUntilMs > Date.now()) {
    storeRateLimitStats.blocked += 1;
    return { allowed: false, waitedMs: waitMs, blockedMs: state.blockedUntilMs - Date.now() };
  }

  return { allowed: true, waitedMs: waitMs, blockedMs: 0 };
}

export function registerSteamStoreFailure(
  url: string,
  status?: number | null,
  retryAfterHeader?: string | null
): number | undefined {
  if (!steamStoreRateLimitEnabled()) return undefined;
  if (status !== undefined && status !== null && status !== 403 && status !== 429) {
    return undefined;
  }

  const state = getStoreRateLimitState(storeRateLimitKey(url));
  const now = Date.now();
  const cooldownMs = steamStoreRateLimitCooldownMs();
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  const waitMs = Math.min(
    Math.max(cooldownMs, retryAfterMs ?? 0),
    STEAM_STORE_RATE_LIMIT_COOLDOWN_MAX_MS
  );

  state.blockedUntilMs = Math.max(state.blockedUntilMs, now + waitMs);
  storeRateLimitStats.failures += 1;
  return waitMs;
}
