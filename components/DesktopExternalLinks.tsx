"use client";

import { useEffect } from "react";

interface TauriShell {
  open: (path: string) => Promise<unknown>;
}

interface TauriGlobal {
  shell?: { open?: TauriShell["open"] };
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

export function DesktopExternalLinks() {
  useEffect(() => {
    const openExternal = window.__TAURI__?.shell?.open;
    if (!openExternal) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[data-external="true"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(href, window.location.origin);
      if (!/^https?:$/i.test(url.protocol)) return;

      event.preventDefault();
      event.stopPropagation();
      void Promise.resolve(openExternal(url.toString())).catch(() => undefined);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
