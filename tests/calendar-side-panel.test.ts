import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("calendar side state is encoded in the query and preserved through view switching", () => {
  const displayCore = read("lib/display-mode-core.ts");
  const display = read("lib/display-mode.ts");
  const action = read("app/actions/calendar-view.ts");
  const toggle = read("components/CalendarViewToggle.tsx");
  const page = read("app/calendar/page.tsx");

  assert.match(displayCore, /export type CalendarSide = "tbd" \| "earlyAccess";/);
  assert.match(
    displayCore,
    /if \(value === "early-access" \|\| value === "earlyAccess" \|\| value === "ea"\) return "earlyAccess";/
  );
  assert.match(displayCore, /return side === "earlyAccess" \? "early-access" : "tbd";/);
  assert.match(display, /export \{[\s\S]*parseCalendarSide[\s\S]*\} from "\.\/display-mode-core";/);

  assert.match(action, /const side = parseCalendarSide\(String\(formData\.get\("side"\) \?\? ""\)\);/);
  assert.match(action, /new URLSearchParams\(\{ view, side: calendarSideQueryValue\(side\) \}\)/);

  assert.match(toggle, /<input type="hidden" name="side" value=\{calendarSideQueryValue\(side\)\} \/>/);
  assert.match(toggle, /name="view" value="grid"[\s\S]*\{t\("calendar\.title"\)\}/);
  assert.match(toggle, /\{t\("calendar\.view\.list"\)\}/);

  assert.match(page, /const side = parseCalendarSide\(sp\.side\);/);
  assert.match(page, /<h1 className="sr-only">\{t\("calendar\.title"\)\}<\/h1>[\s\S]*<CalendarViewToggle/);
  assert.match(
    page,
    /<CalendarViewToggle[\s\S]*?lang=\{lang\}[\s\S]*?view=\{view\}[\s\S]*?side=\{side\}/
  );
  // The counter must stream inside Suspense so the header is not blocked.
  assert.match(page, /<Suspense fallback=\{null\}>[\s\S]*<CalendarUpcomingCount/);
  assert.match(page, /<CalendarFeed session=\{session\} lang=\{lang\} view=\{view\} side=\{side\}/);
  assert.doesNotMatch(page, /import \{ calendarSideQueryValue,/);
});

test("calendar feed renders without waiting for early access and lets the side panel load it client-side", () => {
  const feed = read("components/CalendarFeed.tsx");
  const panel = read("components/CalendarSidePanel.tsx");
  const route = read("app/api/early-access/route.ts");

  assert.doesNotMatch(feed, /getEarlyAccessSessionResult/);
  assert.match(
    feed,
    /const (?:collected|result) = await collectUpcoming\(session, session\.rawgApiKey \?\? process\.env\.RAWG_API_KEY\);/
  );
  assert.match(feed, /mergeManualReleaseDates\(collected\.games, manualEntries\)/);
  assert.match(
    feed,
    /const query: Record<string, string \| number> = \{[\s\S]*side: calendarSideQueryValue\(side\),/
  );
  assert.match(
    feed,
    /<CalendarSidePanel[\s\S]*side=\{side\}[\s\S]*tbdGames=\{tbd\}/
  );
  assert.doesNotMatch(feed, /earlyAccessGames=/);

  assert.match(panel, /"use client"/);
  assert.match(panel, /fetch\("\/api\/early-access"/);
  assert.match(panel, /getEarlyAccessSessionSnapshot|earlyAccessLoading|calendar-side-tab-spinner/);
  assert.match(panel, /earlyAccessGameToUpcoming/);
  assert.match(route, /getEarlyAccessSessionSnapshot/);
  assert.match(route, /getEarlyAccessSessionResult/);
});

test("calendar side panel exposes horizontal no-date and early-access tabs without losing month/view state", () => {
  const panel = read("components/CalendarSidePanel.tsx");

  assert.doesNotMatch(panel, /role="group"/);
  assert.match(panel, /<nav className="calendar-side-tabs" aria-label=\{t\("calendar\.sidePanel\.label"\)\}>/);
  assert.match(
    panel,
    /const params = new URLSearchParams\(\{\s*month: monthValue,\s*view,\s*side: calendarSideQueryValue\(nextSide\),/
  );
  assert.match(panel, /hrefFor\("tbd"\)/);
  assert.match(panel, /hrefFor\("earlyAccess"\)/);
  assert.match(panel, /hrefFor\("tbd"\)[\s\S]*aria-current=\{side === "tbd" \? "page" : undefined\}/);
  assert.match(panel, /hrefFor\("earlyAccess"\)[\s\S]*aria-current=\{side === "earlyAccess" \? "page" : undefined\}/);
  assert.match(panel, /side === "earlyAccess" \? \([\s\S]*<EarlyAccessSection/);
  assert.match(panel, /\) : \([\s\S]*<TBDSection/);
  assert.match(
    panel,
    /<span className="calendar-side-tab-label">\{t\("calendar\.sideTab\.tbd"\)\}<\/span>\s*<span className="calendar-side-tab-count">\{tbdGames\.length\}<\/span>/
  );
  assert.match(
    panel,
    /<span className="calendar-side-tab-label">\{t\("calendar\.sideTab\.earlyAccess"\)\}<\/span>\s*<span className="calendar-side-tab-count" aria-live="polite">/
  );
  assert.match(panel, /calendar-side-tab-spinner/);
  assert.match(panel, /earlyAccessLoading \? \([\s\S]*calendar-side-tab-spinner[\s\S]*\) : \(\s*earlyAccessGames\.length\s*\)/);
});

test("early access side section mirrors the no-date compact grid and compact cards", () => {
  const earlyAccess = read("components/EarlyAccessSection.tsx");
  const tbd = read("components/TBDSection.tsx");

  for (const source of [earlyAccess, tbd]) {
    assert.match(source, /className="calendar-side-section flex min-w-0 flex-col gap-1"/);
    assert.match(source, /const singleColumn = games\.length <= 8;/);
    assert.match(source, /const rows = singleColumn \? games\.length : Math\.ceil\(games\.length \/ 2\);/);
    assert.match(source, /<FitBlock rows=\{rows\} className="min-w-0">/);
    assert.match(source, /className=\{`compact-grid tbd-grid fit h-full\$\{singleColumn \? " single-column" : ""\}`\}/);
    assert.match(source, /variant="compact"/);
    assert.doesNotMatch(source, /<h2/);
  }

  assert.match(earlyAccess, /key=\{`early-access-\$\{g\.appid\}`\}/);
  assert.doesNotMatch(earlyAccess, /t\("calendar\.earlyAccess\.title"\)/);
  assert.match(earlyAccess, /t\("calendar\.earlyAccess\.empty"\)/);
  assert.match(earlyAccess, /loading = false/);
  assert.match(tbd, /key=\{`tbd-\$\{g\.appid\}`\}/);
  assert.doesNotMatch(tbd, /t\("calendar\.tbd\.title"\)/);

  assert.match(
    read("components/CalendarSidePanel.tsx"),
    /title=\{t\("calendar\.earlyAccess\.title"\)\}/
  );
  assert.match(
    read("components/CalendarSidePanel.tsx"),
    /title=\{t\("calendar\.tbd\.title"\)\}/
  );

  assert.match(
    read("app/globals.css"),
    /\.compact-grid\.tbd-grid\.single-column\s*{[^}]*grid-template-columns: minmax\(0, 1fr\);/
  );
});

test("side panel layout styles place both tabs horizontally and keep the section inside the fitted aside height", () => {
  const globals = read("app/globals.css");
  const tabsRule = globals.match(/\.calendar-side-tabs\s*{[^}]*}/)?.[0] ?? "";
  const tabLinkRule = globals.match(/\.calendar-side-tabs > a\s*{[^}]*}/)?.[0] ?? "";
  const tabCountRule = globals.match(/\.calendar-side-tab-count\s*{[^}]*}/)?.[0] ?? "";
  const activeTabCountRule =
    globals.match(/\.calendar-side-tabs > a\[aria-current="page"\] > \.calendar-side-tab-count\s*{[^}]*}/)?.[0] ?? "";
  const panelRule = globals.match(/\.calendar-side-panel\s*{[^}]*}/)?.[0] ?? "";

  assert.match(tabsRule, /display: flex;/);
  assert.match(tabsRule, /align-items: center;/);
  assert.match(tabLinkRule, /flex: 1 1 50%;/);
  assert.match(tabLinkRule, /display: flex;/);
  assert.match(tabLinkRule, /text-align: center;/);
  assert.match(tabCountRule, /border-left: 1px solid/);
  assert.match(tabCountRule, /color: var\(--side-tab-count-color, #52525b\);/);
  assert.match(activeTabCountRule, /border-left-color: var\(--side-tab-divider-active, rgba\(255, 255, 255, 0\.55\)\);/);
  assert.match(activeTabCountRule, /color: var\(--side-tab-count-active-color, #dbeafe\);/);
  assert.match(panelRule, /gap: var\(--fit-bottom-offset, 53px\);/);
  assert.match(
    globals,
    /html\.calendar-fit-viewport main \.calendar-feed-with-tbd > aside > div \{[\s\S]*gap: var\(--fit-bottom-offset, 53px\);/
  );
  assert.match(
    globals,
    /html\.calendar-fit-viewport main \.calendar-feed-with-tbd > aside > div \{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);/
  );
  assert.match(
    globals,
    /html\.calendar-fit-viewport main \.calendar-feed-with-tbd > aside > div > \.calendar-side-section \{[\s\S]*height: 100%;/
  );
  const sideSectionRule =
    globals.match(
      /html\.calendar-fit-viewport main \.calendar-feed-with-tbd > aside > div > \.calendar-side-section \{[^}]*\}/
    )?.[0] ?? "";
  assert.match(sideSectionRule, /grid-template-rows: minmax\(0, 1fr\);/);
  assert.doesNotMatch(sideSectionRule, /grid-template-rows: auto minmax\(0, 1fr\);/);
  assert.match(
    globals,
    /html\.calendar-fit-viewport main \.calendar-side-section > \[data-fit-block\] \{[\s\S]*height: 100% !important;/
  );
});

test("side panel labels and early access section labels exist in both dictionaries", () => {
  const keys = [
    "calendar.sidePanel.label",
    "calendar.sideTab.tbd",
    "calendar.sideTab.earlyAccess",
    "calendar.earlyAccess.title",
    "calendar.earlyAccess.empty",
  ];
  const ru = JSON.parse(read("i18n/ru.json"));
  const en = JSON.parse(read("i18n/en.json"));

  for (const key of keys) {
    assert.equal(typeof ru[key], "string");
    assert.ok(ru[key].trim().length > 0, `${key} is empty in ru.json`);
    assert.equal(typeof en[key], "string");
    assert.ok(en[key].trim().length > 0, `${key} is empty in en.json`);
  }

  assert.equal(en["calendar.sideTab.tbd"], "No release date");
  assert.equal(ru["calendar.sideTab.tbd"], "Без даты выхода");
});
