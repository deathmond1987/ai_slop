import {
  steamAppDetailsRetryDelayMs,
  steamAppDetailsRetryEnabled,
  steamAppDetailsRetryMaxAttempts,
  steamAppDetailsRetryQueueMax,
  steamAppDetailsRetrySteamIdsMax,
} from "./steam-core.ts";
import { processSingleton } from "./process-singleton.ts";
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

const retryState = processSingleton("steam.appDetailsRetry", () => ({
  entries: new Map<string, RetryEntry>(),
  handlers: {} as AppDetailsRetryHandlers,
  timer: undefined as ReturnType<typeof setTimeout> | undefined,
  stats: createStats(),
  running: false,
}));
const retryEntries = retryState.entries;

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
  retryState.stats.configured = Boolean(retryState.handlers.retry);
  retryState.stats.enabled = cfg.enabled;
  retryState.stats.queued = retryEntries.size;
  retryState.stats.due = 0;
  for (const entry of retryEntries.values()) {
    if (entry.nextRetryAtMs <= now) retryState.stats.due += 1;
  }
  retryState.stats.uniqueSteamIds = uniqueSteamIds();
  retryState.stats.scheduled = retryState.timer !== undefined;
}

function clearTimer(): void {
  if (!retryState.timer) return;
  clearTimeout(retryState.timer);
  retryState.timer = undefined;
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

  retryState.timer = setTimeout(() => {
    retryState.timer = undefined;
    void processAppDetailsRetries();
  }, waitMs);
  retryState.timer.unref?.();
  refreshStats();
}

export function configureAppDetailsRetry(nextHandlers: AppDetailsRetryHandlers): void {
  retryState.handlers = { ...nextHandlers };
  refreshStats();
}

export function resetAppDetailsRetry(): void {
  clearTimer();
  retryEntries.clear();
  retryState.handlers = {};
  retryState.running = false;
  retryState.stats = createStats();
}

export function enqueueAppDetailsRetry(request: AppDetailsRetryRequest): boolean {
  const cfg = config();
  if (!cfg.enabled) {
    refreshStats();
    return false;
  }

  const entry = normalizeRequest(request);
  if (!entry) {
    retryState.stats.dropped += 1;
    refreshStats();
    return false;
  }

  if (retryEntries.has(entry.key)) {
    refreshStats();
    return false;
  }

  if (retryEntries.size >= cfg.queueMax) {
    retryState.stats.dropped += 1;
    refreshStats();
    return false;
  }

  if (entry.steamId && uniqueSteamIds() >= cfg.steamIdsMax && !hasSteamId(entry.steamId)) {
    retryState.stats.dropped += 1;
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
  if (!cfg.enabled || !retryState.handlers.retry || retryState.running) {
    refreshStats();
    return 0;
  }

  const dueEntries = [...retryEntries.values()].filter((entry) => entry.nextRetryAtMs <= now);
  if (dueEntries.length === 0) {
    scheduleNext();
    return 0;
  }

  retryState.running = true;
  let handled = 0;

  for (const entry of dueEntries) {
    if (!retryEntries.has(entry.key)) continue;

    entry.attempts += 1;
    retryState.stats.attempts += 1;
    const request = toRequest(entry);
    let outcome: AppDetailsRetryOutcome = "stop";

    try {
      outcome = await retryState.handlers.retry(request);
    } catch {
      outcome = "stop";
    }

    if (outcome === "succeeded") {
      retryEntries.delete(entry.key);
      retryState.stats.succeeded += 1;
      handled += 1;
      if (retryState.handlers.onSucceeded) {
        try {
          await retryState.handlers.onSucceeded(request);
        } catch {
          // Cache invalidation is best-effort.
        }
      }
      continue;
    }

    if (outcome === "retry" && entry.attempts < cfg.maxAttempts) {
      entry.nextRetryAtMs = now + cfg.delayMs * Math.min(entry.attempts, cfg.maxAttempts);
      retryState.stats.retried += 1;
      handled += 1;
      continue;
    }

    retryEntries.delete(entry.key);
    retryState.stats.stopped += 1;
    handled += 1;
  }

  retryState.running = false;
  scheduleNext();
  return handled;
}

export function appDetailsRetryQueueStats(): AppDetailsRetryStats {
  refreshStats();
  return { ...retryState.stats };
}
