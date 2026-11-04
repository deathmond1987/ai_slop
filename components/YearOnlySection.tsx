import { tFor } from "@/lib/i18n";
import type { Lang, UpcomingGame } from "@/lib/types";
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

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 className="text-scale-11 leading-tight font-semibold truncate">
        {t("calendar.knownYear.title")} ({year}, {games.length})
      </h2>
      <div className="compact-grid year-grid">
        {games.map((g) => (
          <GameCard key={`year-only-${g.appid}`} game={g} lang={lang} variant="compact" />
        ))}
      </div>
    </div>
  );
}
