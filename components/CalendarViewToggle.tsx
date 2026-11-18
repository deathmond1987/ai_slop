import { setCalendarView } from "@/app/actions/calendar-view";
import type { ReactNode } from "react";
import { tFor } from "@/lib/i18n";
import { calendarSideQueryValue, type CalendarSide, type CalendarView } from "@/lib/display-mode";
import type { Lang } from "@/lib/types";

export function CalendarViewToggle({
  lang,
  view,
  side,
  year,
  month1,
  countSlot,
}: {
  lang: Lang;
  view: CalendarView;
  side: CalendarSide;
  year: number;
  month1: number;
  countSlot?: ReactNode;
}) {
  const t = tFor(lang);
  const monthValue = `${year}-${String(month1).padStart(2, "0")}`;
  const inactive =
    "rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-800";
  const active =
    "rounded border border-blue-500 bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700";

  return (
    <form action={setCalendarView} className="flex flex-wrap gap-1">
      <input type="hidden" name="month" value={monthValue} />
      <input type="hidden" name="side" value={calendarSideQueryValue(side)} />
      <button type="submit" name="view" value="grid" className={view === "grid" ? active : inactive}>
        {t("calendar.title")}
      </button>
      <button type="submit" name="view" value="list" className={view === "list" ? active : inactive}>
        {t("calendar.view.list")}
        {countSlot}
      </button>
      <button type="submit" name="view" value="history" className={view === "history" ? active : inactive}>
        {t("calendar.view.history")}
      </button>
    </form>
  );
}
