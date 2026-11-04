import "server-only";
import {
  buildByDateMap,
  buildByYearMap,
  buildDateGroups,
  buildMonthGrid,
  buildYearGroups,
  todayISO,
  type ReleaseDateGroup,
} from "@/lib/calendar";
import { logDebug } from "@/lib/debug";
import { formatTemplate, monthName, tFor, weekdayNames } from "@/lib/i18n";
import { collectUpcoming } from "@/lib/upcoming";
import type { CalendarView } from "@/lib/display-mode";
import type { IdentifiedSession, Lang, UpcomingGame } from "@/lib/types";
import { CalendarGrid } from "./CalendarGrid";
import { ReleaseDateList, type ReleaseMonthGroup } from "./ReleaseDateList";
import { TBDSection } from "./TBDSection";
import { YearOnlySection } from "./YearOnlySection";
import { MonthSideNav } from "./MonthNav";

export async function CalendarFeed({
  session,
  lang,
  view,
  year,
  month1,
}: {
  session: IdentifiedSession;
  lang: Lang;
  view: CalendarView;
  year: number;
  month1: number;
}) {
  const result = await collectUpcoming(session, session.rawgApiKey ?? process.env.RAWG_API_KEY);
  logDebug("calendarFeed.render", {
    view,
    year,
    month1,
    gameCount: result.games.length,
    warningCount: result.warnings.length,
    wishlistPrivate: result.wishlistPrivate,
  });
  const t = tFor(lang);

  const today = todayISO();
  const tbd: UpcomingGame[] = [];
  for (const g of result.games) {
    if (!g.releaseDate && typeof g.releaseYear !== "number") tbd.push(g);
  }
  const yearOnlyForSelectedYear = buildYearGroups(buildByYearMap(result.games)).find(
    (group) => group.year === year
  )?.games ?? [];
  const byDate = buildByDateMap(result.games);

  const dateGroups = buildDateGroups(byDate);
  const monthGroups = new Map<string, ReleaseDateGroup[]>();
  for (const group of dateGroups) {
    const key = group.iso.slice(0, 7);
    const arr = monthGroups.get(key) ?? [];
    arr.push(group);
    monthGroups.set(key, arr);
  }
  const allListSections: ReleaseMonthGroup[] = Array.from(monthGroups.entries()).map(([key, dates]) => ({
    key,
    label: `${monthName(lang, Number(key.slice(5, 7)) - 1)} ${key.slice(0, 4)}`,
    dates,
  }));
  const monthValue = `${year}-${String(month1).padStart(2, "0")}`;
  const query: Record<string, string | number> = { month: monthValue, view };

  const grid = buildMonthGrid(year, month1, today);

  return (
    <>
      {(result.warnings.length > 0 || result.wishlistPrivate) && (
        <div className="text-scale-11 leading-tight bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded p-2 flex flex-col gap-0.5">
          {result.warnings.map((w) => {
            const text =
              w === "wishlistPartial"
                ? formatTemplate(t(`error.${w}`), {
                    shown: result.wishlistShown,
                    total: result.wishlistTotalKnown ?? result.wishlistShown,
                  })
                : t(`error.${w}`);
            return <div key={w}>{text}</div>;
          })}
        </div>
      )}

      <div className="calendar-feed-with-tbd min-w-0">
        <div className="min-w-0 flex flex-col gap-2">
          {view === "grid" ? (
            <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-1">
              <MonthSideNav lang={lang} year={year} month1={month1} direction="prev" query={query} />
              <CalendarGrid
                lang={lang}
                year={year}
                month1={month1}
                grid={grid}
                byDate={byDate}
                monthLabel={`${monthName(lang, month1 - 1)} ${year}`}
                weekdays={weekdayNames(lang)}
              />
              <MonthSideNav lang={lang} year={year} month1={month1} direction="next" query={query} />
            </div>
          ) : (
            <ReleaseDateList lang={lang} groups={allListSections} />
          )}

          <YearOnlySection lang={lang} year={year} games={yearOnlyForSelectedYear} />
        </div>

        <aside className="min-w-0">
          <TBDSection lang={lang} games={tbd} />
        </aside>
      </div>
    </>
  );
}
