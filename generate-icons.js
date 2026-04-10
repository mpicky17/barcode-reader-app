// generate-icons.js
// Generates icon-192.png and icon-512.png using only Node.js built-ins.
// Run once with: node generate-icons.js
// Produces a dark (#111827) icon with a cyan (#22d3ee) barcode symbol.

const fs   = require('fs');
const zlib = require('zlib');

function generateIcon(size) {
  const bg = { r: 0x11, g: 0x18, b: 0x27 }; // #111827 dark
  const fg = { r: 0x22, g: 0xd3, b: 0xee }; // #22d3ee cyan

  const pixels = new Uint8Array(size * size * 4);

  function setPixel(x, y, color, alpha = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i]     = color.r;
    pixels[i + 1] = color.g;
    pixels[i + 2] = color.b;
    pixels[i + 3] = alpha;
  }

  function fillRect(x, y, w, h, color) {
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++)
        setPixel(px, py, color);
  }

  // Fill background
  fillRect(0, 0, size, size, bg);

  // Draw barcode bars pattern
  // Layout: bars fill 70% width, 60% height, centered
  const barsW   = Math.round(size * 0.70);
  const barsH   = Math.round(size * 0.58);
  const barsX   = Math.round((size - barsW) / 2);
  const barsY   = Math.round((size - barsH) / 2);

  // Bar widths pattern (1 = thin, 2 = thick) — simplified EAN-style
  const pattern = [2, 1, 1, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 1, 2, 1, 1, 2];
  const gaps    = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0]; // 0=bar, 1=gap
  const unit    = barsW / pattern.reduce((s, v) => s + v, 0);

  let cx = barsX;
  for (let i = 0; i < pattern.length; i++) {
    const w = Math.max(1, Math.round(pattern[i] * unit));
    if (!gaps[i]) fillRect(cx, barsY, w, barsH, fg);
    cx += w;
  }

  // Quiet zone lines (top and bottom border of barcode area, slightly taller)
  const lineH = Math.max(1, Math.round(size * 0.025));
  fillRect(barsX, barsY - lineH - 1, barsW, lineH, fg);
  fillRect(barsX, barsY + barsH + 1, barsW, lineH, fg);

  return pixels;
}

// ── PNG encoding (pure Node.js, no npm) ──────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(n) {
  return Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function chunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const d   = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const crc = crc32(Buffer.concat([t, d]));
  return Buffer.concat([u32(d.length), t, d, u32(crc)]);
}

function encodePNG(pixels, size) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk('IHDR', Buffer.concat([u32(size), u32(size), Buffer.from([8, 6, 0, 0, 0])]));

  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0); // filter type None
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }

  const idat = chunk('IDAT', zlib.deflateSync(Buffer.from(raw), { level: 6 }));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ── Write icons ───────────────────────────────────────────────────────────────

for (const size of [192, 512]) {
  const filename = `icon-${size}.png`;
  fs.writeFileSync(filename, encodePNG(generateIcon(size), size));
  console.log(`Created ${filename}`);
}

console.log('Done. Open the PNG files to verify before deploying.');
