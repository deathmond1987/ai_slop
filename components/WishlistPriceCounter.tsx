"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/i18n-core";
import type { Lang } from "@/lib/types";
import type { WishlistTotalResponse } from "@/lib/wishlist-total";
import { WishlistDiscountsModal } from "./WishlistDiscountsModal";

function mergeTotalResponse(
  current: WishlistTotalResponse | null,
  incoming: WishlistTotalResponse | null
): WishlistTotalResponse | null {
  if (incoming?.ready && typeof incoming.totalCents === "number") return incoming;
  if (current?.ready && typeof current.totalCents === "number") return current;
  return incoming ?? current;
}

export function WishlistPriceCounter({
  lang,
  signedIn,
  label,
  refreshKey,
  initialTotal,
}: {
  lang: Lang;
  signedIn: boolean;
  label: string;
  refreshKey?: string;
  initialTotal?: WishlistTotalResponse;
}) {
  const pathname = usePathname();
  const [total, setTotal] = useState<WishlistTotalResponse | null>(initialTotal ?? null);
  const [discountsOpen, setDiscountsOpen] = useState(false);
  const requestKey = `${pathname}|${refreshKey ?? ""}`;

  useEffect(() => {
    if (!signedIn) return;

    let ignore = false;

    fetch(`/api/wishlist-total?k=${encodeURIComponent(requestKey)}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<WishlistTotalResponse>)
      .then((data) => {
        if (ignore) return;
        setTotal((current) => mergeTotalResponse(current, data));
        setDiscountsOpen(false);
      })
      .catch(() => {
        if (!ignore) setTotal((current) => current ?? null);
      });

    return () => {
      ignore = true;
    };
  }, [requestKey, signedIn]);

  if (!signedIn) return null;

  const totalCents = typeof total?.totalCents === "number" ? total.totalCents : undefined;
  const discountTotalCents =
    typeof total?.discountTotalCents === "number" ? total.discountTotalCents : undefined;
  const items = total?.items ?? total?.discounts ?? [];
  const value =
    total?.ready && totalCents !== undefined
      ? formatMoney(totalCents, total.currency, lang)
      : "…";

  if (items.length > 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDiscountsOpen(true)}
          title={`${label}: ${value}`}
          aria-label={`${label}: ${value}`}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs whitespace-nowrap hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          <span className="opacity-70">{label}:</span>
          <span className="font-semibold">{value}</span>
        </button>
        {discountsOpen ? (
          <WishlistDiscountsModal
            lang={lang}
            items={items}
            totalSavingsCents={discountTotalCents ?? 0}
            currency={total?.currency}
            onClose={() => setDiscountsOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs whitespace-nowrap"
      title={`${label}: ${value}`}
      aria-live="polite"
    >
      <span className="opacity-70">{label}:</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
