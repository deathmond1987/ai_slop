import { formatTemplate, tFor } from "@/lib/i18n";
import type { Lang, UpcomingGame } from "@/lib/types";
import { FitBlock } from "./FitBlock";
import { GameCard } from "./GameCard";

export function YearOnlySection({
  lang,
  year,
  games,
}: {
  lang: Lang;
  year: number;
  games: UpcomingGame[];
}) {
  const t = tFor(lang);
  if (!games.length) return null;

  const rows = Math.ceil(games.length / 4);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 className="text-scale-11 leading-tight font-semibold truncate">
        {formatTemplate(t("calendar.knownYear.title"), { year, count: games.length })}
      </h2>
      <FitBlock rows={rows} maxHeightVar="--compact-card-height" className="min-w-0">
        <div className="compact-grid year-grid fit capped h-full">
          {games.map((g) => (
            <GameCard key={`year-only-${g.appid}`} game={g} lang={lang} variant="compact" />
          ))}
        </div>
      </FitBlock>
    </div>
  );
}
