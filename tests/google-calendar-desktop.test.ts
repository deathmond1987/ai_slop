import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actionSource = readFileSync(
  new URL("../app/actions/calendar-feed.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../app/calendar/page.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);
const desktopLinksSource = readFileSync(
  new URL("../components/DesktopExternalLinks.tsx", import.meta.url),
  "utf8",
);
const capabilities = JSON.parse(
  readFileSync(
    new URL("../desktop_version/linux/src-tauri/capabilities/default.json", import.meta.url),
    "utf8",
  ),
);
const en = JSON.parse(readFileSync(new URL("../i18n/en.json", import.meta.url), "utf8"));
const ru = JSON.parse(readFileSync(new URL("../i18n/ru.json", import.meta.url), "utf8"));

test("calendar feed creation redirects to a local calendar page instead of Google", () => {
  assert.ok(!actionSource.includes("redirect(googleCalendarImportUrl"));
  assert.ok(actionSource.includes('params.set("openGoogle", "1")'));
  assert.ok(actionSource.includes('redirectFeedLink("created", formData, true)'));
});

test("calendar page renders local Google-open panel with app back link", () => {
  assert.ok(pageSource.includes('const openGoogle = openGoogleParam === "1"'));
  assert.ok(pageSource.includes("calendarBackPath"));
  assert.ok(pageSource.includes('href={calendarBackPath}'));
  assert.ok(pageSource.includes('t("calendar.google.back")'));
  assert.ok(pageSource.includes('t("calendar.google.open")'));
  assert.ok(pageSource.includes('data-external="true"'));
  assert.ok(pageSource.includes('data-external={googleUrl ? "true" : undefined}'));
});

test("layout mounts desktop external link interceptor", () => {
  assert.ok(layoutSource.includes('import { DesktopExternalLinks } from "@/components/DesktopExternalLinks"'));
  assert.ok(layoutSource.includes("<DesktopExternalLinks />"));
});

test("desktop interceptor opens only marked external links through Tauri shell", () => {
  assert.ok(desktopLinksSource.includes('window.__TAURI__?.shell?.open'));
  assert.ok(desktopLinksSource.includes('a[data-external="true"]'));
  assert.ok(desktopLinksSource.includes('document.addEventListener("click", onClick, true)'));
  assert.ok(desktopLinksSource.includes("openExternal(url.toString())"));
  assert.ok(desktopLinksSource.includes("event.preventDefault()"));
});

test("desktop Tauri capabilities allow shell open for http links", () => {
  assert.ok(capabilities.permissions.includes("shell:default"));
});

test("google calendar desktop translation keys exist in both dictionaries", () => {
  for (const dict of [en, ru]) {
    assert.ok(dict["calendar.google.help"]);
    assert.ok(dict["calendar.google.open"]);
    assert.ok(dict["calendar.google.back"]);
  }
});
