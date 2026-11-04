import "server-only";
import { cookies } from "next/headers";
import { getUserPreferences } from "./auth-store";

export type CalendarView = "grid" | "list";

export const VIEW_COOKIE = "calendar_view";

export function parseView(raw: string | string[] | undefined): CalendarView | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "grid" || value === "list") return value;
  return null;
}

export async function getCalendarView(steamId?: string): Promise<CalendarView> {
  const raw = (await cookies()).get(VIEW_COOKIE)?.value;
  const parsed = parseView(raw);
  if (parsed) return parsed;

  if (steamId) {
    const prefs = await getUserPreferences(steamId);
    if (prefs?.calendarView) return prefs.calendarView;
  }

  return "grid";
}
