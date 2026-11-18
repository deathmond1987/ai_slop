"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountStats } from "@/lib/account-stats-core";
import { tFor } from "@/lib/i18n-core";
import type { Lang } from "@/lib/types";
import { ModalShell } from "./ModalShell";

type LoadState = "loading" | "ready" | "failed";

function StatsModal({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = tFor(lang);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account-stats", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return (await response.json()) as AccountStats;
      })
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: [string, string | number][] =
    stats && state === "ready"
      ? [
          [t("stats.owned"), stats.ownedCount],
          [t("stats.missingDates"), stats.ownedCount - stats.withReleaseDate],
          [t("stats.games"), stats.games],
          [t("stats.dlc"), stats.dlc],
          [t("stats.demos"), stats.demos],
          [t("stats.tools"), stats.tools],
          [t("stats.other"), stats.other],
          [t("stats.earlyAccess"), stats.earlyAccessNow],
          [t("stats.earliest"), stats.earliestRelease ?? "—"],
          [t("stats.latest"), stats.latestRelease ?? "—"],
          [t("stats.playtime"), `${stats.totalPlaytimeHours} ${t("stats.hours")}`],
          [t("stats.played"), stats.playedGames],
          [t("stats.neverPlayed"), stats.neverPlayed],
          [t("stats.blacklisted"), stats.blacklisted],
          [t("stats.manualDates"), stats.manualDates],
        ]
      : [];

  const peak = Math.max(1, ...(stats?.releasesByYear.map((row) => row.count) ?? [1]));

  return (
    <ModalShell
      title={t("stats.title")}
      titleId="account-stats-title"
      closeLabel={t("modal.close")}
      contentClassName="mt-3 flex flex-col gap-3"
      onClose={onClose}
    >
      {state === "loading" ? (
        <p className="text-xs opacity-70">{t("stats.loading")}</p>
      ) : state === "failed" ? (
        <p className="text-xs text-red-600 dark:text-red-400">{t("stats.failed")}</p>
      ) : (
        <>
          <dl className="stats-grid">
            {rows.map(([label, value]) => (
              <div key={label} className="stats-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {stats && stats.releasesByYear.length > 0 ? (
            <div>
              <div className="stats-subtitle">{t("stats.byYear")}</div>
              <div className="stats-years">
                {stats.releasesByYear.map((row) => (
                  <div key={row.year} className="stats-year-row">
                    <span className="stats-year-label">{row.year}</span>
                    <span
                      className="stats-year-bar"
                      style={{ width: `${Math.max(2, (row.count / peak) * 100)}%` }}
                      aria-hidden="true"
                    />
                    <span className="stats-year-count">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </ModalShell>
  );
}

export function AccountStatsButton({ lang }: { lang: Lang }) {
  const t = tFor(lang);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button type="button" className="settings-blacklist-btn" onClick={() => setOpen(true)}>
        {t("stats.open")}
      </button>
      {open ? <StatsModal lang={lang} onClose={close} /> : null}
    </>
  );
}
