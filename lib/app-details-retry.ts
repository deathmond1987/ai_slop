import {
  steamAppDetailsRetryDelayMs,
  steamAppDetailsRetryEnabled,
  steamAppDetailsRetryMaxAttempts,
  steamAppDetailsRetryQueueMax,
  steamAppDetailsRetrySteamIdsMax,
} from "./steam-core.ts";
import { normalizeSteamStoreCc } from "./store-cc.ts";

export type AppDetailsRetryOutcome = "succeeded" | "retry" | "stop";

export interface AppDetailsRetryRequest {
  appid: number;
  storeCc?: string | null;
  steamId?: string | null;
}

export interface AppDetailsRetryHandlers {
  retry?: (request: AppDetailsRetryRequest) => Promise<AppDetailsRetryOutcome>;
  onSucceeded?: (request: AppDetailsRetryRequest) => Promise<void>;
}

export interface AppDetailsRetryStats {
  configured: boolean;
  enabled: boolean;
  queued: number;
  due: number;
  uniqueSteamIds: number;
  attempts: number;
  succeeded: number;
  retried: number;
  stopped: number;
  dropped: number;
  scheduled: boolean;
}

interface RetryEntry {
  key: string;
  appid: number;
  storeCc?: string;
  steamId?: string;
  attempts: number;
  nextRetryAtMs: number;
}

const retryEntries = new Map<string, RetryEntry>();
let handlers: AppDetailsRetryHandlers = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let stats = createStats();
let running = false;

function createStats(): AppDetailsRetryStats {
  return {
    configured: false,
    enabled: false,
    queued: 0,
    due: 0,
    uniqueSteamIds: 0,
    attempts: 0,
    succeeded: 0,
    retried: 0,
    stopped: 0,
    dropped: 0,
    scheduled: false,
  };
}

function config() {
  return {
    enabled: steamAppDetailsRetryEnabled(),
    delayMs: steamAppDetailsRetryDelayMs(),
    maxAttempts: steamAppDetailsRetryMaxAttempts(),
    queueMax: steamAppDetailsRetryQueueMax(),
    steamIdsMax: steamAppDetailsRetrySteamIdsMax(),
  };
}

function normalizeSteamId(steamId?: string | null): string | undefined {
  if (typeof steamId !== "string") return undefined;
  const normalized = steamId.trim();
  if (!normalized || !/^\d{15,20}$/.test(normalized)) return undefined;
  return normalized;
}

function normalizeRequest(request: AppDetailsRetryRequest): RetryEntry | undefined {
  if (!Number.isSafeInteger(request.appid) || request.appid <= 0) return undefined;
  const storeCc = normalizeSteamStoreCc(request.storeCc);
  const hasSteamId = request.steamId !== undefined && request.steamId !== null;
  const steamId = normalizeSteamId(request.steamId);
  if (hasSteamId && !steamId) return undefined;
  return {
    key: `${request.appid}|${storeCc ?? ""}|${steamId ?? ""}`,
    appid: request.appid,
    storeCc,
    steamId,
    attempts: 0,
    nextRetryAtMs: 0,
  };
}

function toRequest(entry: RetryEntry): AppDetailsRetryRequest {
  return {
    appid: entry.appid,
    storeCc: entry.storeCc ?? null,
    steamId: entry.steamId ?? null,
  };
}

function uniqueSteamIds(): number {
  const ids = new Set<string>();
  for (const entry of retryEntries.values()) {
    if (entry.steamId) ids.add(entry.steamId);
  }
  return ids.size;
}

function refreshStats(): void {
  const cfg = config();
  const now = Date.now();
  stats.configured = Boolean(handlers.retry);
  stats.enabled = cfg.enabled;
  stats.queued = retryEntries.size;
  stats.due = 0;
  for (const entry of retryEntries.values()) {
    if (entry.nextRetryAtMs <= now) stats.due += 1;
  }
  stats.uniqueSteamIds = uniqueSteamIds();
  stats.scheduled = timer !== undefined;
}

function clearTimer(): void {
  if (!timer) return;
  clearTimeout(timer);
  timer = undefined;
}

function nextDueAtMs(now: number): number | undefined {
  let next: number | undefined;
  for (const entry of retryEntries.values()) {
    if (next === undefined || entry.nextRetryAtMs < next) next = entry.nextRetryAtMs;
  }
  if (next === undefined) return undefined;
  return Math.max(0, next - now);
}

function scheduleNext(): void {
  clearTimer();
  if (retryEntries.size === 0) {
    refreshStats();
    return;
  }

  const waitMs = nextDueAtMs(Date.now());
  if (waitMs === undefined) {
    refreshStats();
    return;
  }

  timer = setTimeout(() => {
    timer = undefined;
    void processAppDetailsRetries();
  }, waitMs);
  timer.unref?.();
  refreshStats();
}

export function configureAppDetailsRetry(nextHandlers: AppDetailsRetryHandlers): void {
  handlers = { ...nextHandlers };
  refreshStats();
}

export function resetAppDetailsRetry(): void {
  clearTimer();
  retryEntries.clear();
  handlers = {};
  running = false;
  stats = createStats();
}

export function enqueueAppDetailsRetry(request: AppDetailsRetryRequest): boolean {
  const cfg = config();
  if (!cfg.enabled) {
    refreshStats();
    return false;
  }

  const entry = normalizeRequest(request);
  if (!entry) {
    stats.dropped += 1;
    refreshStats();
    return false;
  }

  if (retryEntries.has(entry.key)) {
    refreshStats();
    return false;
  }

  if (retryEntries.size >= cfg.queueMax) {
    stats.dropped += 1;
    refreshStats();
    return false;
  }

  if (entry.steamId && uniqueSteamIds() >= cfg.steamIdsMax && !hasSteamId(entry.steamId)) {
    stats.dropped += 1;
    refreshStats();
    return false;
  }

  entry.nextRetryAtMs = Date.now() + cfg.delayMs;
  retryEntries.set(entry.key, entry);
  scheduleNext();
  return true;
}

function hasSteamId(steamId: string): boolean {
  for (const entry of retryEntries.values()) {
    if (entry.steamId === steamId) return true;
  }
  return false;
}

export async function processAppDetailsRetries(now = Date.now()): Promise<number> {
  const cfg = config();
  if (!cfg.enabled || !handlers.retry || running) {
    refreshStats();
    return 0;
  }

  const dueEntries = [...retryEntries.values()].filter((entry) => entry.nextRetryAtMs <= now);
  if (dueEntries.length === 0) {
    scheduleNext();
    return 0;
  }

  running = true;
  let handled = 0;

  for (const entry of dueEntries) {
    if (!retryEntries.has(entry.key)) continue;

    entry.attempts += 1;
    stats.attempts += 1;
    const request = toRequest(entry);
    let outcome: AppDetailsRetryOutcome = "stop";

    try {
      outcome = await handlers.retry(request);
    } catch {
      outcome = "stop";
    }

    if (outcome === "succeeded") {
      retryEntries.delete(entry.key);
      stats.succeeded += 1;
      handled += 1;
      if (handlers.onSucceeded) {
        try {
          await handlers.onSucceeded(request);
        } catch {
          // Cache invalidation is best-effort.
        }
      }
      continue;
    }

    if (outcome === "retry" && entry.attempts < cfg.maxAttempts) {
      entry.nextRetryAtMs = now + cfg.delayMs * Math.min(entry.attempts, cfg.maxAttempts);
      stats.retried += 1;
      handled += 1;
      continue;
    }

    retryEntries.delete(entry.key);
    stats.stopped += 1;
    handled += 1;
  }

  running = false;
  scheduleNext();
  return handled;
}

export function appDetailsRetryQueueStats(): AppDetailsRetryStats {
  refreshStats();
  return { ...stats };
}
