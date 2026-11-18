import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";

register(new URL("./ts-extension-resolver.mjs", import.meta.url).href, import.meta.url);

const tempDir = mkdtempSync(path.join(os.tmpdir(), "steam-calendar-cache-bulk-"));
const originalDbSqlitePath = process.env.DB_SQLITE_PATH;
process.env.DB_SQLITE_PATH = path.join(tempDir, "cache-bulk.sqlite");

test("cacheGetMany and cacheSetMany round-trip values and skip expired entries", async () => {
  const { cacheGetMany, cacheSetMany } = await import("../lib/cache-store.ts");

  await cacheSetMany([
    { key: "bulk:a", value: { n: 1 }, ttlMs: 60_000 },
    { key: "bulk:b", value: { n: 2 }, ttlMs: 60_000 },
    { key: "bulk:expired", value: { n: 3 }, ttlMs: 1 },
  ]);

  const found = await cacheGetMany(["bulk:a", "bulk:b", "bulk:expired", "bulk:missing"]);
  assert.deepEqual(found.get("bulk:a"), { n: 1 });
  assert.deepEqual(found.get("bulk:b"), { n: 2 });
  assert.equal(found.has("bulk:missing"), false);

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await cacheGetMany(["bulk:expired"])).has("bulk:expired"), false);
});

test("bulk delete SQL builders keep one placeholder per appid", async () => {
  const { earlyAccessBlacklistDeleteManySql } = await import("../lib/early-access-core.ts");
  const { manualReleaseDatesDeleteManySql } = await import("../lib/manual-release-dates-core.ts");

  assert.equal(
    earlyAccessBlacklistDeleteManySql(3),
    "DELETE FROM early_access_blacklist WHERE steam_id = ? AND appid IN (?,?,?)"
  );
  assert.equal(
    manualReleaseDatesDeleteManySql(2),
    "DELETE FROM manual_release_dates WHERE steam_id = ? AND appid IN (?,?)"
  );
  assert.match(earlyAccessBlacklistDeleteManySql(0), /IN \(\?\)/);
});

test.after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (originalDbSqlitePath === undefined) delete process.env.DB_SQLITE_PATH;
  else process.env.DB_SQLITE_PATH = originalDbSqlitePath;
});
