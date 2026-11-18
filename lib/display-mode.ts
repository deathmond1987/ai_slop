import "server-only";
import { cookies } from "next/headers";
import { getUserPreferences } from "./auth-store";
import {
  VIEW_COOKIE,
  parseView,
  type CalendarView,
} from "./display-mode-core";

export {
  VIEW_COOKIE,
  parseView,
  parseCalendarSide,
  calendarSideQueryValue,
  type CalendarView,
  type CalendarSide,
} from "./display-mode-core";

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
