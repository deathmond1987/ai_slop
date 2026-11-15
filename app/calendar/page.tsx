import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarFeed } from "@/components/CalendarFeed";
import { CalendarFeedSkeleton } from "@/components/CalendarFeedSkeleton";
import { CalendarSubscriptionMenu } from "@/components/CalendarSubscriptionMenu";
import { CalendarViewToggle } from "@/components/CalendarViewToggle";
import { getCalendarFeedToken } from "@/lib/auth-store";
import {
  calendarFeedPath,
  calendarFeedUrl,
  googleCalendarImportUrl,
} from "@/lib/calendar-feed-link";
import { getCalendarView, parseView } from "@/lib/display-mode";
import { logDebug } from "@/lib/debug";
import { getLang, getT } from "@/lib/i18n";
import { getExternalOriginFromHeaders } from "@/lib/requestOrigin";
import { requireSteamSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseMonth(raw: string | string[] | undefined): { year: number; month1: number } {
  const today = new Date();
  const def = { year: today.getUTCFullYear(), month1: today.getUTCMonth() + 1 };
  if (!raw) return def;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? "");
  if (!m) return def;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return def;
  return { year: y, month1: mm };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSteamSession();
  if (!session) {
    logDebug("calendar.page.session_missing");
    redirect("/auth/login");
  }

  const sp = await searchParams;
  const { year, month1 } = parseMonth(sp.month);
  const [lang, t, cookieView] = await Promise.all([
    getLang(session.steamId),
    getT(session.steamId),
    getCalendarView(session.steamId),
  ]);
  const view = parseView(sp.view) ?? cookieView;
  const requestHeaders = await headers();
  const origin = getExternalOriginFromHeaders(requestHeaders);
  const feedToken = await getCalendarFeedToken(session.steamId);
  const feedPath = feedToken ? calendarFeedPath(feedToken) : undefined;
  const feedUrl = feedToken && origin ? calendarFeedUrl(origin, feedToken) : undefined;
  const googleUrl = feedUrl ? googleCalendarImportUrl(feedUrl) : undefined;
  const feedStatus = Array.isArray(sp.feed) ? sp.feed[0] : sp.feed;
  const openGoogleParam = Array.isArray(sp.openGoogle) ? sp.openGoogle[0] : sp.openGoogle;
  const openGoogle = openGoogleParam === "1";
  const monthValue = `${year}-${String(month1).padStart(2, "0")}`;
  const calendarBackPath = `/calendar?month=${encodeURIComponent(monthValue)}&view=${encodeURIComponent(view)}`;
  logDebug("calendar.page.render", {
    view,
    year,
    month1,
    hasFeedToken: Boolean(feedToken),
    hasOrigin: Boolean(origin),
  });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <h1 className="text-lg font-semibold">{t("calendar.title")}</h1>
        <div className="flex items-center gap-1 flex-wrap">
          <CalendarSubscriptionMenu
            steamId={session.steamId}
            feedPath={feedPath}
            feedUrl={feedUrl}
            googleUrl={googleUrl}
            monthValue={monthValue}
            view={view}
          />
          <CalendarViewToggle lang={lang} view={view} year={year} month1={month1} />
        </div>
      </div>

      {openGoogle && feedUrl && googleUrl ? (
        <div className="text-xs rounded border border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/30 px-3 py-2">
          <p className="mb-2">{t("calendar.google.help")}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={calendarBackPath}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {t("calendar.google.back")}
            </a>
            <a
              href={googleUrl}
              target="_blank"
              rel="noreferrer"
              data-external="true"
              className="rounded bg-[#1b2838] px-3 py-1 text-white hover:bg-[#2a475e]"
            >
              {t("calendar.google.open")}
            </a>
          </div>
        </div>
      ) : null}

      {feedStatus === "created" && (
        <div className="text-xs rounded border border-green-300 dark:border-green-700 bg-green-100 dark:bg-green-900/30 px-3 py-2">
          {t("calendar.feed.flash.created")}
        </div>
      )}

      {feedStatus === "revoked" && (
        <div className="text-xs rounded border border-yellow-300 dark:border-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-2">
          {t("calendar.feed.flash.revoked")}
        </div>
      )}

      <Suspense fallback={<CalendarFeedSkeleton view={view} />}>
        <CalendarFeed session={session} lang={lang} view={view} year={year} month1={month1} />
      </Suspense>
    </section>
  );
}
