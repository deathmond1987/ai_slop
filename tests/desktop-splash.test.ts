import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const splashSource = readFileSync(new URL("../desktop/web/index.html", import.meta.url), "utf8");

test("desktop splash shows launching state with animation instead of sidecar details", () => {
  assert.ok(!splashSource.includes("Starting the local app sidecar."));
  assert.ok(!splashSource.includes("Connected to port "));
  assert.ok(!splashSource.includes("Sidecar status: "));
  assert.ok(!/statusEl\.textContent\s*=\s*[^;]*127\.0\.0\.1/.test(splashSource));
  assert.ok(splashSource.includes("Application is launching..."));
  assert.ok(splashSource.includes("Приложение запускается..."));
  assert.ok(splashSource.includes('class="launcher-spinner"'));
  assert.ok(splashSource.includes('class="launcher-spinner-core"'));
  assert.ok(splashSource.includes("@keyframes launch-spin"));
  assert.ok(splashSource.includes("@keyframes launch-pulse"));
  assert.ok(
    /<div class="launcher">\s*<div class="launcher-copy">[\s\S]*?<\/div>\s*<div class="launcher-spinner"/.test(
      splashSource
    )
  );
});
