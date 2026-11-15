#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const desktopDir = path.resolve(scriptsDir, "..");
const iconsDir = path.join(desktopDir, "src-tauri", "icons");

const palette = {
  background: [31, 36, 48, 255],
  calendarBody: [246, 248, 250, 255],
  calendarBar: [47, 129, 247, 255],
  calendarLeg: [139, 148, 158, 255],
  grid: [208, 215, 222, 255],
};

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const name = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([name, data])) >>> 0);

  return Buffer.concat([length, name, data, crc]);
}

function encodePng(width, height, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (1 + width * 4);
    raw[rawOffset] = 0;
    pixels.copy(raw, rawOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(pixels, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) return;
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function isInsideRounded(lx, ly, width, height, radius) {
  if (lx < 0 || ly < 0 || lx >= width || ly >= height) return false;

  if (lx <= radius && ly <= radius) {
    return (radius - lx) ** 2 + (radius - ly) ** 2 <= radius ** 2;
  }

  if (lx >= width - radius && ly <= radius) {
    return (lx - (width - radius)) ** 2 + (radius - ly) ** 2 <= radius ** 2;
  }

  if (lx <= radius && ly >= height - radius) {
    return (radius - lx) ** 2 + (ly - (height - radius)) ** 2 <= radius ** 2;
  }

  if (lx >= width - radius && ly >= height - radius) {
    return (lx - (width - radius)) ** 2 + (ly - (height - radius)) ** 2 <= radius ** 2;
  }

  return true;
}

function fillRect(pixels, size, x, y, width, height, color) {
  for (let offsetY = 0; offsetY < height; offsetY += 1) {
    for (let offsetX = 0; offsetX < width; offsetX += 1) {
      setPixel(pixels, size, x + offsetX, y + offsetY, color);
    }
  }
}

function drawCalendarIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);

  fillRoundedRect(pixels, size, 0, 0, size, size, Math.max(2, Math.round(size * 0.18)), palette.background);

  const x0 = Math.round(size * 0.18);
  const y0 = Math.round(size * 0.28);
  const x1 = size - x0;
  const y1 = size - Math.round(size * 0.14);

  const bodyWidth = x1 - x0;
  const bodyHeight = y1 - y0;
  const bodyRadius = Math.max(1, Math.round(bodyWidth * 0.14));
  const barHeight = Math.max(2, Math.round(bodyHeight * 0.3));

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const lx = x - x0;
      const ly = y - y0;

      if (!isInsideRounded(lx, ly, bodyWidth, bodyHeight, bodyRadius)) continue;

      const color = ly < barHeight ? palette.calendarBar : palette.calendarBody;
      setPixel(pixels, size, x, y, color);
    }
  }

  const legWidth = Math.max(1, Math.round(bodyWidth * 0.12));
  const legHeight = Math.max(2, Math.round(size * 0.12));
  const legTop = Math.max(0, y0 - Math.round(size * 0.1));
  const leg1X = x0 + Math.round(bodyWidth * 0.2);
  const leg2X = x1 - legWidth - Math.round(bodyWidth * 0.12);

  fillRect(pixels, size, leg1X, legTop, legWidth, legHeight, palette.calendarLeg);
  fillRect(pixels, size, leg2X, legTop, legWidth, legHeight, palette.calendarLeg);

  const gridWhiteHeight = bodyHeight - barHeight;
  const verticalLineOne = Math.round(bodyWidth / 3);
  const verticalLineTwo = Math.round((2 * bodyWidth) / 3);
  const horizontalLineOne = barHeight + Math.round(gridWhiteHeight / 3);
  const horizontalLineTwo = barHeight + Math.round((2 * gridWhiteHeight) / 3);

  for (let y = y0 + barHeight; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const lx = x - x0;
      const ly = y - y0;

      if (!isInsideRounded(lx, ly, bodyWidth, bodyHeight, bodyRadius)) continue;
      if (ly < barHeight) continue;

      const isGridLine =
        lx === verticalLineOne ||
        lx === verticalLineTwo ||
        ly === horizontalLineOne ||
        ly === horizontalLineTwo;

      if (isGridLine) {
        setPixel(pixels, size, x, y, palette.grid);
      }
    }
  }

  return pixels;
}

function fillRoundedRect(pixels, size, x0, y0, width, height, radius, color) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isInsideRounded(x, y, width, height, radius)) continue;
      setPixel(pixels, size, x0 + x, y0 + y, color);
    }
  }
}

function encodeIcoImage(size, pixels) {
  const header = Buffer.alloc(40);
  const colorBytes = size * size * 4;
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const maskBytes = maskRowBytes * size;

  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(colorBytes + maskBytes, 20);
  header.writeUInt32LE(0, 24);
  header.writeUInt32LE(0, 28);
  header.writeUInt32LE(0, 32);
  header.writeUInt32LE(0, 36);

  const colorData = Buffer.alloc(colorBytes);
  for (let y = 0; y < size; y += 1) {
    const sourceY = size - 1 - y;
    const colorOffset = y * size * 4;
    for (let x = 0; x < size; x += 1) {
      const sourceOffset = (sourceY * size + x) * 4;
      const destOffset = colorOffset + x * 4;
      colorData[destOffset] = pixels[sourceOffset + 2];
      colorData[destOffset + 1] = pixels[sourceOffset + 1];
      colorData[destOffset + 2] = pixels[sourceOffset];
      colorData[destOffset + 3] = pixels[sourceOffset + 3];
    }
  }

  const maskData = Buffer.alloc(maskBytes);
  return Buffer.concat([header, colorData, maskData]);
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
    entry.writeUInt8(image.width === 256 ? 0 : image.width, 0);
    entry.writeUInt8(image.height === 256 ? 0 : image.height, 1);
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

function iconEntry(size, pixels) {
  return {
    width: size,
    height: size,
    bytes: encodeIcoImage(size, pixels),
  };
}

const pngIcons = [
  { name: "icon-16x16.png", size: 16 },
  { name: "icon-32x32.png", size: 32 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },
];

const iconSizes = [16, 32, 48, 64, 128, 256];
const pixelsBySize = new Map(iconSizes.map((size) => [size, drawCalendarIcon(size)]));

mkdirSync(iconsDir, { recursive: true });

for (const icon of pngIcons) {
  const pixels = pixelsBySize.get(icon.size) || drawCalendarIcon(icon.size);
  writeFileSync(path.join(iconsDir, icon.name), encodePng(icon.size, icon.size, pixels));
}

writeFileSync(
  path.join(iconsDir, "icon.ico"),
  encodeIco(iconSizes.map((size) => iconEntry(size, pixelsBySize.get(size))))
);

process.stdout.write(`Generated ${pngIcons.length + 1} icon(s) in ${iconsDir}\n`);
