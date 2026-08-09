import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const iconsDir = path.join(publicDir, 'icons');

// ---- Brand colors ----
const C = {
  grad0: [0x00, 0xff, 0x66], // #00FF66
  grad1: [0x00, 0xc3, 0x00], // #00C300
  grad2: [0x00, 0x8a, 0x00], // #008A00
  white: [0xff, 0xff, 0xff],
};

const DIM = 512;

// ---- Drawing helpers (all coordinates in 512 space) ----
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function lerp(a, b, t) { return a + (b - a) * t; }
function mixRGB(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Precompute gradient LUT for the brand background (diagonal top-left -> bottom-right)
// and for the inner bubble gradient.
const bgGrad = new Array(DIM * DIM);
const bubbleGrad = new Array(DIM * DIM);
for (let y = 0; y < DIM; y++) {
  for (let x = 0; x < DIM; x++) {
    const t = clamp((x + y) / (2 * (DIM - 1)), 0, 1);
    // 0 -> grad0, 0.55 -> grad1, 1 -> grad2
    let c;
    if (t < 0.55) c = mixRGB(C.grad0, C.grad1, t / 0.55);
    else c = mixRGB(C.grad1, C.grad2, (t - 0.55) / 0.45);
    bgGrad[y * DIM + x] = c;

    // Bubble gradient: lighter, stop at #00A300
    const bub = mixRGB(C.grad0, [0x00, 0xa3, 0x00], t);
    bubbleGrad[y * DIM + x] = bub;
  }
}

// Signed distance to a rounded rectangle (center, half-size, radius)
function sdRoundedRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

// Check if point is inside the outer chat bubble (using piecewise curves not needed;
// we approximate with a rounded-rect bubble + tail since exact bezier SDF is complex).
// We instead use a polygon approximation of the bubble outline for hit-testing.
function inOuterBubble(x, y) {
  // Bubble body: rounded rect centered (256,246) approx width 300 height 240 radius 90
  // plus tail triangle pointing down-left.
  const body = sdRoundedRect(x, y, 256, 246, 146, 118, 90);
  if (body <= 0) return true;
  // Tail: triangle from the body bottom toward (222,404)
  const inTail = pointInTriangle(x, y, [222, 330], [268, 330], [222, 404]);
  return inTail;
}

function inInnerBubble(x, y) {
  const body = sdRoundedRect(x, y, 256, 246, 104, 90, 70);
  if (body <= 0) return true;
  const inTail = pointInTriangle(x, y, [226, 320], [258, 320], [226, 356]);
  return inTail;
}

function pointInTriangle(px, py, a, b, c) {
  const d1 = sign(px, py, a, b);
  const d2 = sign(px, py, b, c);
  const d3 = sign(px, py, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
function sign(px, py, a, b) {
  return (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
}

// "G" letterform via a set of simple polygons (approximate). We build the G from
// a ring (rounded "C" shape) using concentric arcs. Simpler approach: use a bold
// stroke of a "C" path. We'll approximate with polygon sampling of the G outline.
const G_POLY = buildGPolygon();

function buildGPolygon() {
  // Outer "C" ring: inner radius 60, outer radius 92, gap on the right (open at ~0..70 deg)
  const pts = [];
  const cx = 240, cy = 236;
  const rOut = 96, rIn = 58;
  const gapStart = 18;  // degrees from top where the C opens (right side)
  const gapEnd = 78;
  // Outer arc from gapEnd -> 360+gapStart
  for (let a = gapEnd; a <= 360 + gapStart; a += 4) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + Math.cos(rad) * rOut, cy + Math.sin(rad) * rOut]);
  }
  // close outer (small connecting in toward inside at gap)
  // inner arc reverse
  for (let a = 360 + gapStart; a >= gapEnd; a -= 4) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + Math.cos(rad) * rIn, cy + Math.sin(rad) * rIn]);
  }
  // Plus a horizontal bar across the opening (the "G" crossbar) near the middle-right
  const bar = [
    [cx + Math.cos((gapEnd * Math.PI) / 180) * rIn - 6, cy + Math.sin((gapEnd * Math.PI) / 180) * rIn],
    [cx + Math.cos((gapEnd * Math.PI) / 180) * rOut + 8, cy + Math.sin((gapEnd * Math.PI) / 180) * rOut],
    [cx + Math.cos((gapEnd * Math.PI) / 180) * rIn + 6, cy + Math.sin((gapEnd * Math.PI) / 180) * rIn - 14],
  ];
  return { ring: pts, bar };
}

function inG(x, y) {
  const { ring, bar } = G_POLY;
  const inRing = pointInPolygon(x, y, ring);
  if (inRing) return true;
  return pointInPolygon(x, y, bar);
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Soft highlight ellipse
function inHighlight(x, y) {
  // ellipse centered (170,110) rx 230 ry 130
  const nx = (x - 170) / 230;
  const ny = (y - 110) / 130;
  return Math.hypot(nx, ny) <= 1;
}

// Spark accent dot
function inSparkDot(x, y) {
  const dx = x - 330, dy = y - 178;
  return Math.hypot(dx, dy) <= 14;
}

// ---- Render at a given size (supersampled * scale) ----
function render(size, scale = 4) {
  const W = size * scale;
  const img = new Uint8ClampedArray(W * W * 4);
  const s = DIM / W; // how many 512-units per output pixel

  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      // sample center of pixel in 512-space, with 4x sub-samples for AA
      let r = 0, g = 0, b = 0, a = 0;
      const sub = 2;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const x = (px + (sx + 0.5) / sub) * s;
          const y = (py + (sy + 0.5) / sub) * s;

          // Determine color
          let col = null;
          let alpha = 1;

          // Order: background is always brand gradient.
          // White outer bubble on top, then inner gradient bubble, then white G, then spark.
          if (inSparkDot(x, y)) {
            col = C.grad0;
          } else if (inG(x, y)) {
            col = C.white;
          } else if (inInnerBubble(x, y)) {
            col = mixRGB(C.grad0, [0x00, 0xa3, 0x00], clamp((x + y) / (2 * (DIM - 1)), 0, 1));
          } else if (inOuterBubble(x, y)) {
            col = C.white;
} else if (inHighlight(x, y)) {
            // soft highlight over gradient
            const bx = clamp(Math.round(x), 0, DIM - 1);
            const by = clamp(Math.round(y), 0, DIM - 1);
            const base = bgGrad[by * DIM + bx];
            col = mixRGB(base, C.white, 0.14);
          } else {
            const bx = clamp(Math.round(x), 0, DIM - 1);
            const by = clamp(Math.round(y), 0, DIM - 1);
            col = bgGrad[by * DIM + bx];
          }

          r += col[0]; g += col[1]; b += col[2]; a += alpha;
        }
      }
      const n = sub * sub;
      const idx = (py * W + px) * 4;
      img[idx] = r / n;
      img[idx + 1] = g / n;
      img[idx + 2] = b / n;
      img[idx + 3] = 255;
    }
  }

  // Downscale from W to size using box average
  const out = downsample(img, W, size);
  return out;
}

function downsample(src, W, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  const scale = W / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, cnt = 0;
      const x0 = Math.floor(x * scale), x1 = Math.min(W - 1, Math.floor((x + 1) * scale));
      const y0 = Math.floor(y * scale), y1 = Math.min(W - 1, Math.floor((y + 1) * scale));
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const idx = (yy * W + xx) * 4;
          r += src[idx]; g += src[idx + 1]; b += src[idx + 2]; a += src[idx + 3];
          cnt++;
        }
      }
      const idx = (y * size + x) * 4;
      out[idx] = r / cnt;
      out[idx + 1] = g / cnt;
      out[idx + 2] = b / cnt;
      out[idx + 3] = a / cnt;
    }
  }
  return out;
}

// ---- Encode RGBA to PNG ----
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter type 0
    for (let x = 0; x < width * 4; x++) {
      raw[y * (width * 4 + 1) + 1 + x] = rgba[y * width * 4 + x];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

// ---- Write all icons ----
function write(file, size, scale) {
  const data = render(size, scale);
  const png = encodePNG(size, size, data);
  fs.writeFileSync(file, png);
  console.log('wrote', path.relative(publicDir, file), `${size}x${size}`, png.length, 'bytes');
}

fs.mkdirSync(iconsDir, { recursive: true });

// Main public logo files
write(path.join(publicDir, 'logo-192.png'), 192, 4);
write(path.join(publicDir, 'logo-512.png'), 512, 3);
write(path.join(publicDir, 'logo-maskable-512.png'), 512, 3);
write(path.join(publicDir, 'apple-touch-icon.png'), 180, 4);
write(path.join(publicDir, 'favicon-16x16.png'), 16, 6);
write(path.join(publicDir, 'favicon-32x32.png'), 32, 6);

// icons/ folder
write(path.join(iconsDir, 'icon-72x72.png'), 72, 4);
write(path.join(iconsDir, 'icon-96x96.png'), 96, 4);
write(path.join(iconsDir, 'icon-128x128.png'), 128, 4);
write(path.join(iconsDir, 'icon-144x144.png'), 144, 4);
write(path.join(iconsDir, 'icon-152x152.png'), 152, 4);
write(path.join(iconsDir, 'icon-192x192.png'), 192, 4);
write(path.join(iconsDir, 'icon-384x384.png'), 384, 4);
write(path.join(iconsDir, 'icon-512x512.png'), 512, 3);
write(path.join(iconsDir, 'icon-maskable.png'), 512, 3);
write(path.join(iconsDir, 'logo.png'), 96, 4);

console.log('All icons generated.');
