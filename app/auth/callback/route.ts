import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logDebug, sanitizeDebugError } from "@/lib/debug";
import { getSteamSession, saveSteamSession } from "@/lib/session";
import { extractSteamIdFromOpenId, getSteamProfile } from "@/lib/steam";
import { getExternalOrigin, shouldUseSecureSessionCookie } from "@/lib/requestOrigin";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const DEFAULT_STEAM_OPENID_TIMEOUT_MS = 45000;
const MAX_STEAM_OPENID_TIMEOUT_MS = 60000;
const DEFAULT_STEAM_OPENID_VERIFY_ATTEMPTS = 2;
const MAX_STEAM_OPENID_VERIFY_ATTEMPTS = 3;

type OpenIdVerifyFailure = "invalid_sig" | "openid_timeout";
type OpenIdVerifyResult = { ok: true } | { ok: false; failure: OpenIdVerifyFailure };

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
  return Math.max(1000, Math.min(timeout, MAX_STEAM_OPENID_TIMEOUT_MS));
}

function steamOpenidVerifyAttempts(): number {
  const attempts = parsePositiveInt(
    process.env.STEAM_OPENID_VERIFY_ATTEMPTS,
    DEFAULT_STEAM_OPENID_VERIFY_ATTEMPTS
  );
  return Math.max(1, Math.min(attempts, MAX_STEAM_OPENID_VERIFY_ATTEMPTS));
}

function isTimeoutOpenIdFetchError(error: unknown): boolean {
  return /timeout|timed out|abort/i.test(sanitizeDebugError(error));
}

function isRetryableOpenIdFetchError(error: unknown): boolean {
  if (isTimeoutOpenIdFetchError(error)) return false;

  return /fetch failed|network|connect|socket|dns|tls|eai_again|enotfound|undici/i.test(
    sanitizeDebugError(error)
  );
}

async function verifySteamOpenId(verifyBody: URLSearchParams): Promise<OpenIdVerifyResult> {
  const timeoutMs = steamOpenidTimeoutMs();
  const attempts = steamOpenidVerifyAttempts();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const verifyUrl = `${STEAM_OPENID_ENDPOINT}?${verifyBody.toString()}`;
      const res = await fetch(verifyUrl, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      const ms = Date.now() - startedAt;
      const isValid = res.ok && /is_valid\s*:\s*true/i.test(text);
      if (isValid) {
        logDebug("auth.callback.openid_check_ok", {
          attempt,
          attempts,
          timeoutMs,
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
          status: res.status,
          ms,
        });
        continue;
      }
      logDebug("auth.callback.invalid_sig", {
        status: res.status,
        hasText: text.length > 0,
        hasIsValid: /is_valid/i.test(text),
        responseIsHtml: /^\s*<!DOCTYPE html>/i.test(text),
        ms,
      });
      return { ok: false, failure: "invalid_sig" };
    } catch (error) {
      logDebug("auth.callback.openid_check_failed", {
        attempt,
        attempts,
        timeoutMs,
        ms: Date.now() - startedAt,
        error: sanitizeDebugError(error),
      });
      if (attempt < attempts && isRetryableOpenIdFetchError(error)) {
        continue;
      }
      return { ok: false, failure: "openid_timeout" };
    }
  }

  return { ok: false, failure: "openid_timeout" };
}

function redirectNoStore(url: string): NextResponse {
  return NextResponse.redirect(url, {
    headers: { "Cache-Control": "no-store" },
  });
}

function collectSignedParams(params: URLSearchParams): URLSearchParams {
  const signedRaw = params.get("openid.signed");
  const signedKeys = signedRaw ? signedRaw.split(",") : [];
  const out = new URLSearchParams();
  out.set("openid.mode", "check_authentication");
  out.set("openid.ns", params.get("openid.ns") ?? "");
  out.set("openid.signed", signedRaw ?? "");
  out.set("openid.sig", params.get("openid.sig") ?? "");
  for (const key of signedKeys) {
    const value = params.get(`openid.${key}`);
    if (value !== null) out.set(`openid.${key}`, value);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const origin = getExternalOrigin(req);
  const params = req.nextUrl.searchParams;
  logDebug("auth.callback.start", {
    mode: params.get("openid.mode") ?? undefined,
    hasReturnTo: Boolean(params.get("openid.return_to")),
    cookieSecure: shouldUseSecureSessionCookie(req.headers),
  });
  if (params.get("openid.mode") !== "id_res") {
    logDebug("auth.callback.bad_mode", { mode: params.get("openid.mode") ?? undefined });
    return redirectNoStore(`${origin}/auth/error?reason=bad_mode`);
  }

  const verifyBody = collectSignedParams(params);
  const verified = await verifySteamOpenId(verifyBody);
  if (!verified.ok) {
    return redirectNoStore(`${origin}/auth/error?reason=${verified.failure}`);
  }

  const claimedId = params.get("openid.claimed_id") ?? "";
  const steamId = extractSteamIdFromOpenId(claimedId);
  if (!steamId) {
    logDebug("auth.callback.no_steam_id", {
      claimedIdLength: claimedId.length,
    });
    return redirectNoStore(`${origin}/auth/error?reason=no_steam_id`);
  }

  const current = await getSteamSession();
  const sameUser = current?.steamId === steamId;
  const known = sameUser ? current : undefined;
  const steamApiKey = known?.apiKey;
  let displayName = known?.displayName;
  let avatar = known?.avatar;

  if (!avatar) {
    try {
      const profile = await getSteamProfile(steamId, steamApiKey);
      displayName = profile.displayName ?? displayName;
      avatar = profile.avatar ?? avatar;
      logDebug("auth.callback.profile_lookup", {
        hasSteamId: true,
        hasApiKey: Boolean(steamApiKey),
        hasAvatar: Boolean(profile.avatar),
        hasDisplayName: Boolean(profile.displayName),
      });
    } catch (error) {
      logDebug("auth.callback.profile_failed", {
        hasSteamId: true,
        hasApiKey: Boolean(steamApiKey),
        error: sanitizeDebugError(error),
      });
    }
  }

  await saveSteamSession({
    steamId,
    displayName,
    avatar,
    apiKey: steamApiKey,
    rawgApiKey: known?.rawgApiKey,
  });
  logDebug("auth.callback.success", {
    hasSteamId: true,
    redirectCalendar: true,
    cookieSecure: shouldUseSecureSessionCookie(req.headers),
  });
  return redirectNoStore(`${origin}/calendar`);
}
