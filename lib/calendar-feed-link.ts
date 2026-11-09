export function calendarFeedPath(token: string): string {
  return `/calendar/ics?token=${encodeURIComponent(token)}`;
}

export function calendarFeedUrl(origin: string, token: string): string {
  return `${origin}${calendarFeedPath(token)}`;
}

export function googleCalendarImportUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`;
}
