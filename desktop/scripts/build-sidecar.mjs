#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const desktopDir = path.resolve(scriptsDir, "..");
const repoRoot = path.resolve(desktopDir, "..");

const sidecarBaseName = process.env.STEAM_CALENDAR_SIDECAR_NAME || "steam-calendar-node";
const buildDir = path.join(desktopDir, ".build");
const appDir = path.join(buildDir, "app");
const standaloneDir = path.join(repoRoot, ".next", "standalone");
const staticDir = path.join(repoRoot, ".next", "static");
const publicDir = path.join(repoRoot, "public");
const tauriDir = path.join(desktopDir, "src-tauri");
const binariesDir = path.join(tauriDir, "binaries");

function ensureDirectory(dir) {
  mkdirSync(dir, { recursive: true });
}

function requireFile(file, message) {
  if (!existsSync(file)) {
    throw new Error(message + ". Missing: " + file);
  }
}

function requireDir(dir, message) {
  if (!existsSync(dir)) {
    throw new Error(message + ". Missing: " + dir);
  }
}

function copyFile(src, dest, executable) {
  ensureDirectory(path.dirname(dest));
  rmSync(dest, { force: true });
  cpSync(src, dest, { dereference: true });
  if (executable) {
    chmodSync(dest, 0o755);
  }
}

function hostTripleFromRustc() {
  const result = spawnSync("rustc", ["-vV"], { encoding: "utf8", shell: false });
  if (result.status !== 0) return null;
  const match = /^host:\s*(.+)$/m.exec(result.stdout || "");
  return match?.[1]?.trim() ?? null;
}

function fallbackTriple() {
  const archMap = { arm64: "aarch64", ia32: "i686", x64: "x86_64" };
  const arch = archMap[process.arch] || process.arch;

  if (process.platform === "darwin") return arch + "-apple-darwin";
  if (process.platform === "win32") return arch + "-pc-windows-msvc";

  if (process.platform === "linux") {
    const candidates =
      arch === "aarch64"
        ? ["/lib/ld-musl-aarch64.so.1"]
        : ["/lib/ld-musl-x86_64.so.1", "/lib/ld-musl-x86_64.so"];

    const libc = candidates.some((candidate) => existsSync(candidate)) ? "musl" : "gnu";
    return arch + "-unknown-linux-" + libc;
  }

  return arch + "-unknown-" + process.platform;
}

function hostTriple() {
  return (hostTripleFromRustc() || fallbackTriple()).trim();
}

function targetTriple() {
  return (
    process.env.STEAM_CALENDAR_TARGET_TRIPLE ||
    process.env.TAURI_ENV_TARGET_TRIPLE ||
    hostTriple()
  ).trim();
}

function binaryExtension(triple) {
  if (triple.includes("windows") || process.platform === "win32") return ".exe";
  return "";
}

function targetDebugDir(triple) {
  const debugPath = triple === hostTriple() ? "debug" : triple + "/debug";
  return path.join(tauriDir, "target", debugPath);
}

function stageNextApp() {
  const buildMessage = "Run npm run build in the repo root first";

  requireDir(standaloneDir, buildMessage);
  requireFile(path.join(standaloneDir, "server.js"), buildMessage);
  requireDir(staticDir, "Missing Next.js static assets");

  rmSync(appDir, { recursive: true, force: true });
  ensureDirectory(appDir);

  cpSync(standaloneDir, appDir, { recursive: true, dereference: false });
  ensureDirectory(path.join(appDir, ".next"));
  cpSync(staticDir, path.join(appDir, ".next", "static"), { recursive: true, dereference: false });

  if (existsSync(publicDir)) {
    cpSync(publicDir, path.join(appDir, "public"), { recursive: true, dereference: false });
  }
}

function copySidecarBinary(triple) {
  const nodeExecutable = process.env.STEAM_CALENDAR_NODE_BINARY || process.execPath;
  requireFile(nodeExecutable, "Could not locate the configured Node executable");

  const extension = binaryExtension(triple);
  const debugDir = targetDebugDir(triple);

  ensureDirectory(binariesDir);
  ensureDirectory(debugDir);

  const patternedBinary = path.join(binariesDir, sidecarBaseName + "-" + triple + extension);
  const baseBinary = path.join(binariesDir, sidecarBaseName + extension);
  const devBinary = path.join(debugDir, sidecarBaseName + extension);

  copyFile(nodeExecutable, patternedBinary, true);
  copyFile(nodeExecutable, baseBinary, true);
  copyFile(nodeExecutable, devBinary, true);

  return { patternedBinary, baseBinary, devBinary };
}

function main() {
  const triple = targetTriple();
  stageNextApp();
  const binaries = copySidecarBinary(triple);

  process.stdout.write("Staged sidecar app in " + appDir + "\n");
  process.stdout.write("Target triple: " + triple + "\n");
  process.stdout.write("Sidecar binary: " + binaries.patternedBinary + "\n");
  process.stdout.write("Dev sidecar binary: " + binaries.devBinary + "\n");
}

main();
