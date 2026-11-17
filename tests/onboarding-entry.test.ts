import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const callbackSource = readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/actions/onboarding.ts", import.meta.url), "utf8");
const onboardingSource = readFileSync(new URL("../lib/onboarding.ts", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("root page renders a settings-like first-entry screen before entering the calendar", () => {
  assert.ok(rootPageSource.includes("searchParams: Promise<Record<string, string | string[] | undefined>>"));
  assert.ok(rootPageSource.includes("getEntryValue(sp.entry)"));
  assert.ok(rootPageSource.includes('if (authenticated && !entry)'));
  assert.ok(rootPageSource.includes('redirect("/calendar")'));
  assert.ok(rootPageSource.includes('className="onboarding-page app-shell"'));
  assert.ok(rootPageSource.includes('className="onboarding-settings-layout"'));
  assert.ok(rootPageSource.includes('className="onboarding-account-card"'));
  assert.ok(rootPageSource.includes('className="onboarding-account-info"'));
  assert.ok(rootPageSource.includes('className="onboarding-avatar"'));
  assert.ok(rootPageSource.includes('className="onboarding-account-name"'));
  assert.ok(rootPageSource.includes('className="settings-grid"'));
  assert.equal((rootPageSource.match(/className="settings-card"/g) ?? []).length, 5);
  assert.equal((rootPageSource.match(/<form\b/g) ?? []).length, 1);
  assert.ok(rootPageSource.includes('import { submitOnboardingSettings } from "@/app/actions/onboarding";'));
  assert.ok(rootPageSource.includes("action={submitOnboardingSettings}"));
  assert.ok(rootPageSource.includes('import { getLang, getT } from "@/lib/i18n";'));
  assert.ok(rootPageSource.includes('import { getThemePreference, type ThemePreference } from "@/lib/theme-mode";'));
  assert.ok(rootPageSource.includes("getThemePreference(),"));
  assert.ok(rootPageSource.includes('name="lang"'));
  assert.ok(rootPageSource.includes('name="theme"'));
  assert.ok(rootPageSource.includes('name="onboardingTarget"'));
  assert.ok(rootPageSource.includes('value="lang"'));
  assert.ok(rootPageSource.includes('value="theme"'));
  assert.ok(rootPageSource.includes('value: "ru"'));
  assert.ok(rootPageSource.includes('value: "en"'));
  assert.ok(rootPageSource.includes('value: "light"'));
  assert.ok(rootPageSource.includes('value: "dark"'));
  assert.ok(rootPageSource.includes('value: "system"'));
  assert.ok(rootPageSource.includes('t("settings.language.label")'));
  assert.ok(rootPageSource.includes('t("settings.theme.label")'));
  assert.ok(rootPageSource.includes('value="sign-in"'));
  assert.ok(rootPageSource.includes('value="enter"'));
  assert.ok(rootPageSource.includes('value="steam-save"'));
  assert.ok(rootPageSource.includes('value="steam-remove"'));
  assert.ok(rootPageSource.includes('value="rawg-save"'));
  assert.ok(rootPageSource.includes('value="rawg-remove"'));
  assert.ok(rootPageSource.includes('value="store-save"'));
  assert.ok(rootPageSource.includes('value="store-remove"'));
  assert.ok(rootPageSource.includes('name="steamApiKey"'));
  assert.ok(rootPageSource.includes('name="rawgApiKey"'));
  assert.ok(rootPageSource.includes('name="storeCc"'));
  assert.ok(rootPageSource.includes('pending?.steamApiKey ?? ""'));
  assert.ok(rootPageSource.includes('pending?.rawgApiKey ?? ""'));
  assert.ok(rootPageSource.includes('session?.storeCc'));
  assert.ok(rootPageSource.includes("session?.apiKey ?"));
  assert.ok(rootPageSource.includes("session?.rawgApiKey ?"));
  assert.ok(rootPageSource.includes("session?.storeCc"));
  assert.ok(rootPageSource.includes('className="onboarding-enter-btn"'));
  assert.ok(rootPageSource.includes('t("auth.enterApp")'));
});

test("first-entry callback saves pending optional fields and returns to the entry onboarding", () => {
  assert.ok(onboardingSource.includes('export const PENDING_ONBOARDING_COOKIE = "steam_calendar_pending_onboarding"'));
  assert.ok(onboardingSource.includes("aes-256-gcm"));
  assert.ok(onboardingSource.includes("setAAD"));
  assert.ok(onboardingSource.includes('maxAge: 0'));

  assert.ok(callbackSource.includes("readPendingOnboardingSettings"));
  assert.ok(callbackSource.includes("clearPendingOnboardingSettings"));
  assert.ok(callbackSource.includes("const firstEntry = !current?.steamId"));
  assert.ok(callbackSource.includes("known?.apiKey ?? pending?.steamApiKey"));
  assert.ok(callbackSource.includes("known?.rawgApiKey ?? pending?.rawgApiKey"));
  assert.ok(callbackSource.includes("known?.storeCc ?? pending?.storeCc"));
  assert.ok(callbackSource.includes("rawgApiKey,"));
  assert.ok(callbackSource.includes("storeCc,"));
  assert.ok(callbackSource.includes("firstEntry ? `${origin}/?entry=1` : `${origin}/calendar`"));
});

test("target-aware onboarding actions preserve and apply optional fields", () => {
  assert.ok(actionSource.includes("export async function submitOnboardingSettings"));
  assert.ok(actionSource.includes('formData.get("onboardingTarget")'));
  assert.ok(actionSource.includes("pendingSettingsFromFormData"));
  assert.ok(actionSource.includes("savePendingOnboardingSettingsFromFormData"));
  assert.ok(actionSource.includes("savePendingOnboardingSettings"));
  assert.ok(actionSource.includes('redirect("/auth/login")'));
  assert.ok(actionSource.includes("requireSteamSession()"));
  assert.ok(actionSource.includes("updateSessionSettings(session, updates)"));
  assert.ok(actionSource.includes("clearPendingOnboardingSettings()"));
  assert.ok(actionSource.includes('redirect("/calendar")'));
  assert.ok(
    actionSource.includes("entryRedirect(target)") &&
      actionSource.includes("`/?entry=1&saved=${encodeURIComponent(savedTarget)}`")
  );
  assert.ok(actionSource.includes("getSteamProfile"));
  assert.ok(actionSource.includes("loadMissingSteamProfile"));
  assert.ok(actionSource.includes("updates[removedKey] = null"));
  assert.ok(actionSource.includes('"lang"'));
  assert.ok(actionSource.includes('"theme"'));
  assert.ok(actionSource.includes('import { cookies, headers } from "next/headers";'));
  assert.ok(actionSource.includes('saveUserLang,'));
  assert.ok(actionSource.includes('LANG_COOKIE'));
  assert.ok(actionSource.includes('shouldUseSecureSessionCookie'));
  assert.ok(actionSource.includes('import { THEME_COOKIE, parseThemePreference } from "@/lib/theme-mode";'));
  assert.ok(actionSource.includes('function applyOnboardingLang'));
  assert.ok(actionSource.includes('saveUserLang(session.steamId, lang)'));
  assert.ok(actionSource.includes('function applyOnboardingTheme'));
  assert.ok(actionSource.includes("cookieStore.delete(THEME_COOKIE)"));
});

test("onboarding styles center the account row, settings cards, and green enter button", () => {
  assert.match(
    globalsSource,
    /body:has\(\.onboarding-page\) main \{[\s\S]*?align-items: center;[\s\S]*?justify-content: center;[\s\S]*?\}/
  );
  assert.match(
    globalsSource,
    /body:has\(\.onboarding-page\) \.settings-grid \{[\s\S]*?grid-template-columns: repeat\(auto-fit, minmax\(230px, 1fr\)\);[\s\S]*?\}/
  );
  assert.match(
    globalsSource,
    /body:has\(\.onboarding-page\) \.settings-card \{[\s\S]*?position: relative;[\s\S]*?overflow: hidden;[\s\S]*?\}/
  );
  assert.match(
    globalsSource,
    /body:has\(\.onboarding-page\) \.settings-control \{[\s\S]*?width: 100%;[\s\S]*?\}/
  );
  assert.match(
    globalsSource,
    /body:has\(\.onboarding-page\) \.settings-save-btn \{[\s\S]*?border-radius: 0\.375rem;[\s\S]*?\}/
  );
  assert.match(
    globalsSource,
    /body:has\(\.onboarding-page\) \.settings-card fieldset \{[\s\S]*?display: flex;[\s\S]*?gap: 0\.35rem;[\s\S]*?border: 1px solid var\(--surface-border\);[\s\S]*?\}/
  );
  assert.match(
    globalsSource,
    /body:has\(\.onboarding-page\) \.settings-card label \{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?gap: 0\.25rem;[\s\S]*?\}/
  );
  assert.match(
    globalsSource,
    /\.onboarding-account-card \{[\s\S]*?align-items: center;[\s\S]*?text-align: center;[\s\S]*?\}/
  );
  assert.match(
    globalsSource,
    /\.onboarding-account-info \{[\s\S]*?justify-content: center;[\s\S]*?\}/
  );

  const enterButtonCss = globalsSource.match(/\.onboarding-enter-btn \{[\s\S]*?\}/)?.[0] ?? "";
  assert.ok(enterButtonCss.includes("justify-self: center;"));
  assert.ok(enterButtonCss.includes("background: #16a34a;"));
  assert.ok(enterButtonCss.includes("border-radius: 0.375rem;"));
});

test("onboarding UI labels exist in both supported dictionaries", () => {
  const requiredKeys = [
    "auth.enterApp",
    "nav.login",
    "settings.title",
    "settings.applied",
    "settings.status.saved",
    "settings.status.notSet",
    "settings.apiKey.label",
    "settings.apiKey.help",
    "settings.apiKey.save",
    "settings.apiKey.remove",
    "settings.rawg.label",
    "settings.rawg.help",
    "settings.rawg.save",
    "settings.storeCc.label",
    "settings.storeCc.help",
    "settings.storeCc.save",
    "settings.storeCc.remove",
    "settings.language.label",
    "settings.language.ru",
    "settings.language.en",
    "settings.theme.label",
    "theme.light",
    "theme.dark",
    "theme.system",
    "onboarding.enterApp",
    "onboarding.steamAccountHelp",
  ];

  for (const lang of ["en", "ru"]) {
    const dictionary = JSON.parse(
      readFileSync(new URL(`../i18n/${lang}.json`, import.meta.url), "utf8")
    ) as Record<string, unknown>;

    for (const key of requiredKeys) {
      assert.ok(typeof dictionary[key] === "string" && dictionary[key]);
    }
  }
});
