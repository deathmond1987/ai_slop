"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { ModalShell } from "@/components/ModalShell";

export function CalendarSubscriptionModalTrigger({
  label,
  title,
  closeLabel,
  initialOpen = false,
  clearHref,
  children,
}: {
  label: string;
  title: string;
  closeLabel: string;
  initialOpen?: boolean;
  clearHref?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const close = useCallback(() => {
    setOpen(false);
    if (clearHref) router.replace(clearHref, { scroll: false });
  }, [clearHref, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="calendar-subscription-trigger"
      >
        {label}
      </button>
      {open ? (
        <ModalShell
          title={title}
          titleId="calendar-subscription-title"
          closeLabel={closeLabel}
          contentClassName="mt-3 flex flex-col gap-2"
          onClose={close}
        >
          {children}
        </ModalShell>
      ) : null}
    </>
  );
}
