"use server";

import { redirect } from "next/navigation";
import {
  createCalendarFeedToken,
  revokeCalendarFeedToken,
} from "@/lib/auth-store";
import { logDebug } from "@/lib/debug";
import { requireSteamSession } from "@/lib/session";

export async function createCalendarFeedLink(): Promise<void> {
  const session = await requireSteamSession();
  if (!session) {
    logDebug("calendarFeed.create.session_missing");
    redirect("/auth/login");
  }

  await createCalendarFeedToken(session.steamId);
  logDebug("calendarFeed.create.done");
  redirect("/settings?feed=created");
}

export async function revokeCalendarFeedLink(): Promise<void> {
  const session = await requireSteamSession();
  if (!session) {
    logDebug("calendarFeed.revoke.session_missing");
    redirect("/auth/login");
  }

  await revokeCalendarFeedToken(session.steamId);
  logDebug("calendarFeed.revoke.done");
  redirect("/settings?feed=revoked");
}
