"use server";
import { redirect } from "next/navigation";
import { type UserSettingsUpdate } from "@/lib/auth-store";
import { logDebug, sanitizeDebugError } from "@/lib/debug";
import { requireSteamSession, saveSteamSession, updateSessionSettings } from "@/lib/session";
import { normalizeSteamStoreCc } from "@/lib/store-cc";
import { getSteamProfile } from "@/lib/steam";

export async function saveSettings(formData: FormData) {
  const session = await requireSteamSession();
  if (!session) redirect("/auth/login");

  const steamApiKey = String(formData.get("steamApiKey") ?? "").trim();
  const rawgApiKey = String(formData.get("rawgApiKey") ?? "").trim();
  const storeCc = normalizeSteamStoreCc(String(formData.get("storeCc") ?? ""));
  const remove = String(formData.get("remove") ?? "");
  const hasSteamApiKey = formData.has("steamApiKey");
  const hasRawgApiKey = formData.has("rawgApiKey");
  const hasStoreCc = formData.has("storeCc");

  const updates: UserSettingsUpdate = {};

  if (remove === "steam") {
    updates.steamApiKey = null;
  } else if (remove === "rawg") {
    updates.rawgApiKey = null;
  } else if (remove === "store") {
    updates.storeCc = null;
  } else {
    if (steamApiKey) updates.steamApiKey = steamApiKey;
    if (rawgApiKey) updates.rawgApiKey = rawgApiKey;
    if (storeCc) updates.storeCc = storeCc;
  }

  if (Object.keys(updates).length > 0) {
    logDebug("settings.save.request", {
      remove: remove || undefined,
      hasSteamKeyUpdate: "steamApiKey" in updates,
      hasRawgKeyUpdate: "rawgApiKey" in updates,
      hasStoreCcUpdate: "storeCc" in updates,
    });
    const ok = await updateSessionSettings(session, updates);
    logDebug("settings.save.result", { ok });

    if (ok && steamApiKey && !session.avatar) {
      try {
        const profile = await getSteamProfile(session.steamId, steamApiKey);
        if (profile.avatar || profile.displayName) {
          await saveSteamSession({
            steamId: session.steamId,
            displayName: profile.displayName ?? session.displayName,
            avatar: profile.avatar ?? session.avatar,
            apiKey: steamApiKey,
            rawgApiKey: session.rawgApiKey,
            storeCc: session.storeCc,
          });
          logDebug("settings.save.avatar_loaded", {
            hasAvatar: Boolean(profile.avatar),
            hasDisplayName: Boolean(profile.displayName),
          });
        }
      } catch (error) {
        logDebug("settings.save.avatar_failed", {
          error: sanitizeDebugError(error),
        });
      }
    }
  } else {
    logDebug("settings.save.no_updates", { remove: remove || undefined });
  }

  let savedTarget = "settings";
  if (remove === "steam") {
    savedTarget = "steam-remove";
  } else if (remove === "rawg") {
    savedTarget = "rawg-remove";
  } else if (remove === "store") {
    savedTarget = "store-remove";
  } else if (hasSteamApiKey) {
    savedTarget = "steam-save";
  } else if (hasRawgApiKey) {
    savedTarget = "rawg-save";
  } else if (hasStoreCc) {
    savedTarget = "store-save";
  }

  redirect(`/settings?saved=${encodeURIComponent(savedTarget)}`);
}
