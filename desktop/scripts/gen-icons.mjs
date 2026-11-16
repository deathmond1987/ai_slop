#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const desktopDir = path.resolve(scriptsDir, "..");
const projectRoot = path.resolve(desktopDir, "..");
const assetsDir = path.join(desktopDir, "assets");
const iconsDir = path.join(desktopDir, "src-tauri", "icons");
const tempDir = path.join(desktopDir, ".tmp-icons");
const sourceIcon = path.join(assetsDir, "app-icon.svg");

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const pngSizes = [...icoSizes, 512];
const outputIcons = [
  { name: "icon-16x16.png", sourceSize: 16 },
  { name: "icon-32x32.png", sourceSize: 32 },
  { name: "16x16.png", sourceSize: 16 },
  { name: "32x32.png", sourceSize: 32 },
  { name: "128x128.png", sourceSize: 128 },
  { name: "128x128@2x.png", sourceSize: 256 },
  { name: "icon.png", sourceSize: 512 },
];

function runTauriIcon() {
  const cliPath = path.join(projectRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
  const args = ["icon", sourceIcon, "--output", tempDir, "--png", pngSizes.join(",")];

  if (existsSync(cliPath)) {
    return spawnSync(process.execPath, [cliPath, ...args], {
      cwd: projectRoot,
      stdio: "inherit",
    });
  }

  return spawnSync("npx", ["--no-install", "tauri", ...args], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function encodeIco(images) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(images.length, 4);

  const headerSize = 6 + images.length * 16;
  const entries = [];
  const data = [];
  let offset = headerSize;

  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size === 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size === 256 ? 0 : image.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.bytes.length, 8);
    entry.writeUInt32LE(offset, 12);

    entries.push(entry);
    data.push(image.bytes);
    offset += image.bytes.length;
  }

  return Buffer.concat([dir, ...entries, ...data]);
}

try {
  if (!existsSync(sourceIcon)) {
    throw new Error(`Missing desktop icon source: ${sourceIcon}`);
  }

  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(iconsDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });

  const result = runTauriIcon();
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Tauri icon generation failed with exit code ${result.status}`);
  }

  const pngBySize = new Map();
  for (const size of pngSizes) {
    const pngPath = path.join(tempDir, `${size}x${size}.png`);
    if (!existsSync(pngPath)) {
      throw new Error(`Tauri icon generation did not produce ${pngPath}`);
    }
    pngBySize.set(size, readFileSync(pngPath));
  }

  for (const outputIcon of outputIcons) {
    const bytes = pngBySize.get(outputIcon.sourceSize);
    if (!bytes) {
      throw new Error(`Missing generated PNG size ${outputIcon.sourceSize} for ${outputIcon.name}`);
    }
    writeFileSync(path.join(iconsDir, outputIcon.name), bytes);
  }

  writeFileSync(
    path.join(iconsDir, "icon.ico"),
    encodeIco(icoSizes.map((size) => ({ size, bytes: pngBySize.get(size) })))
  );

  process.stdout.write(`Generated ${outputIcons.length + 1} desktop icon(s) from ${sourceIcon}\n`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
