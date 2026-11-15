import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const headerSource = readFileSync(new URL("../components/Header.tsx", import.meta.url), "utf8");
const toggleSource = readFileSync(new URL("../components/ThemeToggleButton.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
const en = JSON.parse(readFileSync(new URL("../i18n/en.json", import.meta.url), "utf8"));
const ru = JSON.parse(readFileSync(new URL("../i18n/ru.json", import.meta.url), "utf8"));

test("header theme control is a single icon toggle posting to /theme", () => {
  assert.ok(headerSource.includes("<ThemeToggleButton"));
  assert.ok(!headerSource.includes('name="theme"'));
  assert.ok(toggleSource.includes('action="/theme"'));
  assert.ok(toggleSource.includes('type="hidden"'));
  assert.ok(toggleSource.includes('name="theme"'));
  assert.equal((toggleSource.match(/<button/g) ?? []).length, 1);
  assert.ok(toggleSource.includes("onSubmit={onSubmit}"));
  assert.ok(toggleSource.includes('document.documentElement.classList.contains("dark")'));
});

test("settings expose explicit theme options for light dark and system", () => {
  assert.ok(settingsSource.includes('action="/theme"'));
  assert.ok(settingsSource.includes('method="post"'));
  assert.ok(settingsSource.includes('name="theme"'));
  assert.ok(settingsSource.includes('type="radio"'));
  assert.ok(settingsSource.includes('value: "light" as const'));
  assert.ok(settingsSource.includes('value: "dark" as const'));
  assert.ok(settingsSource.includes('value: "system" as const'));
  assert.ok(settingsSource.includes("defaultChecked={theme === option.value}"));
});

test("theme translation keys exist in both dictionaries", () => {
  for (const dict of [en, ru]) {
    assert.ok(dict["theme.toggle"]);
    assert.ok(dict["settings.theme.label"]);
    assert.ok(dict["settings.theme.help"]);
    assert.ok(dict["settings.theme.save"]);
  }
});
