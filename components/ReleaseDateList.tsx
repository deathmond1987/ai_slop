import { tFor } from "@/lib/i18n-core";
import type { ReleaseDateGroup } from "@/lib/calendar";
import type { Lang, UpcomingGame } from "@/lib/types";
import { GameCard } from "./GameCard";

export interface ReleaseMonthGroup {
  key: string;
  label: string;
  dates: ReleaseDateGroup[];
  yearOnlyGames?: UpcomingGame[];
}

export function ReleaseDateList({
  lang,
  groups,
}: {
  lang: Lang;
  groups: ReleaseMonthGroup[];
}) {
  const t = tFor(lang);

  if (!groups.some((group) => group.dates.length || group.yearOnlyGames?.length)) {
    return (
      <div className="rounded border border-dashed border-zinc-300 dark:border-zinc-700 p-2 text-xs opacity-60">
        {t("calendar.empty")}
      </div>
    );
  }

  return (
    <div className="release-date-list flex flex-col gap-3">
      {groups.map((month) => {
        const yearOnlyGames = month.yearOnlyGames ?? [];
        const games = [
          ...month.dates.flatMap((date) =>
            date.games.map((game) => ({ key: `${date.iso}-${game.appid}`, game }))
          ),
          ...yearOnlyGames.map((game) => ({ key: `${month.key}-${game.appid}`, game })),
        ];

        if (!games.length) return null;

        return (
          <section
            key={month.key}
            className={`flex flex-col gap-2${yearOnlyGames.length ? " release-year-block" : ""}`}
          >
            <h2 className="text-base font-semibold">{month.label}</h2>
            <div className="release-month-cards">
              {games.map(({ key, game }) => (
                <GameCard key={key} game={game} lang={lang} variant="row" />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
