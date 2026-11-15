import { createCalendarFeedLink, revokeCalendarFeedLink } from "@/app/actions/calendar-feed";
import { getT } from "@/lib/i18n";

export async function CalendarSubscriptionMenu({
  steamId,
  feedPath,
  feedUrl,
  googleUrl,
  monthValue,
  view,
}: {
  steamId: string;
  feedPath?: string;
  feedUrl?: string;
  googleUrl?: string;
  monthValue: string;
  view: string;
}) {
  const t = await getT(steamId);
  const borderedLink =
    "rounded border border-zinc-300 bg-white px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800";

  return (
    <details className="relative">
      <summary className="cursor-pointer rounded bg-[#1b2838] px-3 py-1 text-white hover:bg-[#2a475e]">
        {t("calendar.subscribe.menu")}
      </summary>
      <div className="absolute right-0 z-10 mt-1 flex w-[min(30rem,calc(100vw-2rem))] flex-col gap-2 rounded border border-zinc-300 bg-white p-2 shadow dark:border-zinc-700 dark:bg-zinc-900">
        {feedPath ? (
          <>
            {googleUrl ? (
              <a
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
                data-external="true"
                className="rounded bg-[#1b2838] px-3 py-1 text-white hover:bg-[#2a475e]"
              >
                {t("calendar.subscribe.google")}
              </a>
            ) : null}
            <p className="text-xs opacity-70">{t("calendar.feed.help")}</p>
            {feedUrl ? (
              <input
                readOnly
                value={feedUrl}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-900"
              />
            ) : null}
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={feedPath}
                target="_blank"
                rel="noreferrer"
                download
                data-external="true"
                className={borderedLink}
              >
                {t("calendar.subscribe.ics")}
              </a>
              <a href="/calendar/ics" download className={borderedLink}>
                {t("calendar.export.ics")}
              </a>
              <form action={revokeCalendarFeedLink}>
                <input type="hidden" name="month" value={monthValue} />
                <input type="hidden" name="view" value={view} />
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  {t("calendar.feed.revoke")}
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs opacity-70">{t("calendar.feed.noToken")}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <form action={createCalendarFeedLink}>
                <input type="hidden" name="month" value={monthValue} />
                <input type="hidden" name="view" value={view} />
                <button type="submit" className={borderedLink}>
                  {t("calendar.subscribe.create")}
                </button>
              </form>
              <a href="/calendar/ics" download className={borderedLink}>
                {t("calendar.export.ics")}
              </a>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
