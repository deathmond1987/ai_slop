"use client";

import { type MouseEvent } from "react";

export function CalendarExportButton({
  label,
  href = "/calendar/ics",
  className,
}: {
  label: string;
  href?: string;
  className?: string;
}) {
  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return;

    event.preventDefault();
    try {
      const response = await fetch(href, {
        credentials: "same-origin",
        headers: { accept: "text/calendar" },
      });
      const contentType = response.headers.get("content-type") ?? "";
      const contents = await response.text();

      if (
        !response.ok ||
        !contentType.includes("text/calendar") ||
        !contents.trimStart().startsWith("BEGIN:VCALENDAR")
      ) {
        throw new Error("invalid calendar export");
      }

      await invoke("save_calendar_export", {
        contents,
        filename: "steam-calendar.ics",
      });
    } catch {
      window.location.assign(href);
    }
  };

  return (
    <a href={href} download onClick={onClick} className={className}>
      {label}
    </a>
  );
}
