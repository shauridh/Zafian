// Generator ikon PNG tanpa dependensi (menggunakan zlib bawaan Node)
// Desain: latar kuning, border hitam, cangkir kopi hitam
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

// --- PNG encoder minimal ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// --- Drawing helpers (RGBA buffer) ---
function makeCanvas(size, bg) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = bg[0];
    buf[i * 4 + 1] = bg[1];
    buf[i * 4 + 2] = bg[2];
    buf[i * 4 + 3] = 255;
  }
  return { buf, size };
}

function fillRect(c, x, y, w, h, color) {
  for (let py = Math.max(0, y); py < Math.min(c.size, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(c.size, x + w); px++) {
      const idx = (py * c.size + px) * 4;
      c.buf[idx] = color[0];
      c.buf[idx + 1] = color[1];
      c.buf[idx + 2] = color[2];
      c.buf[idx + 3] = 255;
    }
  }
}

function fillRoundRect(c, x, y, w, h, r, color) {
  fillRect(c, x + r, y, w - 2 * r, h, color);
  fillRect(c, x, y + r, w, h - 2 * r, color);
  // corners
  const corner = (cx, cy) => {
    for (let py = -r; py <= 0; py++) {
      for (let px = -r; px <= 0; px++) {
        if (px * px + py * py <= r * r) {
          fillRect(c, cx + px, cy + py, 1, 1, color);
        }
      }
    }
  };
  corner(x + r, y + r);
  corner(x + w - r, y + r);
  corner(x + r, y + h + r);
  corner(x + w - r, y + h + r);
}

function fillCircle(c, cx, cy, r, color) {
  for (let py = cy - r; py <= cy + r; py++) {
    for (let px = cx - r; px <= cx + r; px++) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r * r) fillRect(c, px, py, 1, 1, color);
    }
  }
}

// --- Ikon: cangkir kopi ---
const INK = [20, 20, 20];
const SUN = [255, 217, 61];
const CREAM = [250, 247, 240];
const CANDY = [255, 107, 157];

function drawIcon(size) {
  const c = makeCanvas(size, SUN);
  const s = size / 512; // skala berdasarkan desain 512

  // Border tebal
  const b = Math.round(20 * s);
  fillRoundRect(c, b, b, size - 2 * b, size - 2 * b, Math.round(64 * s), INK);
  fillRoundRect(c, b * 3, b * 3, size - 6 * b, size - 6 * b, Math.round(48 * s), SUN);

  // Aksen lingkaran pink
  fillCircle(c, Math.round(400 * s), Math.round(110 * s), Math.round(44 * s), CANDY);

  // Cangkir (badan)
  const cupX = Math.round(140 * s);
  const cupY = Math.round(190 * s);
  const cupW = Math.round(210 * s);
  const cupH = Math.round(190 * s);
  fillRoundRect(c, cupX, cupY, cupW, cupH, Math.round(24 * s), INK);

  // Handle
  fillCircle(c, cupX + cupW + Math.round(18 * s), cupY + Math.round(70 * s), Math.round(52 * s), INK);
  fillCircle(c, cupX + cupW + Math.round(18 * s), cupY + Math.round(70 * s), Math.round(26 * s), SUN);

  // Awan uap (krem)
  fillRoundRect(c, Math.round(180 * s), Math.round(120 * s), Math.round(36 * s), Math.round(52 * s), Math.round(18 * s), CREAM);
  fillRoundRect(c, Math.round(250 * s), Math.round(100 * s), Math.round(36 * s), Math.round(72 * s), Math.round(18 * s), CREAM);

  // Piring (garis bawah)
  fillRoundRect(c, Math.round(110 * s), Math.round(404 * s), Math.round(292 * s), Math.round(26 * s), Math.round(13 * s), INK);

  return encodePNG(size, size, c.buf);
}

writeFileSync(join(outDir, "icon-192.png"), drawIcon(192));
writeFileSync(join(outDir, "icon-512.png"), drawIcon(512));
writeFileSync(join(outDir, "apple-touch-icon.png"), drawIcon(180));
writeFileSync(join(outDir, "icon-96.png"), drawIcon(96));

console.log("✅ Ikon dibuat di public/icons/");
