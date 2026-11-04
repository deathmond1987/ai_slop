"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { tFor, formatDate, formatDateWithYear, formatPlaytime } from "@/lib/i18n-core";
import type { Lang, UpcomingGame } from "@/lib/types";

export function GameCard({
  game,
  lang,
  variant = "grid",
}: {
  game: UpcomingGame;
  lang: Lang;
  variant?: "grid" | "row" | "compact";
}) {
  const t = tFor(lang);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const isRawg = game.dateSource === "rawg";
  const sourceBadges = game.sources.map((s) =>
    s === "library" ? t("calendar.sourceLibrary") : t("calendar.sourceWishlist")
  );
  const tooltip = `${game.name}${game.dateSourceUrl ? ` · ${game.dateSourceUrl}` : ""}`;
  const modal = open ? <GameModal game={game} lang={lang} onClose={close} /> : null;
  const dateText = game.releaseDate
    ? formatDateWithYear(game.releaseDate, lang)
    : typeof game.releaseYear === "number"
      ? String(game.releaseYear)
      : t("modal.dateUnknown");

  if (variant === "row") {
    return (
      <>
        <a
          href={game.steamUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            setOpen(true);
          }}
          title={tooltip}
          className="release-game-card group rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900 hover:shadow-md transition-shadow text-scale-10 leading-tight cursor-pointer"
        >
          <div className="release-game-image">
            {game.headerImage ? (
              <Image
                src={game.headerImage}
                alt={game.name}
                fill
                sizes="120px"
                loading="lazy"
                style={{ objectFit: "cover" }}
              />
            ) : (
              <div className="release-game-image-empty w-full h-full bg-zinc-200 dark:bg-zinc-800" />
            )}
            <div className="release-game-badges">
              {isRawg ? (
                <span className="rounded bg-amber-200 text-amber-900 px-1 py-0 text-scale-9 font-medium">
                  {t("calendar.notFromSteam")}
                </span>
              ) : null}
              {sourceBadges.map((s) => (
                <span
                  key={s}
                  className="rounded bg-zinc-200 dark:bg-zinc-800 px-1 py-0 text-scale-9"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="release-game-info">
            <div className="release-game-title font-medium leading-tight line-clamp-2">{game.name}</div>
            <div className="release-game-date opacity-80">{dateText}</div>
          </div>
        </a>

        {modal}
      </>
    );
  }

  if (variant === "compact") {
    return (
      <>
        <a
          href={game.steamUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            setOpen(true);
          }}
          title={tooltip}
          className="compact-game-card group rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900 hover:shadow-md transition-shadow text-scale-10 leading-tight cursor-pointer"
        >
          {game.headerImage ? (
            <div className="compact-game-media">
              <Image
                src={game.headerImage}
                alt={game.name}
                fill
                loading="lazy"
                sizes="(max-width: 1024px) 100vw, 22rem"
                style={{ objectFit: "cover" }}
              />
            </div>
          ) : (
            <div className="compact-game-media bg-zinc-200 dark:bg-zinc-800" />
          )}
          <div className="compact-game-info">
            <div className="font-medium leading-tight line-clamp-2 min-w-0">{game.name}</div>
          </div>
        </a>

        {modal}
      </>
    );
  }

  return (
    <>
      <a
        href={game.steamUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          setOpen(true);
        }}
        title={tooltip}
          className="group block rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900 hover:shadow-md transition-shadow text-scale-10 leading-tight cursor-pointer"
        >
          {game.headerImage ? (
            <Image
              src={game.headerImage}
              alt={game.name}
              width={460}
              height={215}
              className="w-full h-10 object-cover"
              loading="lazy"
              sizes="(max-width: 480px) 100vw, 180px"
            />
          ) : (
            <div className="w-full h-10 bg-zinc-200 dark:bg-zinc-800" />
          )}
          <div className="px-1 py-0.5 flex flex-col gap-0.5 min-w-0">
            <div className="font-medium leading-tight line-clamp-1">{game.name}</div>
            <div className="flex gap-0.5 flex-wrap opacity-80">
              {isRawg && (
                <span className="rounded bg-amber-200 text-amber-900 px-1 py-0 text-scale-9 font-medium">
                  {t("calendar.notFromSteam")}
                </span>
              )}
              {sourceBadges.map((s) => (
                <span
                  key={s}
                  className="rounded bg-zinc-200 dark:bg-zinc-800 px-1 py-0 text-scale-9"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
      </a>

      {modal}
    </>
  );
}

function GameModal({
  game,
  lang,
  onClose,
}: {
  game: UpcomingGame;
  lang: Lang;
  onClose: () => void;
}) {
  const t = tFor(lang);
  const isRawg = game.dateSource === "rawg";
  const dateText = game.releaseDate
    ? formatDate(game.releaseDate, lang)
    : typeof game.releaseYear === "number"
      ? String(game.releaseYear)
      : t("modal.dateUnknown");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={game.name}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-w-md w-full rounded-lg overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 shadow-2xl">
        {game.headerImage ? (
          <Image
            src={game.headerImage}
            alt={game.name}
            width={460}
            height={215}
            className="w-full h-40 object-cover"
            sizes="(max-width: 767px) 100vw, 448px"
          />
        ) : (
          <div className="w-full h-24 bg-zinc-200 dark:bg-zinc-800" />
        )}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold leading-tight">{game.name}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-xl leading-none px-2"
              aria-label={t("modal.close")}
            >
              ×
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5">
              {dateText}
            </span>
            {isRawg ? (
              game.dateSourceUrl ? (
                <a
                  href={game.dateSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-amber-200 text-amber-900 px-2 py-0.5 font-medium hover:bg-amber-300"
                >
                  {t("calendar.notFromSteam")}
                </a>
              ) : (
                <span className="rounded bg-amber-200 text-amber-900 px-2 py-0.5 font-medium">
                  {t("calendar.notFromSteam")}
                </span>
              )
            ) : game.dateSource === "steam" || game.dateSource === "steamYear" ? (
              <span className="rounded bg-emerald-200 text-emerald-900 px-2 py-0.5">
                {t("calendar.fromSteam")}
              </span>
            ) : null}
            {game.sources.includes("wishlist") && (
              <span className="rounded bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-0.5">
                {t("modal.inWishlist")}
              </span>
            )}
            {game.sources.includes("library") && (
              <span className="rounded bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5">
                {t("modal.inLibrary")}
              </span>
            )}
          </div>

          {game.genres?.length ? (
            <div className="mt-3 text-sm">
              <div className="opacity-70 text-xs">{t("modal.genres")}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {game.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {game.developer ? (
            <div className="mt-2 text-sm">
              <span className="opacity-70 text-xs">{t("modal.developer")}: </span>
              <span>{game.developer}</span>
            </div>
          ) : null}

          {game.publisher ? (
            <div className="mt-1 text-sm">
              <span className="opacity-70 text-xs">{t("modal.publisher")}: </span>
              <span>{game.publisher}</span>
            </div>
          ) : null}

          {typeof game.playtimeForever === "number" && game.playtimeForever > 0 ? (
            <div className="mt-2 text-sm">
              <span className="opacity-70 text-xs">{t("modal.playtime")}: </span>
              <span>{formatPlaytime(game.playtimeForever, lang)}</span>
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <a
              href={game.steamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 font-medium"
            >
              {t("modal.openSteam")}
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded border border-zinc-300 dark:border-zinc-700 text-sm px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {t("modal.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
