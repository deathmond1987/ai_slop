"use server";
import { redirect } from "next/navigation";
import { logDebug } from "@/lib/debug";
import { requireSteamSession, updateSessionSettings } from "@/lib/session";

export async function saveSettings(formData: FormData) {
  const session = await requireSteamSession();
  if (!session) redirect("/auth/login");

  const steamApiKey = String(formData.get("steamApiKey") ?? "").trim();
  const rawgApiKey = String(formData.get("rawgApiKey") ?? "").trim();
  const remove = String(formData.get("remove") ?? "");

  const updates: { steamApiKey?: string | null; rawgApiKey?: string | null } = {};

  if (remove === "steam") {
    updates.steamApiKey = null;
  } else if (steamApiKey) {
    updates.steamApiKey = steamApiKey;
  }

  if (remove === "rawg") {
    updates.rawgApiKey = null;
  } else if (rawgApiKey) {
    updates.rawgApiKey = rawgApiKey;
  }

  if (Object.keys(updates).length > 0) {
    logDebug("settings.save.request", {
      remove: remove || undefined,
      hasSteamKeyUpdate: "steamApiKey" in updates,
      hasRawgKeyUpdate: "rawgApiKey" in updates,
    });
    const ok = await updateSessionSettings(session, updates);
    logDebug("settings.save.result", { ok });
  } else {
    logDebug("settings.save.no_updates", { remove: remove || undefined });
  }

  redirect("/settings?saved=1");
}
