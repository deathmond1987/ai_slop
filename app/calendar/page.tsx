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
import { getCalendarView, parseCalendarSide, parseView } from "@/lib/display-mode";
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
  const side = parseCalendarSide(sp.side);
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
        <div className="flex items-center gap-1 flex-wrap">
          <h1 className="sr-only">{t("calendar.title")}</h1>
          <CalendarViewToggle lang={lang} view={view} side={side} year={year} month1={month1} />
        </div>
        <CalendarSubscriptionMenu
          steamId={session.steamId}
          feedPath={feedPath}
          feedUrl={feedUrl}
          googleUrl={googleUrl}
          monthValue={monthValue}
          view={view}
          feedStatus={feedStatus}
          openGoogle={openGoogle}
        />
      </div>

      <Suspense fallback={<CalendarFeedSkeleton view={view} />}>
        <CalendarFeed session={session} lang={lang} view={view} side={side} year={year} month1={month1} />
      </Suspense>
    </section>
  );
}
