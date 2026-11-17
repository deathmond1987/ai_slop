"use client";

import { GameCard } from "@/components/GameCard";
import { ModalShell } from "@/components/ModalShell";
import { formatMoney, formatTemplate, tFor } from "@/lib/i18n-core";
import type { Lang, SteamPriceOverview, UpcomingGame } from "@/lib/types";
import type { WishlistItemEntry } from "@/lib/wishlist-total";

export type WishlistItemEntryClient = WishlistItemEntry;

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
  const fallbackCurrency = currency ?? items.find((item) => item.currency)?.currency ?? null;
  const savings = totalSavingsCents > 0
    ? formatMoney(totalSavingsCents, fallbackCurrency, lang)
    : null;

  return (
    <ModalShell
      titleId="wishlist-games-title"
      title={t("wishlist.title")}
      subtitle={
        savings ? formatTemplate(t("discount.savings"), { amount: savings }) : null
      }
      closeLabel={t("modal.close")}
      onClose={onClose}
    >
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
    </ModalShell>
  );
}
