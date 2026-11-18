import { tFor } from "@/lib/i18n-core";
import type { Lang, UpcomingGame } from "@/lib/types";
import { FitBlock } from "./FitBlock";
import { GameCard } from "./GameCard";

export function EarlyAccessSection({
  lang,
  games,
  loading = false,
}: {
  lang: Lang;
  games: UpcomingGame[];
  loading?: boolean;
}) {
  const t = tFor(lang);
  if (!games.length) {
    if (loading) {
      return <div className="calendar-side-section flex min-w-0 flex-col gap-1" aria-busy="true" />;
    }

    return (
      <div className="rounded border border-dashed border-zinc-300 dark:border-zinc-700 p-1.5 text-scale-10 opacity-60">
        {t("calendar.earlyAccess.empty")}
      </div>
    );
  }

  const singleColumn = games.length <= 8;
  const rows = singleColumn ? games.length : Math.ceil(games.length / 2);

  return (
    <div className="calendar-side-section flex min-w-0 flex-col gap-1" aria-busy={loading || undefined}>
      <FitBlock rows={rows} className="min-w-0">
        <div className={`compact-grid tbd-grid fit h-full${singleColumn ? " single-column" : ""}`}>
          {games.map((g) => (
            <GameCard key={`early-access-${g.appid}`} game={g} lang={lang} variant="compact" />
          ))}
        </div>
      </FitBlock>
    </div>
  );
}
