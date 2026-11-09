"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GameCard } from "@/components/GameCard";
import { formatMoney, formatTemplate, tFor } from "@/lib/i18n-core";
import type { Lang, SteamPriceOverview, UpcomingGame } from "@/lib/types";
import type { WishlistItemEntry } from "@/lib/wishlist-total";

export type WishlistItemEntryClient = WishlistItemEntry;

const FOCUSABLE_SELECTOR = 'a[href], button, [tabindex]:not([tabindex="-1"])';

export function WishlistDiscountsModal({
  lang,
  items,
  totalSavingsCents,
  currency,
  onClose,
}: {
  lang: Lang;
  items: WishlistItemEntryClient[];
  totalSavingsCents: number;
  currency: string | null | undefined;
  onClose: () => void;
}) {
  const t = tFor(lang);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fallbackCurrency = currency ?? items.find((item) => item.currency)?.currency ?? null;
  const savings = totalSavingsCents > 0
    ? formatMoney(totalSavingsCents, fallbackCurrency, lang)
    : null;

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [close]);

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wishlist-games-title"
      className="fixed inset-0 z-50 bg-black/60 outline-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyUp={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div
        className="wishlist-modal-panel fixed left-1/2 top-1/2 w-[min(38rem,calc(100vw-2rem))] max-h-[80vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-zinc-300 bg-white p-4 shadow-2xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="wishlist-games-title" className="text-base font-semibold leading-tight">
              {t("wishlist.title")}
            </h2>
            {savings ? (
              <div className="mt-0.5 text-xs opacity-70">
                {formatTemplate(t("discount.savings"), { amount: savings })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {t("modal.close")}
          </button>
        </div>

        <div className="wishlist-modal-cards mt-3">
          {items.map((item) => {
            const itemCurrency = item.currency ?? fallbackCurrency;
            const priceOverview: SteamPriceOverview | undefined =
              typeof item.finalCents === "number"
                ? {
                    currency: itemCurrency ?? "",
                    final: item.finalCents,
                    initial: item.initialCents,
                    discount_percent: item.discountPercent,
                    final_formatted:
                      item.finalFormatted ?? formatMoney(item.finalCents, itemCurrency, lang),
                    initial_formatted:
                      item.initialFormatted ??
                      (typeof item.initialCents === "number"
                        ? formatMoney(item.initialCents, itemCurrency, lang)
                        : undefined),
                  }
                : undefined;
            const game: UpcomingGame = {
              appid: item.appid,
              name: item.name,
              steamUrl: item.steamUrl,
              sources: ["wishlist"],
              releaseDate: item.releaseDate ?? null,
              releaseYear: item.releaseYear,
              dateSource: item.dateSource ?? "unknown",
              dateSourceUrl: item.dateSourceUrl,
              headerImage: item.headerImage,
              steamType: item.steamType,
              isFree: item.isFree,
              fullgame: item.fullgame,
              genres: item.genres,
              developer: item.developer,
              publisher: item.publisher,
              price: priceOverview,
            };

            return (
              <GameCard
                key={item.appid}
                game={game}
                lang={lang}
                variant="row"
                disableNestedModal
              />
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
