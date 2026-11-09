import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarFeedPath,
  calendarFeedUrl,
  googleCalendarImportUrl,
} from "../lib/calendar-feed-link.ts";

test("calendar feed path encodes token", () => {
  assert.equal(calendarFeedPath("abc+/="), "/calendar/ics?token=abc%2B%2F%3D");
});

test("calendar feed url uses external origin", () => {
  assert.equal(
    calendarFeedUrl("http://localhost:3000", "abc"),
    "http://localhost:3000/calendar/ics?token=abc"
  );
});

test("google calendar import url encodes feed url", () => {
  assert.equal(
    googleCalendarImportUrl("http://localhost:3000/calendar/ics?token=abc"),
    "https://calendar.google.com/calendar/r?cid=http%3A%2F%2Flocalhost%3A3000%2Fcalendar%2Fics%3Ftoken%3Dabc"
  );
});
