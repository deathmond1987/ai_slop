import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWishlistFinalizedItems,
  needsWishlistAppDetails,
  wishlistApiAppidMap,
  wishlistFinalizeAppids,
  wishlistPageItemMap,
} from "../lib/wishlist-core.ts";
import type { WishlistFinalizeDetailsLike } from "../lib/wishlist-core.ts";

test("wishlist finalize falls back to page items when api wishlist list is empty", () => {
  const apiMap = wishlistApiAppidMap([]);
  const pageMap = wishlistPageItemMap([
    {
      appid: 42,
      title: "Game A",
      coverImage: "https://example.invalid/a.jpg",
      releaseDateText: "December 2026",
    },
    {
      appid: 43,
      title: "App 43",
    },
  ]);

  const appids = wishlistFinalizeAppids(apiMap, pageMap);
  assert.deepEqual(appids, [42, 43]);

  assert.equal(needsWishlistAppDetails(42, false, pageMap.get(42)), true);
  assert.equal(needsWishlistAppDetails(43, false, pageMap.get(43)), true);

  const details = new Map<number, WishlistFinalizeDetailsLike | null>([
    [42, { name: "API A", header_image: "https://example.invalid/api-a.jpg" }],
    [43, { name: "Game 43", release_date: { date: "Nov 2026" } }],
  ]);

  const items = buildWishlistFinalizedItems(appids, pageMap, details);
  assert.deepEqual(items, [
    {
      appid: 42,
      title: "Game A",
      coverImage: "https://example.invalid/a.jpg",
      releaseDateText: "December 2026",
    },
    {
      appid: 43,
      title: "Game 43",
      coverImage: undefined,
      releaseDateText: "Nov 2026",
    },
  ]);
});

test("wishlist finalize keeps api items when api wishlist list has items", () => {
  const apiMap = wishlistApiAppidMap([{ appid: 42 }, { appid: 44 }]);
  const pageMap = wishlistPageItemMap([
    {
      appid: 42,
      title: "Game A",
      coverImage: "https://example.invalid/a.jpg",
      releaseDateText: "December 2026",
    },
    {
      appid: 43,
      title: "Game B",
      coverImage: "https://example.invalid/b.jpg",
      releaseDateText: "January 2027",
    },
  ]);

  const appids = wishlistFinalizeAppids(apiMap, pageMap);
  assert.deepEqual(appids, [42, 44]);

  assert.equal(needsWishlistAppDetails(42, true, pageMap.get(42)), false);
  assert.equal(needsWishlistAppDetails(44, true, pageMap.get(44)), true);
});
