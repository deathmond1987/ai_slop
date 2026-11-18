import type { CSSProperties, ReactNode } from "react";
import type { CalendarDay } from "@/lib/calendar";
import {
  computeCalendarCellLayouts,
  computeCalendarColumnOccupancy,
  computeCalendarColumnTracks,
  computeCalendarColumnWeights,
  computeCalendarRowWeights,
  computeCalendarRowsMinWidth,
} from "@/lib/calendar-layout";
import { formatTemplate, tFor } from "@/lib/i18n-core";
import type { Lang, UpcomingGame } from "@/lib/types";
import { DayDropZone } from "./DayDropZone";
import { GameCard } from "./GameCard";

export function CalendarGrid({
  lang,
  grid,
  byDate,
  monthLabel,
  weekdays,
  nav,
}: {
  lang: Lang;
  year: number;
  month1: number;
  grid: CalendarDay[];
  byDate: Map<string, UpcomingGame[]>;
  monthLabel: string;
  weekdays: string[];
  nav?: { prev: ReactNode; next: ReactNode; today?: ReactNode };
}) {
  const t = tFor(lang);
  const rows: CalendarDay[][] = [];
  for (let index = 0; index < grid.length; index += 7) {
    rows.push(grid.slice(index, index + 7));
  }

  const columnWeights = computeCalendarColumnWeights(grid, byDate);
  const occupiedColumns = computeCalendarColumnOccupancy(grid, byDate);
  const cellLayouts = computeCalendarCellLayouts(grid, byDate, columnWeights);
  const rowWeights = computeCalendarRowWeights(grid, byDate, cellLayouts);
  // Пустые будни могут сжиматься до 0, занятые будни и карточки держат минимальную ширину.
  const calendarColumns = computeCalendarColumnTracks(columnWeights, occupiedColumns).join(" ");
  const calendarMinWidth = computeCalendarRowsMinWidth(columnWeights, occupiedColumns);
  // Недели с играми получают авто-высоту под карточку, пустые недели делят остаток высоты.
  const calendarRowsStyle = {
    gridTemplateColumns: calendarColumns,
    gridTemplateRows: `minmax(var(--calendar-row-header-min), var(--calendar-row-header-max)) ${rowWeights
      .map((weight) => {
        const isCardRow = weight > 1;
        if (isCardRow) return "minmax(0, auto)";
        return "1fr";
      })
      .join(" ")}`,
    minWidth: calendarMinWidth,
  } as CSSProperties;

  return (
    <div className="calendar-grid-shell w-full">
      <div className="calendar-grid-min">
        {nav ? (
          <div className="calendar-grid-nav">
            {nav.prev}
            <div className="calendar-grid-nav-label">
              {nav.today}
              <div className="text-scale-11 opacity-70">{monthLabel}</div>
            </div>
            {nav.next}
          </div>
        ) : (
          <div className="text-scale-11 opacity-70 mb-1">{monthLabel}</div>
        )}
        <div className="calendar-grid-scroll min-h-0 overflow-auto">
          <div
            className="calendar-grid-rows rounded border border-zinc-200 bg-zinc-200 text-scale-10 dark:border-zinc-800 dark:bg-zinc-800"
            style={calendarRowsStyle}
          >
            <div className="calendar-grid-header">
              {weekdays.map((weekday) => (
                <div
                  key={weekday}
                  className="bg-zinc-100 dark:bg-zinc-900 text-center font-medium py-1"
                >
                  {weekday}
                </div>
              ))}
            </div>
            {rows.map((row, rowIndex) => {
              const rowKey = row.map((cell) => cell.iso).join("-");
              const rowWeight = rowWeights[rowIndex] ?? 1;
              const rowClass = rowWeight > 1 ? "calendar-week-row-cards" : "calendar-week-row-empty";

                return (
                  <div key={rowKey} className={`calendar-week-row ${rowClass}`}>
                    {row.map((cell, index) => {
                      const games = byDate.get(cell.iso) ?? [];
                      const layout = cellLayouts[rowIndex * 7 + index];
                    const visibleCount = layout.visibleCount;
                    const hiddenCount = layout.hiddenCount;
                    const visibleGames = games.slice(0, visibleCount);
                    const hiddenGames = games.slice(visibleCount);
                    const contentSlots = visibleCount;
                    const contentStyle =
                      contentSlots > 1
                        ? ({ gridTemplateColumns: `repeat(${contentSlots}, var(--calendar-game-card-min-track))` } as CSSProperties)
                        : undefined;

                    return (
                      <DayDropZone
                        key={cell.iso}
                        iso={cell.iso}
                        className={[
                          "calendar-day-cell bg-white dark:bg-zinc-950",
                          cell.inMonth ? "" : "opacity-40",
                          cell.isToday ? "ring-2 ring-blue-500" : "",
                        ].join(" ")}
                      >
                        <div
                          className={
                            contentSlots > 1
                              ? "calendar-day-content calendar-day-content-multi"
                              : "calendar-day-content"
                          }
                          style={contentStyle}
                        >
                          {visibleGames.map((game) => (
                            <GameCard
                              key={`${cell.iso}-${game.appid}`}
                              game={game}
                              lang={lang}
                              removableFromCalendar
                            />
                          ))}
                        </div>
                        <div className="calendar-day-date">
                          <div className="font-medium leading-none">{cell.day}</div>
                        </div>
                        {hiddenCount > 0 && (
                          <details className="calendar-day-hidden">
                            <summary className="cursor-pointer select-none leading-none">
                              {formatTemplate(t("calendar.more"), { count: hiddenCount })}
                            </summary>
                            <div className="calendar-day-hidden-list">
                              {hiddenGames.map((game) => (
                                <GameCard
                                  key={`${cell.iso}-more-${game.appid}`}
                                  game={game}
                                  lang={lang}
                                  variant="compact"
                                  removableFromCalendar
                                />
                              ))}
                            </div>
                          </details>
                        )}
                      </DayDropZone>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
