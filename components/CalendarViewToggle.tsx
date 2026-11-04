import { setCalendarView } from "@/app/actions/calendar-view";
import { tFor } from "@/lib/i18n";
import type { CalendarView } from "@/lib/display-mode";
import type { Lang } from "@/lib/types";

export function CalendarViewToggle({
  lang,
  view,
  year,
  month1,
}: {
  lang: Lang;
  view: CalendarView;
  year: number;
  month1: number;
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
      <button type="submit" name="view" value="grid" className={view === "grid" ? active : inactive}>
        {t("calendar.view.grid")}
      </button>
      <button type="submit" name="view" value="list" className={view === "list" ? active : inactive}>
        {t("calendar.view.list")}
      </button>
    </form>
  );
}
