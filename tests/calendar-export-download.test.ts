import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const icsRouteSource = readFileSync(
  new URL("../app/calendar/ics/route.ts", import.meta.url),
  "utf8",
);
const exportButtonSource = readFileSync(
  new URL("../components/CalendarExportButton.tsx", import.meta.url),
  "utf8",
);
const subscriptionMenuSource = readFileSync(
  new URL("../components/CalendarSubscriptionMenu.tsx", import.meta.url),
  "utf8",
);
const sidecarCapabilities = JSON.parse(
  readFileSync(
    new URL("../desktop/src-tauri/capabilities/sidecar.json", import.meta.url),
    "utf8",
  ),
);
const mainRsSource = readFileSync(
  new URL("../desktop/src-tauri/src/main.rs", import.meta.url),
  "utf8",
);
const exportRsSource = readFileSync(
  new URL("../desktop/src-tauri/src/export.rs", import.meta.url),
  "utf8",
);

test("calendar ics route returns attachment download disposition", () => {
  assert.ok(icsRouteSource.includes('content-disposition": "attachment; filename=steam-calendar.ics"'));
  assert.ok(!icsRouteSource.includes('content-disposition": "inline; filename=steam-calendar.ics"'));
});

test("calendar export button saves ICS through Tauri when available", () => {
  assert.ok(exportButtonSource.includes("window.__TAURI__?.core?.invoke"));
  assert.ok(exportButtonSource.includes('invoke("save_calendar_export"'));
  assert.ok(exportButtonSource.includes('filename: "steam-calendar.ics"'));
  assert.ok(exportButtonSource.includes("BEGIN:VCALENDAR"));
  assert.ok(exportButtonSource.includes('href={href}'));
  assert.ok(exportButtonSource.includes("download"));
});

test("calendar subscription menu uses the Tauri-aware export button", () => {
  assert.ok(subscriptionMenuSource.includes('import { CalendarExportButton } from "@/components/CalendarExportButton"'));
  assert.ok(subscriptionMenuSource.includes("<CalendarExportButton"));
  assert.ok(subscriptionMenuSource.includes('label={t("calendar.export.ics")}'));
});

test("sidecar remote WebView can invoke core commands for desktop export", () => {
  assert.ok(sidecarCapabilities.permissions.includes("core:default"));
  assert.ok(sidecarCapabilities.permissions.includes("shell:allow-open"));
});

test("desktop Rust exposes a safe calendar export save command", () => {
  assert.ok(mainRsSource.includes("mod export;"));
  assert.ok(mainRsSource.includes("save_calendar_export"));
  assert.ok(exportRsSource.includes("#[tauri::command]"));
  assert.ok(exportRsSource.includes("pub fn save_calendar_export"));
  assert.ok(exportRsSource.includes("DEFAULT_EXPORT_NAME"));
});
