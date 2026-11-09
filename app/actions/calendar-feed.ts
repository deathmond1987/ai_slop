"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createCalendarFeedToken,
  revokeCalendarFeedToken,
} from "@/lib/auth-store";
import {
  calendarFeedUrl,
  googleCalendarImportUrl,
} from "@/lib/calendar-feed-link";
import { logDebug } from "@/lib/debug";
import { parseView } from "@/lib/display-mode";
import { getExternalOriginFromHeaders } from "@/lib/requestOrigin";
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

function redirectFeedLink(status: "created" | "revoked", formData: FormData): never {
  const params = new URLSearchParams({ feed: status });
  const month = monthFromFormData(formData);
  if (month) params.set("month", month);
  params.set("view", viewFromFormData(formData));
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

  const origin = getExternalOriginFromHeaders(await headers());
  const feedUrl = origin ? calendarFeedUrl(origin, token) : undefined;
  if (feedUrl) {
    logDebug("calendarFeed.create.google_redirect", { hasOrigin: true });
    redirect(googleCalendarImportUrl(feedUrl));
  }

  logDebug("calendarFeed.create.done", { hasOrigin: false });
  redirectFeedLink("created", formData);
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
