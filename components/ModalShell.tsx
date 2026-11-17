"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = 'a[href], button, [tabindex]:not([tabindex="-1"])';

export function ModalShell({
  title,
  titleId,
  closeLabel,
  children,
  subtitle = null,
  contentClassName = "wishlist-modal-cards mt-3",
  panelClassName,
  onClose,
}: {
  title: string;
  titleId: string;
  closeLabel: string;
  children: ReactNode;
  subtitle?: ReactNode;
  contentClassName?: string;
  panelClassName?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
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
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 bg-black/60 outline-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyUp={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div
        className={[
          "wishlist-modal-panel fixed left-1/2 top-1/2 w-[min(38rem,calc(100vw-2rem))] max-h-[80vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-zinc-300 bg-white p-4 shadow-2xl outline-none dark:border-zinc-700 dark:bg-zinc-900",
          panelClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id={titleId} className="text-base font-semibold leading-tight">
              {title}
            </h2>
            {subtitle ? <div className="mt-0.5 text-xs opacity-70">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {closeLabel}
          </button>
        </div>

        <div className={contentClassName}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
