import "server-only";
import { cookies, headers } from "next/headers";
import { getIronSession } from "iron-session";
import { logDebug, sanitizeDebugError } from "./debug";
import { shouldUseSecureSessionCookie } from "./requestOrigin";
import type { IdentifiedSession, SteamSession } from "./types";
import {
  createDbSession,
  destroyDbSession,
  getOrCreateSessionSecret,
  getSteamSessionDataFromToken,
  saveUserSettings,
  type UserSettingsUpdate,
} from "./auth-store";

export const SESSION_COOKIE = "steam_calendar_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

async function ironSessionOptions(cookieSecure: boolean) {
  return {
    cookieName: SESSION_COOKIE,
    password: await getOrCreateSessionSecret(),
    ttl: SESSION_MAX_AGE,
    cookieOptions: {
      secure: cookieSecure,
    },
  };
}

async function getLegacySteamSession(
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Promise<SteamSession | null> {
  try {
    const cookieSecure = shouldUseSecureSessionCookie(await headers());
    const legacy = await getIronSession<SteamSession>(
      cookieStore,
      await ironSessionOptions(cookieSecure)
    );
    if (!legacy.steamId) return null;
    return {
      steamId: legacy.steamId,
      displayName: legacy.displayName,
      avatar: legacy.avatar,
      apiKey: legacy.apiKey,
      rawgApiKey: legacy.rawgApiKey,
    };
  } catch (error) {
    logDebug("session.legacy.read_failed", {
      hasCookie: Boolean(cookieStore.get(SESSION_COOKIE)?.value),
      error: sanitizeDebugError(error),
    });
    return null;
  }
}

export async function getSteamSession(): Promise<SteamSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const dbSession = await getSteamSessionDataFromToken(token);
    if (dbSession?.steamId) return dbSession;
    logDebug("session.db.invalid_token", {
      hasToken: true,
      hasSteamId: Boolean(dbSession?.steamId),
    });
  }

  return getLegacySteamSession(cookieStore);
}

export async function requireSteamSession(): Promise<IdentifiedSession | null> {
  const session = await getSteamSession();
  if (!session?.steamId) return null;

  return {
    steamId: session.steamId,
    displayName: session.displayName,
    avatar: session.avatar,
    apiKey: session.apiKey,
    rawgApiKey: session.rawgApiKey,
  };
}

export async function saveSteamSession(profile: SteamSession): Promise<void> {
  if (!profile.steamId) {
    logDebug("session.save.skipped_missing_steam_id");
    return;
  }

  const cookieStore = await cookies();
  const token = await createDbSession({
    steamId: profile.steamId,
    displayName: profile.displayName,
    avatar: profile.avatar,
  });

  if (token) {
    const updates: UserSettingsUpdate = {};
    if (profile.apiKey) updates.steamApiKey = profile.apiKey;
    if (profile.rawgApiKey) updates.rawgApiKey = profile.rawgApiKey;

    if (Object.keys(updates).length > 0) {
      await saveUserSettings(profile.steamId, updates);
    }

    const cookieSecure = shouldUseSecureSessionCookie(await headers());
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure,
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    logDebug("session.db_cookie.set", { cookieSecure });
    return;
  }

  const cookieSecure = shouldUseSecureSessionCookie(await headers());
  const legacy = await getIronSession<SteamSession>(
    cookieStore,
    await ironSessionOptions(cookieSecure)
  );
  legacy.steamId = profile.steamId;
  if (profile.displayName !== undefined) legacy.displayName = profile.displayName;
  if (profile.avatar !== undefined) legacy.avatar = profile.avatar;
  if (profile.apiKey !== undefined) legacy.apiKey = profile.apiKey;
  if (profile.rawgApiKey !== undefined) legacy.rawgApiKey = profile.rawgApiKey;
  await legacy.save();
}

export async function updateSessionSettings(
  session: IdentifiedSession,
  updates: UserSettingsUpdate
): Promise<boolean> {
  const dbSaved = await saveUserSettings(session.steamId, updates);
  if (dbSaved) return true;

  const cookieStore = await cookies();
  try {
    const cookieSecure = shouldUseSecureSessionCookie(await headers());
    const legacy = await getIronSession<SteamSession>(
      cookieStore,
      await ironSessionOptions(cookieSecure)
    );
    if (legacy.steamId !== session.steamId) return false;

    if ("steamApiKey" in updates) legacy.apiKey = updates.steamApiKey ?? undefined;
    if ("rawgApiKey" in updates) legacy.rawgApiKey = updates.rawgApiKey ?? undefined;

    await legacy.save();
    return true;
  } catch (error) {
    logDebug("session.legacy.save_failed", { error: sanitizeDebugError(error) });
    return false;
  }
}

export async function destroySteamSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await destroyDbSession(token);
  }

  cookieStore.delete(SESSION_COOKIE);
}
