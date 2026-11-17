import Image from "next/image";
import { redirect } from "next/navigation";
import { logDebug } from "@/lib/debug";
import { getLang, getT } from "@/lib/i18n";
import { readPendingOnboardingSettings } from "@/lib/onboarding";
import { getSteamSession } from "@/lib/session";
import { formatSteamStoreCc } from "@/lib/store-cc";
import { getThemePreference, type ThemePreference } from "@/lib/theme-mode";
import { submitOnboardingSettings } from "@/app/actions/onboarding";

const ONBOARDING_SAVED_TARGETS = new Set<string>([
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

const STORE_CC_REGION_OPTIONS = [
  { value: "us", labelKey: "settings.storeCc.option.us" },
  { value: "ua", labelKey: "settings.storeCc.option.ua" },
  { value: "ru", labelKey: "settings.storeCc.option.ru" },
  { value: "kz", labelKey: "settings.storeCc.option.kz" },
] satisfies { value: string; labelKey: string }[];

function getEntryValue(raw: string | string[] | undefined): boolean {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "1";
}

function getSavedTarget(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && ONBOARDING_SAVED_TARGETS.has(value) ? value : null;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [t, lang, theme, session, pending, sp] = await Promise.all([
    getT(),
    getLang(),
    getThemePreference(),
    getSteamSession(),
    readPendingOnboardingSettings(),
    searchParams,
  ]);

  const entry = getEntryValue(sp.entry);
  const savedTarget = getSavedTarget(sp.saved);
  const authenticated = Boolean(session?.steamId);
  logDebug("home.page.render", {
    hasSession: authenticated,
    entry,
    savedTarget,
    hasPendingOnboarding: Boolean(pending),
  });

  if (authenticated && !entry) {
    redirect("/calendar");
  }

  const steamApiKey = pending?.steamApiKey ?? "";
  const rawgApiKey = pending?.rawgApiKey ?? "";
  const storeCc = pending?.storeCc ?? session?.storeCc ?? "";
  const accountName = session?.displayName ?? (session?.steamId ? "Steam user" : "");
  const storeCcOptions = [
    { value: "", label: t("settings.storeCc.option.none") },
    ...(storeCc && !STORE_CC_REGION_OPTIONS.some((option) => option.value === storeCc)
      ? [{ value: storeCc, label: formatSteamStoreCc(storeCc) }]
      : []),
    ...STORE_CC_REGION_OPTIONS.map((option) => ({
      value: option.value,
      label: t(option.labelKey),
    })),
  ];
  const langOptions = [
    { value: "ru", label: t("settings.language.ru") },
    { value: "en", label: t("settings.language.en") },
  ];
  const themeOptions = [
    { value: "light" as const, label: t("theme.light") },
    { value: "lightExperimental" as const, label: t("theme.lightExperimental") },
    { value: "dark" as const, label: t("theme.dark") },
    { value: "system" as const, label: t("theme.system") },
  ] satisfies { value: ThemePreference; label: string }[];

  return (
    <section className="onboarding-page app-shell">
      <header className="onboarding-header">
        <h1 className="text-scale-11 font-semibold">{t("settings.title")}</h1>
        <p>{authenticated ? t("onboarding.enterApp") : t("auth.desc")}</p>
      </header>

      <form action={submitOnboardingSettings} className="onboarding-settings-layout">
        <div className="onboarding-account-card">
          <span className="settings-status">
            {authenticated ? t("settings.status.saved") : t("settings.status.notSet")}
          </span>
          <div className="onboarding-account-info">
            {authenticated && session?.avatar ? (
              <Image
                src={session.avatar}
                alt=""
                width={48}
                height={48}
                className="onboarding-avatar"
              />
            ) : null}
            {authenticated && accountName ? (
              <span className="onboarding-account-name">{accountName}</span>
            ) : null}
          </div>
          <p>{t("onboarding.steamAccountHelp")}</p>
          {!authenticated && (
            <button
              type="submit"
              name="onboardingTarget"
              value="sign-in"
              className="onboarding-signin-btn"
            >
              {t("nav.login")}
            </button>
          )}
        </div>

        <div className="settings-grid">
          <div className="settings-card">
            <h2>{t("settings.language.label")}</h2>
            <span className="settings-status">{t(`settings.language.${lang}`)}</span>
            <p>{t("settings.language.help")}</p>
            <fieldset>
              <legend className="sr-only">{t("settings.language.label")}</legend>
              {langOptions.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="lang"
                    value={option.value}
                    defaultChecked={lang === option.value}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            {savedTarget === "lang" && (
              <span className="settings-applied settings-applied-save">
                {t("settings.applied")}
              </span>
            )}
            <button
              type="submit"
              name="onboardingTarget"
              value="lang"
              className="settings-save-btn"
            >
              {t("settings.language.save")}
            </button>
          </div>

          <div className="settings-card">
            <h2>{t("settings.theme.label")}</h2>
            <span className="settings-status">{t(`theme.${theme}`)}</span>
            <p>{t("settings.theme.help")}</p>
            <fieldset>
              <legend className="sr-only">{t("settings.theme.label")}</legend>
              {themeOptions.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    defaultChecked={theme === option.value}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            {savedTarget === "theme" && (
              <span className="settings-applied settings-applied-save">
                {t("settings.applied")}
              </span>
            )}
            <button
              type="submit"
              name="onboardingTarget"
              value="theme"
              className="settings-save-btn"
            >
              {t("settings.theme.save")}
            </button>
          </div>

          <div className="settings-card">
            <h2>{t("settings.apiKey.label")}</h2>
            <span className="settings-status">
              {session?.apiKey ? t("settings.status.saved") : t("settings.status.notSet")}
            </span>
            <p>{t("settings.apiKey.help")}</p>
            <input
              id="steamApiKey"
              name="steamApiKey"
              type="password"
              defaultValue={steamApiKey}
              placeholder={t("settings.apiKey.placeholder")}
              className="settings-control"
            />
            {savedTarget === "steam-save" && (
              <span className="settings-applied settings-applied-save">
                {t("settings.applied")}
              </span>
            )}
            <button
              type="submit"
              name="onboardingTarget"
              value="steam-save"
              className="settings-save-btn"
            >
              {t("settings.apiKey.save")}
            </button>
            {session?.apiKey && (
              <>
                {savedTarget === "steam-remove" && (
                  <span className="settings-applied settings-applied-remove">
                    {t("settings.applied")}
                  </span>
                )}
                <button
                  type="submit"
                  name="onboardingTarget"
                  value="steam-remove"
                  className="settings-remove-btn"
                >
                  {t("settings.apiKey.remove")}
                </button>
              </>
            )}
          </div>

          <div className="settings-card">
            <h2>{t("settings.rawg.label")}</h2>
            <span className="settings-status">
              {session?.rawgApiKey ? t("settings.status.saved") : t("settings.status.notSet")}
            </span>
            <p>{t("settings.rawg.help")}</p>
            <input
              id="rawgApiKey"
              name="rawgApiKey"
              type="password"
              defaultValue={rawgApiKey}
              placeholder={t("settings.apiKey.placeholder")}
              className="settings-control"
            />
            {savedTarget === "rawg-save" && (
              <span className="settings-applied settings-applied-save">
                {t("settings.applied")}
              </span>
            )}
            <button
              type="submit"
              name="onboardingTarget"
              value="rawg-save"
              className="settings-save-btn"
            >
              {t("settings.rawg.save")}
            </button>
            {session?.rawgApiKey && (
              <>
                {savedTarget === "rawg-remove" && (
                  <span className="settings-applied settings-applied-remove">
                    {t("settings.applied")}
                  </span>
                )}
                <button
                  type="submit"
                  name="onboardingTarget"
                  value="rawg-remove"
                  className="settings-remove-btn"
                >
                  {t("settings.apiKey.remove")}
                </button>
              </>
            )}
          </div>

          <div className="settings-card">
            <h2>{t("settings.storeCc.label")}</h2>
            <span className="settings-status">
              {session?.storeCc
                ? `${t("settings.status.saved")}: ${formatSteamStoreCc(session.storeCc)}`
                : t("settings.status.notSet")}
            </span>
            <p>{t("settings.storeCc.help")}</p>
            <select id="storeCc" name="storeCc" defaultValue={storeCc} className="settings-control">
              {storeCcOptions.map((option) => (
                <option key={option.value || "none"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {savedTarget === "store-save" && (
              <span className="settings-applied settings-applied-save">
                {t("settings.applied")}
              </span>
            )}
            <button
              type="submit"
              name="onboardingTarget"
              value="store-save"
              className="settings-save-btn"
            >
              {t("settings.storeCc.save")}
            </button>
            {session?.storeCc && (
              <>
                {savedTarget === "store-remove" && (
                  <span className="settings-applied settings-applied-remove">
                    {t("settings.applied")}
                  </span>
                )}
                <button
                  type="submit"
                  name="onboardingTarget"
                  value="store-remove"
                  className="settings-remove-btn"
                >
                  {t("settings.storeCc.remove")}
                </button>
              </>
            )}
          </div>
        </div>

        {authenticated && (
          <button type="submit" name="onboardingTarget" value="enter" className="onboarding-enter-btn">
            {t("auth.enterApp")}
          </button>
        )}
      </form>
    </section>
  );
}
