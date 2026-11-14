#!/usr/bin/env node
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const out = { label: "run", clearCache: false, clearCacheOnly: false, build: false, noUp: false, env: {}, baseUrl: "http://localhost:5000" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--label") out.label = argv[++i];
    else if (arg === "--clear-cache") out.clearCache = true;
    else if (arg === "--clear-cache-only") {
      out.clearCacheOnly = true;
      out.clearCache = true;
    }
    else if (arg === "--build") out.build = true;
    else if (arg === "--no-up") out.noUp = true;
    else if (arg === "--base-url") out.baseUrl = argv[++i];
    else if (arg === "--env") {
      const pair = argv[++i] ?? "";
      const eq = pair.indexOf("=");
      if (eq > 0) out.env[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else {
      throw new Error(`unknown arg: ${arg}`);
    }
  }
  return out;
}

function assertSteamId(steamId) {
  const value = String(steamId ?? "").trim();
  if (!/^\d+$/.test(value)) throw new Error("invalid steam_id");
  return value;
}

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function execCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function healthReady(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(50);
  }
  throw new Error("health timeout");
}

async function getSteamId() {
  const script = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_SQLITE_PATH);
const row = db.prepare('SELECT steam_id FROM users ORDER BY updated_at DESC LIMIT 1').get();
console.log(row?.steam_id ?? '');
`;
  const out = await execCapture("docker", ["exec", "ai_slop-app-1", "node", "-e", script]);
  const steamId = assertSteamId(out.stdout.trim());
  return steamId;
}

async function ensureBenchmarkFeed(steamId) {
  const steamIdLiteral = JSON.stringify(assertSteamId(steamId));
  const script = `
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_SQLITE_PATH);
const token = 'local-benchmark-token';
const hash = createHash('sha256').update(token).digest('hex');
const existing = db.prepare('SELECT token_hash FROM calendar_feeds WHERE token_hash = ?').get(hash);
if (!existing) {
  const ts = Date.now();
  db.prepare('INSERT INTO calendar_feeds (token_hash, steam_id, token_cipher, created_at, updated_at) VALUES (?,?,?,?,?)').run(hash, ${steamIdLiteral}, 'benchmark', ts, ts);
}
console.log('ok');
`;
  await exec("docker", ["exec", "ai_slop-app-1", "node", "-e", script]);
}

async function clearCaches(steamId) {
  const steamIdLiteral = JSON.stringify(assertSteamId(steamId));
  const script = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_SQLITE_PATH);
const steamId = ${steamIdLiteral};
const prefixes = [
  'upcoming:v5:' + steamId + '%',
  'wishlist:v2:' + steamId + '%',
  'owned:' + steamId + '%',
  'appdetails:%'
];
const before = {
  aggregate: db.prepare('SELECT COUNT(*) AS count FROM cache_entries WHERE key LIKE ?').get(prefixes[0]).count,
  wishlist: db.prepare('SELECT COUNT(*) AS count FROM cache_entries WHERE key LIKE ?').get(prefixes[1]).count,
  owned: db.prepare('SELECT COUNT(*) AS count FROM cache_entries WHERE key LIKE ?').get(prefixes[2]).count,
  appdetails: db.prepare('SELECT COUNT(*) AS count FROM cache_entries WHERE key LIKE ?').get(prefixes[3]).count,
};
db.prepare('DELETE FROM cache_entries WHERE key LIKE ? OR key LIKE ? OR key LIKE ? OR key LIKE ?').run(prefixes[0], prefixes[1], prefixes[2], prefixes[3]);
console.log(JSON.stringify({ cleared: true, before }, null, 2));
`;
  await exec("docker", ["exec", "ai_slop-app-1", "node", "-e", script]);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const startAll = Date.now();
  if (!opts.noUp) {
    const args = ["compose", "up", "-d", "--force-recreate"];
    if (opts.build) args.push("--build");
    await exec("docker", args, { env: { ...process.env, ...opts.env } });
  }

  let readyMs = 0;
  if (!(opts.noUp && opts.clearCacheOnly)) {
    await healthReady(opts.baseUrl, 180000);
    readyMs = Date.now() - startAll;
  }

  const steamId = await getSteamId();
  await ensureBenchmarkFeed(steamId);
  if (opts.clearCache) await clearCaches(steamId);

  if (opts.clearCacheOnly) {
    console.log(JSON.stringify({
      label: opts.label,
      env: opts.env,
      clearCacheOnly: true,
      steamId,
      readyMs,
      totalMs: Date.now() - startAll,
    }, null, 2));
    return;
  }

  const requestStart = Date.now();
  const res = await fetch(`${opts.baseUrl}/calendar/ics?token=local-benchmark-token`, {
    cache: "no-store",
    signal: AbortSignal.timeout(300000),
  });
  const body = await res.text();
  const renderMs = Date.now() - requestStart;

  console.log(JSON.stringify({
    label: opts.label,
    env: opts.env,
    clearCache: opts.clearCache,
    steamId,
    readyMs,
    httpStatus: res.status,
    renderMs,
    totalMs: Date.now() - startAll,
    bodyBytes: Buffer.byteLength(body),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
