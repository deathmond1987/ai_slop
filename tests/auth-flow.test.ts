import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { register } from "node:module";
import {
  buildSteamOpenIdLoginUrl,
  collectSignedOpenIdParams,
  STEAM_OPENID_ENDPOINT,
  STEAM_OPENID_IDENTIFIER_SELECT,
  STEAM_OPENID_NS,
} from "../lib/auth.ts";

register(new URL("./ts-extension-resolver.mjs", import.meta.url).href, import.meta.url);

const tempDir = mkdtempSync(path.join(os.tmpdir(), "steam-calendar-auth-flow-"));
const steamId = "10000000000000001";

process.env.DB_SQLITE_PATH = path.join(tempDir, "auth-flow.sqlite");
process.env.DB_ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
process.env.STEAM_OPENID_TIMEOUT_MS = "2000";
process.env.STEAM_OPENID_VERIFY_ATTEMPTS = "1";

delete process.env.STEAM_OPENID_VERIFY_URL;
delete process.env.RAWG_API_KEY;
delete process.env.STEAM_API_KEY;
delete process.env.AUTH_BASE_URL;
delete process.env.COOKIE_SECURE;
delete process.env.SESSION_PASSWORD;

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const openidVerify = await import("../lib/openid-verify.ts");
const authStore = await import("../lib/auth-store.ts");
const steam = await import("../lib/steam.ts");

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withVerifyServer(body: string, fn: () => Promise<void>): Promise<void> {
  const server = http.createServer((req, res) => {
    req.resume();
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain");
    res.end(body);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected http server to listen on port");
  }

  const originalEndpoint = process.env.STEAM_OPENID_VERIFY_URL;
  process.env.STEAM_OPENID_VERIFY_URL = `http://127.0.0.1:${address.port}/openid/login`;

  try {
    await fn();
  } finally {
    if (originalEndpoint === undefined) {
      delete process.env.STEAM_OPENID_VERIFY_URL;
    } else {
      process.env.STEAM_OPENID_VERIFY_URL = originalEndpoint;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test("buildSteamOpenIdLoginUrl creates a Steam checkid_setup request", () => {
  const url = new URL(buildSteamOpenIdLoginUrl("https://calendar.example/"));

  assert.equal(`${url.origin}${url.pathname}`, STEAM_OPENID_ENDPOINT);
  assert.equal(url.searchParams.get("openid.ns"), STEAM_OPENID_NS);
  assert.equal(url.searchParams.get("openid.mode"), "checkid_setup");
  assert.equal(url.searchParams.get("openid.return_to"), "https://calendar.example/auth/callback");
  assert.equal(url.searchParams.get("openid.realm"), "https://calendar.example");
  assert.equal(url.searchParams.get("openid.identity"), STEAM_OPENID_IDENTIFIER_SELECT);
  assert.equal(url.searchParams.get("openid.claimed_id"), STEAM_OPENID_IDENTIFIER_SELECT);
});

test("collectSignedOpenIdParams sends only signed OpenID fields for verification", () => {
  const signed = "op_endpoint,identity,return_to,response_nonce,assoc_handle";
  const params = new URLSearchParams({
    "openid.ns": STEAM_OPENID_NS,
    "openid.mode": "id_res",
    "openid.signed": signed,
    "openid.sig": "signature",
    "openid.op_endpoint": STEAM_OPENID_ENDPOINT,
    "openid.identity": `https://steamcommunity.com/openid/id/${steamId}`,
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${steamId}`,
    "openid.return_to": "https://calendar.example/auth/callback",
    "openid.response_nonce": "nonce",
    "openid.assoc_handle": "handle",
    "openid.unsigned": "ignored",
  });

  const verifyBody = collectSignedOpenIdParams(params);

  assert.equal(verifyBody.get("openid.mode"), "check_authentication");
  assert.equal(verifyBody.get("openid.ns"), STEAM_OPENID_NS);
  assert.equal(verifyBody.get("openid.signed"), signed);
  assert.equal(verifyBody.get("openid.sig"), "signature");
  assert.equal(verifyBody.get("openid.op_endpoint"), STEAM_OPENID_ENDPOINT);
  assert.equal(verifyBody.get("openid.identity"), `https://steamcommunity.com/openid/id/${steamId}`);
  assert.equal(verifyBody.get("openid.return_to"), "https://calendar.example/auth/callback");
  assert.equal(verifyBody.get("openid.response_nonce"), "nonce");
  assert.equal(verifyBody.get("openid.assoc_handle"), "handle");
  assert.equal(verifyBody.has("openid.unsigned"), false);
  assert.equal(verifyBody.has("openid.claimed_id"), false);
});

test("extractSteamIdFromOpenId accepts Steam OpenID identifiers", () => {
  assert.equal(steam.extractSteamIdFromOpenId(`https://steamcommunity.com/openid/id/${steamId}`), steamId);
  assert.equal(steam.extractSteamIdFromOpenId(`https://steamcommunity.com/openid/id/${steamId}/`), steamId);
  assert.equal(steam.extractSteamIdFromOpenId(`steamcommunity.com/openid/id/${steamId}`), steamId);
  assert.equal(steam.extractSteamIdFromOpenId("not-an-openid"), null);
});

test("shouldUseSecureSessionCookie respects overrides and forwarded protocol", async () => {
  const requestOrigin = await import("../lib/requestOrigin.ts");
  const httpHeaders = new Headers({ host: "127.0.0.1:3000" });
  const httpsForwardedHeaders = new Headers({
    host: "127.0.0.1:3000",
    "x-forwarded-proto": "https",
  });

  assert.equal(
    withEnv(
      { COOKIE_SECURE: "false", AUTH_BASE_URL: "https://calendar.example" },
      () => requestOrigin.shouldUseSecureSessionCookie(httpHeaders)
    ),
    false
  );

  assert.equal(
    withEnv(
      { COOKIE_SECURE: undefined, AUTH_BASE_URL: "https://calendar.example" },
      () => requestOrigin.shouldUseSecureSessionCookie(httpHeaders)
    ),
    true
  );

  assert.equal(
    withEnv(
      { COOKIE_SECURE: undefined, AUTH_BASE_URL: undefined },
      () => requestOrigin.shouldUseSecureSessionCookie(httpsForwardedHeaders)
    ),
    true
  );
});

test("steamOpenidVerifyEndpoint only honors STEAM_OPENID_VERIFY_URL outside production", () => {
  const endpoint = "http://127.0.0.1:43210/openid/login";

  assert.equal(
    withEnv({ NODE_ENV: "test", STEAM_OPENID_VERIFY_URL: endpoint }, () => {
      const value = openidVerify.steamOpenidVerifyEndpoint();
      return value?.href;
    }),
    endpoint
  );

  assert.equal(
    withEnv({ NODE_ENV: "production", STEAM_OPENID_VERIFY_URL: endpoint }, () =>
      openidVerify.steamOpenidVerifyEndpoint()
    ),
    undefined
  );

  assert.equal(
    withEnv({ NODE_ENV: "test", STEAM_OPENID_VERIFY_URL: "not-a-url" }, () =>
      openidVerify.steamOpenidVerifyEndpoint()
    ),
    undefined
  );
});

test("verifySteamOpenId succeeds against a fake Steam OpenID verifier", async () => {
  await withVerifyServer("is_valid: true\n", async () => {
    const result = await openidVerify.verifySteamOpenId(
      new URLSearchParams({
        "openid.mode": "check_authentication",
        "openid.sig": "signature",
      })
    );

    assert.deepEqual(result, { ok: true });
  });
});

test("verifySteamOpenId reports invalid_sig when the fake verifier rejects the signature", async () => {
  await withVerifyServer("is_valid: false\n", async () => {
    const result = await openidVerify.verifySteamOpenId(
      new URLSearchParams({
        "openid.mode": "check_authentication",
        "openid.sig": "bad",
      })
    );

    assert.deepEqual(result, { ok: false, failure: "invalid_sig" });
  });
});

test("authorization stores a DB session and encrypted user settings", async () => {
  const token = await authStore.createDbSession({ steamId });
  assert.ok(token);

  const saved = await authStore.saveUserSettings(steamId, {
    steamApiKey: "steam-key",
    rawgApiKey: "rawg-key",
    storeCc: "de",
  });
  assert.equal(saved, true);

  const session = await authStore.getSteamSessionDataFromToken(token!);
  assert.equal(session?.steamId, steamId);
  assert.equal(session?.apiKey, "steam-key");
  assert.equal(session?.rawgApiKey, "rawg-key");
  assert.equal(session?.storeCc, "de");

  assert.equal(await authStore.destroyDbSession(token!), true);
  assert.equal(await authStore.getSteamSessionDataFromToken(token!), undefined);
});
