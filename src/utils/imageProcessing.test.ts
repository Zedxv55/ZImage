import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ADJUSTMENTS,
  applyAdjustmentsToRgba,
  applyRoundedCornersRgba,
  autoEnhanceRgba,
  computeColorDistance,
  createZipArchive,
  encodeBmpFromRgba,
  encodeIcoFromPngBytes,
  encodePdfFromJpegBytes,
  encodeSvgWrapper,
  encodeTiffFromRgba,
  extractDominantPalette,
  pixelateRegionRgba,
  removeBackgroundFromRgba,
  sharpenRgba,
  vectorizeRgbaToSvg,
} from './imageProcessing';

test('computeColorDistance returns 0 for identical colors and large value for contrasting colors', () => {
  assert.equal(computeColorDistance(255, 255, 255, 255, 255, 255), 0);
  assert.ok(computeColorDistance(0, 0, 0, 255, 255, 255) > 500);
});

test('removeBackgroundFromRgba clears outer uniform background while preserving center subject', () => {
  const width = 5;
  const height = 5;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = 255;
  }
  const centerIdx = (2 * width + 2) * 4;
  rgba[centerIdx] = 180;
  rgba[centerIdx + 1] = 20;
  rgba[centerIdx + 2] = 20;
  rgba[centerIdx + 3] = 255;

  const res = removeBackgroundFromRgba(rgba, width, height, {
    tolerance: 25,
    feather: 0,
  });

  assert.equal(res[3], 0);
  assert.equal(res[centerIdx + 3], 255);
});

test('applyAdjustmentsToRgba converts to monochrome and preserves transparency', () => {
  const rgba = new Uint8ClampedArray([200, 100, 50, 255, 10, 20, 30, 0]);
  const res = applyAdjustmentsToRgba(rgba, 2, 1, {
    ...DEFAULT_ADJUSTMENTS,
    filter: 'monochrome',
  });
  assert.equal(res[0], res[1]);
  assert.equal(res[1], res[2]);
  assert.equal(res[3], 255);
  assert.equal(res[7], 0);
});

test('sharpenRgba, autoEnhanceRgba, applyRoundedCornersRgba, and pixelateRegionRgba work accurately', () => {
  const w = 10;
  const h = 10;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = (i % 10) * 20 + 30;
    buf[i * 4 + 1] = 100;
    buf[i * 4 + 2] = 120;
    buf[i * 4 + 3] = 255;
  }
  const sharpened = sharpenRgba(buf, w, h, 1.0);
  assert.equal(sharpened.length, buf.length);

  const enhanced = autoEnhanceRgba(buf, w, h);
  assert.equal(enhanced[0], 0); // Lowest value stretched near 0

  const rounded = applyRoundedCornersRgba(buf, w, h, 4);
  assert.equal(rounded[3], 0); // Top-left corner (0,0) becomes transparent
  assert.equal(rounded[(5 * w + 5) * 4 + 3], 255); // Center remains opaque

  const pixelated = pixelateRegionRgba(buf, w, h, { x: 0, y: 0, width: 4, height: 4 }, 4);
  assert.equal(pixelated[0], pixelated[4]); // Same value across block
});

test('extractDominantPalette and vectorizeRgbaToSvg produce valid swatches and SVG paths', () => {
  const buf = new Uint8ClampedArray([
    220, 40, 40, 255,
    220, 40, 40, 255,
    20, 100, 220, 255,
    20, 100, 220, 255,
  ]);
  const palette = extractDominantPalette(buf, 2, 2, 4);
  assert.equal(palette.length, 2);
  assert.ok(palette[0].hex.startsWith('#'));

  const svg = vectorizeRgbaToSvg(buf, 2, 2, 32);
  assert.ok(svg.includes('<path fill='));
});

test('encodeBmpFromRgba, encodeTiffFromRgba, encodeIcoFromPngBytes, and createZipArchive produce valid headers', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const bmp = encodeBmpFromRgba(rgba, 2, 1);
  assert.equal(bmp[0], 0x42);
  assert.equal(bmp[1], 0x4d);
  assert.equal(bmp.length, 62);

  const tiff = encodeTiffFromRgba(rgba, 2, 1);
  assert.equal(tiff[0], 0x49); // 'I'
  assert.equal(tiff[1], 0x49); // 'I'
  assert.equal(tiff[2], 42);

  const fakePng = new Uint8Array([137, 80, 78, 71]);
  const ico = encodeIcoFromPngBytes(fakePng, 64, 64);
  assert.equal(ico[2], 1);
  assert.equal(ico[6], 64);
  assert.equal(ico.length, 22 + fakePng.length);

  const zip = createZipArchive([
    { name: 'a.txt', bytes: new TextEncoder().encode('hello') },
    { name: 'b.txt', bytes: new TextEncoder().encode('world') },
  ]);
  assert.equal(zip[0], 0x50); // 'P'
  assert.equal(zip[1], 0x4b); // 'K'
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);
});

test('encodeSvgWrapper and encodePdfFromJpegBytes produce valid containers', () => {
  const svg = encodeSvgWrapper('data:image/png;base64,AAAA', 800, 600);
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('width="800"'));

  const pdfBytes = encodePdfFromJpegBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 400, 300);
  const pdfText = new TextDecoder().decode(pdfBytes);
  assert.ok(pdfText.startsWith('%PDF-1.4'));
  assert.ok(pdfText.includes('%%EOF'));
});
