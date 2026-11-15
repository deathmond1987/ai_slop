import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSteamProfileAvatar,
  normalizeSteamProfileDisplayName,
  parseSteamProfileHtml,
} from "../lib/steam-core.ts";

test("parses steam community open graph profile metadata", () => {
  const profile = parseSteamProfileHtml(`
    <html><head>
      <meta property="og:title" content="Steam Community :: Test &amp; Sons">
      <meta property="og:image" content="https://avatars.fastly.steamstatic.com/abc_full.jpg">
    </head><body></body></html>
  `);

  assert.equal(profile.displayName, "Test & Sons");
  assert.equal(profile.avatar, "https://avatars.fastly.steamstatic.com/abc_full.jpg");
});

test("parses reversed open graph meta attributes", () => {
  const profile = parseSteamProfileHtml(`
    <html><head>
      <meta content="Steam Community :: Foo" property="og:title">
      <meta content="https://avatars.akamai.steamstatic.com/foo.png" property="og:image">
    </head><body></body></html>
  `);

  assert.equal(profile.displayName, "Foo");
  assert.equal(profile.avatar, "https://avatars.akamai.steamstatic.com/foo.png");
});

test("normalizes steam avatars only from trusted steamstatic hosts", () => {
  assert.equal(
    normalizeSteamProfileAvatar("https://avatars.fastly.steamstatic.com/a.jpg"),
    "https://avatars.fastly.steamstatic.com/a.jpg"
  );
  assert.equal(normalizeSteamProfileAvatar("http://avatars.fastly.steamstatic.com/a.jpg"), undefined);
  assert.equal(normalizeSteamProfileAvatar("https://evil.example.com/a.jpg"), undefined);
});

test("normalizes steam community profile display names", () => {
  assert.equal(normalizeSteamProfileDisplayName("Steam Community :: Foo Bar"), "Foo Bar");
  assert.equal(normalizeSteamProfileDisplayName("Steam Community :: Sign In"), undefined);
  assert.equal(normalizeSteamProfileDisplayName("Steam Community"), undefined);
});