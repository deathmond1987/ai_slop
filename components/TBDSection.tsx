import { tFor } from "@/lib/i18n";
import type { Lang, UpcomingGame } from "@/lib/types";
import { FitBlock } from "./FitBlock";
import { GameCard } from "./GameCard";

export function TBDSection({ lang, games }: { lang: Lang; games: UpcomingGame[] }) {
  const t = tFor(lang);
  if (!games.length) {
    return (
      <div className="rounded border border-dashed border-zinc-300 dark:border-zinc-700 p-1.5 text-scale-10 opacity-60">
        {t("calendar.tbd.empty")}
      </div>
    );
  }

  const rows = Math.ceil(games.length / 2);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 className="text-scale-11 leading-tight font-semibold truncate">
        {t("calendar.tbd.title")} ({games.length})
      </h2>
      <FitBlock rows={rows} className="min-w-0">
        <div className="compact-grid tbd-grid fit h-full">
          {games.map((g) => (
            <GameCard key={`tbd-${g.appid}`} game={g} lang={lang} variant="compact" />
          ))}
        </div>
      </FitBlock>
    </div>
  );
}
