#!/usr/bin/env node
// Generate pixel-art PNG icons (16, 48, 128) for the Chrome extension.
// Zero dependencies: builds the PNG bytes manually using only `node:zlib`.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "extension", "assets", "icons");

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePNG(width, height, pixels /* RGBA Buffer */) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 4;
  const filtered = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0;
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(filtered);

  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- Icon template ----
// 16x16 base pattern: a pixel character bust on a gradient background.
// We scale up to 48 and 128 with nearest-neighbor.

function rgba(r, g, b, a = 255) { return [r, g, b, a]; }
const C = {
  bg1:   rgba(106, 206, 240),   // accent
  bg2:   rgba(164, 140, 255),   // accent-2
  outline: rgba(26, 26, 46),
  skin:  rgba(246, 210, 179),
  hair:  rgba(43, 26, 20),
  outfit:rgba(58, 143, 214),
  eye:   rgba(26, 26, 46),
  none:  rgba(0, 0, 0, 0)
};

// 16x16 grid — glyphs map to colors
const TEMPLATE = [
  "................",
  "..gggggggggggg..",
  ".gggggggggggggg.",
  ".gghhhhhhhhhhgg.",
  ".gghhhhhhhhhhgg.",
  ".ggh#ssssss#hgg.",
  ".gg#ssssssss#gg.",
  ".gg#sseess#sgg..",
  ".ggg#ssssss#gg..",
  ".gggg#smmms#g...",
  ".gggg#oooo#g....",
  ".ggg#oooooo#g...",
  ".gg#oooooooo#...",
  ".gg#oooooooo#...",
  ".gg##oooooo##...",
  "..ggggggggggg..."
];

function glyphColor(g, x, y) {
  switch (g) {
    case ".": return C.none;
    case "g": {
      // Gradient bg
      const t = (x + y) / 30;
      const r = Math.round(C.bg1[0] + (C.bg2[0] - C.bg1[0]) * t);
      const gc = Math.round(C.bg1[1] + (C.bg2[1] - C.bg1[1]) * t);
      const b = Math.round(C.bg1[2] + (C.bg2[2] - C.bg1[2]) * t);
      return [r, gc, b, 255];
    }
    case "h": return C.hair;
    case "s": return C.skin;
    case "e": return C.eye;
    case "m": return C.outline;
    case "o": return C.outfit;
    case "#": return C.outline;
    default:  return C.none;
  }
}

function basePixels() {
  const W = 16, H = 16;
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const row = TEMPLATE[y];
    for (let x = 0; x < W; x++) {
      const g = row[x];
      const [r, gc, b, a] = glyphColor(g, x, y);
      const o = (y * W + x) * 4;
      buf[o] = r; buf[o + 1] = gc; buf[o + 2] = b; buf[o + 3] = a;
    }
  }
  return { W, H, buf };
}

function scaleUp(base, factor) {
  const W = base.W * factor;
  const H = base.H * factor;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / factor);
      const si = (sy * base.W + sx) * 4;
      const di = (y * W + x) * 4;
      out[di] = base.buf[si];
      out[di + 1] = base.buf[si + 1];
      out[di + 2] = base.buf[si + 2];
      out[di + 3] = base.buf[si + 3];
    }
  }
  return { W, H, buf: out };
}

function writeIcon(size) {
  const base = basePixels();
  const factor = size / 16;
  const scaled = factor === 1 ? base : scaleUp(base, factor);
  const png = encodePNG(scaled.W, scaled.H, scaled.buf);
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes)`);
}

writeIcon(16);
writeIcon(48);
writeIcon(128);
