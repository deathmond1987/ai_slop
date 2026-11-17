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
const subscriptionMenuSource = readFileSync(
  new URL("../components/CalendarSubscriptionMenu.tsx", import.meta.url),
  "utf8",
);
const subscriptionTriggerSource = readFileSync(
  new URL("../components/CalendarSubscriptionModalTrigger.tsx", import.meta.url),
  "utf8",
);
const modalShellSource = readFileSync(
  new URL("../components/ModalShell.tsx", import.meta.url),
  "utf8",
);
const wishlistModalSource = readFileSync(
  new URL("../components/WishlistDiscountsModal.tsx", import.meta.url),
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
    new URL("../desktop/src-tauri/capabilities/default.json", import.meta.url),
    "utf8",
  ),
);
const sidecarCapabilities = JSON.parse(
  readFileSync(
    new URL("../desktop/src-tauri/capabilities/sidecar.json", import.meta.url),
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

test("subscription feedback renders inside the subscription modal, not on the calendar page", () => {
  assert.ok(pageSource.includes('const openGoogle = openGoogleParam === "1"'));
  assert.ok(pageSource.includes("feedStatus={feedStatus}"));
  assert.ok(pageSource.includes("openGoogle={openGoogle}"));
  assert.ok(!pageSource.includes('t("calendar.feed.flash.created")'));
  assert.ok(!pageSource.includes('t("calendar.feed.flash.revoked")'));
  assert.ok(!pageSource.includes('t("calendar.google.open")'));
  assert.ok(!pageSource.includes('t("calendar.google.back")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.feed.flash.created")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.feed.flash.revoked")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.google.help")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.google.open")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.google.back")'));
  assert.ok(subscriptionMenuSource.includes("href={calendarBackPath}"));
  assert.ok(subscriptionMenuSource.includes('data-external="true"'));
  assert.ok(
    subscriptionMenuSource.includes(
      'initialOpen={feedStatus === "created" || feedStatus === "revoked"}',
    ),
  );
});

test("subscription modal stays open after create and revoke submit", () => {
  assert.ok(subscriptionTriggerSource.includes("useState(initialOpen)"));
  assert.ok(subscriptionMenuSource.includes('key={feedStatus ?? "subscription"}'));
  assert.ok(!subscriptionTriggerSource.includes("useEffect"));
  assert.ok(subscriptionTriggerSource.includes("router.replace(clearHref"));
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

test("sidecar remote Tauri capability allows local WebView external links", () => {
  assert.ok(sidecarCapabilities.windows.includes("main"));
  assert.ok(sidecarCapabilities.remote.urls.includes("http://127.0.0.1:*"));
  assert.ok(sidecarCapabilities.remote.urls.includes("http://localhost:*"));
  assert.ok(sidecarCapabilities.permissions.includes("shell:allow-open"));
});

test("calendar page uses a unified subscription menu", () => {
  assert.ok(pageSource.includes("<CalendarSubscriptionMenu"));
  assert.ok(subscriptionMenuSource.includes('t("calendar.subscribe.menu")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.subscribe.google")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.subscribe.ics")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.export.ics")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.subscribe.create")'));
  assert.ok(subscriptionMenuSource.includes('t("calendar.feed.noToken")'));
  assert.ok(subscriptionMenuSource.includes('action={createCalendarFeedLink}'));
  assert.ok(subscriptionMenuSource.includes('action={revokeCalendarFeedLink}'));
  assert.ok(subscriptionMenuSource.includes('data-external="true"'));
});

test("calendar subscription button opens the wishlist-style modal shell", () => {
  assert.ok(subscriptionMenuSource.includes("<CalendarSubscriptionModalTrigger"));
  assert.ok(subscriptionMenuSource.includes('closeLabel={t("modal.close")}'));
  assert.ok(!subscriptionMenuSource.includes("<details"));
  assert.ok(subscriptionTriggerSource.includes("<ModalShell"));
  assert.ok(subscriptionTriggerSource.includes('aria-haspopup="dialog"'));
  assert.ok(wishlistModalSource.includes("<ModalShell"));
  assert.ok(modalShellSource.includes('wishlist-modal-panel fixed left-1/2 top-1/2'));
  assert.ok(modalShellSource.includes("aria-modal=\"true\""));
});

test("google calendar desktop translation keys exist in both dictionaries", () => {
  for (const dict of [en, ru]) {
    assert.ok(dict["calendar.google.help"]);
    assert.ok(dict["calendar.google.open"]);
    assert.ok(dict["calendar.google.back"]);
    assert.ok(dict["calendar.subscribe.menu"]);
    assert.ok(dict["calendar.subscribe.create"]);
    assert.ok(dict["calendar.feed.noToken"]);
  }
});
