import { type NextRequest, NextResponse } from "next/server";
import { logDebug, sanitizeDebugError } from "@/lib/debug";
import {
  jsonError,
  jsonSuccess,
  requestIdFromRequest,
  runWithRequestId,
} from "@/lib/request-context";
import { getAppDetails } from "@/lib/steam";
import { normalizeSteamStoreCc } from "@/lib/store-cc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_EVENT_LENGTH = 100;
const MAX_APP_IDS = 100;

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, maxLength = 256): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

function firstDefined(values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function parseSteamId(value: unknown): string | undefined {
  const raw = optionalString(value, 20);
  if (!raw || !/^\d{15,20}$/.test(raw)) return undefined;
  return raw;
}

function parseAppIds(body: JsonObject): { appIds: number[]; tooMany: boolean } {
  const raw = firstDefined([body.appids, body.appIds, body.appid]);
  if (raw === undefined) return { appIds: [], tooMany: false };

  const rawValues = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [raw];

  const appIds = new Set<number>();
  for (const value of rawValues) {
    if (value === undefined || value === null || value === "") continue;

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 1_000_000_000) continue;
    appIds.add(parsed);
  }

  return { appIds: Array.from(appIds), tooMany: appIds.size > MAX_APP_IDS };
}

function summarizeAppIds(appIds: number[]): number[] {
  if (appIds.length <= 20) return appIds;
  return [...appIds.slice(0, 20), -1];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFromRequest(request);

  return runWithRequestId(requestId, async () => {
    try {
      logDebug("steam.webhook.received", {
        path: request.nextUrl.pathname,
        method: request.method,
      });

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        logDebug("steam.webhook.invalid_json");
        return jsonError("Request body must be valid JSON", 400, "invalid_json");
      }

      if (!isRecord(body)) {
        logDebug("steam.webhook.invalid_body");
        return jsonError("Request body must be a JSON object", 422, "invalid_body");
      }

      const event = optionalString(firstDefined([body.event, body.eventType]), MAX_EVENT_LENGTH);
      if (!event) {
        logDebug("steam.webhook.missing_event");
        return jsonError("event is required", 422, "missing_event");
      }

      const { appIds, tooMany } = parseAppIds(body);
      if (appIds.length === 0) {
        logDebug("steam.webhook.missing_appids");
        return jsonError("appid or appIds is required", 422, "missing_appids");
      }

      if (tooMany) {
        logDebug("steam.webhook.too_many_appids", { requested: appIds.length });
        return jsonError(`at most ${MAX_APP_IDS} appIds are accepted`, 413, "too_many_appids");
      }

      const steamId = parseSteamId(firstDefined([body.steamId, body.steamid]));
      const storeCc = normalizeSteamStoreCc(optionalString(firstDefined([body.storeCc, body.store_cc])));

      logDebug("steam.webhook.validated", {
        event,
        requestedAppIds: appIds.length,
        appIds: summarizeAppIds(appIds),
        hasSteamId: Boolean(steamId),
        hasStoreCc: Boolean(storeCc),
      });

      const details = await getAppDetails(appIds, {
        steamId,
        storeCc,
      });

      const loaded = appIds.filter((appid) => details.get(appid) !== null);
      const missing = appIds.filter((appid) => details.get(appid) === null);

      logDebug("steam.webhook.done", {
        event,
        requested: appIds.length,
        loaded: loaded.length,
        missing: missing.length,
      });

      return jsonSuccess({
        ok: true,
        event,
        processed: {
          requested: appIds.length,
          loaded: loaded.length,
          missing: missing.length,
        },
        results: appIds.map((appid) => ({
          appid,
          loaded: !missing.includes(appid),
        })),
      });
    } catch (error) {
      const safeError = sanitizeDebugError(error);
      logDebug("steam.webhook.failed", { error: safeError });
      return jsonError("Steam webhook processing failed", 502, "webhook_failed");
    }
  });
}
