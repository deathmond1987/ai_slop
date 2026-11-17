import Link from "next/link";
import { tFor } from "@/lib/i18n";
import { calendarSideQueryValue, type CalendarSide, type CalendarView } from "@/lib/display-mode";
import type { Lang, UpcomingGame } from "@/lib/types";
import { EarlyAccessSection } from "./EarlyAccessSection";
import { TBDSection } from "./TBDSection";

export function CalendarSidePanel({
  lang,
  view,
  side,
  year,
  month1,
  tbdGames,
  earlyAccessGames,
}: {
  lang: Lang;
  view: CalendarView;
  side: CalendarSide;
  year: number;
  month1: number;
  tbdGames: UpcomingGame[];
  earlyAccessGames: UpcomingGame[];
}) {
  const t = tFor(lang);
  const monthValue = `${year}-${String(month1).padStart(2, "0")}`;
  const hrefFor = (nextSide: CalendarSide) => {
    const params = new URLSearchParams({
      month: monthValue,
      view,
      side: calendarSideQueryValue(nextSide),
    });
    return `/calendar?${params.toString()}`;
  };
  const inactive =
    "rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-800";
  const active =
    "rounded border border-blue-500 bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700";

  return (
    <div className="calendar-side-panel min-w-0">
      <nav className="calendar-side-tabs" aria-label={t("calendar.sidePanel.label")}>
        <Link
          href={hrefFor("tbd")}
          title={t("calendar.tbd.title")}
          aria-current={side === "tbd" ? "page" : undefined}
          className={side === "tbd" ? active : inactive}
        >
          <span className="calendar-side-tab-label">{t("calendar.sideTab.tbd")}</span>
          <span className="calendar-side-tab-count">{tbdGames.length}</span>
        </Link>
        <Link
          href={hrefFor("earlyAccess")}
          title={t("calendar.earlyAccess.title")}
          aria-current={side === "earlyAccess" ? "page" : undefined}
          className={side === "earlyAccess" ? active : inactive}
        >
          <span className="calendar-side-tab-label">{t("calendar.sideTab.earlyAccess")}</span>
          <span className="calendar-side-tab-count">{earlyAccessGames.length}</span>
        </Link>
      </nav>

      {side === "earlyAccess" ? (
        <EarlyAccessSection lang={lang} games={earlyAccessGames} />
      ) : (
        <TBDSection lang={lang} games={tbdGames} />
      )}
    </div>
  );
}
