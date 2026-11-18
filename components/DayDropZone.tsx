"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { markDropHandled } from "./drag-drop-state";

export const DRAG_MIME = "application/x-steam-calendar-game";

export interface DragGamePayload {
  appid: number;
  name: string;
  headerImage?: string;
}

export function readDragGame(dataTransfer: DataTransfer): DragGamePayload | null {
  const raw = dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DragGamePayload;
    return Number.isSafeInteger(parsed?.appid) && parsed.appid > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** Drops an Early Access game onto a calendar day to set its release date. */
export function DayDropZone({
  iso,
  className,
  children,
}: {
  iso: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <div
      className={[className, over ? "is-drop-target" : "", saving ? "is-drop-saving" : ""]
        .filter(Boolean)
        .join(" ")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const game = readDragGame(e.dataTransfer);
        setOver(false);
        if (!game || saving) return;
        e.preventDefault();
        markDropHandled();
        setSaving(true);
        void fetch("/api/release-date", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...game, releaseDate: iso }),
        })
          .then((response) => {
            if (response.ok) router.refresh();
          })
          .finally(() => setSaving(false));
      }}
    >
      {children}
    </div>
  );
}
