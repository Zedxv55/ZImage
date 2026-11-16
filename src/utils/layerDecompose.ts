import { computeColorDistance } from './imageProcessing';
import type { LayerProvenance, StudioLayer } from './studioTypes';

export interface DetectedTextRegion {
  id: string;
  text: string;
  bboxPct: [number, number, number, number]; // [x, y, w, h] 0..100
  colorHex?: string;
  fontSizeRel?: number;
}

export interface DetectedObjectRegion {
  id: string;
  label: string;
  category: 'subject' | 'element' | 'overlay' | 'frame';
  bboxPct: [number, number, number, number]; // [x, y, w, h] 0..100
}

export interface DecomposeAiResult {
  engine: string;
  backgroundDescription: string;
  dominantColors: string[];
  textRegions: DetectedTextRegion[];
  objectRegions: DetectedObjectRegion[];
}

export interface ExtractedMaskRegion {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Computes a binary/soft foreground alpha mask inside a bounding box using perimeter
 * color statistics + optional center foreground seeding.
 */
export function extractForegroundMaskInRegion(
  srcRgba: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  bboxPct: [number, number, number, number],
  tolerance: number = 34
): Uint8Array {
  const mask = new Uint8Array(imgW * imgH);
  const x0 = Math.max(0, Math.floor((bboxPct[0] / 100) * imgW));
  const y0 = Math.max(0, Math.floor((bboxPct[1] / 100) * imgH));
  const x1 = Math.min(imgW, Math.ceil(((bboxPct[0] + bboxPct[2]) / 100) * imgW));
  const y1 = Math.min(imgH, Math.ceil(((bboxPct[1] + bboxPct[3]) / 100) * imgH));
  if (x1 <= x0 || y1 <= y0) return mask;

  // Sample outer perimeter of the bbox as local background reference
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  const sample = (px: number, py: number) => {
    const idx = (py * imgW + px) * 4;
    if (srcRgba[idx + 3] < 20) return;
    rSum += srcRgba[idx];
    gSum += srcRgba[idx + 1];
    bSum += srcRgba[idx + 2];
    count++;
  };
  for (let x = x0; x < x1; x += Math.max(1, Math.floor((x1 - x0) / 16))) {
    sample(x, y0);
    sample(x, Math.max(y0, y1 - 1));
  }
  for (let y = y0; y < y1; y += Math.max(1, Math.floor((y1 - y0) / 16))) {
    sample(x0, y);
    sample(Math.max(x0, x1 - 1), y);
  }
  const bgR = count > 0 ? rSum / count : 255;
  const bgG = count > 0 ? gSum / count : 255;
  const bgB = count > 0 ? bSum / count : 255;
  const distCutoff = Math.max(18, tolerance * 1.9);

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = y * imgW + x;
      const idx = p * 4;
      if (srcRgba[idx + 3] < 20) continue;
      const d = computeColorDistance(srcRgba[idx], srcRgba[idx + 1], srcRgba[idx + 2], bgR, bgG, bgB);
      if (d > distCutoff) {
        mask[p] = 255;
      } else if (d > distCutoff * 0.72) {
        const ratio = (d - distCutoff * 0.72) / Math.max(1, distCutoff * 0.28);
        mask[p] = Math.round(255 * Math.max(0, Math.min(1, ratio)));
      }
    }
  }
  return mask;
}

/**
 * Interactive brush paint onto an existing grayscale 0..255 alpha mask.
 */
export function applyBrushToMask(
  mask: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radiusPx: number,
  mode: 'add' | 'erase'
): Uint8Array {
  const out = new Uint8Array(mask);
  const r = Math.max(1, radiusPx);
  const rSq = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(height - 1, Math.ceil(cy + r));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (dSq <= rSq) {
        const p = y * width + x;
        out[p] = mode === 'add' ? 255 : 0;
      }
    }
  }
  return out;
}

/**
 * Interactive polygon lasso fill onto a 0..255 alpha mask using scanline even-odd parity.
 */
export function applyLassoToMask(
  mask: Uint8Array,
  width: number,
  height: number,
  polygon: Array<{ x: number; y: number }>,
  mode: 'add' | 'erase'
): Uint8Array {
  const out = new Uint8Array(mask);
  if (polygon.length < 3) return out;
  let minY = height - 1;
  let maxY = 0;
  let minX = width - 1;
  let maxX = 0;
  for (const pt of polygon) {
    minX = Math.max(0, Math.min(minX, Math.floor(pt.x)));
    maxX = Math.min(width - 1, Math.max(maxX, Math.ceil(pt.x)));
    minY = Math.max(0, Math.min(minY, Math.floor(pt.y)));
    maxY = Math.min(height - 1, Math.max(maxY, Math.ceil(pt.y)));
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        const intersect =
          yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      if (inside) {
        out[y * width + x] = mode === 'add' ? 255 : 0;
      }
    }
  }
  return out;
}

/**
 * Magic-wand flood fill selection on RGB image at (seedX, seedY).
 */
export function applyMagicWandToMask(
  srcRgba: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance: number,
  mode: 'add' | 'erase'
): Uint8Array {
  const out = new Uint8Array(mask);
  const sx = Math.max(0, Math.min(width - 1, Math.round(seedX)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(seedY)));
  const sIdx = (sy * width + sx) * 4;
  const sr = srcRgba[sIdx];
  const sg = srcRgba[sIdx + 1];
  const sb = srcRgba[sIdx + 2];
  const cutoff = Math.max(8, tolerance * 2.3);

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const startP = sy * width + sx;
  visited[startP] = 1;
  queue[tail++] = startP;

  while (head < tail) {
    const p = queue[head++];
    out[p] = mode === 'add' ? 255 : 0;
    const x = p % width;
    const y = (p - x) / width;
    const neighbors = [
      x + 1 < width ? p + 1 : -1,
      x - 1 >= 0 ? p - 1 : -1,
      y + 1 < height ? p + width : -1,
      y - 1 >= 0 ? p - width : -1,
    ];
    for (const np of neighbors) {
      if (np < 0 || visited[np]) continue;
      const idx = np * 4;
      const dist = computeColorDistance(srcRgba[idx], srcRgba[idx + 1], srcRgba[idx + 2], sr, sg, sb);
      if (dist <= cutoff) {
        visited[np] = 1;
        queue[tail++] = np;
      }
    }
  }
  return out;
}

export function invertMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    out[i] = 255 - mask[i];
  }
  return out;
}

export function featherMask(
  mask: Uint8Array,
  width: number,
  height: number,
  passes: number = 1
): Uint8Array {
  let cur = new Uint8Array(mask);
  const rounds = Math.max(0, Math.min(6, Math.round(passes)));
  for (let r = 0; r < rounds; r++) {
    const next = new Uint8Array(cur);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const p = y * width + x;
        const avg =
          (cur[p] * 2 + cur[p - 1] + cur[p + 1] + cur[p - width] + cur[p + width]) / 6;
        next[p] = Math.round(avg);
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * Multi-pass radial boundary background patch reconstruction (clean background plate)
 * for pixels where foregroundMask[p] > 128.
 */
export function reconstructBackgroundPatch(
  srcRgba: Uint8ClampedArray,
  foregroundMask: Uint8Array,
  width: number,
  height: number,
  maxPasses: number = 28
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcRgba);
  const total = width * height;
  const filled = new Uint8Array(total);

  for (let p = 0; p < total; p++) {
    filled[p] = foregroundMask[p] > 100 ? 0 : 1;
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    let anyChanged = false;
    const nextFilled = new Uint8Array(filled);
    const snapshot = new Uint8ClampedArray(out);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (filled[p]) continue;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (dx === 0 && dy === 0) continue;
            const np = ny * width + nx;
            if (!filled[np]) continue;
            const idx = np * 4;
            rSum += snapshot[idx];
            gSum += snapshot[idx + 1];
            bSum += snapshot[idx + 2];
            count++;
          }
        }
        if (count > 0) {
          const dIdx = p * 4;
          out[dIdx] = Math.round(rSum / count);
          out[dIdx + 1] = Math.round(gSum / count);
          out[dIdx + 2] = Math.round(bSum / count);
          out[dIdx + 3] = 255;
          nextFilled[p] = 1;
          anyChanged = true;
        }
      }
    }

    filled.set(nextFilled);
    if (!anyChanged) break;
  }

  return out;
}

export function applyMaskToRgba(
  srcRgba: Uint8ClampedArray,
  mask: Uint8Array
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcRgba);
  for (let p = 0; p < mask.length; p++) {
    const idx = p * 4;
    out[idx + 3] = Math.round((srcRgba[idx + 3] * mask[p]) / 255);
  }
  return out;
}

export function exportDecomposedLayersManifestJson(layers: StudioLayer[]): string {
  return JSON.stringify(
    {
      schema: 'zimage.layers.v1',
      exportedAtUtc: new Date().toISOString(),
      layerCount: layers.length,
      layers: layers.map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        provenance: l.provenance || (l.type === 'text' ? 'text' : l.type === 'shape' || l.type === 'svg' ? 'vector' : 'raster'),
        visible: l.visible,
        locked: l.locked,
        groupId: l.groupId || null,
        x: Math.round(l.x),
        y: Math.round(l.y),
        width: Math.round(l.width),
        height: Math.round(l.height),
        opacity: l.opacity,
        blendMode: l.blendMode,
      })),
    },
    null,
    2
  );
}

export function getProvenanceLabel(provenance?: LayerProvenance): string {
  switch (provenance) {
    case 'text':
      return 'Text (Editable)';
    case 'vector':
      return 'Vector';
    case 'ai-reconstructed':
      return 'AI-Reconstructed';
    case 'raster':
    default:
      return 'Raster';
  }
}
