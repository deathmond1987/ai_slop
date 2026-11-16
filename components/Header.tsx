import Image from "next/image";
import Link from "next/link";
import { appVersion } from "@/lib/app-version";
import { tFor } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme-mode";
import type { Lang } from "@/lib/types";
import type { WishlistTotalResponse } from "@/lib/wishlist-total";
import { WishlistPriceCounter } from "./WishlistPriceCounter";
import { ThemeToggleButton } from "./ThemeToggleButton";

export function Header({
  lang,
  theme,
  signedIn,
  displayName,
  avatar,
  storeCc,
  initialTotal,
}: {
  lang: Lang;
  theme: ThemePreference;
  signedIn: boolean;
  displayName?: string;
  avatar?: string;
  storeCc?: string;
  initialTotal?: WishlistTotalResponse;
}) {
  const t = tFor(lang);
  const counterKey = [
    signedIn ? "in" : "out",
    storeCc ?? "",
    initialTotal?.ready ?? false,
    initialTotal?.totalCents ?? "",
    initialTotal?.currency ?? "",
    initialTotal?.discountTotalCents ?? "",
    initialTotal?.discounts?.length ?? 0,
    initialTotal?.items?.length ?? 0,
  ].join("|");
  return (
    <header className="app-shell flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
      <Link href="/" className="flex items-baseline gap-2 font-semibold tracking-tight text-base">
        <span>{t("app.title")}</span>
        <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
          {appVersion}
        </span>
      </Link>
      <nav className="flex items-center gap-2 text-xs ml-2">
        <Link href="/calendar" className="hover:underline">
          {t("nav.calendar")}
        </Link>
        <Link href="/settings" className="hover:underline">
          {t("nav.settings")}
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-2 text-xs">
        <WishlistPriceCounter
          key={counterKey}
          lang={lang}
          signedIn={signedIn}
          label={t("header.wishlistTotal")}
          refreshKey={storeCc}
          initialTotal={initialTotal}
          refreshLabel={t("wishlist.refresh")}
          refreshingLabel={t("wishlist.refreshing")}
          calculatingLabel={t("wishlist.calculating")}
          privateLabel={t("error.wishlistHidden")}
          unavailableLabel={t("wishlist.unavailable")}
        />
        <ThemeToggleButton theme={theme} label={t("theme.toggle")} />
        {signedIn ? (
          <form action="/auth/logout" method="post">
            {avatar ? (
              <Image
                src={avatar}
                alt=""
                width={22}
                height={22}
                className="mr-2 inline-block rounded-full border border-zinc-300 dark:border-zinc-700 object-cover align-middle"
              />
            ) : null}
            {displayName ? (
              <span className="text-xs opacity-70 mr-2">{displayName}</span>
            ) : !avatar ? (
              <span className="text-xs opacity-70 mr-2">Steam user</span>
            ) : null}
            <button
              type="submit"
              className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-800"
            >
              {t("nav.logout")}
            </button>
          </form>
        ) : (
          <a
            href="/auth/login"
            className="rounded bg-[#1b2838] px-3 py-1.5 text-xs text-white hover:bg-[#2a475e]"
          >
            {t("nav.login")}
          </a>
        )}
      </div>
    </header>
  );
}
