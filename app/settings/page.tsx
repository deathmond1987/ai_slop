import { redirect } from "next/navigation";
import { logDebug } from "@/lib/debug";
import { getLang, getT } from "@/lib/i18n";
import { requireSteamSession } from "@/lib/session";
import { formatSteamStoreCc } from "@/lib/store-cc";
import { saveSettings } from "@/app/actions/settings";
import { getThemePreference, type ThemePreference } from "@/lib/theme-mode";

const SETTINGS_SAVED_TARGETS = new Set<string>([
  "lang",
  "theme",
  "steam-save",
  "steam-remove",
  "rawg-save",
  "rawg-remove",
  "store-save",
  "store-remove",
  "early-access-experimental-save",
]);

function getSettingsSavedTarget(
  raw: string | string[] | undefined
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && SETTINGS_SAVED_TARGETS.has(value) ? value : null;
}

const STORE_CC_REGION_OPTIONS = [
  { value: "us", labelKey: "settings.storeCc.option.us" },
  { value: "ua", labelKey: "settings.storeCc.option.ua" },
  { value: "ru", labelKey: "settings.storeCc.option.ru" },
  { value: "kz", labelKey: "settings.storeCc.option.kz" },
] satisfies { value: string; labelKey: string }[];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSteamSession();
  if (!session) {
    logDebug("settings.page.session_missing");
    redirect("/auth/login");
  }

  const [t, lang, sp, theme] = await Promise.all([
    getT(session.steamId),
    getLang(session.steamId),
    searchParams,
    getThemePreference(),
  ]);

  const savedTarget = getSettingsSavedTarget(sp.saved);
  logDebug("settings.page.render", { savedTarget });

  const currentStoreCc = session.storeCc ?? "";
  const storeCcOptions = [
    { value: "", label: t("settings.storeCc.option.none") },
    ...(currentStoreCc && !STORE_CC_REGION_OPTIONS.some((option) => option.value === currentStoreCc)
      ? [{ value: currentStoreCc, label: formatSteamStoreCc(currentStoreCc) }]
      : []),
    ...STORE_CC_REGION_OPTIONS.map((option) => ({
      value: option.value,
      label: t(option.labelKey),
    })),
  ];

  return (
    <section className="settings-page app-shell mt-3">
      <h1 className="text-scale-11 font-semibold">{t("settings.title")}</h1>

      <div className="settings-grid">
        <div className="settings-card">
          <h2>{t("settings.language.label")}</h2>
          <span className="settings-status">{t(`settings.language.${lang}`)}</span>
          <p>{t("settings.language.help")}</p>
          <form action="/auth/lang" method="post">
            <fieldset>
              <legend className="sr-only">{t("settings.language.label")}</legend>
              <label>
                <input type="radio" name="lang" value="ru" defaultChecked={lang === "ru"} />
                {t("settings.language.ru")}
              </label>
              <label>
                <input type="radio" name="lang" value="en" defaultChecked={lang === "en"} />
                {t("settings.language.en")}
              </label>
            </fieldset>
            {savedTarget === "lang" && (
              <span className="settings-applied settings-applied-save">
                {t("settings.applied")}
              </span>
            )}
            <button type="submit" className="settings-save-btn">
              {t("settings.language.save")}
            </button>
          </form>
        </div>

        <div className="settings-card">
          <h2>{t("settings.theme.label")}</h2>
          <span className="settings-status">{t(`theme.${theme}`)}</span>
          <p>{t("settings.theme.help")}</p>
          <form action="/theme" method="post">
            <fieldset>
              <legend className="sr-only">{t("settings.theme.label")}</legend>
              {(
                [
                  { value: "light" as const, label: t("theme.light") },
                  { value: "lightExperimental" as const, label: t("theme.lightExperimental") },
                  { value: "dark" as const, label: t("theme.dark") },
                  { value: "system" as const, label: t("theme.system") },
                ] satisfies { value: ThemePreference; label: string }[]
              ).map((option) => (
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
            <button type="submit" className="settings-save-btn">
              {t("settings.theme.save")}
            </button>
          </form>
        </div>

        <div className="settings-card">
          <h2>{t("settings.apiKey.label")}</h2>
          <span className="settings-status">
            {session.apiKey ? t("settings.status.saved") : t("settings.status.notSet")}
          </span>
          <p>
            {t("settings.apiKey.help.before")}{" "}
            <a
              href="https://steamcommunity.com/dev/apikey"
              target="_blank"
              rel="noreferrer"
              data-external="true"
              className="underline"
            >
              steamcommunity.com/dev/apikey
            </a>
            {t("settings.apiKey.help.after")}
          </p>
          <form action={saveSettings}>
            <input
              id="steamApiKey"
              name="steamApiKey"
              type="password"
              defaultValue=""
              placeholder={t("settings.apiKey.placeholder")}
              className="settings-control"
            />
            {savedTarget === "steam-save" && (
              <span className="settings-applied settings-applied-save">
                {t("settings.applied")}
              </span>
            )}
            <button type="submit" className="settings-save-btn">
              {t("settings.apiKey.save")}
            </button>
          </form>
          {session.apiKey && (
            <form action={saveSettings}>
              {savedTarget === "steam-remove" && (
                <span className="settings-applied settings-applied-remove">
                  {t("settings.applied")}
                </span>
              )}
              <button
                type="submit"
                name="remove"
                value="steam"
                className="settings-remove-btn"
              >
                {t("settings.apiKey.remove")}
              </button>
            </form>
          )}
        </div>

        <div className="settings-card">
          <h2>{t("settings.rawg.label")}</h2>
          <span className="settings-status">
            {session.rawgApiKey ? t("settings.status.saved") : t("settings.status.notSet")}
          </span>
          <p>{t("settings.rawg.help")}</p>
          <form action={saveSettings}>
            <input
              id="rawgApiKey"
              name="rawgApiKey"
              type="password"
              defaultValue=""
              placeholder={t("settings.apiKey.placeholder")}
              className="settings-control"
            />
            {savedTarget === "rawg-save" && (
              <span className="settings-applied settings-applied-save">
                {t("settings.applied")}
              </span>
            )}
            <button type="submit" className="settings-save-btn">
              {t("settings.rawg.save")}
            </button>
          </form>
          {session.rawgApiKey && (
            <form action={saveSettings}>
              {savedTarget === "rawg-remove" && (
                <span className="settings-applied settings-applied-remove">
                  {t("settings.applied")}
                </span>
              )}
              <button
                type="submit"
                name="remove"
                value="rawg"
                className="settings-remove-btn"
              >
                {t("settings.apiKey.remove")}
              </button>
            </form>
          )}
        </div>

        <div className="settings-card">
          <h2>{t("settings.storeCc.label")}</h2>
          <span className="settings-status">
            {session.storeCc
              ? `${t("settings.status.saved")}: ${formatSteamStoreCc(session.storeCc)}`
              : t("settings.status.notSet")}
          </span>
          <p>{t("settings.storeCc.help")}</p>
          <form action={saveSettings}>
            <select
              id="storeCc"
              name="storeCc"
              defaultValue={currentStoreCc}
              className="settings-control"
            >
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
            <button type="submit" className="settings-save-btn">
              {t("settings.storeCc.save")}
            </button>
          </form>
          {session.storeCc && (
            <form action={saveSettings}>
              {savedTarget === "store-remove" && (
                <span className="settings-applied settings-applied-remove">
                  {t("settings.applied")}
                </span>
              )}
              <button
                type="submit"
                name="remove"
                value="store"
                className="settings-remove-btn"
              >
                {t("settings.storeCc.remove")}
              </button>
            </form>
          )}
        </div>

        <div className="settings-card">
          <h2>{t("settings.experimentalEarlyAccess.label")}</h2>
          <span className="settings-status">
            {t(
              session.experimentalEarlyAccess
                ? "settings.experimentalEarlyAccess.enabled"
                : "settings.experimentalEarlyAccess.disabled"
            )}
          </span>
          <p>{t("settings.experimentalEarlyAccess.help")}</p>
          <form action={saveSettings}>
            <label>
              <input
                id="experimentalEarlyAccess"
                name="experimentalEarlyAccess"
                type="checkbox"
                value="true"
                defaultChecked={session.experimentalEarlyAccess === true}
              />
              {t("settings.experimentalEarlyAccess.label")}
            </label>
            <input type="hidden" name="experimentalEarlyAccess" value="false" />
            {savedTarget === "early-access-experimental-save" && (
              <span className="settings-applied settings-applied-save">
                {t("settings.applied")}
              </span>
            )}
            <button type="submit" className="settings-save-btn">
              {t("settings.experimentalEarlyAccess.save")}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
