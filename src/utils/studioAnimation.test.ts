import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEasing,
  buildKeyframesForMotionPreset,
  computeSnapPosition,
  interpolateLayerAtTime,
} from './studioAnimation';
import { DEFAULT_ADJUSTMENTS } from './imageProcessing';
import type { ImageStudioLayer } from './studioTypes';

function createMockImageLayer(overrides: Partial<ImageStudioLayer> = {}): ImageStudioLayer {
  return {
    id: 'layer-1',
    name: 'ภาพหลัก',
    type: 'image',
    visible: true,
    locked: false,
    x: 540,
    y: 540,
    width: 800,
    height: 800,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 100,
    blendMode: 'source-over',
    parallaxDepth: 0.4,
    keyframes: [],
    imageUrl: 'data:image/png;base64,AAA',
    originalImageUrl: 'data:image/png;base64,AAA',
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    ...overrides,
  };
}

test('easing functions start at 0, end at 1, and respect curve shapes', () => {
  for (const kind of ['linear', 'ease-in', 'ease-out', 'bounce'] as const) {
    assert.equal(applyEasing(0, kind), 0);
    assert.ok(Math.abs(applyEasing(1, kind) - 1) < 0.001);
  }
  assert.ok(applyEasing(0.5, 'ease-in') < 0.5);
  assert.ok(applyEasing(0.5, 'ease-out') > 0.5);
});

test('zoom-in-slow motion preset increases scale smoothly over timeline', () => {
  const layer = createMockImageLayer();
  const keyframes = buildKeyframesForMotionPreset('zoom-in-slow', layer, 4);
  const animatedLayer = { ...layer, keyframes };

  const t0 = interpolateLayerAtTime(animatedLayer, 0, 4);
  const t2 = interpolateLayerAtTime(animatedLayer, 2, 4);
  const t4 = interpolateLayerAtTime(animatedLayer, 4, 4);

  assert.equal(t0.scale, 1);
  assert.ok(t2.scale > 1 && t2.scale < t4.scale);
  assert.ok(Math.abs(t4.scale - 1.18) < 0.001);
});

test('all 8 motion presets generate valid bounded keyframes', () => {
  const layer = createMockImageLayer();
  const presets = [
    'zoom-in-slow',
    'zoom-out',
    'pan-left-right',
    'pan-up',
    'float-gentle',
    'shake-gentle',
    'fade-in',
    'spin-slow',
  ] as const;

  for (const p of presets) {
    const kfs = buildKeyframesForMotionPreset(p, layer, 5);
    assert.ok(kfs.length >= 2, `Preset ${p} should have >=2 keyframes`);
    assert.equal(kfs[0].timeSec, 0);
    assert.ok(kfs[kfs.length - 1].timeSec <= 5);
  }
});

test('parallax mode differentiates cutout foreground offset from background', () => {
  const bg = createMockImageLayer({ id: 'bg', isCutoutForeground: false, parallaxDepth: 0.3 });
  const fg = createMockImageLayer({ id: 'fg', isCutoutForeground: true, parallaxDepth: 1.8 });

  const bgPos = interpolateLayerAtTime(bg, 1, 4, true);
  const fgPos = interpolateLayerAtTime(fg, 1, 4, true);
  assert.ok(Math.abs(fgPos.x - 540) > Math.abs(bgPos.x - 540));
});

test('computeSnapPosition snaps magnetically to canvas center and edges', () => {
  const centerSnap = computeSnapPosition(546, 535, 1080, 1080, 200, 200, true, 12);
  assert.equal(centerSnap.x, 540);
  assert.equal(centerSnap.y, 540);
  assert.equal(centerSnap.snappedX, true);
  assert.equal(centerSnap.snappedY, true);
  assert.equal(centerSnap.guideX, 540);
  assert.equal(centerSnap.guideY, 540);

  const far = computeSnapPosition(700, 300, 1080, 1080, 200, 200, true, 12);
  assert.equal(far.x, 700);
  assert.equal(far.snappedX, false);
});
