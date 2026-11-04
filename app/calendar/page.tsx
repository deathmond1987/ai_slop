import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CalendarFeed } from "@/components/CalendarFeed";
import { CalendarFeedSkeleton } from "@/components/CalendarFeedSkeleton";
import { CalendarViewToggle } from "@/components/CalendarViewToggle";
import { MonthTodayLink } from "@/components/MonthNav";
import { getCalendarView, parseView } from "@/lib/display-mode";
import { logDebug } from "@/lib/debug";
import { getLang, getT } from "@/lib/i18n";
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
  const monthValue = `${year}-${String(month1).padStart(2, "0")}`;
  const query: Record<string, string | number> = { month: monthValue, view };
  logDebug("calendar.page.render", { view, year, month1 });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <h1 className="text-lg font-semibold">{t("calendar.title")}</h1>
        <div className="flex items-center gap-1 flex-wrap">
          <a
            href="/calendar/ics"
            download
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {t("calendar.export.ics")}
          </a>
          <CalendarViewToggle lang={lang} view={view} year={year} month1={month1} />
          {view === "grid" && (
            <MonthTodayLink lang={lang} year={year} month1={month1} query={query} />
          )}
        </div>
      </div>

      <Suspense fallback={<CalendarFeedSkeleton view={view} />}>
        <CalendarFeed session={session} lang={lang} view={view} year={year} month1={month1} />
      </Suspense>
    </section>
  );
}
