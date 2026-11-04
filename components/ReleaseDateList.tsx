import { tFor } from "@/lib/i18n-core";
import type { ReleaseDateGroup } from "@/lib/calendar";
import type { Lang } from "@/lib/types";
import { GameCard } from "./GameCard";

export interface ReleaseMonthGroup {
  key: string;
  label: string;
  dates: ReleaseDateGroup[];
}

export function ReleaseDateList({
  lang,
  groups,
}: {
  lang: Lang;
  groups: ReleaseMonthGroup[];
}) {
  const t = tFor(lang);

  if (!groups.length) {
    return (
      <div className="rounded border border-dashed border-zinc-300 dark:border-zinc-700 p-2 text-xs opacity-60">
        {t("calendar.empty")}
      </div>
    );
  }

  return (
    <div className="release-date-list flex flex-col gap-3">
      {groups.map((month) => (
        <section key={month.key} className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">{month.label}</h2>
          <div className="flex flex-col gap-2">
            {month.dates.map((date) => (
              <div key={date.iso} className="release-date-cards">
                {date.games.map((game) => (
                  <GameCard key={`${date.iso}-${game.appid}`} game={game} lang={lang} variant="row" />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
