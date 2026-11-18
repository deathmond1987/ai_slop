import assert from "node:assert/strict";
import test from "node:test";
import {
  STEAM_GET_ITEMS_BATCH_MAX,
  buildGetItemsUrl,
  chunkAppids,
  parseGetItemsEarlyAccess,
} from "../lib/early-access-getitems-core.ts";

test("chunkAppids dedupes, drops invalid ids and respects the Steam batch cap", () => {
  const ids = Array.from({ length: 600 }, (_, i) => i + 1);
  const chunks = chunkAppids([...ids, 5, -1, 0, 1.5]);
  assert.deepEqual(chunks.map((c) => c.length), [200, 200, 200]);
  assert.equal(STEAM_GET_ITEMS_BATCH_MAX, 200);
  assert.equal(new Set(chunks.flat()).size, 600);
});

test("buildGetItemsUrl requests release and assets for the store country", () => {
  const url = buildGetItemsUrl([10, 20], "kz");
  const input = JSON.parse(url.searchParams.get("input_json") ?? "{}");
  assert.equal(url.hostname, "api.steampowered.com");
  assert.deepEqual(input.ids, [{ appid: 10 }, { appid: 20 }]);
  assert.equal(input.context.country_code, "KZ");
  assert.equal(input.data_request.include_release, true);
  assert.equal(input.data_request.include_assets, true);
});

test("parseGetItemsEarlyAccess maps is_early_access, assets and unknown items", () => {
  const payload = {
    response: {
      store_items: [
        {
          appid: 108600,
          success: 1,
          name: "Project Zomboid",
          release: { is_early_access: true },
          assets: { asset_url_format: "steam/apps/108600/${FILENAME}?t=1", header: "header.jpg" },
        },
        { appid: 892970, success: 1, name: "Valheim", release: { release_from_early_access_date: 1 } },
        { appid: 3, success: 2 },
      ],
    },
  };
  const items = parseGetItemsEarlyAccess(payload, [108600, 892970, 3, 4]);
  assert.equal(items[0].earlyAccess, true);
  assert.equal(
    items[0].headerImage,
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/108600/header.jpg?t=1"
  );
  assert.equal(items[1].earlyAccess, false);
  assert.equal(items[2].earlyAccess, null);
  assert.deepEqual(items[3], { appid: 4, earlyAccess: null });
  assert.deepEqual(parseGetItemsEarlyAccess(null, [7]), [{ appid: 7, earlyAccess: null }]);
});

test("parseGetItemsEarlyAccess treats delisted and region-locked items as not Early Access", () => {
  const payload = {
    response: {
      store_items: [
        { appid: 0, success: 15, visible: false, name: "" },
        { appid: 12140, success: 15, visible: false, name: "Max Payne", unvailable_for_country_restriction: true },
        { appid: 30, success: 1, name: "Live", release: { is_early_access: true } },
      ],
    },
  };
  const items = parseGetItemsEarlyAccess(payload, [2350, 12140, 30]);
  assert.deepEqual(items.map((i) => [i.appid, i.earlyAccess]), [
    [2350, false],
    [12140, false],
    [30, true],
  ]);
});

test("parseGetItemsEarlyAccess exposes item type and release timestamps", () => {
  const [item] = parseGetItemsEarlyAccess(
    {
      response: {
        store_items: [
          {
            appid: 892970,
            success: 1,
            type: 0,
            release: { steam_release_date: 1788958595, original_steam_release_date: 1612277769, release_from_early_access_date: 1788937200 },
          },
        ],
      },
    },
    [892970]
  );
  assert.equal(item.itemType, 0);
  assert.equal(item.releaseTs, 1612277769);
  assert.equal(item.fullReleaseTs, 1788937200);
});
