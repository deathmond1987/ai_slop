"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DRAG_MIME } from "./DayDropZone";
import { consumeDropHandled } from "./drag-drop-state";
import { createPortal } from "react-dom";
import Image from "next/image";
import { tFor, formatDateWithYear, formatPlaytime, formatTemplate } from "@/lib/i18n-core";
import type { Lang, UpcomingGame } from "@/lib/types";

function priceParts(game: UpcomingGame): {
  priceText?: string;
  initialPriceText?: string;
  discount: number;
} {
  const price = game.price;
  const discount = typeof price?.discount_percent === "number" ? price.discount_percent : 0;
  const priceText = price?.final_formatted || price?.initial_formatted;
  return {
    priceText: priceText || undefined,
    initialPriceText: discount > 0 ? price?.initial_formatted : undefined,
    discount,
  };
}

function PriceText({
  game,
  t,
  className = "",
}: {
  game: UpcomingGame;
  t: (key: string) => string;
  className?: string;
}) {
  const { priceText, initialPriceText, discount } = priceParts(game);
  if (!priceText || game.sources.includes("library")) return null;

  return (
    <span className={`flex flex-wrap items-baseline gap-1 ${className}`}>
      {initialPriceText ? <span className="line-through opacity-60">{initialPriceText}</span> : null}
      <span className={discount > 0 ? "font-medium" : undefined}>{priceText}</span>
      {discount > 0 ? (
        <span className="text-rose-700 dark:text-rose-400 font-medium">
          {formatTemplate(t("calendar.discount"), { percent: discount })}
        </span>
      ) : null}
    </span>
  );
}

export function GameCard({
  game,
  lang,
  variant = "grid",
  disableNestedModal = false,
  onBlacklist,
  onSetReleaseDate,
  removableFromCalendar = false,
}: {
  game: UpcomingGame;
  lang: Lang;
  variant?: "grid" | "row" | "compact";
  disableNestedModal?: boolean;
  /** When set, the game modal shows a blacklist action (Early Access list). */
  onBlacklist?: (game: UpcomingGame) => Promise<boolean>;
  /** When set, the card is draggable and the modal can set a release date. */
  onSetReleaseDate?: (game: UpcomingGame, date: string) => Promise<boolean>;
  /** Calendar cards with a manual date can be dragged out of the calendar to remove them. */
  removableFromCalendar?: boolean;
}) {
  const t = tFor(lang);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open || disableNestedModal) return;
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
  }, [open, disableNestedModal, close]);

  const isRawg = game.dateSource === "rawg";
  const sourceBadges = game.sources.map((s) => ({
    key: s,
    label: s === "library" ? t("calendar.sourceLibrary") : t("calendar.sourceWishlist"),
    className:
      s === "library"
        ? "rounded bg-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100 px-1 py-0 text-scale-9"
        : "rounded bg-zinc-200 dark:bg-zinc-800 px-1 py-0 text-scale-9",
  }));
  const tooltip = `${game.name}${game.dateSourceUrl ? ` · ${game.dateSourceUrl}` : ""}`;
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const clearReleaseDate = async (event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (removing) return;
    setRemoving(true);
    try {
      const response = await fetch("/api/release-date", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid: game.appid }),
      });
      if (response.ok) router.refresh();
    } catch {
      // ignore: the date stays until the next successful removal
    } finally {
      setRemoving(false);
    }
  };
  // Touch and mouse users cannot drag out of the calendar, so show an explicit button.
  const removeButton = removableFromCalendar && game.fromEarlyAccess ? (
    <button
      type="button"
      className="calendar-card-remove"
      title={t("calendar.removeFromCalendar")}
      aria-label={t("calendar.removeFromCalendar")}
      disabled={removing}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void clearReleaseDate();
      }}
    >
      ×
    </button>
  ) : null;
  const draggable = Boolean(onSetReleaseDate || removableFromCalendar);
  const dragProps = draggable
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent<HTMLAnchorElement>) => {
          e.dataTransfer.setData(
            DRAG_MIME,
            JSON.stringify({ appid: game.appid, name: game.name, headerImage: game.headerImage })
          );
          e.dataTransfer.effectAllowed = "copyMove";
        },
        onDragEnd: () => {
          // No drop zone took the card: the user dragged it out of the calendar.
          const removesOnDragOut = removableFromCalendar;
          window.setTimeout(() => {
            if (consumeDropHandled() || !removesOnDragOut || !game.fromEarlyAccess) return;
            void clearReleaseDate();
          }, 0);
        },
      }
    : {};
  const modal = open && !disableNestedModal
    ? createPortal(
        <GameModal
          game={game}
          lang={lang}
          onClose={close}
          onBlacklist={onBlacklist}
          onSetReleaseDate={onSetReleaseDate}
        />,
        document.body
      )
    : null;
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
            if (disableNestedModal || e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            setOpen(true);
          }}
          title={tooltip}
          className="release-game-card group rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden bg-zinc-50 shadow-sm dark:bg-zinc-900 dark:shadow-none hover:shadow-md transition-shadow text-scale-10 leading-tight cursor-pointer"
        >
          <div className="release-game-image">
            {game.headerImage ? (
              <Image
                src={game.headerImage}
                alt={game.name}
                fill
                sizes="(max-width: 480px) 72px, (max-width: 640px) 96px, 240px"
                loading="lazy"
                style={{ objectFit: "cover" }}
              />
            ) : (
              <div className="release-game-image-empty w-full h-full bg-zinc-200 dark:bg-zinc-800" />
            )}
          </div>
          <div className="release-game-info">
            <div className="release-game-title font-medium leading-tight line-clamp-1">{game.name}</div>
            <div className="release-game-date opacity-80">{dateText}</div>
            <PriceText game={game} t={t} className="release-game-price justify-end" />
            {isRawg || sourceBadges.length ? (
              <div className="release-game-badges">
                {isRawg ? (
                  <span className="rounded bg-amber-200 text-amber-900 px-1 py-0 text-scale-9 font-medium">
                    {t("calendar.notFromSteam")}
                  </span>
                ) : null}
                {sourceBadges.map((badge) => (
                  <span key={badge.key} className={badge.className}>
                    {badge.label}
                  </span>
                ))}
              </div>
            ) : null}
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
            if (disableNestedModal || e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            setOpen(true);
          }}
          {...dragProps}
          title={tooltip}
          className="compact-game-card group rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden bg-zinc-50 shadow-sm dark:bg-zinc-900 dark:shadow-none hover:shadow-md transition-shadow text-scale-10 leading-tight cursor-pointer"
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
            <PriceText game={game} t={t} className="compact-game-price text-scale-9" />
            {game.fromEarlyAccess ? (
              <span className="game-card-ea-badge">{t("modal.fromEarlyAccess")}</span>
            ) : null}
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
        {...dragProps}
        title={tooltip}
        className="calendar-game-card group rounded border border-zinc-300 dark:border-zinc-700 overflow-hidden bg-zinc-50 shadow-sm dark:bg-zinc-900 dark:shadow-none hover:shadow-md transition-shadow text-scale-10 leading-tight cursor-pointer"
        >
          {game.headerImage ? (
            <div className="calendar-game-media">
              <Image
                src={game.headerImage}
                alt={game.name}
                fill
                loading="eager"
                sizes="(max-width: 480px) 100vw, 220px"
                style={{ objectFit: "cover" }}
              />
            </div>
          ) : (
            <div className="calendar-game-media bg-zinc-200 dark:bg-zinc-800" />
          )}
          {removeButton}
          <div className="calendar-game-info">
            <div className="font-medium leading-tight line-clamp-1 min-w-0">{game.name}</div>
            <PriceText game={game} t={t} className="calendar-game-price text-scale-9" />
            <div className="calendar-game-badges">
              {isRawg && (
                <span className="rounded bg-amber-200 text-amber-900 px-1 py-0 text-scale-9 font-medium">
                  {t("calendar.notFromSteam")}
                </span>
              )}
              {sourceBadges.map((badge) => (
                <span key={badge.key} className={badge.className}>
                  {badge.label}
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
  onBlacklist,
  onSetReleaseDate,
}: {
  game: UpcomingGame;
  lang: Lang;
  onClose: () => void;
  onBlacklist?: (game: UpcomingGame) => Promise<boolean>;
  onSetReleaseDate?: (game: UpcomingGame, date: string) => Promise<boolean>;
}) {
  const t = tFor(lang);
  const [blacklistState, setBlacklistState] = useState<"idle" | "pending" | "failed">("idle");
  const [dateOpen, setDateOpen] = useState(false);
  const [dateValue, setDateValue] = useState(game.releaseDate ?? "");
  const [dateState, setDateState] = useState<"idle" | "pending" | "failed">("idle");
  const saveDate = async () => {
    if (!onSetReleaseDate || !dateValue || dateState === "pending") return;
    setDateState("pending");
    const ok = await onSetReleaseDate(game, dateValue);
    if (ok) onClose();
    else setDateState("failed");
  };
  const blacklist = async () => {
    if (!onBlacklist || blacklistState === "pending") return;
    setBlacklistState("pending");
    const ok = await onBlacklist(game);
    if (ok) onClose();
    else setBlacklistState("failed");
  };
  const isRawg = game.dateSource === "rawg";
  const dateText = game.releaseDate
    ? formatDateWithYear(game.releaseDate, lang)
    : typeof game.releaseYear === "number"
      ? String(game.releaseYear)
      : t("modal.dateUnknown");
  const typeText = game.steamType === "game"
    ? t("modal.typeGame")
    : game.steamType === "dlc"
      ? t("modal.typeDlc")
      : game.steamType
        ? formatTemplate(t("modal.typeOther"), { type: game.steamType })
        : t("modal.typeUnknown");
  const typeBadgeClass = game.steamType === "dlc"
    ? "rounded bg-purple-200 text-purple-900 px-2 py-0.5 font-medium"
    : game.steamType === "game"
      ? "rounded bg-emerald-200 text-emerald-900 px-2 py-0.5 font-medium"
      : "rounded bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5";
  const fullgameName = game.fullgame?.name || `Steam App ${game.fullgame?.appid ?? ""}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={game.name}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyUp={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="max-w-md w-full max-h-[90vh] overflow-y-auto rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 shadow-2xl">
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
          <div>
            <h2 className="text-lg font-semibold leading-tight">{game.name}</h2>
            <div className="mt-1 opacity-70 text-xs">
              {t("modal.appid")}: {game.appid}
            </div>
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
              <span className="rounded bg-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100 px-2 py-0.5">
                {t("modal.inLibrary")}
              </span>
            )}
            <span className={typeBadgeClass}>{typeText}</span>
            {game.isFree && (
              <span className="rounded bg-green-200 text-green-900 px-2 py-0.5 font-medium">
                {t("modal.isFree")}
              </span>
            )}
          </div>

          {game.price && !game.sources.includes("library") ? (
            <div className="mt-2 text-sm">
              <span className="opacity-70 text-xs">{t("modal.price")}: </span>
              <PriceText game={game} t={t} />
              {game.priceCc ? (
                <span className="opacity-70 text-xs">
                  {" · "}
                  {formatTemplate(t("modal.priceRegion"), { region: game.priceCc.toUpperCase() })}
                </span>
              ) : null}
            </div>
          ) : null}

          {game.fullgame && (
            <div className="mt-2 text-sm">
              <span className="opacity-70 text-xs">{t("modal.fullGame")}: </span>
              <a
                href={`https://store.steampowered.com/app/${game.fullgame.appid}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {fullgameName}
              </a>
            </div>
          )}

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

          {typeof game.playtimeForever === "number" ? (
            <div className="mt-2 text-sm">
              <span className="opacity-70 text-xs">{t("modal.playtime")}: </span>
              <span>{formatPlaytime(game.playtimeForever, lang)}</span>
            </div>
          ) : null}

          {onSetReleaseDate && dateOpen ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="text-xs opacity-70" htmlFor={`release-date-${game.appid}`}>
                {t("modal.releaseDateLabel")}
              </label>
              <input
                id={`release-date-${game.appid}`}
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => void saveDate()}
                disabled={!dateValue || dateState === "pending"}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {dateState === "failed" ? t("modal.blacklistFailed") : t("modal.saveReleaseDate")}
              </button>
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
            {onSetReleaseDate ? (
              <button
                type="button"
                onClick={() => setDateOpen((open) => !open)}
                className="inline-flex items-center justify-center rounded border border-zinc-300 dark:border-zinc-700 text-sm px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {t("modal.setReleaseDate")}
              </button>
            ) : null}
            {onBlacklist ? (
              <button
                type="button"
                onClick={() => void blacklist()}
                disabled={blacklistState === "pending"}
                title={blacklistState === "failed" ? t("modal.blacklistFailed") : undefined}
                className="ml-auto inline-flex items-center justify-center rounded bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm px-3 py-1.5 font-medium"
              >
                {blacklistState === "failed" ? t("modal.blacklistFailed") : t("modal.blacklist")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
