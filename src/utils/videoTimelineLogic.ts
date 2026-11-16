import type { EasingType } from './studioTypes';

export type VideoTrackKind = 'video' | 'image' | 'overlay' | 'text' | 'audio';

export type VideoTransitionType = 'none' | 'crossfade' | 'slide-left' | 'zoom-in';

export interface VideoClipEffects {
  exposure: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  blur: number; // 0..20
  glow: number; // 0..100
  vignette: number; // 0..100
  chromaKeyEnabled: boolean;
  chromaKeyColor: string; // hex
  chromaKeyTolerance: number; // 10..120
}

export const DEFAULT_VIDEO_CLIP_EFFECTS: VideoClipEffects = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  glow: 0,
  vignette: 0,
  chromaKeyEnabled: false,
  chromaKeyColor: '#00b140',
  chromaKeyTolerance: 42,
};

export interface VideoKeyframe {
  id: string;
  timeOffsetSec: number; // relative to clip start
  xPct: number; // 50 = center
  yPct: number; // 50 = center
  scale: number; // 1 = 100%
  rotationDeg: number;
  opacity: number; // 0..100
  easing: EasingType;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  kind: VideoTrackKind;
  name: string;
  sourceUrl: string; // dataUrl or objectUrl
  mediaDurationSec: number;
  startSec: number;
  durationSec: number;
  inPointSec: number;
  speed: number; // 0.25..4
  volume: number; // 0..100
  fadeInSec: number;
  fadeOutSec: number;
  muted: boolean;
  transitionIn: VideoTransitionType;
  transitionDurationSec: number;
  textContent?: string;
  textColor?: string;
  textFontSize?: number;
  effects: VideoClipEffects;
  keyframes: VideoKeyframe[];
}

export interface VideoTrack {
  id: string;
  name: string;
  kind: VideoTrackKind;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  hidden: boolean;
}

export interface TimelineMarker {
  id: string;
  timeSec: number;
  label: string;
}

export function applyEasing(t: number, easing: EasingType): number {
  const x = Math.max(0, Math.min(1, t));
  if (easing === 'ease-in') return x * x;
  if (easing === 'ease-out') return 1 - (1 - x) * (1 - x);
  if (easing === 'bounce') {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) {
      const k = x - 1.5 / d1;
      return n1 * k * k + 0.75;
    }
    if (x < 2.5 / d1) {
      const k = x - 2.25 / d1;
      return n1 * k * k + 0.9375;
    }
    const k = x - 2.625 / d1;
    return n1 * k * k + 0.984375;
  }
  return x;
}

export function interpolateClipTransformAtTime(
  clip: TimelineClip,
  globalTimeSec: number
): {
  xPct: number;
  yPct: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
} {
  const localT = Math.max(0, globalTimeSec - clip.startSec);
  const kfs = [...clip.keyframes].sort((a, b) => a.timeOffsetSec - b.timeOffsetSec);
  if (kfs.length === 0) {
    return { xPct: 50, yPct: 50, scale: 1, rotationDeg: 0, opacity: 100 };
  }
  if (localT <= kfs[0].timeOffsetSec || kfs.length === 1) {
    const k = kfs[0];
    return {
      xPct: k.xPct,
      yPct: k.yPct,
      scale: k.scale,
      rotationDeg: k.rotationDeg,
      opacity: k.opacity,
    };
  }
  const last = kfs[kfs.length - 1];
  if (localT >= last.timeOffsetSec) {
    return {
      xPct: last.xPct,
      yPct: last.yPct,
      scale: last.scale,
      rotationDeg: last.rotationDeg,
      opacity: last.opacity,
    };
  }
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (localT >= a.timeOffsetSec && localT <= b.timeOffsetSec) {
      const span = Math.max(0.0001, b.timeOffsetSec - a.timeOffsetSec);
      const u = applyEasing((localT - a.timeOffsetSec) / span, b.easing);
      return {
        xPct: a.xPct + (b.xPct - a.xPct) * u,
        yPct: a.yPct + (b.yPct - a.yPct) * u,
        scale: a.scale + (b.scale - a.scale) * u,
        rotationDeg: a.rotationDeg + (b.rotationDeg - a.rotationDeg) * u,
        opacity: a.opacity + (b.opacity - a.opacity) * u,
      };
    }
  }
  return { xPct: 50, yPct: 50, scale: 1, rotationDeg: 0, opacity: 100 };
}

export function splitClipAtTime(
  clips: TimelineClip[],
  clipId: string,
  splitTimeSec: number
): TimelineClip[] {
  const idx = clips.findIndex((c) => c.id === clipId);
  if (idx < 0) return clips;
  const target = clips[idx];
  const minPart = 0.2;
  if (
    splitTimeSec <= target.startSec + minPart ||
    splitTimeSec >= target.startSec + target.durationSec - minPart
  ) {
    return clips;
  }

  const leftDuration = Number((splitTimeSec - target.startSec).toFixed(3));
  const rightDuration = Number((target.durationSec - leftDuration).toFixed(3));
  const leftClip: TimelineClip = {
    ...target,
    durationSec: leftDuration,
    keyframes: target.keyframes.filter((k) => k.timeOffsetSec <= leftDuration),
  };
  const rightClip: TimelineClip = {
    ...target,
    id: `${target.id}-split-${Math.random().toString(36).slice(2, 6)}`,
    name: `${target.name} (2)`,
    startSec: Number(splitTimeSec.toFixed(3)),
    durationSec: rightDuration,
    inPointSec: Number((target.inPointSec + leftDuration * target.speed).toFixed(3)),
    keyframes: target.keyframes
      .filter((k) => k.timeOffsetSec >= leftDuration)
      .map((k) => ({
        ...k,
        timeOffsetSec: Number((k.timeOffsetSec - leftDuration).toFixed(3)),
      })),
  };
  const next = [...clips];
  next.splice(idx, 1, leftClip, rightClip);
  return next;
}

export function rippleDeleteClip(clips: TimelineClip[], clipId: string): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;
  const gapDuration = target.durationSec;
  const targetStart = target.startSec;
  return clips
    .filter((c) => c.id !== clipId)
    .map((c) => {
      if (c.trackId === target.trackId && c.startSec > targetStart) {
        return {
          ...c,
          startSec: Number(Math.max(0, c.startSec - gapDuration).toFixed(3)),
        };
      }
      return c;
    });
}

export function trimClipBounds(
  clip: TimelineClip,
  nextStartSec: number,
  nextDurationSec: number
): TimelineClip {
  const minDur = 0.25;
  const clampedStart = Math.max(0, Number(nextStartSec.toFixed(3)));
  const clampedDur = Math.max(minDur, Number(nextDurationSec.toFixed(3)));
  return {
    ...clip,
    startSec: clampedStart,
    durationSec: clampedDur,
  };
}

export function computeTimelineAudioGain(clip: TimelineClip, globalTimeSec: number): number {
  if (clip.muted || clip.volume <= 0) return 0;
  const localT = globalTimeSec - clip.startSec;
  if (localT < 0 || localT > clip.durationSec) return 0;
  let gain = Math.max(0, Math.min(1, clip.volume / 100));
  if (clip.fadeInSec > 0 && localT < clip.fadeInSec) {
    gain *= Math.max(0, localT / clip.fadeInSec);
  }
  const timeToEnd = clip.durationSec - localT;
  if (clip.fadeOutSec > 0 && timeToEnd < clip.fadeOutSec) {
    gain *= Math.max(0, timeToEnd / clip.fadeOutSec);
  }
  return Number(gain.toFixed(4));
}

export function formatTimecode(sec: number): string {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  const tenths = Math.floor((s % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}.${tenths}`;
}
