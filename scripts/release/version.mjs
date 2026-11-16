#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const packageJsonPath = path.join(repoRoot, "package.json");
const packageLockPath = path.join(repoRoot, "package-lock.json");
const cargoTomlPath = path.join(repoRoot, "desktop/src-tauri/Cargo.toml");
const tauriConfPath = path.join(repoRoot, "desktop/src-tauri/tauri.conf.json");
const tauriWindowsConfPath = path.join(repoRoot, "desktop/src-tauri/tauri.windows.conf.json");
const semverPattern = /^([0-9]+)\.([0-9]+)(\.[0-9]+)?(-[0-9A-Za-z.-]+)?$/;

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return "";
  return String(result.stdout || "").trim();
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeIfChanged(filePath, nextContent) {
  const current = readText(filePath);
  if (current === nextContent) return false;
  fs.writeFileSync(filePath, nextContent);
  return true;
}

function normalizeVersion(raw, source) {
  const value = String(raw || "").trim();
  if (!value) return null;

  const withoutPrefix = value.replace(/^[vV]/, "");
  if (!semverPattern.test(withoutPrefix)) {
    throw new Error(
      `Invalid app version "${value}" from ${source}. Use a semver-like value such as 1.2.3, 1.2.3-beta.1, or v1.2.3.`
    );
  }

  return withoutPrefix;
}

function versionFromEnv() {
  const envNames = [
    "STEAM_CALENDAR_VERSION",
    "APP_VERSION",
    "VERSION_INPUT",
    "VERSION",
    "GITHUB_REF_NAME",
    "GITHUB_REF",
  ];

  for (const envName of envNames) {
    const raw = process.env[envName] || "";
    if (!raw) continue;

    if (envName === "GITHUB_REF_NAME" && process.env.GITHUB_REF_TYPE !== "tag") continue;
    if (envName === "GITHUB_REF") {
      const tag = raw.match(/refs\/tags\/(.+)$/);
      if (!tag) continue;
      return normalizeVersion(tag[1], envName);
    }

    return normalizeVersion(raw, envName);
  }

  return null;
}

function versionFromGitTag() {
  const tags = runGit(["tag", "--points-at", "HEAD", "--sort=-v:refname"]);
  if (!tags) return null;

  for (const tag of tags.split(/\r?\n/)) {
    if (!tag || !/^v[0-9]/.test(tag)) continue;
    return normalizeVersion(tag, "git tag at HEAD");
  }

  const exactTag = runGit(["describe", "--tags", "--exact-match", "--match", "v*"]);
  if (!exactTag) return null;

  return normalizeVersion(exactTag, "git describe exact tag");
}

function versionFromPackageJson() {
  return normalizeVersion(JSON.parse(readText(packageJsonPath)).version, "package.json");
}

export function resolveAppVersion() {
  return versionFromEnv() || versionFromGitTag() || versionFromPackageJson();
}

function updatePackageJson(version) {
  const content = readText(packageJsonPath);
  const next = content.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`);
  return writeIfChanged(packageJsonPath, next);
}

function updatePackageLock(version) {
  const lock = JSON.parse(readText(packageLockPath));
  lock.version = version;
  lock.packages[""].version = version;
  return writeIfChanged(packageLockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

function updateCargoToml(version) {
  const content = readText(cargoTomlPath);
  const next = content.replace(/^version = "[^"]*"/m, `version = "${version}"`);
  return writeIfChanged(cargoTomlPath, next);
}

function updateTauriConfig(filePath, version) {
  const config = JSON.parse(readText(filePath));
  config.version = version;
  return writeIfChanged(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function syncVersion(version) {
  const changed = [
    updatePackageJson(version),
    updatePackageLock(version),
    updateCargoToml(version),
    updateTauriConfig(tauriConfPath, version),
    updateTauriConfig(tauriWindowsConfPath, version),
  ];

  return {
    version,
    changed: changed.some(Boolean),
  };
}

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/release/version.mjs [get|sync]",
      "  get   print the resolved app version",
      "  sync  update package.json, package-lock.json, Cargo.toml and Tauri configs",
      "",
      "Resolution order:",
      "  STEAM_CALENDAR_VERSION or VERSION or GitHub tag ref",
      "  exact git tag at HEAD",
      "  package.json",
      "",
    ].join("\n")
  );
}

function main() {
  const command = process.argv[2] || "get";

  if (command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  const version = resolveAppVersion();

  if (command === "get") {
    process.stdout.write(`${version}\n`);
    return;
  }

  if (command === "sync") {
    const result = syncVersion(version);
    process.stdout.write(
      `App version ${result.version}${result.changed ? " synced" : " already up to date"}\n`
    );
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main();
