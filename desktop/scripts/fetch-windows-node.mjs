#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const desktopDir = path.resolve(scriptsDir, "..");
const outDir = path.join(desktopDir, ".build", "node-windows");
const nodeExePath = path.join(outDir, "node.exe");

function normalizeVersion(value) {
  return String(value || "current").replace(/^v/, "").trim();
}

function requireFile(file, message) {
  if (!existsSync(file)) {
    throw new Error(message + ". Missing: " + file);
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch " + url + ": " + response.status + " " + response.statusText);
  }
  return response.json();
}

async function resolveNodeVersion(requested) {
  const versions = await fetchJson("https://nodejs.org/dist/index.json");
  const exact = versions.find(
    (item) => item.version === "v" + requested && item.files?.includes("win-x64-zip")
  );
  if (exact) return exact.version;

  const major = requested.split(".")[0];
  const fallback = versions.find(
    (item) => item.version.startsWith("v" + major + ".") && item.files?.includes("win-x64-zip")
  );

  if (!fallback) {
    throw new Error("Could not find a Windows Node.js distribution for version " + requested);
  }

  return fallback.version;
}

async function main() {
  if (existsSync(nodeExePath)) {
    process.stdout.write("Windows Node sidecar binary already exists: " + nodeExePath + "\n");
    return;
  }

  const requested = normalizeVersion(
    process.env.STEAM_CALENDAR_WINDOWS_NODE_VERSION || process.version
  );
  const versionName = await resolveNodeVersion(requested);
  const archiveName = "node-" + versionName + "-win-x64.zip";
  const url = "https://nodejs.org/dist/" + versionName + "/" + archiveName;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to download " + url + ": " + response.status + " " + response.statusText);
  }

  const archive = Buffer.from(await response.arrayBuffer());
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const archivePath = path.join(outDir, archiveName);
  const extractDir = path.join(outDir, "extracted");
  mkdirSync(extractDir, { recursive: true });
  writeFileSync(archivePath, archive);

  const unzip = spawnSync("unzip", ["-q", archivePath, "-d", extractDir], { shell: false });
  if (unzip.status !== 0) {
    throw new Error(
      "Failed to extract " + archiveName + ": " + String(unzip.stderr || unzip.error || "")
    );
  }

  const nodeSource = path.join(extractDir, "node-" + versionName + "-win-x64", "node.exe");
  requireFile(nodeSource, "Downloaded Windows Node archive did not contain node.exe");
  cpSync(nodeSource, nodeExePath, { dereference: true });

  rmSync(archivePath, { force: true });
  rmSync(extractDir, { recursive: true, force: true });

  process.stdout.write("Downloaded Windows Node sidecar binary: " + nodeExePath + "\n");
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + "\n");
  process.exit(1);
});
