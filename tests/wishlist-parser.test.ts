import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeWishlistRequest,
  parseFirstField1Varint,
  parseGetWishlistResponse,
  parseJsonCountResponse,
  parseJsonWishlistResponse,
  parseWishlistDate,
  parseWishlistPageResult,
} from "../lib/wishlist-core.ts";

const steamId = "76561198015461483";

test("wishlist page parser extracts items, total count, titles, covers and release text", () => {
  const ssrData = {
    renderContext: {
      queryData: {
        queries: [
          {
            queryKey: ["wishlistitemcount", steamId],
            state: { status: "success", data: 2 },
          },
          {
            queryKey: ["WishlistSortedFiltered", steamId],
            state: {
              status: "success",
              data: {
                items: [{ appid: 42 }, { appid: 43 }],
              },
            },
          },
          {
            queryKey: ["StoreItem", "app_42", "default_info"],
            state: { status: "success", data: { name: "Game A" } },
          },
          {
            queryKey: ["StoreItem", "app_42", "include_assets"],
            state: {
              status: "success",
              data: {
                asset_url_format: "header.jpg?size=header.jpg&filename=${FILENAME}",
                header: "capsule_616x353.jpg",
              },
            },
          },
          {
            queryKey: ["StoreItem", "app_42", "include_release"],
            state: {
              status: "success",
              data: { custom_release_date_message: "December 2026" },
            },
          },
        ],
      },
    },
  };

  const html = `<div id="valve-ssr-data">${JSON.stringify(ssrData)}</div>`;
  const result = parseWishlistPageResult(html, steamId);

  assert.equal(result.private, false);
  assert.equal(result.totalKnown, 2);
  assert.equal(result.items.length, 2);

  assert.deepEqual(result.items[0], {
    appid: 42,
    title: "Game A",
    coverImage:
      "https://shared.fastly.steamstatic.com/store_item_assets/header.jpg?size=header.jpg&filename=capsule_616x353.jpg",
    releaseDateText: "December 2026",
  });
  assert.equal(result.items[1].appid, 43);
  assert.equal(result.items[1].title, "App 43");
  assert.equal(result.items[1].coverImage, undefined);
  assert.equal(result.items[1].releaseDateText, undefined);
});

test("wishlist page parser distinguishes private no-items pages from public empty pages", () => {
  const privateHtml = `<div id="valve-ssr-data">${JSON.stringify({
    renderContext: {
      queryData: {
        queries: [
          {
            queryKey: ["wishlistitemcount", steamId],
            state: { status: "success", data: 10 },
          },
          {
            queryKey: ["WishlistSortedFiltered", steamId],
            state: { status: "success", data: { items: [] } },
          },
        ],
      },
    },
  })}</div>`;

  const publicHtml = `<div id="valve-ssr-data">${JSON.stringify({
    renderContext: {
      queryData: {
        queries: [
          {
            queryKey: ["wishlistitemcount", steamId],
            state: { status: "success", data: 0 },
          },
          {
            queryKey: ["WishlistSortedFiltered", steamId],
            state: { status: "success", data: { items: [] } },
          },
        ],
      },
    },
  })}</div>`;

  assert.equal(parseWishlistPageResult(privateHtml, steamId).private, true);
  assert.equal(parseWishlistPageResult(privateHtml, steamId).totalKnown, 10);
  assert.equal(parseWishlistPageResult(publicHtml, steamId).private, false);
  assert.equal(parseWishlistPageResult(publicHtml, steamId).totalKnown, 0);
  assert.equal(parseWishlistPageResult("<div></div>", steamId).private, true);
});

test("wishlist API parser handles JSON, protobuf count and protobuf items", () => {
  assert.deepEqual(
    parseJsonWishlistResponse({ response: { items: [{ appid: 42 }, { appid: "43" }, { appid: 0 }] } }),
    [{ appid: 42 }]
  );
  assert.equal(parseJsonCountResponse({ response: { count: 7 } }), 7);
  assert.deepEqual(
    parseGetWishlistResponse(Buffer.from([0x0a, 0x02, 0x08, 0x2a])),
    [{ appid: 42 }]
  );
  assert.equal(parseFirstField1Varint(Buffer.from([0x08, 0x2a])), 42);
  assert.equal(encodeWishlistRequest("1"), "CQEAAAAAAAAA");
});

test("wishlist date parser separates exact ISO dates from vague text", () => {
  assert.deepEqual(parseWishlistDate("2027-12-31"), {
    date: "2027-12-31",
    comingSoon: false,
  });
  assert.deepEqual(parseWishlistDate("December 2026"), {
    date: null,
    comingSoon: true,
  });
  assert.deepEqual(parseWishlistDate(""), {
    date: null,
    comingSoon: true,
  });
});
