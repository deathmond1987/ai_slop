import "server-only";
import https from "node:https";
import { logDebug, sanitizeDebugError, sanitizeDebugText } from "./debug";

export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

const DEFAULT_STEAM_OPENID_TIMEOUT_MS = 15000;
const MIN_STEAM_OPENID_TIMEOUT_MS = 2000;
const MAX_STEAM_OPENID_TIMEOUT_MS = 30000;
const DEFAULT_STEAM_OPENID_VERIFY_ATTEMPTS = 2;
const MAX_STEAM_OPENID_VERIFY_ATTEMPTS = 3;
const MAX_STEAM_OPENID_RESPONSE_BYTES = 65536;

export type OpenIdVerifyFailure = "invalid_sig" | "openid_timeout";
export type OpenIdVerifyResult = { ok: true } | { ok: false; failure: OpenIdVerifyFailure };

type HttpResponse = {
  status: number;
  text: string;
};

function errorCauseText(error: unknown): string {
  const parts: string[] = [];
  let cause = error instanceof Error ? error.cause : undefined;

  for (let depth = 0; depth < 3 && cause !== undefined; depth += 1) {
    if (cause instanceof Error) {
      parts.push(`${cause.name}: ${cause.message}`);
    } else if (typeof cause === "object" && cause !== null) {
      const record = cause as Record<string, unknown>;
      const details = [
        typeof record.name === "string" ? record.name : undefined,
        typeof record.message === "string" ? record.message : undefined,
        typeof record.code === "string" ? record.code : undefined,
        typeof record.errno === "number" ? String(record.errno) : undefined,
        typeof record.syscall === "string" ? record.syscall : undefined,
      ].filter(Boolean);
      parts.push(details.join(": "));
    } else {
      parts.push(String(cause));
    }

    cause = cause instanceof Error ? cause.cause : undefined;
  }

  return sanitizeDebugText(parts.join("; "));
}

function openIdFetchErrorText(error: unknown): string {
  return `${sanitizeDebugError(error)} ${errorCauseText(error)}`.trim();
}

function openIdFetchErrorDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {
    error: sanitizeDebugError(error),
  };
  const causeText = errorCauseText(error);
  if (causeText) details.causeText = causeText;
  return details;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function steamOpenidTimeoutMs(): number {
  const timeout = parsePositiveInt(
    process.env.STEAM_OPENID_TIMEOUT_MS,
    DEFAULT_STEAM_OPENID_TIMEOUT_MS
  );
  return Math.max(MIN_STEAM_OPENID_TIMEOUT_MS, Math.min(timeout, MAX_STEAM_OPENID_TIMEOUT_MS));
}

function steamOpenidVerifyAttempts(): number {
  const attempts = parsePositiveInt(
    process.env.STEAM_OPENID_VERIFY_ATTEMPTS,
    DEFAULT_STEAM_OPENID_VERIFY_ATTEMPTS
  );
  return Math.max(1, Math.min(attempts, MAX_STEAM_OPENID_VERIFY_ATTEMPTS));
}

function steamOpenidFamily(): number | undefined {
  const raw = process.env.STEAM_OPENID_FAMILY ?? "4";
  if (!raw || raw === "auto") return undefined;

  const family = Number(raw);
  if (family === 4 || family === 6) return family;
  return 4;
}

function isRetryableOpenIdFetchError(error: unknown): boolean {
  return /timeout|timed out|abort|fetch failed|network|connect|socket|dns|tls|eai_again|enotfound|undici|socket hang up|connection closed/i.test(
    openIdFetchErrorText(error)
  );
}

export function steamOpenidVerifyEndpoint(): URL | undefined {
  const override = process.env.STEAM_OPENID_VERIFY_URL?.trim();
  if (!override || process.env.NODE_ENV === "production") return undefined;

  try {
    const endpoint = new URL(override);
    if (endpoint.protocol === "https:" || endpoint.protocol === "http:") return endpoint;
  } catch {
    return undefined;
  }

  return undefined;
}

async function fetchOpenIdForm(
  endpoint: URL,
  body: URLSearchParams,
  timeoutMs: number
): Promise<HttpResponse> {
  const payload = body.toString();
  if (Buffer.byteLength(payload) > MAX_STEAM_OPENID_RESPONSE_BYTES) {
    throw new Error(`Steam OpenID request exceeded ${MAX_STEAM_OPENID_RESPONSE_BYTES} bytes`);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    body: payload,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(Buffer.byteLength(payload)),
      accept: "text/plain",
    },
  });

  return {
    status: response.status,
    text: await response.text(),
  };
}

function postOpenIdForm(body: URLSearchParams, timeoutMs: number): Promise<HttpResponse> {
  const overrideEndpoint = steamOpenidVerifyEndpoint();
  if (overrideEndpoint) return fetchOpenIdForm(overrideEndpoint, body, timeoutMs);

  const payload = body.toString();
  const family = steamOpenidFamily();

  return new Promise((resolve, reject) => {
    const agent = new https.Agent({
      keepAlive: false,
      maxSockets: 1,
      maxFreeSockets: 0,
    });

    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;

    const cleanup = () => {
      agent.destroy();
    };

    const finishResolve = (response: HttpResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const req = https.request(
      {
        protocol: "https:",
        hostname: "steamcommunity.com",
        port: 443,
        path: "/openid/login",
        method: "POST",
        family,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String(Buffer.byteLength(payload)),
          accept: "text/plain",
        },
        agent,
        timeout: timeoutMs,
        signal: AbortSignal.timeout(timeoutMs),
      },
      (res) => {
        res.on("data", (chunk: Buffer) => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > MAX_STEAM_OPENID_RESPONSE_BYTES) {
            req.destroy(new Error(`Steam OpenID response exceeded ${MAX_STEAM_OPENID_RESPONSE_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          finishResolve({
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });

        res.on("error", (error: Error) => {
          finishReject(error);
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      finishReject(new Error(`Steam OpenID request timed out after ${timeoutMs}ms`));
    });

    req.on("error", (error: Error) => {
      finishReject(error);
    });

    req.on("close", () => {
      if (!settled) {
        finishReject(new Error("Steam OpenID connection closed before response"));
      }
    });

    req.write(payload);
    req.end();
  });
}

export async function verifySteamOpenId(verifyBody: URLSearchParams): Promise<OpenIdVerifyResult> {
  const timeoutMs = steamOpenidTimeoutMs();
  const attempts = steamOpenidVerifyAttempts();
  const family = steamOpenidFamily();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const res = await postOpenIdForm(verifyBody, timeoutMs);
      const ms = Date.now() - startedAt;
      const isValid = res.status >= 200 && res.status < 300 && /is_valid\s*:\s*true/i.test(res.text);

      if (isValid) {
        logDebug("auth.callback.openid_check_ok", {
          attempt,
          attempts,
          timeoutMs,
          family,
          status: res.status,
          ms,
        });
        return { ok: true };
      }

      if (res.status >= 500 && attempt < attempts) {
        logDebug("auth.callback.openid_check_retry", {
          attempt,
          attempts,
          timeoutMs,
          family,
          status: res.status,
          ms,
        });
        continue;
      }

      logDebug("auth.callback.invalid_sig", {
        attempt,
        attempts,
        timeoutMs,
        family,
        status: res.status,
        hasText: res.text.length > 0,
        hasIsValid: /is_valid/i.test(res.text),
        responseIsHtml: /^\s*<!DOCTYPE html>/i.test(res.text),
        ms,
      });
      return { ok: false, failure: "invalid_sig" };
    } catch (error) {
      logDebug("auth.callback.openid_check_failed", {
        attempt,
        attempts,
        timeoutMs,
        family,
        ms: Date.now() - startedAt,
        ...openIdFetchErrorDetails(error),
      });
      if (attempt < attempts && isRetryableOpenIdFetchError(error)) {
        continue;
      }
      return { ok: false, failure: "openid_timeout" };
    }
  }

  return { ok: false, failure: "openid_timeout" };
}
