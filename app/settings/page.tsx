import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCalendarFeedToken } from "@/lib/auth-store";
import {
  createCalendarFeedLink,
  revokeCalendarFeedLink,
} from "@/app/actions/calendar-feed";
import { logDebug } from "@/lib/debug";
import { getExternalOriginFromHeaders } from "@/lib/requestOrigin";
import { getT } from "@/lib/i18n";
import { requireSteamSession } from "@/lib/session";
import { saveSettings } from "@/app/actions/settings";

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

  const [t, sp] = await Promise.all([getT(session.steamId), searchParams]);

  const saved = isSaved(sp.saved);
  const feedStatus = Array.isArray(sp.feed) ? sp.feed[0] : sp.feed;
  const origin = getExternalOriginFromHeaders(await headers());
  const feedToken = await getCalendarFeedToken(session.steamId);
  const feedPath = feedToken ? `/calendar/ics?token=${encodeURIComponent(feedToken)}` : undefined;
  const feedUrl = feedPath && origin ? `${origin}${feedPath}` : undefined;
  const googleUrl = feedUrl
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`
    : undefined;
  logDebug("settings.page.render", {
    saved,
    feedStatus,
    hasFeedToken: Boolean(feedToken),
    hasOrigin: Boolean(origin),
  });

  return (
    <section className="app-shell mt-4 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>

      {saved && (
        <div className="text-sm rounded border border-green-300 dark:border-green-700 bg-green-100 dark:bg-green-900/30 px-3 py-2">
          {t("settings.saved.flash")}
        </div>
      )}

      {feedStatus === "created" && (
        <div className="text-sm rounded border border-green-300 dark:border-green-700 bg-green-100 dark:bg-green-900/30 px-3 py-2">
          {t("settings.calendarExport.flash.created")}
        </div>
      )}

      {feedStatus === "revoked" && (
        <div className="text-sm rounded border border-yellow-300 dark:border-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-2">
          {t("settings.calendarExport.flash.revoked")}
        </div>
      )}

      <form action={saveSettings} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="font-medium">{t("settings.apiKey.label")}</label>
            <span className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1">
              {session.apiKey ? t("settings.status.saved") : t("settings.status.notSet")}
            </span>
          </div>
          <p className="text-sm opacity-70">{t("settings.apiKey.help")}</p>
          <input
            name="steamApiKey"
            type="password"
            defaultValue=""
            placeholder={t("settings.apiKey.placeholder")}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
          />
          {session.apiKey && (
            <button
              type="submit"
              name="remove"
              value="steam"
              className="self-start text-sm text-red-600 hover:underline"
            >
              {t("settings.apiKey.remove")}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="font-medium">{t("settings.rawg.label")}</label>
            <span className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1">
              {session.rawgApiKey ? t("settings.status.saved") : t("settings.status.notSet")}
            </span>
          </div>
          <p className="text-sm opacity-70">{t("settings.rawg.help")}</p>
          <input
            name="rawgApiKey"
            type="password"
            defaultValue=""
            placeholder={t("settings.apiKey.placeholder")}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
          />
          {session.rawgApiKey && (
            <button
              type="submit"
              name="remove"
              value="rawg"
              className="self-start text-sm text-red-600 hover:underline"
            >
              {t("settings.apiKey.remove")}
            </button>
          )}
        </div>

        <button
          type="submit"
          className="self-start rounded bg-[#1b2838] px-4 py-2 text-white hover:bg-[#2a475e]"
        >
          {t("settings.apiKey.save")}
        </button>
      </form>

      <div className="flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <h2 className="text-xl font-semibold">{t("settings.calendarExport.title")}</h2>
        <p className="text-sm opacity-70">{t("settings.calendarExport.help")}</p>

        <a
          href="/calendar/ics"
          download
          className="self-start rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {t("settings.calendarExport.download")}
        </a>

        {feedUrl && googleUrl ? (
          <div className="flex flex-col gap-2">
            <input
              readOnly
              value={feedUrl}
              className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded bg-[#1b2838] px-4 py-2 text-white hover:bg-[#2a475e]"
              >
                {t("settings.calendarExport.google")}
              </a>
              <form action={revokeCalendarFeedLink}>
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  {t("settings.calendarExport.revoke")}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <form action={createCalendarFeedLink}>
            <button
              type="submit"
              className="self-start rounded bg-[#1b2838] px-4 py-2 text-white hover:bg-[#2a475e]"
            >
              {t("settings.calendarExport.create")}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
