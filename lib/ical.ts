import type { UpcomingGame } from "./types.ts";
import { buildByDateMap, buildDateGroups } from "./calendar.ts";

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;

  const lines: string[] = [];
  let current = "";
  let currentLength = 0;
  let first = true;

  for (const ch of Array.from(line)) {
    const chLength = Buffer.byteLength(ch, "utf8");
    const limit = first ? 75 : 74;

    if (currentLength + chLength > limit) {
      lines.push(current);
      current = ` ${ch}`;
      currentLength = 1 + chLength;
      first = false;
      continue;
    }

    current += ch;
    currentLength += chLength;
  }

  if (current) lines.push(current);
  return lines.join("\r\n");
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const FULL_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hasExactReleaseDate(game: UpcomingGame): boolean {
  return typeof game.releaseDate === "string" && FULL_ISO_DATE_RE.test(game.releaseDate);
}

function sourceLabel(game: UpcomingGame): string {
  if (game.dateSource === "steam") return "Steam";
  if (game.dateSource === "steamYear") return "Steam (year only)";
  if (game.dateSource === "rawg") return game.dateSourceUrl ?? "RAWG";
  return "Unknown";
}

export function buildIcsCalendar(games: UpcomingGame[], generatedAt = new Date()): string {
  const stamp = icsStamp(generatedAt);
  const groups = buildDateGroups(buildByDateMap(games.filter(hasExactReleaseDate)));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Steam Calendar//Upcoming Releases//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Steam Calendar",
    "X-WR-CALDESC:Upcoming Steam releases with exact release dates",
    "X-WR-TIMEZONE:UTC",
  ];

  for (const group of groups) {
    for (const game of group.games) {
      const descriptionParts = [
        `Steam: ${game.steamUrl}`,
        `Date source: ${sourceLabel(game)}`,
      ];

      if (game.sources.includes("wishlist")) descriptionParts.push("Source: wishlist");
      if (game.sources.includes("library")) descriptionParts.push("Source: library");
      if (game.developer) descriptionParts.push(`Developer: ${game.developer}`);
      if (game.publisher) descriptionParts.push(`Publisher: ${game.publisher}`);
      if (game.genres?.length) descriptionParts.push(`Genres: ${game.genres.join(", ")}`);

      lines.push(
        "BEGIN:VEVENT",
        `UID:steam-calendar-${game.appid}-${group.iso}@steamcalendar`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(group.iso)}`,
        `SUMMARY:${escapeIcs(game.name)}`,
        `DESCRIPTION:${escapeIcs(descriptionParts.join("\n"))}`,
        `URL:${escapeIcs(encodeURI(game.steamUrl))}`,
        "END:VEVENT"
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
