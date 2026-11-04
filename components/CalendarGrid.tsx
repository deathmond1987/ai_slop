import type { CalendarDay } from "@/lib/calendar";
import { formatTemplate, tFor } from "@/lib/i18n-core";
import { GRID_DAY_CAP } from "@/lib/pagination";
import type { Lang, UpcomingGame } from "@/lib/types";
import { GameCard } from "./GameCard";

export function CalendarGrid({
  lang,
  grid,
  byDate,
  monthLabel,
  weekdays,
}: {
  lang: Lang;
  year: number;
  month1: number;
  grid: CalendarDay[];
  byDate: Map<string, UpcomingGame[]>;
  monthLabel: string;
  weekdays: string[];
}) {
  const t = tFor(lang);

  return (
    <div className="calendar-grid-shell w-full">
      <div className="calendar-grid-min">
        <div className="text-scale-11 opacity-70 mb-1">{monthLabel}</div>
        <div className="grid grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-800 rounded overflow-hidden border border-zinc-200 dark:border-zinc-800 text-scale-10">
          {weekdays.map((w) => (
            <div
              key={w}
              className="bg-zinc-100 dark:bg-zinc-900 text-center font-medium py-1"
            >
              {w}
            </div>
          ))}
          {grid.map((cell) => {
            const games = byDate.get(cell.iso) ?? [];
            const shown = games.slice(0, GRID_DAY_CAP);
            const hidden = games.length - shown.length;
            return (
              <div
                key={cell.iso}
                className={[
                  "bg-white dark:bg-zinc-950 min-h-[3.5rem] p-1 flex flex-col gap-0.5",
                  cell.inMonth ? "" : "opacity-40",
                  cell.isToday ? "ring-2 ring-blue-500" : "",
                ].join(" ")}
              >
                <div className="font-medium opacity-70 leading-none">{cell.day}</div>
                {shown.map((g) => (
                  <GameCard key={`${cell.iso}-${g.appid}`} game={g} lang={lang} />
                ))}
                {hidden > 0 && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer select-none opacity-70 leading-none hover:underline">
                      {formatTemplate(t("calendar.more"), { count: hidden })}
                    </summary>
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {games.slice(GRID_DAY_CAP).map((g) => (
                        <GameCard
                          key={`${cell.iso}-more-${g.appid}`}
                          game={g}
                          lang={lang}
                          variant="compact"
                        />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
