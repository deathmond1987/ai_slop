import "server-only";
import {
  buildByDateMap,
  buildByYearMap,
  buildCombinedReleaseGroups,
  buildDateGroups,
  buildMonthGrid,
  buildYearGroups,
  todayISO,
} from "@/lib/calendar";
import { logDebug } from "@/lib/debug";
import { calendarSideQueryValue, type CalendarSide } from "@/lib/display-mode";
import { formatTemplate, monthName, tFor, weekdayNames } from "@/lib/i18n";
import { collectUpcoming } from "@/lib/upcoming";
import { earlyAccessStoreCc } from "@/lib/early-access-core.ts";
import { mergeManualReleaseDates } from "@/lib/manual-release-dates-core.ts";
import { reconcileManualReleaseDates } from "@/lib/manual-release-dates";
import type { CalendarView } from "@/lib/display-mode";
import type { IdentifiedSession, Lang, UpcomingGame } from "@/lib/types";
import { CalendarGrid } from "./CalendarGrid";
import { CalendarSidePanel } from "./CalendarSidePanel";
import { ReleaseDateList, type ReleaseMonthGroup } from "./ReleaseDateList";
import { YearOnlySection } from "./YearOnlySection";
import { MonthSideNav, MonthTodayLink } from "./MonthNav";
import { ScrollableReleaseList } from "./ScrollableReleaseList";

export async function CalendarFeed({
  session,
  lang,
  view,
  side,
  year,
  month1,
}: {
  session: IdentifiedSession;
  lang: Lang;
  view: CalendarView;
  side: CalendarSide;
  year: number;
  month1: number;
}) {
  const collected = await collectUpcoming(session, session.rawgApiKey ?? process.env.RAWG_API_KEY);
  const manualEntries = await reconcileManualReleaseDates(
    session.steamId,
    earlyAccessStoreCc(session.storeCc)
  );
  const result = { ...collected, games: mergeManualReleaseDates(collected.games, manualEntries) };
  logDebug("calendar.manualDates.merged", { entries: manualEntries.length });
  logDebug("calendarFeed.render", {
    view,
    side,
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

  const yearGroups = buildYearGroups(buildByYearMap(result.games));
  const yearOnlyForSelectedYear =
    view === "grid" ? yearGroups.find((group) => group.year === year)?.games ?? [] : [];
  const byDate = buildByDateMap(result.games);
  const dateGroups = buildDateGroups(byDate);
  const allListSections: ReleaseMonthGroup[] =
    view === "list"
      ? buildCombinedReleaseGroups(dateGroups, yearGroups).map((group) =>
          group.kind === "month"
            ? {
                key: group.key,
                label: `${monthName(lang, group.month1 - 1)} ${group.year}`,
                dates: group.dates,
              }
            : {
                key: group.key,
                label: formatTemplate(t("calendar.knownYear.title"), {
                  year: group.year,
                  count: group.games.length,
                }),
                dates: [],
                yearOnlyGames: group.games,
              }
        )
      : [];
  const monthValue = `${year}-${String(month1).padStart(2, "0")}`;
  const query: Record<string, string | number> = {
    month: monthValue,
    view,
    side: calendarSideQueryValue(side),
  };

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
        <div className="min-w-0 flex flex-col gap-[var(--calendar-feed-gap)]">
          {view === "grid" ? (
            <CalendarGrid
              lang={lang}
              year={year}
              month1={month1}
              grid={grid}
              byDate={byDate}
              monthLabel={`${monthName(lang, month1 - 1)} ${year}`}
              weekdays={weekdayNames(lang)}
              nav={{
                prev: <MonthSideNav lang={lang} year={year} month1={month1} direction="prev" query={query} />,
                next: <MonthSideNav lang={lang} year={year} month1={month1} direction="next" query={query} />,
                today: <MonthTodayLink lang={lang} year={year} month1={month1} query={query} />,
              }}
            />
          ) : (
            <ScrollableReleaseList>
              <ReleaseDateList lang={lang} groups={allListSections} />
            </ScrollableReleaseList>
          )}

          {view === "grid" && (
            <YearOnlySection lang={lang} year={year} games={yearOnlyForSelectedYear} />
          )}
        </div>

        <aside className="min-w-0">
          <CalendarSidePanel
            lang={lang}
            view={view}
            side={side}
            year={year}
            month1={month1}
            tbdGames={tbd}
          />
        </aside>
      </div>
    </>
  );
}
