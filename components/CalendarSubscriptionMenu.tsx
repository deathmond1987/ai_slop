import { createCalendarFeedLink, revokeCalendarFeedLink } from "@/app/actions/calendar-feed";
import { CalendarExportButton } from "@/components/CalendarExportButton";
import { CalendarSubscriptionModalTrigger } from "@/components/CalendarSubscriptionModalTrigger";
import { getT } from "@/lib/i18n";

export async function CalendarSubscriptionMenu({
  steamId,
  feedPath,
  feedUrl,
  googleUrl,
  monthValue,
  view,
  feedStatus,
  openGoogle = false,
}: {
  steamId: string;
  feedPath?: string;
  feedUrl?: string;
  googleUrl?: string;
  monthValue: string;
  view: string;
  feedStatus?: string;
  openGoogle?: boolean;
}) {
  const t = await getT(steamId);
  const borderedLink =
    "rounded border border-zinc-300 bg-white px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800";
  const calendarBackPath = `/calendar?month=${encodeURIComponent(monthValue)}&view=${encodeURIComponent(view)}`;
  const subscriptionOpenPath = feedPath ? `${feedPath}&open=1` : undefined;
  const flash =
    feedStatus === "created" ? (
      <div className="text-xs rounded border border-green-300 dark:border-green-700 bg-green-100 dark:bg-green-900/30 px-3 py-2">
        {t("calendar.feed.flash.created")}
      </div>
    ) : feedStatus === "revoked" ? (
      <div className="text-xs rounded border border-yellow-300 dark:border-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-2">
        {t("calendar.feed.flash.revoked")}
      </div>
    ) : null;
  const showGoogleHelp = Boolean(openGoogle && feedUrl && googleUrl);
  const googleHelp =
    showGoogleHelp && googleUrl ? (
      <div className="text-xs rounded border border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/30 px-3 py-2">
        <p className="mb-2">{t("calendar.google.help")}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={googleUrl}
            target="_blank"
            rel="noreferrer"
            data-external="true"
            className={borderedLink}
          >
            {t("calendar.google.open")}
          </a>
          <a href={calendarBackPath} className={borderedLink}>
            {t("calendar.google.back")}
          </a>
        </div>
      </div>
    ) : null;
  const subscriptionContent = feedPath ? (
    <>
      {flash}
      {googleHelp}
      {googleUrl && !showGoogleHelp ? (
        <a
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
          data-external="true"
          className={borderedLink}
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
          href={subscriptionOpenPath}
          target="_blank"
          rel="noreferrer"
          data-external="true"
          className={borderedLink}
        >
          {t("calendar.subscribe.ics")}
        </a>
        <CalendarExportButton
          label={t("calendar.export.ics")}
          className={borderedLink}
        />
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
      {flash}
      <p className="text-xs opacity-70">{t("calendar.feed.noToken")}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <form action={createCalendarFeedLink}>
          <input type="hidden" name="month" value={monthValue} />
          <input type="hidden" name="view" value={view} />
          <button type="submit" className={borderedLink}>
            {t("calendar.subscribe.create")}
          </button>
        </form>
        <CalendarExportButton
          label={t("calendar.export.ics")}
          className={borderedLink}
        />
      </div>
    </>
  );

  return (
    <CalendarSubscriptionModalTrigger
      key={feedStatus ?? "subscription"}
      label={t("calendar.subscribe.menu")}
      title={t("calendar.subscribe.menu")}
      closeLabel={t("modal.close")}
      initialOpen={feedStatus === "created" || feedStatus === "revoked"}
      clearHref={feedStatus === "created" || feedStatus === "revoked" ? calendarBackPath : undefined}
    >
      {subscriptionContent}
    </CalendarSubscriptionModalTrigger>
  );
}
