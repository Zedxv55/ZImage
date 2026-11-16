export type EditorFilterId =
  | 'none'
  | 'engraving-bw'
  | 'antique-gold'
  | 'ink-on-paper'
  | 'studio-crisp'
  | 'warm-film'
  | 'cool-editorial'
  | 'monochrome'
  | 'high-contrast'
  | 'sepia'
  | 'vivid';

export interface ImageAdjustments {
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  warmth: number; // -50 to 50
  vignette: number; // 0 to 100
  blur: number; // 0 to 20
  sharpness?: number; // 0 to 100
  grain?: number; // 0 to 100
  filter: EditorFilterId;
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  vignette: 0,
  blur: 0,
  sharpness: 0,
  grain: 0,
  filter: 'none',
};

export interface FilterPresetInfo {
  id: EditorFilterId;
  label: string;
}

export const EDITOR_FILTER_PRESETS: FilterPresetInfo[] = [
  { id: 'none', label: 'ต้นฉบับ' },
  { id: 'engraving-bw', label: 'ภาพแกะสลักขาวดำ' },
  { id: 'antique-gold', label: 'ทองโบราณ' },
  { id: 'ink-on-paper', label: 'หมึกบนกระดาษ' },
  { id: 'studio-crisp', label: 'Studio Crisp' },
  { id: 'warm-film', label: 'Warm Film' },
  { id: 'cool-editorial', label: 'Cool Editorial' },
  { id: 'monochrome', label: 'ขาวดำ (B&W)' },
  { id: 'high-contrast', label: 'คอนทราสต์สูง' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'vivid', label: 'สีสดใส' },
];

export type ExportFormatId =
  | 'png'
  | 'jpg'
  | 'webp'
  | 'avif'
  | 'bmp'
  | 'ico'
  | 'tiff'
  | 'svg'
  | 'svg-vector'
  | 'pdf';

export interface ExportFormatOption {
  id: ExportFormatId;
  label: string;
  mime: string;
  extension: string;
  supportsQuality: boolean;
  supportsAlpha: boolean;
}

export const EXPORT_FORMATS: ExportFormatOption[] = [
  { id: 'png', label: 'PNG (พื้นหลังโปร่งใส / Lossless)', mime: 'image/png', extension: 'png', supportsQuality: false, supportsAlpha: true },
  { id: 'jpg', label: 'JPEG (ขนาดเล็กสำหรับเว็บ)', mime: 'image/jpeg', extension: 'jpg', supportsQuality: true, supportsAlpha: false },
  { id: 'webp', label: 'WebP (เว็บยุคใหม่ คมชัด)', mime: 'image/webp', extension: 'webp', supportsQuality: true, supportsAlpha: true },
  { id: 'avif', label: 'AVIF (บีบอัดสูงสุดสำหรับเว็บ)', mime: 'image/avif', extension: 'avif', supportsQuality: true, supportsAlpha: true },
  { id: 'tiff', label: 'TIFF (งานพิมพ์คุณภาพสูง)', mime: 'image/tiff', extension: 'tiff', supportsQuality: false, supportsAlpha: false },
  { id: 'bmp', label: 'BMP (Bitmap ไม่บีบอัด)', mime: 'image/bmp', extension: 'bmp', supportsQuality: false, supportsAlpha: false },
  { id: 'ico', label: 'ICO (ไอคอนเว็บไซต์ / Windows)', mime: 'image/x-icon', extension: 'ico', supportsQuality: false, supportsAlpha: true },
  { id: 'svg-vector', label: 'SVG Vector (แปลงลายเส้นเวกเตอร์)', mime: 'image/svg+xml', extension: 'svg', supportsQuality: false, supportsAlpha: true },
  { id: 'svg', label: 'SVG Embedded (เวกเตอร์คอนเทนเนอร์)', mime: 'image/svg+xml', extension: 'svg', supportsQuality: false, supportsAlpha: true },
  { id: 'pdf', label: 'PDF (เอกสารพร้อมพิมพ์)', mime: 'application/pdf', extension: 'pdf', supportsQuality: true, supportsAlpha: false },
];

export function clampByte(val: number): number {
  if (val < 0) return 0;
  if (val > 255) return 255;
  return Math.round(val);
}

/**
 * Perceptual weighted Euclidean RGB distance (0 .. ~765).
 */
export function computeColorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const rMean = (r1 + r2) * 0.5;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const weightR = 2 + rMean / 256;
  const weightG = 4;
  const weightB = 2 + (255 - rMean) / 256;
  return Math.sqrt(weightR * dr * dr + weightG * dg * dg + weightB * db * db);
}

interface BgCluster {
  r: number;
  g: number;
  b: number;
  count: number;
}

function samplePerimeterBackgroundClusters(
  data: Uint8ClampedArray,
  width: number,
  height: number
): BgCluster[] {
  const buckets = new Map<string, { rSum: number; gSum: number; bSum: number; count: number }>();

  const addSample = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] < 20) return;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.rSum += r;
      existing.gSum += g;
      existing.bSum += b;
      existing.count += 1;
    } else {
      buckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
    }
  };

  const stepX = Math.max(1, Math.floor(width / 80));
  const stepY = Math.max(1, Math.floor(height / 80));

  for (let x = 0; x < width; x += stepX) {
    addSample(x, 0);
    addSample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((c) => ({
      r: c.rSum / c.count,
      g: c.gSum / c.count,
      b: c.bSum / c.count,
      count: c.count,
    }));
}

export interface RemoveBgOptions {
  tolerance: number; // 5 .. 120
  feather: number; // 0 .. 4
  globalColorKey?: boolean;
  seedPoint?: { x: number; y: number } | null;
}

/**
 * Pure RGBA smart background removal with perimeter clustering, BFS flood-fill,
 * optional global color-key mode, and soft alpha feathering on edges.
 */
export function removeBackgroundFromRgba(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  options: RemoveBgOptions
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData);
  const totalPixels = width * height;
  if (totalPixels === 0) return out;

  const threshold = Math.max(8, options.tolerance * 2.4);
  const softMargin = Math.max(8, threshold * 0.28);

  let clusters: BgCluster[];
  if (options.seedPoint) {
    const sx = Math.max(0, Math.min(width - 1, Math.round(options.seedPoint.x)));
    const sy = Math.max(0, Math.min(height - 1, Math.round(options.seedPoint.y)));
    const sIdx = (sy * width + sx) * 4;
    clusters = [{ r: srcData[sIdx], g: srcData[sIdx + 1], b: srcData[sIdx + 2], count: 1 }];
  } else {
    clusters = samplePerimeterBackgroundClusters(srcData, width, height);
  }

  if (clusters.length === 0) return out;

  const minClusterDist = (idx: number): number => {
    const r = srcData[idx];
    const g = srcData[idx + 1];
    const b = srcData[idx + 2];
    let best = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const d = computeColorDistance(r, g, b, clusters[i].r, clusters[i].g, clusters[i].b);
      if (d < best) best = d;
    }
    return best;
  };

  const bgMask = new Uint8Array(totalPixels);

  if (options.globalColorKey && !options.seedPoint) {
    for (let p = 0; p < totalPixels; p++) {
      const idx = p * 4;
      const dist = minClusterDist(idx);
      if (dist <= threshold) {
        bgMask[p] = 1;
        out[idx + 3] = 0;
      } else if (dist <= threshold + softMargin) {
        bgMask[p] = 2;
        const alphaRatio = (dist - threshold) / softMargin;
        out[idx + 3] = Math.round(out[idx + 3] * alphaRatio);
      }
    }
  } else {
    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);
    let head = 0;
    let tail = 0;

    const tryEnqueue = (x: number, y: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const p = y * width + x;
      if (visited[p]) return;
      const idx = p * 4;
      if (srcData[idx + 3] === 0) {
        visited[p] = 1;
        bgMask[p] = 1;
        queue[tail++] = p;
        return;
      }
      const dist = minClusterDist(idx);
      if (dist <= threshold) {
        visited[p] = 1;
        bgMask[p] = 1;
        out[idx + 3] = 0;
        queue[tail++] = p;
      } else if (dist <= threshold + softMargin) {
        visited[p] = 1;
        bgMask[p] = 2;
        const alphaRatio = (dist - threshold) / softMargin;
        out[idx + 3] = Math.min(out[idx + 3], Math.round(out[idx + 3] * alphaRatio));
      }
    };

    if (options.seedPoint) {
      tryEnqueue(Math.round(options.seedPoint.x), Math.round(options.seedPoint.y));
    } else {
      for (let x = 0; x < width; x++) {
        tryEnqueue(x, 0);
        tryEnqueue(x, height - 1);
      }
      for (let y = 1; y < height - 1; y++) {
        tryEnqueue(0, y);
        tryEnqueue(width - 1, y);
      }
    }

    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      const y = (p - x) / width;
      tryEnqueue(x + 1, y);
      tryEnqueue(x - 1, y);
      tryEnqueue(x, y + 1);
      tryEnqueue(x, y - 1);
    }
  }

  const featherPasses = Math.max(0, Math.min(4, Math.round(options.feather)));
  if (featherPasses > 0) {
    const tempAlpha = new Uint8ClampedArray(totalPixels);
    for (let pass = 0; pass < featherPasses; pass++) {
      for (let p = 0; p < totalPixels; p++) {
        tempAlpha[p] = out[p * 4 + 3];
      }
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const p = y * width + x;
          const a = tempAlpha[p];
          if (a === 0) continue;
          const hasTransparentNeighbor =
            tempAlpha[p - 1] === 0 ||
            tempAlpha[p + 1] === 0 ||
            tempAlpha[p - width] === 0 ||
            tempAlpha[p + width] === 0;
          if (hasTransparentNeighbor) {
            const avg =
              (tempAlpha[p] * 2 +
                tempAlpha[p - 1] +
                tempAlpha[p + 1] +
                tempAlpha[p - width] +
                tempAlpha[p + width]) /
              6;
            out[p * 4 + 3] = Math.round(avg);
          }
        }
      }
    }
  }

  return out;
}

/**
 * Applies color adjustments and editorial filter presets to RGBA pixel array.
 */
export function applyAdjustmentsToRgba(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  adj: ImageAdjustments
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData.length);
  const brightOffset = adj.brightness * 1.4;
  let contrastAdj = adj.contrast;
  let satAdj = adj.saturation;
  let warmthAdj = adj.warmth;

  if (adj.filter === 'studio-crisp') {
    contrastAdj += 14;
    satAdj += 8;
  } else if (adj.filter === 'warm-film') {
    warmthAdj += 18;
    contrastAdj += 6;
    satAdj -= 6;
  } else if (adj.filter === 'cool-editorial') {
    warmthAdj -= 16;
    contrastAdj += 10;
    satAdj -= 10;
  } else if (adj.filter === 'high-contrast') {
    contrastAdj += 36;
  } else if (adj.filter === 'vivid') {
    satAdj += 38;
    contrastAdj += 12;
  } else if (adj.filter === 'engraving-bw') {
    contrastAdj += 52;
  } else if (adj.filter === 'antique-gold') {
    contrastAdj += 18;
    warmthAdj += 22;
  } else if (adj.filter === 'ink-on-paper') {
    contrastAdj += 28;
  }

  const contrastFactor = (259 * (contrastAdj + 255)) / (255 * (259 - contrastAdj));
  const satScale = 1 + satAdj / 100;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxDistSq = cx * cx + cy * cy || 1;
  const vigStrength = Math.max(0, Math.min(1, adj.vignette / 100));
  const grainStrength = Math.max(0, Math.min(100, adj.grain || 0)) * 0.55;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = srcData[idx + 3];
      if (a === 0) {
        out[idx] = 0;
        out[idx + 1] = 0;
        out[idx + 2] = 0;
        out[idx + 3] = 0;
        continue;
      }

      let r = srcData[idx] + brightOffset + warmthAdj * 0.8;
      let g = srcData[idx + 1] + brightOffset;
      let b = srcData[idx + 2] + brightOffset - warmthAdj * 0.8;

      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;

      if (adj.filter === 'monochrome') {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lum;
        g = lum;
        b = lum;
      } else if (adj.filter === 'engraving-bw') {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // High-craft woodcut contrast curve
        const crisp = lum > 132 ? Math.min(255, 215 + (lum - 132) * 0.35) : Math.max(12, lum * 0.55);
        r = crisp;
        g = crisp * 0.98;
        b = crisp * 0.94;
      } else if (adj.filter === 'antique-gold') {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = Math.min(255, lum * 1.15 + 24);
        g = Math.min(255, lum * 0.95 + 10);
        b = Math.min(255, lum * 0.58);
      } else if (adj.filter === 'ink-on-paper') {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Warm cream parchment highlights + deep indigo ink shadows
        const t = Math.max(0, Math.min(1, lum / 255));
        r = 14 + t * (243 - 14);
        g = 32 + t * (233 - 32);
        b = 76 + t * (210 - 76);
      } else if (adj.filter === 'sepia') {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = sr;
        g = sg;
        b = sb;
      } else if (satScale !== 1) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lum + (r - lum) * satScale;
        g = lum + (g - lum) * satScale;
        b = lum + (b - lum) * satScale;
      }

      if (vigStrength > 0) {
        const dx = x - cx;
        const dy = y - cy;
        const ratio = (dx * dx + dy * dy) / maxDistSq;
        const darken = 1 - ratio * vigStrength * 0.65;
        r *= darken;
        g *= darken;
        b *= darken;
      }

      if (grainStrength > 0) {
        // Deterministic spatial pseudo-random film grain (fast & flicker-free)
        const hash = (((x * 73856093) ^ (y * 19349663)) & 0xff) / 255 - 0.5;
        const delta = hash * grainStrength;
        r += delta;
        g += delta;
        b += delta;
      }

      out[idx] = clampByte(r);
      out[idx + 1] = clampByte(g);
      out[idx + 2] = clampByte(b);
      out[idx + 3] = a;
    }
  }

  if (adj.sharpness && adj.sharpness > 0) {
    return sharpenRgba(out, width, height, (adj.sharpness / 100) * 1.4);
  }

  return out;
}

/**
 * 3x3 Unsharp-mask sharpening filter for blurry/soft photos.
 */
export function sharpenRgba(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number = 0.8
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData);
  const strength = Math.max(0, Math.min(3, amount));
  if (width < 3 || height < 3 || strength === 0) return out;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      if (srcData[idx + 3] === 0) continue;
      for (let c = 0; c < 3; c++) {
        const center = srcData[idx + c];
        const neighbors =
          (srcData[((y - 1) * width + x) * 4 + c] +
            srcData[((y + 1) * width + x) * 4 + c] +
            srcData[(y * width + (x - 1)) * 4 + c] +
            srcData[(y * width + (x + 1)) * 4 + c]) *
          0.25;
        const sharpened = center + (center - neighbors) * strength;
        out[idx + c] = clampByte(sharpened);
      }
    }
  }
  return out;
}

/**
 * Edge-preserving 3x3 smoothing / denoising filter for noisy photos.
 */
export function denoiseRgba(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number = 28
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData);
  if (width < 3 || height < 3) return out;
  const maxDiff = Math.max(6, threshold);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      if (srcData[idx + 3] === 0) continue;
      const cr = srcData[idx];
      const cg = srcData[idx + 1];
      const cb = srcData[idx + 2];

      let rSum = cr;
      let gSum = cg;
      let bSum = cb;
      let weightSum = 1;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nIdx = ((y + dy) * width + (x + dx)) * 4;
          const nr = srcData[nIdx];
          const ng = srcData[nIdx + 1];
          const nb = srcData[nIdx + 2];
          const diff = (Math.abs(nr - cr) + Math.abs(ng - cg) + Math.abs(nb - cb)) / 3;
          if (diff <= maxDiff) {
            rSum += nr;
            gSum += ng;
            bSum += nb;
            weightSum += 1;
          }
        }
      }

      out[idx] = clampByte(rSum / weightSum);
      out[idx + 1] = clampByte(gSum / weightSum);
      out[idx + 2] = clampByte(bSum / weightSum);
    }
  }
  return out;
}

/**
 * Per-channel 1%-99% histogram contrast stretch + dehaze boost.
 */
export function autoEnhanceRgba(
  srcData: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData);
  const total = width * height;
  if (total === 0) return out;

  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  let opaqueCount = 0;

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    if (srcData[idx + 3] < 10) continue;
    opaqueCount++;
    histR[srcData[idx]]++;
    histG[srcData[idx + 1]]++;
    histB[srcData[idx + 2]]++;
  }

  if (opaqueCount === 0) return out;

  const findPercentile = (hist: Uint32Array, pct: number) => {
    const target = Math.floor(opaqueCount * pct);
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };

  const rLow = findPercentile(histR, 0.01);
  const rHigh = Math.max(rLow + 1, findPercentile(histR, 0.99));
  const gLow = findPercentile(histG, 0.01);
  const gHigh = Math.max(gLow + 1, findPercentile(histG, 0.99));
  const bLow = findPercentile(histB, 0.01);
  const bHigh = Math.max(bLow + 1, findPercentile(histB, 0.99));

  const rScale = 255 / (rHigh - rLow);
  const gScale = 255 / (gHigh - gLow);
  const bScale = 255 / (bHigh - bLow);

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    if (srcData[idx + 3] === 0) continue;
    out[idx] = clampByte((srcData[idx] - rLow) * rScale);
    out[idx + 1] = clampByte((srcData[idx + 1] - gLow) * gScale);
    out[idx + 2] = clampByte((srcData[idx + 2] - bLow) * bScale);
  }
  return out;
}

/**
 * Applies smooth anti-aliased rounded corners to an RGBA buffer (outputs transparent corners).
 */
export function applyRoundedCornersRgba(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  radiusPx: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData);
  const r = Math.max(0, Math.min(Math.floor(Math.min(width, height) / 2), Math.round(radiusPx)));
  if (r <= 0) return out;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let cx = -1;
      let cy = -1;
      if (x < r && y < r) {
        cx = r - 0.5;
        cy = r - 0.5;
      } else if (x >= width - r && y < r) {
        cx = width - r - 0.5;
        cy = r - 0.5;
      } else if (x < r && y >= height - r) {
        cx = r - 0.5;
        cy = height - r - 0.5;
      } else if (x >= width - r && y >= height - r) {
        cx = width - r - 0.5;
        cy = height - r - 0.5;
      }

      if (cx >= 0 && cy >= 0) {
        const dist = Math.hypot(x - cx, y - cy);
        const idx = (y * width + x) * 4;
        if (dist > r + 0.5) {
          out[idx + 3] = 0;
        } else if (dist > r - 0.5) {
          const factor = 1 - (dist - (r - 0.5));
          out[idx + 3] = clampByte(out[idx + 3] * factor);
        }
      }
    }
  }
  return out;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pixelates a specific rectangular region (great for censoring faces/license plates).
 */
export function pixelateRegionRgba(
  srcData: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  rect: PixelRect,
  blockSize: number = 14
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData);
  const step = Math.max(2, Math.round(blockSize));
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(imgWidth, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(imgHeight, Math.ceil(rect.y + rect.height));

  for (let by = y0; by < y1; by += step) {
    for (let bx = x0; bx < x1; bx += step) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let count = 0;
      const bw = Math.min(x1, bx + step);
      const bh = Math.min(y1, by + step);

      for (let py = by; py < bh; py++) {
        for (let px = bx; px < bw; px++) {
          const idx = (py * imgWidth + px) * 4;
          rSum += srcData[idx];
          gSum += srcData[idx + 1];
          bSum += srcData[idx + 2];
          aSum += srcData[idx + 3];
          count++;
        }
      }
      if (count === 0) continue;
      const rAvg = Math.round(rSum / count);
      const gAvg = Math.round(gSum / count);
      const bAvg = Math.round(bSum / count);
      const aAvg = Math.round(aSum / count);

      for (let py = by; py < bh; py++) {
        for (let px = bx; px < bw; px++) {
          const idx = (py * imgWidth + px) * 4;
          out[idx] = rAvg;
          out[idx + 1] = gAvg;
          out[idx + 2] = bAvg;
          out[idx + 3] = aAvg;
        }
      }
    }
  }
  return out;
}

/**
 * Box-blurs a specific rectangular region for privacy redaction.
 */
export function blurRegionRgba(
  srcData: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  rect: PixelRect,
  radius: number = 8
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcData);
  const rad = Math.max(1, Math.min(20, Math.round(radius)));
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(imgWidth, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(imgHeight, Math.ceil(rect.y + rect.height));

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      const ny0 = Math.max(0, py - rad);
      const ny1 = Math.min(imgHeight - 1, py + rad);
      const nx0 = Math.max(0, px - rad);
      const nx1 = Math.min(imgWidth - 1, px + rad);
      const stride = Math.max(1, Math.floor(rad / 3));

      for (let ny = ny0; ny <= ny1; ny += stride) {
        for (let nx = nx0; nx <= nx1; nx += stride) {
          const sIdx = (ny * imgWidth + nx) * 4;
          rSum += srcData[sIdx];
          gSum += srcData[sIdx + 1];
          bSum += srcData[sIdx + 2];
          count++;
        }
      }

      const dIdx = (py * imgWidth + px) * 4;
      if (count > 0) {
        out[dIdx] = Math.round(rSum / count);
        out[dIdx + 1] = Math.round(gSum / count);
        out[dIdx + 2] = Math.round(bSum / count);
      }
    }
  }
  return out;
}

export interface DominantColorSwatch {
  hex: string;
  r: number;
  g: number;
  b: number;
  percent: number;
}

/**
 * Extracts top dominant colors from an RGBA image using quantized RGB bucketing.
 */
export function extractDominantPalette(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  maxColors: number = 6
): DominantColorSwatch[] {
  const total = width * height;
  if (total === 0) return [];
  const stride = Math.max(1, Math.floor(total / 12000));
  const buckets = new Map<string, { rSum: number; gSum: number; bSum: number; count: number }>();
  let sampled = 0;

  for (let p = 0; p < total; p += stride) {
    const idx = p * 4;
    if (srcData[idx + 3] < 40) continue;
    const r = srcData[idx];
    const g = srcData[idx + 1];
    const b = srcData[idx + 2];
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.rSum += r;
      existing.gSum += g;
      existing.bSum += b;
      existing.count++;
    } else {
      buckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
    }
    sampled++;
  }

  if (sampled === 0) return [];

  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, '0').toUpperCase();
  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((b) => {
      const r = Math.round(b.rSum / b.count);
      const g = Math.round(b.gSum / b.count);
      const bl = Math.round(b.bSum / b.count);
      return {
        hex: `#${toHex(r)}${toHex(g)}${toHex(bl)}`,
        r,
        g,
        b: bl,
        percent: Math.round((b.count / sampled) * 100),
      };
    });
}

/**
 * Estimates image sharpness via Laplacian edge variance (higher = sharper).
 */
export function computeSharpnessScore(
  srcData: Uint8ClampedArray,
  width: number,
  height: number
): { score: number; verdict: 'คมชัดมาก' | 'คมชัดปกติ' | 'ค่อนข้างเบลอ' } {
  if (width < 4 || height < 4) {
    return { score: 0, verdict: 'ค่อนข้างเบลอ' };
  }
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 160));
  const lum = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * srcData[i] + 0.587 * srcData[i + 1] + 0.114 * srcData[i + 2];
  };

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += stepY) {
    for (let x = 1; x < width - 1; x += stepX) {
      const lap = 4 * lum(x, y) - lum(x - 1, y) - lum(x + 1, y) - lum(x, y - 1) - lum(x, y + 1);
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return { score: 0, verdict: 'ค่อนข้างเบลอ' };
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  const normalized = Math.min(100, Math.round(Math.sqrt(variance) * 2.2));
  const verdict = normalized >= 45 ? 'คมชัดมาก' : normalized >= 20 ? 'คมชัดปกติ' : 'ค่อนข้างเบลอ';
  return { score: normalized, verdict };
}

/**
 * True Raster-to-SVG Vectorizer using color quantization and horizontal run-length paths.
 */
export function vectorizeRgbaToSvg(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  quantLevel: number = 32
): string {
  // Downsample internally to max 160px on longest edge so vector SVG stays crisp & lightweight
  const maxGrid = 160;
  const scale = Math.max(1, Math.ceil(Math.max(width, height) / maxGrid));
  const gw = Math.max(1, Math.floor(width / scale));
  const gh = Math.max(1, Math.floor(height / scale));
  const step = Math.max(8, Math.min(64, Math.round(quantLevel)));

  const colorPaths = new Map<string, string[]>();
  const quant = (v: number) => Math.min(255, Math.floor(v / step) * step + Math.floor(step / 2));
  const hex2 = (n: number) => clampByte(n).toString(16).padStart(2, '0');

  for (let gy = 0; gy < gh; gy++) {
    const sy = Math.min(height - 1, gy * scale);
    let gx = 0;
    while (gx < gw) {
      const sx = Math.min(width - 1, gx * scale);
      const idx = (sy * width + sx) * 4;
      if (srcData[idx + 3] < 40) {
        gx++;
        continue;
      }
      const qr = quant(srcData[idx]);
      const qg = quant(srcData[idx + 1]);
      const qb = quant(srcData[idx + 2]);
      const hex = `#${hex2(qr)}${hex2(qg)}${hex2(qb)}`;

      let runEnd = gx + 1;
      while (runEnd < gw) {
        const rx = Math.min(width - 1, runEnd * scale);
        const rIdx = (sy * width + rx) * 4;
        if (
          srcData[rIdx + 3] < 40 ||
          quant(srcData[rIdx]) !== qr ||
          quant(srcData[rIdx + 1]) !== qg ||
          quant(srcData[rIdx + 2]) !== qb
        ) {
          break;
        }
        runEnd++;
      }

      const xPx = gx * scale;
      const yPx = gy * scale;
      const wPx = Math.min(width - xPx, (runEnd - gx) * scale);
      const hPx = Math.min(height - yPx, scale);
      const cmd = `M${xPx} ${yPx}h${wPx}v${hPx}h-${wPx}z`;

      const list = colorPaths.get(hex);
      if (list) list.push(cmd);
      else colorPaths.set(hex, [cmd]);

      gx = runEnd;
    }
  }

  const paths = Array.from(colorPaths.entries())
    .map(([fill, cmds]) => `  <path fill="${fill}" d="${cmds.join('')}" />`)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
    paths,
    '</svg>',
  ].join('\n');
}

/**
 * Encodes an RGBA buffer into a standard 24-bit uncompressed BMP binary.
 */
export function encodeBmpFromRgba(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelArraySize = rowStride * height;
  const fileSize = 54 + pixelArraySize;
  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  buf[0] = 0x42;
  buf[1] = 0x4d;
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelArraySize, true);

  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    const dstRowOffset = 54 + y * rowStride;
    for (let x = 0; x < width; x++) {
      const sIdx = (srcRow * width + x) * 4;
      const alpha = rgba[sIdx + 3] / 255;
      const r = Math.round(rgba[sIdx] * alpha + 255 * (1 - alpha));
      const g = Math.round(rgba[sIdx + 1] * alpha + 255 * (1 - alpha));
      const b = Math.round(rgba[sIdx + 2] * alpha + 255 * (1 - alpha));
      const dIdx = dstRowOffset + x * 3;
      buf[dIdx] = b;
      buf[dIdx + 1] = g;
      buf[dIdx + 2] = r;
    }
  }

  return buf;
}

/**
 * Encodes an RGBA buffer into a valid little-endian baseline uncompressed 24-bit RGB TIFF file.
 */
export function encodeTiffFromRgba(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const pixelBytes = width * height * 3;
  const ifdEntries = 10;
  const headerSize = 8;
  const bitsPerSampleOffset = headerSize + pixelBytes;
  const ifdOffset = bitsPerSampleOffset + 6;
  const totalSize = ifdOffset + 2 + ifdEntries * 12 + 4;

  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  // Little-endian TIFF header ('II' 42)
  buf[0] = 0x49;
  buf[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  // RGB pixel data
  for (let i = 0; i < width * height; i++) {
    const s = i * 4;
    const a = rgba[s + 3] / 255;
    const d = headerSize + i * 3;
    buf[d] = Math.round(rgba[s] * a + 255 * (1 - a));
    buf[d + 1] = Math.round(rgba[s + 1] * a + 255 * (1 - a));
    buf[d + 2] = Math.round(rgba[s + 2] * a + 255 * (1 - a));
  }

  // BitsPerSample [8, 8, 8]
  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);

  // IFD
  view.setUint16(ifdOffset, ifdEntries, true);
  let pos = ifdOffset + 2;
  const writeTag = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(pos, tag, true);
    view.setUint16(pos + 2, type, true);
    view.setUint32(pos + 4, count, true);
    view.setUint32(pos + 8, value, true);
    pos += 12;
  };

  writeTag(256, 4, 1, width); // ImageWidth
  writeTag(257, 4, 1, height); // ImageLength
  writeTag(258, 3, 3, bitsPerSampleOffset); // BitsPerSample
  writeTag(259, 3, 1, 1); // Compression = None
  writeTag(262, 3, 1, 2); // Photometric = RGB
  writeTag(273, 4, 1, headerSize); // StripOffsets
  writeTag(277, 3, 1, 3); // SamplesPerPixel
  writeTag(278, 4, 1, height); // RowsPerStrip
  writeTag(279, 4, 1, pixelBytes); // StripByteCounts
  writeTag(284, 3, 1, 1); // PlanarConfiguration = Chunky

  view.setUint32(pos, 0, true); // Next IFD = 0
  return buf;
}

/**
 * Wraps PNG bytes inside a valid Windows/Favicon ICO container.
 */
export function encodeIcoFromPngBytes(pngBytes: Uint8Array, width: number, height: number): Uint8Array {
  const headerSize = 6 + 16;
  const out = new Uint8Array(headerSize + pngBytes.length);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);

  out[6] = width >= 256 ? 0 : width;
  out[7] = height >= 256 ? 0 : height;
  out[8] = 0;
  out[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, headerSize, true);

  out.set(pngBytes, headerSize);
  return out;
}

/**
 * Wraps a PNG data URL cleanly in an SVG document preserving exact dimensions.
 */
export function encodeSvgWrapper(pngDataUrl: string, width: number, height: number): string {
  const safeUrl = pngDataUrl.replace(/"/g, '&quot;');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <image href="${safeUrl}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />`,
    '</svg>',
  ].join('\n');
}

/**
 * Generates a single-page print-ready PDF embedding a raw JPEG byte stream.
 */
export function encodePdfFromJpegBytes(jpegBytes: Uint8Array, width: number, height: number): Uint8Array {
  const enc = new TextEncoder();
  const pageWidthPt = Math.max(72, Math.round((width * 72) / 96));
  const pageHeightPt = Math.max(72, Math.round((height * 72) / 96));

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let bytePos = 0;

  const pushStr = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    bytePos += b.length;
  };

  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    bytePos += b.length;
  };

  pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  offsets.push(bytePos);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  offsets.push(bytePos);
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  offsets.push(bytePos);
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  offsets.push(bytePos);
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  const contentStream = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  offsets.push(bytePos);
  pushStr(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  const xrefPos = bytePos;
  pushStr(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  const merged = new Uint8Array(bytePos);
  let cursor = 0;
  for (const c of chunks) {
    merged.set(c, cursor);
    cursor += c.length;
  }
  return merged;
}

const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Pure-TS uncompressed STORE ZIP archive creator for batch downloads and image grid splits.
 */
export function createZipArchive(entries: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const data = entry.bytes;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  let centralSize = 0;
  for (const c of centralChunks) centralSize += c.length;

  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + endRecord.length;
  const result = new Uint8Array(totalSize);
  let ptr = 0;
  for (const c of localChunks) {
    result.set(c, ptr);
    ptr += c.length;
  }
  for (const c of centralChunks) {
    result.set(c, ptr);
    ptr += c.length;
  }
  result.set(endRecord, ptr);
  return result;
}
