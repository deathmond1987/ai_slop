"use client";

import { useRef, type FormEvent } from "react";
import type { ThemePreference } from "@/lib/theme-mode";

export function ThemeToggleButton({
  theme,
  label,
}: {
  theme: ThemePreference;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fallbackTheme = theme === "dark" ? "light" : "dark";

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const isDark = theme === "dark" || document.documentElement.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";
    if (inputRef.current) {
      inputRef.current.value = nextTheme;
    }
    void event.currentTarget;
  };

  return (
    <form action="/theme" method="post" onSubmit={onSubmit} className="inline-flex items-center">
      <input ref={inputRef} type="hidden" name="theme" defaultValue={fallbackTheme} />
      <button
        type="submit"
        title={label}
        aria-label={label}
        className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="hidden dark:block"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="dark:hidden"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      </button>
    </form>
  );
}
