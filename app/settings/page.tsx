import { redirect } from "next/navigation";
import { logDebug } from "@/lib/debug";
import { getT } from "@/lib/i18n";
import { requireSteamSession } from "@/lib/session";
import { formatSteamStoreCc } from "@/lib/store-cc";
import { saveSettings } from "@/app/actions/settings";
import { getThemePreference, type ThemePreference } from "@/lib/theme-mode";

function isSaved(raw: string | string[] | undefined): boolean {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "1";
}

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

  const [t, sp, theme] = await Promise.all([
    getT(session.steamId),
    searchParams,
    getThemePreference(),
  ]);

  const saved = isSaved(sp.saved);
  logDebug("settings.page.render", { saved });

  return (
    <section className="settings-page app-shell mt-4 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>

      {saved && (
        <div className="text-sm rounded border border-green-300 dark:border-green-700 bg-green-100 dark:bg-green-900/30 px-3 py-2">
          {t("settings.saved.flash")}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{t("settings.theme.label")}</span>
          <span className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1">
            {t(`theme.${theme}`)}
          </span>
        </div>
        <p className="text-sm opacity-70">{t("settings.theme.help")}</p>
        <form action="/theme" method="post" className="flex flex-col gap-2">
          <fieldset className="flex flex-wrap items-center gap-3 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2">
            <legend className="sr-only">{t("settings.theme.label")}</legend>
            {(
              [
                { value: "light" as const, label: t("theme.light") },
                { value: "dark" as const, label: t("theme.dark") },
                { value: "system" as const, label: t("theme.system") },
              ] satisfies { value: ThemePreference; label: string }[]
            ).map((option) => (
              <label key={option.value} className="flex items-center gap-1 text-sm">
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
          <button
            type="submit"
            className="self-start rounded bg-[#1b2838] px-4 py-2 text-white hover:bg-[#2a475e]"
          >
            {t("settings.theme.save")}
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="steamApiKey" className="font-medium">
              {t("settings.apiKey.label")}
            </label>
            <span className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1">
              {session.apiKey ? t("settings.status.saved") : t("settings.status.notSet")}
            </span>
          </div>
          <p className="text-sm opacity-70">{t("settings.apiKey.help")}</p>
          <form action={saveSettings} className="flex flex-col gap-2">
            <input
              id="steamApiKey"
              name="steamApiKey"
              type="password"
              defaultValue=""
              placeholder={t("settings.apiKey.placeholder")}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
            />
            <button
              type="submit"
              className="self-start rounded bg-[#1b2838] px-4 py-2 text-white hover:bg-[#2a475e]"
            >
              {t("settings.apiKey.save")}
            </button>
          </form>
          {session.apiKey && (
            <form action={saveSettings} className="flex flex-col gap-2">
              <button
                type="submit"
                name="remove"
                value="steam"
                className="self-start text-sm text-red-600 hover:underline"
              >
                {t("settings.apiKey.remove")}
              </button>
            </form>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="rawgApiKey" className="font-medium">
              {t("settings.rawg.label")}
            </label>
            <span className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1">
              {session.rawgApiKey ? t("settings.status.saved") : t("settings.status.notSet")}
            </span>
          </div>
          <p className="text-sm opacity-70">{t("settings.rawg.help")}</p>
          <form action={saveSettings} className="flex flex-col gap-2">
            <input
              id="rawgApiKey"
              name="rawgApiKey"
              type="password"
              defaultValue=""
              placeholder={t("settings.apiKey.placeholder")}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
            />
            <button
              type="submit"
              className="self-start rounded bg-[#1b2838] px-4 py-2 text-white hover:bg-[#2a475e]"
            >
              {t("settings.rawg.save")}
            </button>
          </form>
          {session.rawgApiKey && (
            <form action={saveSettings} className="flex flex-col gap-2">
              <button
                type="submit"
                name="remove"
                value="rawg"
                className="self-start text-sm text-red-600 hover:underline"
              >
                {t("settings.apiKey.remove")}
              </button>
            </form>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="storeCc" className="font-medium">
              {t("settings.storeCc.label")}
            </label>
            <span className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1">
              {session.storeCc
                ? `${t("settings.status.saved")}: ${formatSteamStoreCc(session.storeCc)}`
                : t("settings.status.notSet")}
            </span>
          </div>
          <p className="text-sm opacity-70">{t("settings.storeCc.help")}</p>
          <form action={saveSettings} className="flex flex-col gap-2">
            <input
              id="storeCc"
              name="storeCc"
              type="text"
              inputMode="text"
              pattern="[a-zA-Z]{0,2}"
              maxLength={2}
              defaultValue={session.storeCc ?? ""}
              placeholder={t("settings.storeCc.placeholder")}
              className="w-28 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 uppercase"
            />
            <button
              type="submit"
              className="self-start rounded bg-[#1b2838] px-4 py-2 text-white hover:bg-[#2a475e]"
            >
              {t("settings.storeCc.save")}
            </button>
          </form>
          {session.storeCc && (
            <form action={saveSettings} className="flex flex-col gap-2">
              <button
                type="submit"
                name="remove"
                value="store"
                className="self-start text-sm text-red-600 hover:underline"
              >
                {t("settings.storeCc.remove")}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
