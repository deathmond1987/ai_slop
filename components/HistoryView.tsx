"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  groupHistoryYearByMonth,
  matchesHistorySearch,
  summarizeHistoryYears,
  type HistoryGame,
  type HistoryResult,
} from "@/lib/history-core";
import { formatTemplate, monthName, tFor } from "@/lib/i18n-core";
import type { Lang, UpcomingGame } from "@/lib/types";
import { GameCard } from "./GameCard";

type Selection = { kind: "year"; year: number } | { kind: "undated" };

function toUpcoming(game: HistoryGame): UpcomingGame {
  return {
    appid: game.appid,
    name: game.name,
    headerImage: game.headerImage,
    sources: ["library"],
    releaseDate: game.releaseDate ?? null,
    dateSource: game.releaseDate ? "steam" : "unknown",
    steamUrl: game.steamUrl,
    steamType: "game",
    playtimeForever: game.playtimeForever,
  };
}

function HistoryGameGrid({ games, lang }: { games: HistoryGame[]; lang: Lang }) {
  return (
    <div className="history-game-grid">
      {games.map((game) => (
        <div key={game.appid} className="history-game-cell" data-history-appid={game.appid}>
          <GameCard game={toUpcoming(game)} lang={lang} variant="compact" />
          {game.releaseDate ? (
            <span className="history-game-day">{Number(game.releaseDate.slice(8, 10))}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function HistoryView({ lang }: { lang: Lang }) {
  const t = tFor(lang);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [query, setQuery] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/history", { cache: "no-store" })
      .then((response) => response.json() as Promise<HistoryResult>)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const games = useMemo(() => result?.games ?? [], [result]);
  const summary = useMemo(() => summarizeHistoryYears(games), [games]);
  const active: Selection | null =
    selection ?? (summary.years[0] ? { kind: "year", year: summary.years[0].year } : null);

  const activeKey = active ? (active.kind === "year" ? String(active.year) : "undated") : "";
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeKey, query]);

  const searchResults = useMemo(
    () =>
      query.trim()
        ? games
            .filter((game) => matchesHistorySearch(game, query))
            .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "") || a.name.localeCompare(b.name))
        : [],
    [games, query]
  );

  if (failed || (result && !result.ready)) {
    const key =
      result?.reason === "no_api_key" ? "history.noApiKey" : "history.failed";
    return <div className="history-empty">{t(key)}</div>;
  }
  if (!result) {
    return <div className="history-empty" aria-busy="true">{t("history.loading")}</div>;
  }

  const inactive = "history-year-btn";
  const activeCls = "history-year-btn is-active";

  let body: ReactNode;
  if (query.trim()) {
    body = (
      <section className="history-month">
        <h2 className="history-month-title">
          {formatTemplate(t("history.searchResults"), { count: searchResults.length })}
        </h2>
        {searchResults.length ? (
          <HistoryGameGrid games={searchResults} lang={lang} />
        ) : (
          <p className="history-month-empty">{t("history.searchEmpty")}</p>
        )}
      </section>
    );
  } else if (active?.kind === "undated") {
    body = (
      <section className="history-month">
        <h2 className="history-month-title">{t("history.undated")}</h2>
        <HistoryGameGrid
          games={games.filter((game) => !game.releaseDate).sort((a, b) => a.name.localeCompare(b.name))}
          lang={lang}
        />
      </section>
    );
  } else if (active?.kind === "year") {
    const months = groupHistoryYearByMonth(games, active.year);
    body = months.map((monthGames, index) => (
      <section key={index} className="history-month">
        <h2 className="history-month-title">
          {monthName(lang, index)} {active.year}
          <span className="history-month-count">{monthGames.length || ""}</span>
        </h2>
        {monthGames.length ? (
          <HistoryGameGrid games={monthGames} lang={lang} />
        ) : (
          <p className="history-month-empty">—</p>
        )}
      </section>
    ));
  }

  return (
    <div className="history-view">
      <aside className="history-years">
        {searchOpen ? (
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                setSearchOpen(false);
              }
            }}
            placeholder={t("history.searchPlaceholder")}
            className="history-search-input"
          />
        ) : (
          <button type="button" className="history-search-btn" onClick={() => setSearchOpen(true)}>
            {t("history.search")}
          </button>
        )}
        <nav className="history-year-list" aria-label={t("history.years")}>
          {summary.years.map(({ year, count }) => (
            <button
              key={year}
              type="button"
              className={!query.trim() && active?.kind === "year" && active.year === year ? activeCls : inactive}
              onClick={() => {
                setQuery("");
                setSelection({ kind: "year", year });
              }}
            >
              <span>{year}</span>
              <span className="history-year-count">{count}</span>
            </button>
          ))}
          {summary.undatedCount > 0 ? (
            <button
              type="button"
              className={!query.trim() && active?.kind === "undated" ? activeCls : inactive}
              onClick={() => {
                setQuery("");
                setSelection({ kind: "undated" });
              }}
            >
              <span>{t("history.undated")}</span>
              <span className="history-year-count">{summary.undatedCount}</span>
            </button>
          ) : null}
        </nav>
      </aside>
      <div ref={scrollRef} className="history-calendar">
        {body}
      </div>
    </div>
  );
}
