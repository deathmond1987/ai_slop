import test from "node:test";
import assert from "node:assert/strict";
import { shortHash } from "../lib/aggregate-cache.ts";
import { wishlistCacheKey, wishlistStoreCcHash } from "../lib/wishlist-cache-core.ts";

test("wishlist cache keys include normalized storeCc only when present", () => {
  const steamId = "10000000012345678";
  const base = `wishlist:v2:${steamId}`;

  assert.equal(wishlistStoreCcHash(undefined), undefined);
  assert.equal(wishlistStoreCcHash(null), undefined);
  assert.equal(wishlistStoreCcHash(""), undefined);
  assert.equal(wishlistStoreCcHash("invalid"), undefined);
  assert.equal(wishlistStoreCcHash("DE"), shortHash("de"));
  assert.equal(wishlistStoreCcHash(" de "), shortHash("de"));

  assert.equal(wishlistCacheKey(steamId), base);
  assert.equal(wishlistCacheKey(steamId, wishlistStoreCcHash(null)), base);
  assert.equal(wishlistCacheKey(steamId, wishlistStoreCcHash("invalid")), base);
  assert.equal(
    wishlistCacheKey(steamId, wishlistStoreCcHash("DE")),
    `${base}:${shortHash("de")}`
  );
  assert.notEqual(
    wishlistCacheKey(steamId, wishlistStoreCcHash("DE")),
    wishlistCacheKey(steamId, wishlistStoreCcHash("FR"))
  );
});
