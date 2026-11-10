"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  if (current?.reason === "wishlist_private") return current;
  return incoming ?? current;
}

export function WishlistPriceCounter({
  lang,
  signedIn,
  label,
  refreshKey,
  initialTotal,
  refreshLabel = "Refresh",
  refreshingLabel = "Refreshing…",
  calculatingLabel = "Calculating…",
  privateLabel = "Private",
  unavailableLabel = "Unavailable",
}: {
  lang: Lang;
  signedIn: boolean;
  label: string;
  refreshKey?: string;
  initialTotal?: WishlistTotalResponse;
  refreshLabel?: string;
  refreshingLabel?: string;
  calculatingLabel?: string;
  privateLabel?: string;
  unavailableLabel?: string;
}) {
  const pathname = usePathname();
  const [total, setTotal] = useState<WishlistTotalResponse | null>(initialTotal ?? null);
  const [discountsOpen, setDiscountsOpen] = useState(false);
  const [pending, setPending] = useState(Boolean(signedIn && !initialTotal?.ready));
  const [refreshing, setRefreshing] = useState(false);
  const loadIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const requestKey = `${pathname ?? ""}|${refreshKey ?? ""}`;

  const loadTotal = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!signedIn || inFlightRef.current) return;
      const id = ++loadIdRef.current;
      inFlightRef.current = true;
      if (force) {
        setRefreshing(true);
      } else {
        setPending(true);
      }

      try {
        const params = new URLSearchParams({ k: requestKey });
        if (force) params.set("refresh", "1");

        const response = await fetch(`/api/wishlist-total?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as WishlistTotalResponse;
        if (id !== loadIdRef.current) return;

        if (response.ok) {
          setTotal((current) => mergeTotalResponse(current, data));
          setDiscountsOpen(false);
          if (data?.reason && data.reason !== "wishlist_fetch_in_progress" && data.reason !== "not_cached") {
            setPending(false);
          } else if (!data?.ready) {
            setPending(true);
          } else {
            setPending(false);
          }
        } else {
          setPending(false);
        }
      } catch {
        if (id === loadIdRef.current) setPending(false);
      } finally {
        if (id === loadIdRef.current) {
          inFlightRef.current = false;
          if (force) setRefreshing(false);
        }
      }
    },
    [requestKey, signedIn]
  );

  const loadTotalRef = useRef(loadTotal);

  useEffect(() => {
    loadTotalRef.current = loadTotal;
  }, [loadTotal]);

  const hasTotal = total != null;
  const totalReady = total?.ready;
  const totalReason = total?.reason;

  useEffect(() => {
    if (!signedIn) return;
    const timeout = setTimeout(() => {
      void loadTotalRef.current?.({});
    }, 0);
    return () => {
      clearTimeout(timeout);
      loadIdRef.current += 1;
      inFlightRef.current = false;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || refreshing || totalReady) return;
    if (totalReason === "wishlist_private") return;
    const shouldPoll =
      pending ||
      !hasTotal ||
      totalReason === "wishlist_fetch_in_progress" ||
      totalReason === "not_cached";
    if (!shouldPoll) return;

    const interval = setInterval(() => {
      void loadTotalRef.current?.({});
    }, 2500);

    return () => clearInterval(interval);
  }, [
    hasTotal,
    pending,
    refreshing,
    signedIn,
    totalReason,
    totalReady,
  ]);

  if (!signedIn) return null;

  const totalCents = typeof total?.totalCents === "number" ? total.totalCents : undefined;
  const discountTotalCents =
    typeof total?.discountTotalCents === "number" ? total.discountTotalCents : undefined;
  const items = total?.items ?? total?.discounts ?? [];
  const reason = total?.reason;
  const isPrivate = reason === "wishlist_private";
  const isTerminalFailure =
    reason === "wishlist_failed" ||
    reason === "wishlist_unknown" ||
    reason === "error" ||
    (!total && !pending && !refreshing);
  const isWorking =
    !total?.ready &&
    !isPrivate &&
    !isTerminalFailure &&
    (pending || refreshing || reason === "wishlist_fetch_in_progress" || reason === "not_cached");
  const value =
    total?.ready && totalCents !== undefined
      ? formatMoney(totalCents, total.currency, lang)
      : isWorking
        ? refreshing
          ? refreshingLabel
          : calculatingLabel
        : isPrivate
          ? privateLabel
          : isTerminalFailure
            ? unavailableLabel
            : "…";

  const refreshButton = (
    <button
      type="button"
      onClick={() => void loadTotal({ force: true })}
      disabled={refreshing}
      title={refreshing ? refreshingLabel : refreshLabel}
      aria-label={refreshing ? refreshingLabel : refreshLabel}
      className="inline-flex items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-60"
    >
      {refreshing ? (
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      <span>{refreshing ? refreshingLabel : refreshLabel}</span>
    </button>
  );

  const statusSpinner = isWorking ? (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  ) : null;

  const statusContent = (
    <span className="inline-flex items-center gap-1" aria-live="polite">
      <span className="opacity-70">{label}:</span>
      {statusSpinner}
      <span className="font-semibold">{value}</span>
    </span>
  );

  if (items.length > 0) {
    return (
      <>
        <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
          <button
            type="button"
            onClick={() => setDiscountsOpen(true)}
            title={`${label}: ${value}`}
            aria-label={`${label}: ${value}`}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs whitespace-nowrap hover:bg-zinc-200 dark:hover:bg-zinc-800"
          >
            {statusContent}
          </button>
          {refreshButton}
        </span>
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
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
      <span title={`${label}: ${value}`}>{statusContent}</span>
      {refreshButton}
    </span>
  );
}
