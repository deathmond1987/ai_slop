import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logDebug, sanitizeDebugError } from "@/lib/debug";
import { getSteamSession, saveSteamSession } from "@/lib/session";
import { extractSteamIdFromOpenId } from "@/lib/steam";
import { getExternalOrigin, shouldUseSecureSessionCookie } from "@/lib/requestOrigin";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_OPENID_TIMEOUT_MS = 10000;

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
    return NextResponse.redirect(`${origin}/auth/error?reason=bad_mode`);
  }

  const verifyBody = collectSignedParams(params);
  try {
    const res = await fetch(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      body: verifyBody,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      signal: AbortSignal.timeout(STEAM_OPENID_TIMEOUT_MS),
    });
    const text = await res.text();
    const isValid = res.ok && /is_valid\s*:\s*true/i.test(text);
    if (!isValid) {
      logDebug("auth.callback.invalid_sig", {
        status: res.status,
        hasText: text.length > 0,
      });
      return NextResponse.redirect(`${origin}/auth/error?reason=invalid_sig`);
    }
  } catch (error) {
    logDebug("auth.callback.openid_check_failed", {
      error: sanitizeDebugError(error),
    });
    return NextResponse.redirect(`${origin}/auth/error?reason=openid_timeout`);
  }

  const claimedId = params.get("openid.claimed_id") ?? "";
  const steamId = extractSteamIdFromOpenId(claimedId);
  if (!steamId) {
    logDebug("auth.callback.no_steam_id", {
      claimedIdLength: claimedId.length,
    });
    return NextResponse.redirect(`${origin}/auth/error?reason=no_steam_id`);
  }

  const current = await getSteamSession();
  const sameUser = current?.steamId === steamId;
  await saveSteamSession({
    steamId,
    displayName: sameUser ? current?.displayName : undefined,
    avatar: sameUser ? current?.avatar : undefined,
    apiKey: sameUser ? current?.apiKey : undefined,
    rawgApiKey: sameUser ? current?.rawgApiKey : undefined,
  });
  logDebug("auth.callback.success", {
    hasSteamId: true,
    redirectCalendar: true,
    cookieSecure: shouldUseSecureSessionCookie(req.headers),
  });
  return NextResponse.redirect(`${origin}/calendar`);
}
