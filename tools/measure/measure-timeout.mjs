#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultBaseUrl = "http://localhost:5000";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const benchPath = path.join(scriptDir, "../bench/calendar-bench.mjs");

const EVENT_NAMES = [
  "upcoming.phase.total",
  "upcoming.phase.wishlist",
  "upcoming.phase.owned",
  "upcoming.phase.earlyOwned",
  "upcoming.phase.earlyDetails",
  "upcoming.phase.details",
  "upcoming.phase.rawg",
  "upcoming.candidates",
  "wishlist.phase.api",
  "wishlist.phase.page",
  "wishlist.phase.finalize",
  "wishlist.total",
  "wishlistTotal.ownedCache",
  "steam.getAppDetails.start",
  "steam.getAppDetails.done",
  "steam.appdetails.finished",
  "steam.appdetails.primary_failed",
  "steam.appdetails.fallback_failed",
  "steam.appdetails.retry_succeeded",
  "steam.getAppDetails.retry.enqueued",
  "steam.getAppDetails.retry.failed",
  "calendar.page.render",
  "calendarFeed.render",
  "ics.built",
];

const SNIPPET_NAMES = [
  "Prepared keys",
  "upcoming.phase.total",
  "wishlist.phase.api",
  "wishlist.phase.page",
  "steam.getAppDetails.start",
  "steam.appdetails.primary_failed",
  "steam.appdetails.fallback_failed",
  "steam.getAppDetails.done",
  "calendar.page.render",
  "calendarFeed.render",
  "ics.built",
];

function parseArgs(argv) {
  const out = {
    label: "run",
    clearCache: false,
    build: false,
    noUp: false,
    append: true,
    notes: "",
    timeoutsFile: "timeouts.md",
    baseUrl: defaultBaseUrl,
    env: {},
    envPairs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--label") {
      out.label = argv[++i] ?? out.label;
    } else if (arg === "--clear-cache") {
      out.clearCache = true;
    } else if (arg === "--build") {
      out.build = true;
    } else if (arg === "--no-up") {
      out.noUp = true;
    } else if (arg === "--no-append") {
      out.append = false;
    } else if (arg === "--notes") {
      out.notes = argv[++i] ?? "";
    } else if (arg === "--timeouts-file") {
      out.timeoutsFile = argv[++i] ?? out.timeoutsFile;
    } else if (arg === "--base-url") {
      out.baseUrl = argv[++i] ?? out.baseUrl;
    } else if (arg === "--env") {
      const pair = argv[++i] ?? "";
      const eq = pair.indexOf("=");
      if (eq <= 0) throw new Error(`--env requires KEY=VALUE: ${pair}`);
      out.env[pair.slice(0, eq)] = pair.slice(eq + 1);
      out.envPairs.push(pair);
    } else {
      throw new Error(`unknown arg: ${arg}`);
    }
  }

  if (!out.label) throw new Error("--label is required");
  return out;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function execCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(Object.assign(new Error(`${command} exited with code ${code}: ${stderr}`), { stdout, stderr }));
    });
  });
}

function buildBenchArgs(opts) {
  const args = [benchPath, "--label", opts.label, "--base-url", opts.baseUrl];
  if (opts.build) args.push("--build");
  if (opts.clearCache) args.push("--clear-cache");
  if (opts.noUp) args.push("--no-up");
  for (const pair of opts.envPairs) {
    args.push("--env", pair);
  }
  return args;
}

async function runBench(opts) {
  return execCapture(process.execPath, buildBenchArgs(opts), {
    env: { ...process.env, ...opts.env },
  });
}

function parseBenchmarkJson(stdout) {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const marker = stdout.lastIndexOf('{\n  "label"');
    if (marker < 0) throw new Error(`benchmark JSON not found in stdout:\n${stdout}`);
    return JSON.parse(stdout.slice(marker));
  }
}

function redactSteamId(value, steamId) {
  if (!steamId) return value;
  return String(value).split(steamId).join("<steamId>");
}

async function getContainerId() {
  try {
    const out = await execCapture("docker", ["compose", "ps", "-q", "app"]);
    const id = out.stdout.trim();
    if (id) return id;
  } catch {
    // fallback below
  }
  return "ai_slop-app-1";
}

async function getContainerLogs(containerId, startTime, tail = 2500) {
  const since = new Date(startTime).toISOString();
  try {
    const out = await execCapture("docker", [
      "logs",
      "--since",
      since,
      "--tail",
      String(tail),
      containerId,
    ]);
    return `${out.stdout}\n${out.stderr}`;
  } catch (error) {
    return `Failed to read container logs: ${error instanceof Error ? error.message : String(error)}\n`;
  }
}

async function debugDownloadParams(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/debug/download-params`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json();
    return { status: res.status, body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function extractNumber(line, key) {
  const match = line.match(new RegExp(`"${key}"\\s*:\\s*([0-9]+)`));
  return match ? Number(match[1]) : undefined;
}

function eventLines(logText, name) {
  return logText
    .split("\n")
    .filter((line) => line.includes(name))
    .map((line) => ({ line, ms: extractNumber(line, "ms") }));
}

function buildEventRows(logText) {
  const rows = [];
  for (const name of EVENT_NAMES) {
    const events = eventLines(logText, name);
    if (events.length === 0) continue;
    const last = events.at(-1);
    const ms = last.ms ?? extractNumber(last.line, "elapsedMs") ?? "";
    rows.push(`| ${name} | ${events.length} | ${ms === undefined ? "" : ms} |`);
  }
  return rows;
}

function buildSnippets(logText) {
  const lines = logText.split("\n");
  const snippets = [];
  for (const name of SNIPPET_NAMES) {
    const line = [...lines].reverse().find((candidate) => candidate.includes(name));
    if (line) snippets.push(line);
  }
  return snippets.join("\n");
}

function buildCommand(opts) {
  const parts = ["node", "tools/measure/measure-timeout.mjs", "--label", shellQuote(opts.label)];
  if (opts.build) parts.push("--build");
  if (opts.clearCache) parts.push("--clear-cache");
  if (opts.noUp) parts.push("--no-up");
  if (!opts.append) parts.push("--no-append");
  if (opts.notes) parts.push("--notes", shellQuote(opts.notes));
  if (opts.baseUrl !== defaultBaseUrl) parts.push("--base-url", shellQuote(opts.baseUrl));
  if (opts.timeoutsFile !== "timeouts.md") parts.push("--timeouts-file", shellQuote(opts.timeoutsFile));
  for (const pair of opts.envPairs) {
    parts.push("--env", shellQuote(pair));
  }
  return parts.join(" ");
}

function buildEnvRows(env) {
  const entries = Object.entries(env ?? {});
  if (entries.length === 0) return "- default env";
  return entries.map(([key, value]) => `- \`${key}=${value}\``).join("\n");
}

function buildMarkdown(opts, bench, debug, logText) {
  const envRows = buildEnvRows(bench.env);
  const eventRows = buildEventRows(logText);
  const snippets = redactSteamId(buildSnippets(logText), bench.steamId);
  const debugText = redactSteamId(JSON.stringify(debug ?? {}, null, 2), bench.steamId);
  const command = buildCommand(opts);
  const benchCommand = buildBenchArgs(opts).join(" ");

  return `## ${opts.label}

- timestamp: ${new Date().toISOString()}
- notes: ${opts.notes || "-"}
- command: \`${command}\`
- benchmark command: \`${redactSteamId(benchCommand, bench.steamId)}\`
- readyMs: ${bench.readyMs}
- renderMs: ${bench.renderMs}
- totalMs: ${bench.totalMs}
- httpStatus: ${bench.httpStatus}
- bodyBytes: ${bench.bodyBytes}
- clearCache: ${bench.clearCache}
- build: ${opts.build}
- noUp: ${opts.noUp}

### Env

${envRows}

### Effective Steam appdetails params

\`\`\`json
${debugText}
\`\`\`

### Log event summary

| event | count | last_ms |
|---|---:|---:|
${eventRows.join("\n") || "| no matching events | 0 |  |"}

### Log excerpts

\`\`\`text
${snippets || "no matching logs"}
\`\`\`

`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const startAll = Date.now();
  const benchOut = await runBench(opts);
  const bench = parseBenchmarkJson(benchOut.stdout);
  const containerId = await getContainerId();
  const logText = await getContainerLogs(containerId, startAll);
  const debug = await debugDownloadParams(opts.baseUrl);
  const markdown = buildMarkdown(opts, bench, debug, logText);
  const timeoutsPath = path.resolve(process.cwd(), opts.timeoutsFile);

  if (opts.append) {
    await appendFile(timeoutsPath, markdown, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        label: opts.label,
        timeoutsFile: timeoutsPath,
        readyMs: bench.readyMs,
        renderMs: bench.renderMs,
        totalMs: bench.totalMs,
        httpStatus: bench.httpStatus,
        bodyBytes: bench.bodyBytes,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
