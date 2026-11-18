export type CalendarView = "grid" | "list";
export type CalendarSide = "tbd" | "earlyAccess";

export const VIEW_COOKIE = "calendar_view";

export function parseView(raw: string | string[] | undefined): CalendarView | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "grid" || value === "list") return value;
  return null;
}

export function parseCalendarSide(raw: string | string[] | undefined): CalendarSide {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "early-access" || value === "earlyAccess" || value === "ea") return "earlyAccess";
  return "tbd";
}

export function calendarSideQueryValue(side: CalendarSide): "tbd" | "early-access" {
  return side === "earlyAccess" ? "early-access" : "tbd";
}
