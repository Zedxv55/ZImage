import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VIDEO_CLIP_EFFECTS,
  computeTimelineAudioGain,
  interpolateClipTransformAtTime,
  rippleDeleteClip,
  splitClipAtTime,
  trimClipBounds,
} from './videoTimelineLogic';
import type { TimelineClip } from './videoTimelineLogic';

function makeSampleClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip-1',
    trackId: 'track-v1',
    kind: 'video',
    name: 'Clip 1',
    sourceUrl: 'data:image/png;base64,AAAA',
    mediaDurationSec: 10,
    startSec: 0,
    durationSec: 6,
    inPointSec: 0,
    speed: 1,
    volume: 100,
    fadeInSec: 0,
    fadeOutSec: 0,
    muted: false,
    transitionIn: 'none',
    transitionDurationSec: 0.5,
    effects: { ...DEFAULT_VIDEO_CLIP_EFFECTS },
    keyframes: [],
    ...overrides,
  };
}

test('splitClipAtTime divides clip cleanly and shifts right clip inPointSec', () => {
  const clip = makeSampleClip({ startSec: 2, durationSec: 6, inPointSec: 1, speed: 1 });
  const result = splitClipAtTime([clip], 'clip-1', 4.5);
  assert.equal(result.length, 2);
  assert.equal(result[0].startSec, 2);
  assert.equal(result[0].durationSec, 2.5);
  assert.equal(result[1].startSec, 4.5);
  assert.equal(result[1].durationSec, 3.5);
  assert.equal(result[1].inPointSec, 3.5);
});

test('rippleDeleteClip removes clip and pulls subsequent same-track clips left', () => {
  const c1 = makeSampleClip({ id: 'c1', startSec: 0, durationSec: 3 });
  const c2 = makeSampleClip({ id: 'c2', startSec: 3, durationSec: 2 });
  const c3 = makeSampleClip({ id: 'c3', startSec: 5, durationSec: 4 });
  const cAudio = makeSampleClip({ id: 'a1', trackId: 'track-a1', kind: 'audio', startSec: 5, durationSec: 4 });

  const after = rippleDeleteClip([c1, c2, c3, cAudio], 'c2');
  assert.equal(after.length, 3);
  const nextC3 = after.find((c) => c.id === 'c3');
  const nextA1 = after.find((c) => c.id === 'a1');
  assert.equal(nextC3?.startSec, 3);
  assert.equal(nextA1?.startSec, 5);
});

test('trimClipBounds clamps duration >= 0.25s and start >= 0', () => {
  const trimmed = trimClipBounds(makeSampleClip(), -2, 0.05);
  assert.equal(trimmed.startSec, 0);
  assert.equal(trimmed.durationSec, 0.25);
});

test('interpolateClipTransformAtTime interpolates keyframes with easing', () => {
  const clip = makeSampleClip({
    startSec: 1,
    durationSec: 4,
    keyframes: [
      { id: 'k1', timeOffsetSec: 0, xPct: 40, yPct: 50, scale: 1, rotationDeg: 0, opacity: 0, easing: 'linear' },
      { id: 'k2', timeOffsetSec: 2, xPct: 60, yPct: 50, scale: 2, rotationDeg: 90, opacity: 100, easing: 'linear' },
    ],
  });
  const mid = interpolateClipTransformAtTime(clip, 2); // localT = 1 (50%)
  assert.equal(mid.xPct, 50);
  assert.equal(mid.scale, 1.5);
  assert.equal(mid.rotationDeg, 45);
  assert.equal(mid.opacity, 50);
});

test('computeTimelineAudioGain respects volume, mute, fade-in, and fade-out', () => {
  const clip = makeSampleClip({
    kind: 'audio',
    startSec: 0,
    durationSec: 4,
    volume: 80,
    fadeInSec: 1,
    fadeOutSec: 1,
  });
  assert.equal(computeTimelineAudioGain(clip, 0.5), 0.4);
  assert.equal(computeTimelineAudioGain(clip, 2), 0.8);
  assert.equal(computeTimelineAudioGain(clip, 3.5), 0.4);
  assert.equal(computeTimelineAudioGain({ ...clip, muted: true }, 2), 0);
});
