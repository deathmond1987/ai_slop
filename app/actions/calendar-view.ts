"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logDebug } from "@/lib/debug";
import { saveUserCalendarView } from "@/lib/auth-store";
import { parseView, VIEW_COOKIE, type CalendarView } from "@/lib/display-mode";
import { requireSteamSession } from "@/lib/session";

export async function setCalendarView(formData: FormData) {
  const view: CalendarView = parseView(String(formData.get("view") ?? "")) ?? "grid";
  const month = String(formData.get("month") ?? "");
  const monthOk = /^\d{4}-\d{2}$/.test(month);

  const cookieStore = await cookies();
  cookieStore.set(VIEW_COOKIE, view, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });

  const session = await requireSteamSession();
  logDebug("calendarView.save", {
    view,
    cookieSaved: true,
    monthOk,
    sessionPresent: Boolean(session),
  });
  if (session) {
    await saveUserCalendarView(session.steamId, view);
  }

  const params = new URLSearchParams({ view });
  if (monthOk) params.set("month", month);
  redirect(`/calendar?${params.toString()}`);
}
