import "server-only";
import { getCurrentRequestId } from "./request-context";

const secretQueryPattern =
  /([?&](?:key|api_key|steam_api_key|rawg_api_key|session_password|db_encryption_key)=)[^&\s]+/gi;
const steamIdTextPattern = /765611[0-9]{11}/g;
const secretFieldPattern =
  /^(steam_api_key|rawg_api_key|api_key|session_password|db_encryption_key|steamApiKey|rawgApiKey|apiKey|secret|authorization|cookie|steamId|steamid|steamIds|steamids|steam_ids|.*cipher)$/i;

function debugEnabled(): boolean {
  const raw = process.env.APP_DEBUG;
  if (raw === undefined || raw === "") return false;
  return !(raw === "0" || raw.toLowerCase() === "false");
}

export function sanitizeDebugText(value: string): string {
  return value
    .replace(steamIdTextPattern, "[redacted-steamid]")
    .replace(secretQueryPattern, "$1redacted");
}

export function sanitizeDebugError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeDebugText(`${error.name}: ${error.message}`);
  }
  try {
    return sanitizeDebugText(String(error));
  } catch {
    return "[unserializable error]";
  }
}

function safeDebugValue(value: unknown, key: string | undefined, seen: WeakSet<object>, depth: number): unknown {
  if (key && secretFieldPattern.test(key)) return "[redacted]";
  if (typeof value === "string") return sanitizeDebugText(value);
  if (value instanceof Error) return sanitizeDebugError(value);
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value) || depth > 4) return "[truncated]";

  seen.add(value);

  if (value instanceof Uint8Array) return `[Uint8Array ${value.length}]`;
  if (Array.isArray(value)) {
    return value.map((item) => safeDebugValue(item, undefined, seen, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    out[childKey] = safeDebugValue(childValue, childKey, seen, depth + 1);
  }
  return out;
}

function serializeDebugData(data: unknown): string {
  if (data === undefined) return "";
  try {
    const safe = safeDebugValue(data, undefined, new WeakSet(), 0);
    return ` ${JSON.stringify(safe)}`;
  } catch {
    return ' "[unserializable debug data]"';
  }
}

function withRequestId(data: unknown): unknown {
  const requestId = getCurrentRequestId();
  if (!requestId) return data;
  if (data === undefined) return { requestId };
  if (data === null) return { requestId, data: null };
  if (typeof data !== "object") return { requestId, data };
  if (data instanceof Error) return { requestId, error: data };
  if (Array.isArray(data) || ArrayBuffer.isView(data)) return { requestId, data };

  const record = data as Record<string, unknown>;
  if (record.requestId) return data;

  return { ...record, requestId };
}

export function logDebug(message: string, data?: unknown): void {
  if (!debugEnabled()) return;
  const now = new Date();
  process.stdout.write(`[debug] ${now.toISOString()} t=${now.getTime()} ${sanitizeDebugText(message)}${serializeDebugData(withRequestId(data))}\n`);
}
