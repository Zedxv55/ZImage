import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBrushToMask,
  applyLassoToMask,
  applyMagicWandToMask,
  applyMaskToRgba,
  exportDecomposedLayersManifestJson,
  extractForegroundMaskInRegion,
  featherMask,
  getProvenanceLabel,
  invertMask,
  reconstructBackgroundPatch,
} from './layerDecompose';

function makeSolidRgba(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

test('extractForegroundMaskInRegion separates central contrasting object from perimeter background', () => {
  const w = 20;
  const h = 20;
  const rgba = makeSolidRgba(w, h, 240, 240, 240);
  // Paint a dark navy square in center [6..13, 6..13]
  for (let y = 6; y < 14; y++) {
    for (let x = 6; x < 14; x++) {
      const idx = (y * w + x) * 4;
      rgba[idx] = 15;
      rgba[idx + 1] = 30;
      rgba[idx + 2] = 90;
    }
  }
  const mask = extractForegroundMaskInRegion(rgba, w, h, [10, 10, 80, 80], 25);
  assert.equal(mask[10 * w + 10], 255);
  assert.equal(mask[2 * w + 2], 0);
});

test('interactive brush, lasso, wand, invert, and feather modify masks deterministically', () => {
  const w = 16;
  const h = 16;
  let mask = new Uint8Array(w * h);

  mask = applyBrushToMask(mask, w, h, 8, 8, 2, 'add');
  assert.equal(mask[8 * w + 8], 255);

  mask = applyBrushToMask(mask, w, h, 8, 8, 1, 'erase');
  assert.equal(mask[8 * w + 8], 0);

  const lassoMask = applyLassoToMask(
    new Uint8Array(w * h),
    w,
    h,
    [
      { x: 2, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: 10 },
      { x: 2, y: 10 },
    ],
    'add'
  );
  assert.equal(lassoMask[6 * w + 6], 255);
  assert.equal(lassoMask[0], 0);

  const inv = invertMask(lassoMask);
  assert.equal(inv[6 * w + 6], 0);
  assert.equal(inv[0], 255);

  const feathered = featherMask(lassoMask, w, h, 2);
  assert.ok(feathered[2 * w + 6] < 255);
});

test('magic wand selects contiguous matching color region without leaking into different surround', () => {
  const w = 12;
  const h = 12;
  const rgba = makeSolidRgba(w, h, 255, 255, 255);
  for (let y = 3; y < 8; y++) {
    for (let x = 3; x < 8; x++) {
      const idx = (y * w + x) * 4;
      rgba[idx] = 200;
      rgba[idx + 1] = 20;
      rgba[idx + 2] = 20;
    }
  }
  const wand = applyMagicWandToMask(rgba, new Uint8Array(w * h), w, h, 5, 5, 20, 'add');
  assert.equal(wand[5 * w + 5], 255);
  assert.equal(wand[1 * w + 1], 0);
});

test('reconstructBackgroundPatch fills masked foreground hole smoothly from surrounding background', () => {
  const w = 16;
  const h = 16;
  const rgba = makeSolidRgba(w, h, 180, 210, 240);
  const mask = new Uint8Array(w * h);
  for (let y = 5; y < 11; y++) {
    for (let x = 5; x < 11; x++) {
      const p = y * w + x;
      mask[p] = 255;
      rgba[p * 4] = 10;
      rgba[p * 4 + 1] = 10;
      rgba[p * 4 + 2] = 10;
    }
  }
  const cleanBg = reconstructBackgroundPatch(rgba, mask, w, h, 16);
  const centerIdx = (8 * w + 8) * 4;
  assert.ok(cleanBg[centerIdx] > 150);
  assert.ok(cleanBg[centerIdx + 2] > 210);

  const cutout = applyMaskToRgba(rgba, mask);
  assert.equal(cutout[centerIdx + 3], 255);
  assert.equal(cutout[3], 0);
});

test('exportDecomposedLayersManifestJson and provenance labels serialize accurately', () => {
  const json = exportDecomposedLayersManifestJson([
    {
      id: 'txt-1',
      name: 'Headline',
      type: 'text',
      provenance: 'text',
      visible: true,
      locked: false,
      x: 540,
      y: 200,
      width: 600,
      height: 120,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 100,
      blendMode: 'source-over',
      parallaxDepth: 0,
      keyframes: [],
      text: 'ZImage',
      fontFamily: 'Kanit',
      fontSize: 72,
      color: '#101820',
      bold: true,
      align: 'center',
      shadow: false,
      strokeWidth: 0,
      strokeColor: '#FFFFFF',
    },
  ]);
  const parsed = JSON.parse(json) as { schema: string; layerCount: number; layers: Array<{ provenance: string }> };
  assert.equal(parsed.schema, 'zimage.layers.v1');
  assert.equal(parsed.layerCount, 1);
  assert.equal(parsed.layers[0].provenance, 'text');
  assert.equal(getProvenanceLabel('ai-reconstructed'), 'AI-Reconstructed');
});
