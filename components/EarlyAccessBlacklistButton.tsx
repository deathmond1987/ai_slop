"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { EarlyAccessBlacklistEntry } from "@/lib/early-access-core";
import { formatTemplate, tFor } from "@/lib/i18n-core";
import type { Lang } from "@/lib/types";
import { ModalShell } from "./ModalShell";

type LoadState = "idle" | "loading" | "ready" | "failed";

function EarlyAccessBlacklistModal({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = tFor(lang);
  const [entries, setEntries] = useState<EarlyAccessBlacklistEntry[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/early-access/blacklist", { cache: "no-store" });
      const data = (await response.json()) as { ok?: boolean; entries?: EarlyAccessBlacklistEntry[] };
      if (!response.ok || !data.ok) throw new Error("load failed");
      setEntries(data.entries ?? []);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on open
    void load();
  }, [load]);

  const toggle = (appid: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appid)) next.delete(appid);
      else next.add(appid);
      return next;
    });
  };

  const allSelected = entries.length > 0 && selected.size === entries.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.appid)));
  };

  const unblock = async () => {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/early-access/blacklist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appids: [...selected] }),
      });
      if (!response.ok) throw new Error("unblock failed");
      onClose();
    } catch {
      setState("failed");
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={t("settings.blacklist.title")}
      titleId="early-access-blacklist-title"
      closeLabel={t("modal.close")}
      subtitle={t("settings.blacklist.help")}
      contentClassName="mt-3 flex flex-col gap-2"
      onClose={onClose}
    >
      {state === "loading" ? (
        <p className="text-xs opacity-70">{t("settings.blacklist.loading")}</p>
      ) : state === "failed" ? (
        <p className="text-xs text-red-600 dark:text-red-400">{t("settings.blacklist.failed")}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs opacity-70">{t("settings.blacklist.empty")}</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            {t("settings.blacklist.selectAll")}
          </label>
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.appid}>
                <label className="flex cursor-pointer items-center gap-2 rounded border border-zinc-300 p-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <input
                    type="checkbox"
                    checked={selected.has(entry.appid)}
                    onChange={() => toggle(entry.appid)}
                  />
                  {entry.headerImage ? (
                    <Image
                      src={entry.headerImage}
                      alt=""
                      width={92}
                      height={43}
                      className="h-[43px] w-[92px] shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="h-[43px] w-[92px] shrink-0 rounded bg-zinc-200 dark:bg-zinc-800" />
                  )}
                  <span className="min-w-0 truncate">{entry.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void unblock()}
              disabled={selected.size === 0 || saving}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {formatTemplate(t("settings.blacklist.unblock"), { count: selected.size })}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

export function EarlyAccessBlacklistButton({ lang }: { lang: Lang }) {
  const t = tFor(lang);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button type="button" className="settings-blacklist-btn" onClick={() => setOpen(true)}>
        {t("settings.blacklist.open")}
      </button>
      {open ? <EarlyAccessBlacklistModal lang={lang} onClose={close} /> : null}
    </>
  );
}
