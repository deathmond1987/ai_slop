import Link from "next/link";
import { tFor } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

export function Header({
  lang,
  signedIn,
  displayName,
}: {
  lang: Lang;
  signedIn: boolean;
  displayName?: string;
}) {
  const t = tFor(lang);
  return (
    <header className="app-shell flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
      <Link href="/" className="font-semibold tracking-tight text-base">
        {t("app.title")}
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
        <form action="/auth/lang" method="post" className="flex items-center gap-1">
          <button
            type="submit"
            name="lang"
            value={lang === "ru" ? "en" : "ru"}
            className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-800"
          >
            {t("lang.switch")}: {lang === "ru" ? "EN" : "RU"}
          </button>
        </form>
        {signedIn ? (
          <form action="/auth/logout" method="post">
            <span className="text-xs opacity-70 mr-2">{displayName ?? "Steam user"}</span>
            <button
              type="submit"
              className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-800"
            >
              {t("nav.logout")}
            </button>
          </form>
        ) : (
          <Link
            href="/auth/login"
            className="rounded bg-[#1b2838] px-3 py-1.5 text-xs text-white hover:bg-[#2a475e]"
          >
            {t("nav.login")}
          </Link>
        )}
      </div>
    </header>
  );
}
