'use server';

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { saveUserLang, type UserSettingsUpdate } from "@/lib/auth-store";
import { logDebug, sanitizeDebugError } from "@/lib/debug";
import { LANG_COOKIE } from "@/lib/i18n";
import {
  clearPendingOnboardingSettings,
  pendingSettingsFromFormData,
  savePendingOnboardingSettings,
  savePendingOnboardingSettingsFromFormData,
  type PendingOnboardingSettings,
} from "@/lib/onboarding";
import { shouldUseSecureSessionCookie } from "@/lib/requestOrigin";
import { requireSteamSession, saveSteamSession, updateSessionSettings } from "@/lib/session";
import { getSteamProfile } from "@/lib/steam";
import { THEME_COOKIE, parseThemePreference } from "@/lib/theme-mode";
import type { Lang } from "@/lib/types";

type OnboardingTarget =
  | "sign-in"
  | "enter"
  | "lang"
  | "theme"
  | "steam-save"
  | "steam-remove"
  | "rawg-save"
  | "rawg-remove"
  | "store-save"
  | "store-remove";

type PendingSettingsKey = keyof PendingOnboardingSettings;

const VALID_TARGETS = new Set<string>([
  "sign-in",
  "enter",
  "lang",
  "theme",
  "steam-save",
  "steam-remove",
  "rawg-save",
  "rawg-remove",
  "store-save",
  "store-remove",
]);

const SAVE_TARGETS = new Set<string>(["steam-save", "rawg-save", "store-save"]);
const REMOVE_TARGETS = new Set<string>(["steam-remove", "rawg-remove", "store-remove"]);

const REMOVE_TARGET_KEYS: Partial<Record<OnboardingTarget, PendingSettingsKey>> = {
  "steam-remove": "steamApiKey",
  "rawg-remove": "rawgApiKey",
  "store-remove": "storeCc",
};

function getOnboardingTarget(formData: FormData, authenticated: boolean): OnboardingTarget {
  const raw = String(formData.get("onboardingTarget") ?? "").trim();
  if (VALID_TARGETS.has(raw)) return raw as OnboardingTarget;
  return authenticated ? "enter" : "sign-in";
}

function entryRedirect(savedTarget?: string): string {
  return savedTarget
    ? `/?entry=1&saved=${encodeURIComponent(savedTarget)}`
    : "/?entry=1";
}

function settingsToUpdates(settings: PendingOnboardingSettings): UserSettingsUpdate {
  const updates: UserSettingsUpdate = {};
  if (settings.steamApiKey) updates.steamApiKey = settings.steamApiKey;
  if (settings.rawgApiKey) updates.rawgApiKey = settings.rawgApiKey;
  if (settings.storeCc) updates.storeCc = settings.storeCc;
  return updates;
}

function withoutRemovedTarget(
  settings: PendingOnboardingSettings,
  target: OnboardingTarget
): PendingOnboardingSettings {
  const removedKey = REMOVE_TARGET_KEYS[target];
  if (!removedKey) return settings;

  const nextSettings = { ...settings };
  delete nextSettings[removedKey];
  return nextSettings;
}

async function loadMissingSteamProfile(
  session: Awaited<ReturnType<typeof requireSteamSession>>,
  updates: UserSettingsUpdate
): Promise<void> {
  if (!session?.steamId) return;
  const apiKey = typeof updates.steamApiKey === "string" ? updates.steamApiKey : session.apiKey;
  if (!apiKey || session.avatar) return;

  try {
    const profile = await getSteamProfile(session.steamId, apiKey);
    if (!profile.avatar && !profile.displayName) return;

    await saveSteamSession({
      steamId: session.steamId,
      displayName: profile.displayName ?? session.displayName,
      avatar: profile.avatar ?? session.avatar,
      apiKey,
      rawgApiKey: typeof updates.rawgApiKey === "string" ? updates.rawgApiKey : session.rawgApiKey,
      storeCc: typeof updates.storeCc === "string" ? updates.storeCc : session.storeCc,
    });
    logDebug("onboarding.action.avatar_loaded", {
      hasSteamId: true,
      hasAvatar: Boolean(profile.avatar),
      hasDisplayName: Boolean(profile.displayName),
    });
  } catch (error) {
    logDebug("onboarding.action.avatar_failed", { error: sanitizeDebugError(error) });
  }
}

async function applyOnboardingLang(formData: FormData, session: Awaited<ReturnType<typeof requireSteamSession>>): Promise<void> {
  const lang: Lang = String(formData.get("lang") ?? "") === "en" ? "en" : "ru";
  const cookieStore = await cookies();
  cookieStore.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  if (session) {
    await saveUserLang(session.steamId, lang);
  }
  logDebug("onboarding.action.lang_saved", { lang, sessionPresent: Boolean(session) });
}

async function applyOnboardingTheme(formData: FormData): Promise<void> {
  const preference = parseThemePreference(String(formData.get("theme") ?? ""));
  const cookieStore = await cookies();
  const secure = shouldUseSecureSessionCookie(await headers());
  if (preference === "system") {
    cookieStore.delete(THEME_COOKIE);
  } else {
    cookieStore.set(THEME_COOKIE, preference, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure,
      httpOnly: false,
    });
  }
  logDebug("onboarding.action.theme_saved", {
    preference,
    cookiePresent: preference !== "system",
  });
}

export async function submitOnboardingSettings(formData: FormData): Promise<void> {
  const session = await requireSteamSession();
  const target = getOnboardingTarget(formData, Boolean(session));
  const pendingSettings = pendingSettingsFromFormData(formData);

  logDebug("onboarding.action.submit", {
    target,
    hasSession: Boolean(session),
    hasSteamKey: Boolean(pendingSettings.steamApiKey),
    hasRawgKey: Boolean(pendingSettings.rawgApiKey),
    hasStoreCc: Boolean(pendingSettings.storeCc),
  });

  if (target === "lang") {
    await applyOnboardingLang(formData, session);
    return redirect(entryRedirect(target));
  }

  if (target === "theme") {
    await applyOnboardingTheme(formData);
    return redirect(entryRedirect(target));
  }

  if (!session) {
    if (target === "sign-in" || target === "enter") {
      await savePendingOnboardingSettingsFromFormData(formData);
      return redirect("/auth/login");
    }

    if (SAVE_TARGETS.has(target)) {
      await savePendingOnboardingSettingsFromFormData(formData);
      return redirect(entryRedirect(target));
    }

    if (REMOVE_TARGETS.has(target)) {
      await savePendingOnboardingSettings(withoutRemovedTarget(pendingSettings, target));
      return redirect(entryRedirect(target));
    }

    return redirect(entryRedirect(target));
  }

  if (target === "sign-in") {
    return redirect("/calendar");
  }

  if (target === "enter") {
    const updates = settingsToUpdates(pendingSettings);
    if (Object.keys(updates).length > 0) {
      const ok = await updateSessionSettings(session, updates);
      if (ok && updates.steamApiKey) {
        await loadMissingSteamProfile(session, updates);
      }
    }

    await clearPendingOnboardingSettings();
    return redirect("/calendar");
  }

  if (SAVE_TARGETS.has(target)) {
    const updates = settingsToUpdates(pendingSettings);
    if (Object.keys(updates).length > 0) {
      const ok = await updateSessionSettings(session, updates);
      if (ok && updates.steamApiKey) {
        await loadMissingSteamProfile(session, updates);
      }
    }

    await clearPendingOnboardingSettings();
    return redirect(entryRedirect(target));
  }

  if (REMOVE_TARGETS.has(target)) {
    const removedKey = REMOVE_TARGET_KEYS[target];
    if (removedKey) {
      const updates: UserSettingsUpdate = {};
      updates[removedKey] = null;
      await updateSessionSettings(session, updates);
      await clearPendingOnboardingSettings();
    }
  }

  return redirect(entryRedirect(target));
}
