"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  earlyAccessGameToUpcoming,
  type EarlyAccessSessionResult,
} from "@/lib/early-access-core";
import { tFor } from "@/lib/i18n-core";
import {
  calendarSideQueryValue,
  type CalendarSide,
  type CalendarView,
} from "@/lib/display-mode-core";
import type { Lang, UpcomingGame } from "@/lib/types";
import { EarlyAccessSection } from "./EarlyAccessSection";
import { TBDSection } from "./TBDSection";

const EARLY_ACCESS_POLL_MS = 1500;

function isTerminalEarlyAccessResult(result: EarlyAccessSessionResult): boolean {
  if (result.ready) return true;
  return result.reason !== undefined && result.reason !== "in_progress";
}

export function CalendarSidePanel({
  lang,
  view,
  side,
  year,
  month1,
  tbdGames,
}: {
  lang: Lang;
  view: CalendarView;
  side: CalendarSide;
  year: number;
  month1: number;
  tbdGames: UpcomingGame[];
}) {
  const t = tFor(lang);
  const monthValue = `${year}-${String(month1).padStart(2, "0")}`;
  const hrefFor = (nextSide: CalendarSide) => {
    const params = new URLSearchParams({
      month: monthValue,
      view,
      side: calendarSideQueryValue(nextSide),
    });
    return `/calendar?${params.toString()}`;
  };
  const inactive =
    "rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-800";
  const active =
    "rounded border border-blue-500 bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700";

  const [earlyAccessGames, setEarlyAccessGames] = useState<UpcomingGame[]>([]);
  const [earlyAccessLoading, setEarlyAccessLoading] = useState(true);
  const loadIdRef = useRef(0);
  const inFlightRef = useRef(false);

  const loadEarlyAccess = useCallback(async () => {
    if (inFlightRef.current) return;
    const id = ++loadIdRef.current;
    inFlightRef.current = true;

    try {
      const response = await fetch("/api/early-access", { cache: "no-store" });
      const data = (await response.json()) as EarlyAccessSessionResult;
      if (id !== loadIdRef.current) return;

      if (response.ok) {
        setEarlyAccessGames((data.games ?? []).map(earlyAccessGameToUpcoming));
        if (isTerminalEarlyAccessResult(data)) {
          setEarlyAccessLoading(false);
        } else {
          setEarlyAccessLoading(true);
        }
      } else {
        setEarlyAccessLoading(false);
      }
    } catch {
      if (id === loadIdRef.current) setEarlyAccessLoading(false);
    } finally {
      if (id === loadIdRef.current) inFlightRef.current = false;
    }
  }, []);

  const blacklistEarlyAccessGame = useCallback(async (game: UpcomingGame): Promise<boolean> => {
    try {
      const response = await fetch("/api/early-access/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid: game.appid, name: game.name, headerImage: game.headerImage }),
      });
      if (!response.ok) return false;
      // Drop any in-flight poll result that may still contain this game.
      loadIdRef.current += 1;
      inFlightRef.current = false;
      setEarlyAccessGames((games) => games.filter((g) => g.appid !== game.appid));
      return true;
    } catch {
      return false;
    }
  }, []);

  const setEarlyAccessReleaseDate = useCallback(
    async (game: UpcomingGame, date: string): Promise<boolean> => {
      try {
        const response = await fetch("/api/release-date", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appid: game.appid,
            releaseDate: date,
            name: game.name,
            headerImage: game.headerImage,
          }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    []
  );

  useEffect(() => {
    if (!earlyAccessLoading) return;

    const timeout = setTimeout(() => {
      void loadEarlyAccess();
    }, 0);
    const interval = setInterval(() => {
      void loadEarlyAccess();
    }, EARLY_ACCESS_POLL_MS);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [earlyAccessLoading, loadEarlyAccess]);

  return (
    <div className="calendar-side-panel min-w-0">
      <nav className="calendar-side-tabs" aria-label={t("calendar.sidePanel.label")}>
        <Link
          href={hrefFor("tbd")}
          title={t("calendar.tbd.title")}
          aria-current={side === "tbd" ? "page" : undefined}
          className={side === "tbd" ? active : inactive}
        >
          <span className="calendar-side-tab-label">{t("calendar.sideTab.tbd")}</span>
          <span className="calendar-side-tab-count">{tbdGames.length}</span>
        </Link>
        <Link
          href={hrefFor("earlyAccess")}
          title={t("calendar.earlyAccess.title")}
          aria-current={side === "earlyAccess" ? "page" : undefined}
          className={side === "earlyAccess" ? active : inactive}
        >
          <span className="calendar-side-tab-label">{t("calendar.sideTab.earlyAccess")}</span>
          <span className="calendar-side-tab-count" aria-live="polite">
            {earlyAccessLoading ? (
              <span
                aria-hidden="true"
                className="calendar-side-tab-spinner inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : (
              earlyAccessGames.length
            )}
          </span>
        </Link>
      </nav>

      {side === "earlyAccess" ? (
        <EarlyAccessSection
          lang={lang}
          games={earlyAccessGames}
          loading={earlyAccessLoading}
          onBlacklist={blacklistEarlyAccessGame}
          onSetReleaseDate={setEarlyAccessReleaseDate}
        />
      ) : (
        <TBDSection lang={lang} games={tbdGames} />
      )}
    </div>
  );
}
