import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "..");
const resolverPath = path.join(projectRoot, "tests", "ts-extension-resolver.mjs");
register(pathToFileURL(resolverPath).href, import.meta.url);

const steamId = "10000000000000001";
const gameName = "Auth Test Game";
const SESSION_COOKIE = "steam_calendar_session";
const requireBrowser = process.env.AUTH_RENDER_REQUIRE_BROWSER === "1";
const tempDir = mkdtempSync(path.join(os.tmpdir(), "steam-calendar-auth-render-"));
const dbPath = path.join(tempDir, "auth-render.sqlite");
const testEncryptionKey = "0".repeat(64);

process.env.DB_SQLITE_PATH = dbPath;
process.env.DB_ENCRYPTION_KEY = testEncryptionKey;
process.env.TZ = "UTC";
delete process.env.STEAM_OPENID_VERIFY_URL;
delete process.env.STEAM_OPENID_FAMILY;
delete process.env.STEAM_OPENID_TIMEOUT_MS;
delete process.env.STEAM_OPENID_VERIFY_ATTEMPTS;
delete process.env.RAWG_API_KEY;
delete process.env.STEAM_API_KEY;
delete process.env.AUTH_BASE_URL;
delete process.env.COOKIE_SECURE;
delete process.env.SESSION_PASSWORD;

const { createDbSession, destroyDbSession, saveUserSettings } = await import("../lib/auth-store.ts");
const { todayISO } = await import("../lib/calendar.ts");
const { cacheGet, cacheSet } = await import("../lib/cache-store.ts");
const { upcomingCacheKeyFromContext } = await import("../lib/aggregate-cache.ts");
let chromium = null;
let playwrightImportError = null;
try {
  const playwright = await import("playwright");
  chromium = playwright.chromium ?? playwright.default?.chromium ?? null;
} catch (error) {
  playwrightImportError = error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve a local port")));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function startFakeOpenIdVerifier() {
  const requests = [];
  const waiters = [];
  const maxBodyBytes = 65536;

  function readRequestBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      let bytes = 0;
      let tooLarge = false;
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      req.setTimeout(15000, () => {
        finish(tooLarge ? null : Buffer.concat(chunks).toString("utf8"));
      });

      req.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBodyBytes) {
          tooLarge = true;
          chunks.length = 0;
          return;
        }
        if (!tooLarge) chunks.push(chunk);
      });

      req.on("end", () => finish(tooLarge ? null : Buffer.concat(chunks).toString("utf8")));
      req.on("close", () => finish(tooLarge ? null : Buffer.concat(chunks).toString("utf8")));
      req.on("aborted", () => finish(tooLarge ? null : Buffer.concat(chunks).toString("utf8")));
      req.on("error", () => finish(tooLarge ? null : Buffer.concat(chunks).toString("utf8")));
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      const query = new URLSearchParams(requestUrl.search);
      const body = req.method === "POST" ? await readRequestBody(req) : "";

      if (body === null) {
        res.writeHead(413, { "content-type": "text/plain" });
        res.end("request body too large\n");
        return;
      }

      const form = new URLSearchParams(body);
      const params = {};
      for (const [key, value] of query.entries()) params[key] = value;
      for (const [key, value] of form.entries()) params[key] = value;

      requests.push(params);

      if (params["openid.mode"] !== "check_authentication") {
        res.writeHead(400, { "content-type": "text/plain" });
        res.end("missing check_authentication\n");
        return;
      }

      res.writeHead(200, { "content-type": "text/plain" });
      res.end("is_valid: true\n");

      for (const waiter of [...waiters]) {
        if (!waiter.expectedReturnTo || waiter.expectedReturnTo === params["openid.return_to"]) {
          waiter.resolve({ ...params });
          waiters.splice(waiters.indexOf(waiter), 1);
        }
      }
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("bad request\n");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Fake OpenID verifier failed to bind to 127.0.0.1");
  }

  return {
    url: `http://127.0.0.1:${address.port}/openid/login`,
    close() {
      return new Promise((resolve, reject) => {
        try {
          server.closeAllConnections?.();
        } catch {
          // ignore closeAllConnections support errors
        }
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    waitForVerification(expectedReturnTo, timeoutMs = 15000) {
      const alreadySeen = requests.find(
        (params) =>
          params["openid.mode"] === "check_authentication" &&
          (!expectedReturnTo || params["openid.return_to"] === expectedReturnTo)
      );
      if (alreadySeen) return Promise.resolve({ ...alreadySeen });

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timed out waiting for OpenID check_authentication request"));
        }, timeoutMs);
        waiters.push({
          expectedReturnTo,
          resolve: (params) => {
            clearTimeout(timeout);
            resolve({ ...params });
          },
        });
      });
    },
  };
}

async function waitForNextDev(child, origin, capturedOutput, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next dev exited with code ${child.exitCode}\n${capturedOutput}`);
    }

    try {
      const response = await fetch(`${origin}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(3000),
      });
      await response.body?.cancel?.();
      if (response.status >= 200 && response.status < 400) return;
    } catch {
      await sleep(500);
    }
  }

  throw new Error(`Next dev did not become ready in time\n${capturedOutput}`);
}

function resolveChromiumExecutable() {
  if (process.env.AUTH_RENDER_CHROMIUM_PATH) return process.env.AUTH_RENDER_CHROMIUM_PATH;
  return path.join(
    projectRoot,
    ".tmp-validation",
    "pw-browsers",
    "chromium-1248",
    "chrome-linux64",
    "chrome"
  );
}

function buildCallbackUrl(nextOrigin, steamId, signedKeys) {
  const returnTo = `${nextOrigin}/auth/callback`;
  const identity = `https://steamcommunity.com/openid/id/${steamId}`;
  const params = new URLSearchParams({
    "openid.mode": "id_res",
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.signed": signedKeys.join(","),
    "openid.sig": "test",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.identity": identity,
    "openid.claimed_id": identity,
    "openid.return_to": returnTo,
    "openid.response_nonce": `2026-01-01T00:00:00Z${randomUUID()}`,
    "openid.assoc_handle": "test-assoc",
  });
  return `${returnTo}?${params.toString()}`;
}

function dateRange(today) {
  const dates = [];
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  for (let offset = -3; offset <= 3; offset++) {
    const date = new Date(todayDate);
    date.setUTCDate(date.getUTCDate() + offset);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function chromiumVersionWorks(executablePath) {
  if (!fs.existsSync(executablePath)) return false;
  try {
    execFileSync(executablePath, ["--version"], { stdio: "ignore", timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

async function launchBrowser() {
  if (!chromium) {
    const message = `Playwright Chromium export is not available: ${playwrightImportError?.message ?? "unknown import error"}`;
    if (requireBrowser) throw new Error(message);
    console.warn(`${message}; falling back to authenticated HTTP render.`);
    return null;
  }

  const candidates = [];
  try {
    const bundledPath = chromium.executablePath?.();
    if (bundledPath) candidates.push(bundledPath);
  } catch {
    // ignore unavailable browserType.executablePath()
  }
  candidates.push(resolveChromiumExecutable());

  const failures = [];
  for (const executablePath of [...new Set(candidates.filter(Boolean))]) {
    if (!fs.existsSync(executablePath)) {
      failures.push(`${executablePath} not found`);
      continue;
    }
    if (!chromiumVersionWorks(executablePath)) {
      failures.push(`${executablePath} failed to report a version`);
    }
    try {
      return await chromium.launch({
        headless: true,
        executablePath,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"],
      });
    } catch (error) {
      failures.push(`${executablePath} failed to launch: ${error?.message ?? String(error)}`);
    }
  }

  const message = failures.length
    ? `Chromium is not launchable in this environment: ${failures.join("; ")}`
    : "No Chromium candidate is available";
  if (requireBrowser) throw new Error(message);
  console.warn(`${message}; falling back to authenticated HTTP render.`);
  return null;
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // ignore response body cleanup errors
  }
}

function cookieHeader(cookieMap) {
  return [...cookieMap.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function fetchManual(url, cookieMap, timeoutMs = 20000) {
  const headers = { accept: "text/html, application/xhtml+xml" };
  if (cookieMap?.size > 0) headers.cookie = cookieHeader(cookieMap);
  return fetch(url, { redirect: "manual", headers, signal: AbortSignal.timeout(timeoutMs) });
}

function parseSetCookie(raw) {
  const cookiePart = String(raw).split(";")[0];
  const eq = cookiePart.indexOf("=");
  if (eq < 1) return null;
  const name = cookiePart.slice(0, eq).trim();
  const value = cookiePart.slice(eq + 1).trim();
  if (!name) return null;
  return { name, value };
}

function setCookiesFromResponse(response, cookieMap) {
  const rawCookies = [];
  if (typeof response.headers.getSetCookie === "function") {
    try {
      rawCookies.push(...response.headers.getSetCookie());
    } catch {
      // ignore getSetCookie errors
    }
  }
  if (rawCookies.length === 0) {
    const single = response.headers.get("set-cookie");
    if (single) rawCookies.push(single);
  }

  for (const raw of rawCookies) {
    const parsed = parseSetCookie(raw);
    if (parsed) cookieMap.set(parsed.name, parsed.value);
  }
}

function textSnippet(text, max = 500) {
  return String(text).replace(/\s+/g, " ").trim().slice(0, max);
}

async function assertRedirectToCalendar(response, label, nextOrigin, getLogText) {
  if (!(response.status >= 300 && response.status < 400)) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${label} expected redirect to /calendar, got ${response.status}\nnext log:\n${getLogText().slice(-4000)}\nresponse body:\n${textSnippet(body)}`
    );
  }

  const location = response.headers.get("location");
  if (!location) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${label} redirect missing location header\nnext log:\n${getLogText().slice(-4000)}\nresponse body:\n${textSnippet(body)}`
    );
  }

  const redirectUrl = new URL(location, nextOrigin);
  if (redirectUrl.pathname !== "/calendar") {
    throw new Error(`${label} redirected to ${location}, expected /calendar`);
  }
}

async function assertLoginRedirect(nextOrigin) {
  const response = await fetchManual(`${nextOrigin}/auth/login?next=${encodeURIComponent("/calendar")}`, new Map(), 15000);
  const location = response.headers.get("location");
  if (!(response.status >= 300 && response.status < 400)) {
    const body = await response.text().catch(() => "");
    throw new Error(`/auth/login should redirect to Steam OpenID, got ${response.status}\nresponse body:\n${textSnippet(body)}`);
  }
  if (!location?.startsWith("https://steamcommunity.com/openid/login?")) {
    throw new Error(`/auth/login redirected to ${location}`);
  }
  await cancelBody(response);
}

async function runBrowserFlow({ browser, nextOrigin, fakeVerifier, callbackUrl, sessionToken, getLogText }) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await context.route("**/*", async (route) => {
      try {
        const url = new URL(route.request().url());
        if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
          await route.continue();
          return;
        }
        if (url.protocol === "http:" || url.protocol === "https:") {
          await route.fulfill({ status: 204, body: "" });
          return;
        }
        await route.abort();
      } catch {
        await route.abort();
      }
    });

    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: sessionToken,
        url: nextOrigin,
      },
    ]);

    const page = await context.newPage();
    const verificationPromise = fakeVerifier.waitForVerification(`${nextOrigin}/auth/callback`);
    const callbackResponse = await page.goto(callbackUrl, { waitUntil: "load", timeout: 60000 });
    await verificationPromise;

    if (callbackResponse && callbackResponse.status() !== 200) {
      throw new Error(`Authenticated callback render returned ${callbackResponse.status()}`);
    }

    const calendarUrl = new URL(page.url());
    if (calendarUrl.pathname !== "/calendar") {
      throw new Error(`Expected callback to render /calendar, got ${page.url()}\nnext log:\n${getLogText().slice(-4000)}`);
    }

    const pageContent = await page.content();
    if (!pageContent.includes(gameName)) {
      throw new Error(`Authenticated /calendar did not contain ${gameName}\npage snippet:\n${textSnippet(pageContent)}\nnext log:\n${getLogText().slice(-4000)}`);
    }

    await page.locator("a.calendar-game-card", { hasText: gameName }).waitFor({ state: "attached", timeout: 15000 });

    await page.goto(`${nextOrigin}/`, { waitUntil: "load", timeout: 60000 });
    const rootUrl = new URL(page.url());
    if (rootUrl.pathname !== "/calendar") {
      throw new Error(`Expected authenticated root to redirect to /calendar, got ${page.url()}`);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

async function runHttpFlow({ nextOrigin, fakeVerifier, callbackUrl, sessionToken, getLogText }) {
  const cookieMap = new Map([[SESSION_COOKIE, sessionToken]]);

  const verificationPromise = fakeVerifier.waitForVerification(`${nextOrigin}/auth/callback`);
  const callbackResponse = await fetchManual(callbackUrl, cookieMap, 60000);
  try {
    await verificationPromise;
  } catch (error) {
    const body = await callbackResponse.text().catch(() => "");
    throw new Error(
      `OpenID verification was not observed for ${callbackUrl}: ${error?.message ?? error}\ncallback status: ${callbackResponse.status}\nnext log:\n${getLogText().slice(-4000)}\nresponse body:\n${textSnippet(body)}`
    );
  }

  await assertRedirectToCalendar(callbackResponse, "/auth/callback", nextOrigin, getLogText);
  setCookiesFromResponse(callbackResponse, cookieMap);
  await cancelBody(callbackResponse);

  const calendarResponse = await fetchManual(`${nextOrigin}/calendar`, cookieMap, 60000);
  const calendarText = await calendarResponse.text();
  if (calendarResponse.status !== 200) {
    throw new Error(
      `Authenticated /calendar returned ${calendarResponse.status}\nnext log:\n${getLogText().slice(-4000)}\nresponse body:\n${textSnippet(calendarText)}`
    );
  }
  if (!calendarText.includes(gameName)) {
    throw new Error(
      `Authenticated /calendar did not contain ${gameName}\nresponse body:\n${textSnippet(calendarText)}\nnext log:\n${getLogText().slice(-4000)}`
    );
  }
  if (!calendarText.includes("calendar-game-card")) {
    throw new Error(
      `Authenticated /calendar did not contain calendar-game-card\nresponse body:\n${textSnippet(calendarText)}\nnext log:\n${getLogText().slice(-4000)}`
    );
  }

  const rootResponse = await fetchManual(`${nextOrigin}/`, cookieMap, 30000);
  await assertRedirectToCalendar(rootResponse, "authenticated /", nextOrigin, getLogText);
  await cancelBody(rootResponse);
}

async function main() {
  const today = todayISO();
  const savedSettings = await saveUserSettings(steamId, {});
  if (!savedSettings) throw new Error("Failed to seed test user settings");

  const seeded = new Set();
  for (const releaseDate of dateRange(today)) {
    const key = upcomingCacheKeyFromContext({
      steamId,
      apiKey: undefined,
      rawgApiKey: undefined,
      storeCc: undefined,
      today: releaseDate,
    });
    if (seeded.has(key)) continue;
    seeded.add(key);

    await cacheSet(
      key,
      {
        games: [
          {
            appid: 424242,
            name: gameName,
            sources: ["wishlist"],
            releaseDate,
            dateSource: "steam",
            steamUrl: "https://store.steampowered.com/app/424242/",
          },
        ],
        warnings: [],
        libraryAvailable: true,
        wishlistPrivate: false,
        wishlistPartial: false,
        wishlistShown: 1,
      },
      10 * 60 * 1000
    );

    const seededResult = await cacheGet(key);
    if (seededResult === undefined) throw new Error(`Failed to seed upcoming cache for ${key}`);
  }

  const sessionToken = await createDbSession({
    steamId,
    displayName: "Auth Test User",
    avatar: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/avatars/test/test.jpg",
  });
  if (!sessionToken) throw new Error("Failed to create test DB session");

  const fakeVerifier = await startFakeOpenIdVerifier();
  const nextPort = await getAvailablePort();
  const nextOrigin = `http://127.0.0.1:${nextPort}`;
  const signedKeys = [
    "ns",
    "op_endpoint",
    "identity",
    "return_to",
    "claimed_id",
    "response_nonce",
    "assoc_handle",
  ];
  const callbackUrl = buildCallbackUrl(nextOrigin, steamId, signedKeys);
  const nextEnv = { ...process.env };
  delete nextEnv.RAWG_API_KEY;
  delete nextEnv.STEAM_API_KEY;
  delete nextEnv.SESSION_PASSWORD;
  nextEnv.NODE_ENV = "development";
  nextEnv.TZ = "UTC";
  nextEnv.AUTH_BASE_URL = nextOrigin;
  nextEnv.COOKIE_SECURE = "false";
  nextEnv.DB_SQLITE_PATH = dbPath;
  nextEnv.DB_ENCRYPTION_KEY = testEncryptionKey;
  nextEnv.STEAM_OPENID_VERIFY_URL = fakeVerifier.url;
  nextEnv.STEAM_OPENID_TIMEOUT_MS = "2000";
  nextEnv.STEAM_OPENID_VERIFY_ATTEMPTS = "1";
  nextEnv.STEAM_OPENID_FAMILY = "4";
  nextEnv.NEXT_TELEMETRY_DISABLED = "1";
  nextEnv.NO_COLOR = "1";

  let nextOutput = "";
  const child = spawn(
    process.execPath,
    [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "--port", String(nextPort)],
    {
      cwd: projectRoot,
      env: nextEnv,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  child.stdout?.on("data", (chunk) => {
    nextOutput += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    nextOutput += chunk.toString();
  });

  let browser;
  try {
    await waitForNextDev(child, nextOrigin, nextOutput);
    await assertLoginRedirect(nextOrigin);

    browser = await launchBrowser();
    const flowContext = {
      nextOrigin,
      fakeVerifier,
      callbackUrl,
      sessionToken,
      getLogText: () => nextOutput,
    };

    if (browser) {
      try {
        await runBrowserFlow({ browser, ...flowContext });
        console.log("Auth render test passed (browser)");
      } catch (browserError) {
        if (requireBrowser) {
          throw new Error(
            `Browser flow failed and AUTH_RENDER_REQUIRE_BROWSER=1 was set. ${browserError?.stack ?? browserError?.message ?? browserError}`
          );
        }
        console.warn(
          `Browser flow failed; falling back to authenticated HTTP render: ${browserError?.stack ?? browserError?.message ?? browserError}`
        );
        await browser.close().catch(() => {});
        browser = null;
        await runHttpFlow(flowContext);
        console.log("Auth render test passed (HTTP fallback)");
      }
    } else {
      console.warn("Playwright/Chromium unavailable; using authenticated HTTP fallback.");
      await runHttpFlow(flowContext);
      console.log("Auth render test passed (HTTP fallback)");
    }
  } finally {
    if (child.exitCode === null && child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore cleanup failure
        }
      }
    }
    if (browser) await browser.close().catch(() => {});
    await fakeVerifier.close().catch(() => {});
    await destroyDbSession(sessionToken).catch(() => {});
    rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
