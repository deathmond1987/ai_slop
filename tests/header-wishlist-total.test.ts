import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const counterSource = readFileSync(new URL("../components/WishlistPriceCounter.tsx", import.meta.url), "utf8");

test("root layout passes the full wishlist total to the header counter", () => {
  assert.ok(layoutSource.includes("initialTotal={wishlistTotal}"));
  assert.ok(!/const\s+headerWishlistTotal\s*=/.test(layoutSource));
  assert.ok(!/\.\.\.wishlistTotal,\s*items:\s*\[\]/.test(layoutSource));
  assert.ok(!/\.\.\.wishlistTotal,\s*discounts:\s*\[\]/.test(layoutSource));
});

test("header counter can open the wishlist modal from initial items", () => {
  assert.ok(counterSource.includes("const items = total?.items ?? total?.discounts ?? [];"));
  assert.ok(counterSource.includes("if (items.length > 0) {"));
  assert.ok(counterSource.includes("<WishlistDiscountsModal"));
});
