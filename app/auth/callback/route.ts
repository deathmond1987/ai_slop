import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { collectSignedOpenIdParams } from "@/lib/auth";
import { logDebug, sanitizeDebugError } from "@/lib/debug";
import { verifySteamOpenId } from "@/lib/openid-verify";
import {
  clearPendingOnboardingSettings,
  readPendingOnboardingSettings,
} from "@/lib/onboarding";
import { getSteamSession, saveSteamSession } from "@/lib/session";
import { extractSteamIdFromOpenId, getSteamProfile } from "@/lib/steam";
import { getExternalOrigin, shouldUseSecureSessionCookie } from "@/lib/requestOrigin";

function redirectNoStore(url: string): NextResponse {
  return NextResponse.redirect(url, {
    headers: { "Cache-Control": "no-store" },
  });
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

  const verifyBody = collectSignedOpenIdParams(params);
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

  const [current, pending] = await Promise.all([getSteamSession(), readPendingOnboardingSettings()]);
  const firstEntry = !current?.steamId;
  const sameUser = current?.steamId === steamId;
  const known = sameUser ? current : undefined;
  const steamApiKey = known?.apiKey ?? pending?.steamApiKey;
  const rawgApiKey = known?.rawgApiKey ?? pending?.rawgApiKey;
  const storeCc = known?.storeCc ?? pending?.storeCc;
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
    rawgApiKey,
    storeCc,
  });
  await clearPendingOnboardingSettings();
  logDebug("auth.callback.success", {
    hasSteamId: true,
    firstEntry,
    redirectCalendar: !firstEntry,
    redirectOnboarding: firstEntry,
    cookieSecure: shouldUseSecureSessionCookie(req.headers),
  });
  return redirectNoStore(firstEntry ? `${origin}/?entry=1` : `${origin}/calendar`);
}
