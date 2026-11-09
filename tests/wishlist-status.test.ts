import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateWishlistGuardReason,
  isCacheableWishlistResult,
  wishlistResultStatus,
  wishlistTotalGuardReason,
} from "../lib/wishlist-core.ts";
import { initializeCandidatesFromWishlist } from "../lib/upcoming-candidates.ts";

test("wishlist status marks full known wishlist results complete", () => {
  assert.equal(
    wishlistResultStatus({
      items: [{ appid: 10 }, { appid: 11 }],
      private: false,
      totalKnown: 2,
    }),
    "complete"
  );
});

test("wishlist status marks confirmed zero-item wishlists empty", () => {
  assert.equal(
    wishlistResultStatus({
      items: [],
      private: false,
      totalKnown: 0,
    }),
    "empty"
  );
});

test("wishlist status marks private wishlist results private", () => {
  assert.equal(
    wishlistResultStatus({
      items: [],
      private: true,
      totalKnown: 24,
    }),
    "private"
  );
});

test("wishlist status marks partial wishlist results unknown", () => {
  assert.equal(
    wishlistResultStatus({
      items: [{ appid: 10 }],
      private: false,
      totalKnown: 24,
    }),
    "unknown"
  );
});

test("wishlist status counts details appids when items are partial", () => {
  assert.equal(
    wishlistResultStatus({
      items: [{ appid: 10 }],
      details: [{ appid: 11 }, { appid: 10 }],
      private: false,
      totalKnown: 2,
    }),
    "complete"
  );
});

test("wishlist status preserves explicit failed status", () => {
  assert.equal(
    wishlistResultStatus({
      items: [{ appid: 10 }],
      private: false,
      totalKnown: 1,
      status: "unknown",
    }),
    "unknown"
  );
});

test("unconfident wishlist results are not cacheable", () => {
  assert.equal(
    isCacheableWishlistResult({
      items: [{ appid: 10 }],
      private: false,
      totalKnown: 24,
    }),
    false
  );
});

test("confident and private wishlist results are cacheable", () => {
  assert.equal(
    isCacheableWishlistResult({
      items: [{ appid: 10 }],
      private: false,
      totalKnown: 1,
    }),
    true
  );
  assert.equal(
    isCacheableWishlistResult({
      items: [],
      private: true,
      totalKnown: 24,
    }),
    true
  );
});

test("wishlist total guard blocks private and unconfident results", () => {
  assert.equal(
    wishlistTotalGuardReason({
      items: [],
      private: true,
      totalKnown: 24,
    }),
    "wishlist_hidden"
  );
  assert.equal(
    wishlistTotalGuardReason({
      items: [{ appid: 10 }],
      private: false,
      totalKnown: 24,
    }),
    "wishlist_failed"
  );
});

test("wishlist total guard allows complete and empty results", () => {
  assert.equal(
    wishlistTotalGuardReason({
      items: [{ appid: 10 }],
      private: false,
      totalKnown: 1,
    }),
    undefined
  );
  assert.equal(
    wishlistTotalGuardReason({
      items: [],
      private: false,
      totalKnown: 0,
    }),
    undefined
  );
});

test("aggregate wishlist guard allows complete aggregate results when wishlist cache is missing", () => {
  assert.equal(
    aggregateWishlistGuardReason(
      {
        wishlistPrivate: false,
        wishlistTotalKnown: 34,
        wishlistStatus: "complete",
      },
      undefined
    ),
    undefined
  );
});

test("aggregate wishlist guard blocks unknown and legacy missing-wishlist results", () => {
  assert.equal(
    aggregateWishlistGuardReason(
      {
        wishlistPrivate: false,
        wishlistTotalKnown: 34,
        wishlistStatus: "unknown",
      },
      undefined
    ),
    "wishlist_failed"
  );
  assert.equal(
    aggregateWishlistGuardReason(
      {
        wishlistPrivate: false,
        wishlistTotalKnown: 34,
      },
      undefined
    ),
    "wishlist_failed"
  );
});

test("candidate initialization records explicit private wishlist status", () => {
  const result = initializeCandidatesFromWishlist({
    items: [],
    private: true,
    totalKnown: 24,
    status: "private",
  });

  assert.equal(result.wishlistPrivate, true);
  assert.equal(result.wishlistStatus, "private");
  assert.equal(result.wishlistTotalKnown, undefined);
  assert.ok(result.warnings.includes("wishlistHidden"));
});

test("candidate initialization records unknown wishlist status", () => {
  const result = initializeCandidatesFromWishlist({
    items: [{ appid: 10, title: "Game A" }],
    private: false,
    totalKnown: 24,
  });

  assert.equal(result.wishlistStatus, "unknown");
  assert.equal(result.wishlistPartial, true);
  assert.equal(result.wishlistTotalKnown, 24);
  assert.ok(result.warnings.includes("wishlistFailed"));
});
