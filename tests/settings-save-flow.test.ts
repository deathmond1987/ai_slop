import test, { after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { register } from "node:module";

register(new URL("./ts-extension-resolver.mjs", import.meta.url).href, import.meta.url);

const tempDir = mkdtempSync(path.join(os.tmpdir(), "steam-calendar-settings-save-"));
const steamId = "10000000000000002";

process.env.DB_SQLITE_PATH = path.join(tempDir, "settings-save.sqlite");
process.env.DB_ENCRYPTION_KEY = "0123456789abcdef".repeat(4);

delete process.env.RAWG_API_KEY;
delete process.env.STEAM_API_KEY;

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const authStore = await import("../lib/auth-store.ts");
const pageSource = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");

test("settings page keeps each saved setting independent from remove controls", () => {
  const settingNames = ["steamApiKey", "rawgApiKey", "storeCc"];
  const formBlocks = [...pageSource.matchAll(/<form action=\{saveSettings\}[\s\S]*?<\/form>/g)].map(
    (match) => match[0]
  );
  const settingFormCount = new Map<string, number>();

  assert.ok(formBlocks.length >= settingNames.length);

  for (const block of formBlocks) {
    const settingsInBlock = settingNames.filter((name) => block.includes(`name="${name}"`));
    const hasRemoveControl = block.includes('name="remove"');

    assert.ok(settingsInBlock.length <= 1);
    assert.ok(!(settingsInBlock.length > 0 && hasRemoveControl));

    if (settingsInBlock.length === 1) {
      const settingName = settingsInBlock[0];
      assert.ok(block.includes('type="submit"'));
      settingFormCount.set(settingName, (settingFormCount.get(settingName) ?? 0) + 1);
    }
  }

  for (const settingName of settingNames) {
    assert.equal(settingFormCount.get(settingName), 1);
  }

  assert.ok(pageSource.includes('t("settings.apiKey.save")'));
  assert.ok(pageSource.includes('t("settings.rawg.save")'));
  assert.ok(pageSource.includes('t("settings.storeCc.save")'));
  assert.ok(pageSource.includes('value="steam"'));
  assert.ok(pageSource.includes('value="rawg"'));
  assert.ok(pageSource.includes('value="store"'));
});

test("sequential settings saves preserve API keys and region", async () => {
  const token = await authStore.createDbSession({ steamId });
  assert.ok(token);

  assert.equal(await authStore.saveUserSettings(steamId, { steamApiKey: "steam-key-1" }), true);
  let session = await authStore.getSteamSessionDataFromToken(token!);
  assert.equal(session?.apiKey, "steam-key-1");
  assert.equal(session?.rawgApiKey, undefined);
  assert.equal(session?.storeCc, undefined);

  assert.equal(await authStore.saveUserSettings(steamId, { storeCc: "de" }), true);
  session = await authStore.getSteamSessionDataFromToken(token!);
  assert.equal(session?.apiKey, "steam-key-1");
  assert.equal(session?.rawgApiKey, undefined);
  assert.equal(session?.storeCc, "de");

  assert.equal(await authStore.saveUserSettings(steamId, { steamApiKey: "steam-key-2" }), true);
  session = await authStore.getSteamSessionDataFromToken(token!);
  assert.equal(session?.apiKey, "steam-key-2");
  assert.equal(session?.rawgApiKey, undefined);
  assert.equal(session?.storeCc, "de");

  assert.equal(await authStore.saveUserSettings(steamId, { rawgApiKey: "rawg-key-1" }), true);
  session = await authStore.getSteamSessionDataFromToken(token!);
  assert.equal(session?.apiKey, "steam-key-2");
  assert.equal(session?.rawgApiKey, "rawg-key-1");
  assert.equal(session?.storeCc, "de");

  assert.equal(await authStore.saveUserSettings(steamId, { steamApiKey: null }), true);
  session = await authStore.getSteamSessionDataFromToken(token!);
  assert.equal(session?.apiKey, undefined);
  assert.equal(session?.rawgApiKey, "rawg-key-1");
  assert.equal(session?.storeCc, "de");

  assert.equal(await authStore.destroyDbSession(token!), true);
});
