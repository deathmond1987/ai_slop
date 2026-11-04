import Link from "next/link";
import { tFor, monthName } from "@/lib/i18n";
import { shiftMonth } from "@/lib/calendar";
import { buildQuery } from "@/lib/pagination";
import type { Lang } from "@/lib/types";

function monthHref(year: number, month1: number, query?: Record<string, unknown>) {
  const monthValue = `${year}-${String(month1).padStart(2, "0")}`;
  return `/calendar?${buildQuery({ ...query, month: monthValue, view: "grid" })}`;
}

function monthLabel(lang: Lang, year: number, month1: number) {
  return `${monthName(lang, month1 - 1)} ${year}`;
}

export function MonthSideNav({
  lang,
  year,
  month1,
  direction,
  query,
}: {
  lang: Lang;
  year: number;
  month1: number;
  direction: "prev" | "next";
  query?: Record<string, unknown>;
}) {
  const t = tFor(lang);
  const target = shiftMonth(year, month1, direction === "prev" ? -1 : 1);
  return (
    <Link
      href={monthHref(target.year, target.month1, query)}
      aria-label={monthLabel(lang, target.year, target.month1)}
      title={monthLabel(lang, target.year, target.month1)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 bg-white text-sm hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
    >
      {direction === "prev" ? t("calendar.prev") : t("calendar.next")}
    </Link>
  );
}

export function MonthTodayLink({
  lang,
  year,
  month1,
  query,
}: {
  lang: Lang;
  year: number;
  month1: number;
  query?: Record<string, unknown>;
}) {
  const t = tFor(lang);
  const today = new Date();
  const todayYear = today.getUTCFullYear();
  const todayMonth1 = today.getUTCMonth() + 1;
  const current = `${year}-${String(month1).padStart(2, "0")}`;
  const todayStr = `${todayYear}-${String(todayMonth1).padStart(2, "0")}`;

  if (current === todayStr) return null;

  return (
    <Link href={monthHref(todayYear, todayMonth1, query)} className="underline text-sm">
      {t("calendar.today")}
    </Link>
  );
}
