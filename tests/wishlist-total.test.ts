import test from "node:test";
import assert from "node:assert/strict";
import {
  computeWishlistPriceTotal,
  markOwnedCandidates,
  mergeWishlistPriceCandidates,
  ownedAppIdSet,
  wishlistCandidatesFromCacheDetails,
  wishlistCandidatesFromCacheResult,
  wishlistItemEntriesFromCandidates,
} from "../lib/wishlist-total.ts";

test("sums wishlist prices in the configured store region", () => {
  const total = computeWishlistPriceTotal(
    [
      { sources: ["wishlist"], price: { currency: "eur", final: 1000 }, priceCc: "de" },
      { sources: ["wishlist"], price: { currency: "eur", final: 2000 }, priceCc: "de" },
      { sources: ["wishlist"], price: { currency: "usd", final: 5000 }, priceCc: "us" },
      { sources: ["library"], price: { currency: "eur", final: 7000 }, priceCc: "de" },
      { sources: ["wishlist"], price: { currency: "eur" } },
    ],
    "DE"
  );

  assert.deepEqual(total, {
    totalCents: 3000,
    discountTotalCents: 0,
    currency: "eur",
    count: 2,
    discountCount: 0,
    discounts: [],
  });
});

test("without a configured region sums only one currency starting from the first price", () => {
  const total = computeWishlistPriceTotal([
    { sources: ["wishlist"], price: { currency: "EUR", final: 1000 } },
    { sources: ["wishlist"], price: { currency: "eur", final: 500 } },
    { sources: ["wishlist"], price: { currency: "usd", final: 3000 } },
  ]);

  assert.deepEqual(total, {
    totalCents: 1500,
    discountTotalCents: 0,
    currency: "eur",
    count: 2,
    discountCount: 0,
    discounts: [],
  });
});

test("counts zero-price wishlist games without breaking the currency", () => {
  const total = computeWishlistPriceTotal([
    { sources: ["wishlist"], price: { currency: "rub", final: 0 } },
  ]);

  assert.deepEqual(total, {
    totalCents: 0,
    discountTotalCents: 0,
    currency: "rub",
    count: 1,
    discountCount: 0,
    discounts: [],
  });
});

test("returns undefined when no wishlist price is present", () => {
  assert.equal(
    computeWishlistPriceTotal([
      { sources: ["wishlist"], price: { currency: "eur" } },
      { sources: ["library"], price: { currency: "eur", final: 1000 } },
    ]),
    undefined
  );
});

test("excludes owned library games from the total even when also wishlisted", () => {
  const total = computeWishlistPriceTotal(
    [
      { appid: 1, sources: ["library", "wishlist"], price: { currency: "eur", final: 1000 }, priceCc: "de" },
      { appid: 2, sources: ["library"], price: { currency: "eur", final: 7000, discount_percent: 50 }, priceCc: "de" },
      { appid: 3, sources: ["wishlist"], price: { currency: "eur", final: 1500 }, priceCc: "de" },
    ],
    "DE"
  );

  assert.deepEqual(total, {
    totalCents: 1500,
    discountTotalCents: 0,
    currency: "eur",
    count: 1,
    discountCount: 0,
    discounts: [],
  });
});

test("sums discount totals and lists discounted wishlist games", () => {
  const total = computeWishlistPriceTotal(
    [
      {
        appid: 100,
        name: "Discounted Game",
        steamUrl: "https://store.steampowered.com/app/100/",
        sources: ["wishlist"],
        price: {
          currency: "eur",
          initial: 2000,
          final: 1000,
          discount_percent: 50,
          initial_formatted: "2,00 €",
          final_formatted: "1,00 €",
        },
        priceCc: "de",
      },
      {
        appid: 200,
        name: "Full Price Game",
        sources: ["wishlist"],
        price: { currency: "eur", initial: 1500, final: 1500 },
        priceCc: "de",
      },
      {
        appid: 300,
        name: "Owned Discount",
        sources: ["library"],
        price: { currency: "eur", initial: 3000, final: 1200, discount_percent: 60 },
        priceCc: "de",
      },
    ],
    "DE"
  );

  assert.deepEqual(total, {
    totalCents: 2500,
    discountTotalCents: 1000,
    currency: "eur",
    count: 2,
    discountCount: 1,
    discounts: [
      {
        appid: 100,
        name: "Discounted Game",
        steamUrl: "https://store.steampowered.com/app/100/",
        currency: "eur",
        finalCents: 1000,
        initialCents: 2000,
        discountCents: 1000,
        discountPercent: 50,
        finalFormatted: "1,00 €",
        initialFormatted: "2,00 €",
      },
    ],
  });
});

test("infers discount percent from initial and final prices when Steam omits it", () => {
  const total = computeWishlistPriceTotal([
    { appid: 400, name: "Inferred", sources: ["wishlist"], price: { currency: "eur", initial: 2500, final: 1000 } },
  ]);

  assert.ok(total);
  assert.equal(total.discountTotalCents, 1500);
  assert.equal(total.discountCount, 1);
  assert.equal(total.discounts[0]?.discountPercent, 60);
});

test("builds wishlist candidates from cached app details", () => {
  const candidates = wishlistCandidatesFromCacheDetails(
    [
      { appid: 30, details: { name: "Cached", price_overview: { currency: "rub", final: 999 } } },
      { appid: 31, details: null },
      { appid: 0, details: { name: "Invalid", price_overview: { currency: "rub", final: 100 } } },
    ],
    "ru"
  );

  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates[0], {
    appid: 30,
    name: "Cached",
    steamUrl: "https://store.steampowered.com/app/30/",
    sources: ["wishlist"],
    price: { currency: "rub", final: 999 },
    priceCc: "ru",
  });
  assert.equal(candidates[1]?.name, "App 31");

  assert.deepEqual(computeWishlistPriceTotal(candidates, "ru"), {
    totalCents: 999,
    discountTotalCents: 0,
    currency: "rub",
    count: 1,
    discountCount: 0,
    discounts: [],
  });
});

test("owned cache entries remove owned wishlist games from cached totals", () => {
  const owned = ownedAppIdSet([{ appid: 20 }, { appid: 21 }, { appid: 0 }, {}]);
  const candidates = markOwnedCandidates(
    wishlistCandidatesFromCacheDetails(
      [
        {
          appid: 10,
          details: {
            name: "Wishlisted Deal",
            price_overview: { currency: "eur", initial: 2000, final: 1000, discount_percent: 50 },
          },
        },
        {
          appid: 20,
          details: {
            name: "Already Owned",
            price_overview: { currency: "eur", initial: 3000, final: 1200, discount_percent: 60 },
          },
        },
      ],
      "DE"
    ),
    owned
  );

  assert.deepEqual(computeWishlistPriceTotal(candidates, "DE"), {
    totalCents: 1000,
    discountTotalCents: 1000,
    currency: "eur",
    count: 1,
    discountCount: 1,
    discounts: [
      {
        appid: 10,
        name: "Wishlisted Deal",
        steamUrl: "https://store.steampowered.com/app/10/",
        currency: "eur",
        finalCents: 1000,
        initialCents: 2000,
        discountCents: 1000,
        discountPercent: 50,
        finalFormatted: undefined,
        initialFormatted: undefined,
      },
    ],
  });
});

test("owned marking keeps the wishlist source and adds library", () => {
  const candidates = markOwnedCandidates(
    [{ appid: 40, sources: ["wishlist"], price: { currency: "eur", final: 500 } }],
    ownedAppIdSet([{ appid: 40 }])
  );

  assert.deepEqual(candidates[0]?.sources, ["wishlist", "library"]);
});

test("merge keeps wishlist-only candidates alongside aggregate candidates", () => {
  const merged = mergeWishlistPriceCandidates(
    [
      {
        appid: 100,
        name: "Aggregate Wishlist",
        sources: ["wishlist"],
        price: { currency: "kzt", initial: 2000, final: 1000, discount_percent: 50 },
        priceCc: "kz",
      },
    ],
    [
      {
        appid: 100,
        name: "Aggregate Wishlist",
        sources: ["wishlist"],
        price: { currency: "kzt", initial: 2500, final: 1100 },
        priceCc: "kz",
      },
      {
        appid: 200,
        name: "Wishlist Only Deal",
        sources: ["wishlist"],
        price: { currency: "kzt", initial: 3000, final: 1000, discount_percent: 67 },
        priceCc: "kz",
      },
    ]
  );

  assert.deepEqual(merged.map((candidate) => candidate.appid), [100, 200]);
  assert.deepEqual(merged[1], {
    appid: 200,
    name: "Wishlist Only Deal",
    sources: ["wishlist"],
    price: { currency: "kzt", initial: 3000, final: 1000, discount_percent: 67 },
    priceCc: "kz",
  });

  assert.deepEqual(computeWishlistPriceTotal(merged, "kz"), {
    totalCents: 2000,
    discountTotalCents: 3000,
    currency: "kzt",
    count: 2,
    discountCount: 2,
    discounts: [
      {
        appid: 100,
        name: "Aggregate Wishlist",
        steamUrl: "https://store.steampowered.com/app/100/",
        currency: "kzt",
        finalCents: 1000,
        initialCents: 2000,
        discountCents: 1000,
        discountPercent: 50,
        finalFormatted: undefined,
        initialFormatted: undefined,
      },
      {
        appid: 200,
        name: "Wishlist Only Deal",
        steamUrl: "https://store.steampowered.com/app/200/",
        currency: "kzt",
        finalCents: 1000,
        initialCents: 3000,
        discountCents: 2000,
        discountPercent: 67,
        finalFormatted: undefined,
        initialFormatted: undefined,
      },
    ],
  });
});

test("merge combined with owned marking excludes owned wishlist-only cache entries", () => {
  const merged = mergeWishlistPriceCandidates(
    wishlistCandidatesFromCacheDetails(
      [
        {
          appid: 1,
          details: {
            name: "Aggregate Wishlisted Deal",
            price_overview: { currency: "eur", initial: 2000, final: 1000, discount_percent: 50 },
          },
        },
      ],
      "DE"
    ),
    wishlistCandidatesFromCacheDetails(
      [
        {
          appid: 2,
          details: {
            name: "Wishlist Only Deal",
            price_overview: { currency: "eur", initial: 3000, final: 900, discount_percent: 70 },
          },
        },
        {
          appid: 3,
          details: {
            name: "Owned Wishlist Only",
            price_overview: { currency: "eur", initial: 4000, final: 800, discount_percent: 80 },
          },
        },
      ],
      "DE"
    )
  );

  assert.deepEqual(merged.map((candidate) => candidate.appid), [1, 2, 3]);

  const total = computeWishlistPriceTotal(
    markOwnedCandidates(merged, ownedAppIdSet([{ appid: 3 }])),
    "DE"
  );

  assert.equal(total?.discountCount, 2);
  assert.equal(total?.discountTotalCents, 3100);
  assert.deepEqual(total?.discounts.map((entry) => entry.appid), [1, 2]);
});

test("builds all wishlist candidates from cached wishlist items plus details", () => {
  const candidates = wishlistCandidatesFromCacheResult(
    {
      items: [
        { appid: 10, title: "Unpriced wishlisted game" },
        { appid: 20, title: "Discounted wishlisted game" },
        { appid: 30 },
      ],
      details: [
        {
          appid: 20,
          details: {
            name: "Discounted from details",
            price_overview: { currency: "eur", initial: 2000, final: 1000, discount_percent: 50 },
          },
        },
        {
          appid: 40,
          details: {
            name: "Cached only",
            price_overview: { currency: "eur", final: 700 },
          },
        },
      ],
    },
    "DE"
  );

  assert.deepEqual(
    candidates.map((candidate) => ({
      appid: candidate.appid,
      name: candidate.name,
      sources: candidate.sources,
      hasPrice: Boolean(candidate.price),
      priceCc: candidate.priceCc,
    })),
    [
      { appid: 10, name: "Unpriced wishlisted game", sources: ["wishlist"], hasPrice: false, priceCc: "de" },
      { appid: 20, name: "Discounted wishlisted game", sources: ["wishlist"], hasPrice: true, priceCc: "de" },
      { appid: 30, name: "App 30", sources: ["wishlist"], hasPrice: false, priceCc: "de" },
      { appid: 40, name: "Cached only", sources: ["wishlist"], hasPrice: true, priceCc: "de" },
    ]
  );
});

test("wishlist modal items include only priced wishlist candidates", () => {
  const candidates = markOwnedCandidates(
    [
      {
        appid: 10,
        name: "Unpriced wishlisted game",
        steamUrl: "https://store.steampowered.com/app/10/",
        sources: ["wishlist"],
      },
      {
        appid: 11,
        name: "Unreleased but priced wishlisted game",
        steamUrl: "https://store.steampowered.com/app/11/",
        sources: ["wishlist"],
        price: { currency: "eur", final: 900, final_formatted: "9,00€" },
        priceCc: "de",
      },
      {
        appid: 20,
        name: "Discounted wishlisted game",
        steamUrl: "https://store.steampowered.com/app/20/",
        sources: ["wishlist"],
        price: {
          currency: "eur",
          initial: 2000,
          final: 1000,
          discount_percent: 50,
          final_formatted: "10,00€",
          initial_formatted: "20,00€",
        },
        priceCc: "de",
      },
      {
        appid: 30,
        name: "Already owned",
        steamUrl: "https://store.steampowered.com/app/30/",
        sources: ["wishlist"],
        price: { currency: "eur", final: 1200 },
        priceCc: "de",
      },
    ],
    ownedAppIdSet([{ appid: 30 }])
  );

  const items = wishlistItemEntriesFromCandidates(candidates);
  const total = computeWishlistPriceTotal(candidates, "DE");

  assert.deepEqual(items.map((item) => item.appid), [11, 20]);
  assert.deepEqual(items[0], {
    appid: 11,
    name: "Unreleased but priced wishlisted game",
    steamUrl: "https://store.steampowered.com/app/11/",
    currency: "eur",
    finalCents: 900,
    finalFormatted: "9,00€",
  });
  assert.equal(items[1]?.discountPercent, 50);
  assert.equal(total?.count, 2);
  assert.equal(total?.discountCount, 1);
  assert.deepEqual(total?.discounts.map((entry) => entry.appid), [20]);
});
