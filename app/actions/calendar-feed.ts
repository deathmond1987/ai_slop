"use server";

import { redirect } from "next/navigation";
import {
  createCalendarFeedToken,
  revokeCalendarFeedToken,
} from "@/lib/auth-store";
import { logDebug } from "@/lib/debug";
import { parseView } from "@/lib/display-mode";
import { requireSteamSession } from "@/lib/session";

function monthFromFormData(formData: FormData): string | undefined {
  const raw = formData.get("month");
  if (typeof raw !== "string" || !/^\d{4}-\d{2}$/.test(raw)) return undefined;
  const month = Number(raw.slice(5, 7));
  return month >= 1 && month <= 12 ? raw : undefined;
}

function viewFromFormData(formData: FormData): "grid" | "list" {
  const raw = formData.get("view");
  return parseView(typeof raw === "string" ? raw : undefined) ?? "grid";
}

function redirectFeedLink(
  status: "created" | "revoked",
  formData: FormData,
  openGoogle = false,
): never {
  const params = new URLSearchParams({ feed: status });
  const month = monthFromFormData(formData);
  if (month) params.set("month", month);
  params.set("view", viewFromFormData(formData));
  if (openGoogle) params.set("openGoogle", "1");
  redirect(`/calendar?${params.toString()}`);
}

export async function createCalendarFeedLink(formData: FormData): Promise<void> {
  const session = await requireSteamSession();
  if (!session) {
    logDebug("calendarFeed.create.session_missing");
    redirect("/auth/login");
  }

  const token = await createCalendarFeedToken(session.steamId);
  if (!token) {
    logDebug("calendarFeed.create.token_failed");
    redirectFeedLink("created", formData);
  }

  logDebug("calendarFeed.create.done");
  redirectFeedLink("created", formData, true);
}

export async function revokeCalendarFeedLink(formData: FormData): Promise<void> {
  const session = await requireSteamSession();
  if (!session) {
    logDebug("calendarFeed.revoke.session_missing");
    redirect("/auth/login");
  }

  await revokeCalendarFeedToken(session.steamId);
  logDebug("calendarFeed.revoke.done");
  redirectFeedLink("revoked", formData);
}
