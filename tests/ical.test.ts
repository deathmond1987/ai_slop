import test from "node:test";
import assert from "node:assert/strict";
import { buildIcsCalendar } from "../lib/ical.ts";
import type { UpcomingGame } from "../lib/types.ts";

function game(
  appid: number,
  releaseDate: string | null,
  releaseYear?: number,
  dateSource?: UpcomingGame["dateSource"]
): UpcomingGame {
  return {
    appid,
    name: `Game ${appid}`,
    sources: ["wishlist"],
    releaseDate,
    releaseYear,
    dateSource:
      dateSource ?? (releaseDate ? "steam" : releaseYear ? "steamYear" : "unknown"),
    steamUrl: `https://store.steampowered.com/app/${appid}/`,
  };
}

test("ICS export contains only games with an exact day-and-month release date", () => {
  const ics = buildIcsCalendar(
    [
      game(101, "2026-12-03"),
      game(102, "2027-01-15", 2027),
      game(201, null, 2027),
      game(202, null),
    ],
    new Date("2026-11-03T00:00:00.000Z")
  );

  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.ok(ics.includes("SUMMARY:Game 101"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261203"));
  assert.ok(ics.includes("SUMMARY:Game 102"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20270115"));
  assert.ok(!ics.includes("Game 201"));
  assert.ok(!ics.includes("Game 202"));
  assert.ok(!ics.includes("-year-"));
  assert.ok(!ics.includes("exact release date unknown"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});
