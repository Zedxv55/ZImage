import type { EasingType, LayerKeyframe, MotionPresetId, StudioLayer } from './studioTypes';

export interface InterpolatedTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export function applyEasing(t: number, easing: EasingType): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'ease-in':
      return clamped * clamped * clamped;
    case 'ease-out': {
      const inv = 1 - clamped;
      return 1 - inv * inv * inv;
    }
    case 'bounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (clamped < 1 / d1) {
        return n1 * clamped * clamped;
      } else if (clamped < 2 / d1) {
        const u = clamped - 1.5 / d1;
        return n1 * u * u + 0.75;
      } else if (clamped < 2.5 / d1) {
        const u = clamped - 2.25 / d1;
        return n1 * u * u + 0.9375;
      } else {
        const u = clamped - 2.625 / d1;
        return n1 * u * u + 0.984375;
      }
    }
    case 'linear':
    default:
      return clamped;
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateAngleDeg(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Computes interpolated layer transform at a given timeline timestamp (seconds).
 * Supports keyframes + optional subtle parallax motion when foreground/background exist.
 */
export function interpolateLayerAtTime(
  layer: StudioLayer,
  timeSec: number,
  durationSec: number,
  parallaxEnabled: boolean = false
): InterpolatedTransform {
  const kfs = [...layer.keyframes].sort((a, b) => a.timeSec - b.timeSec);
  let base: InterpolatedTransform;

  if (kfs.length === 0) {
    base = {
      x: layer.x,
      y: layer.y,
      scale: layer.scale,
      rotation: layer.rotation,
      opacity: layer.opacity,
    };
  } else if (timeSec <= kfs[0].timeSec) {
    base = {
      x: kfs[0].x,
      y: kfs[0].y,
      scale: kfs[0].scale,
      rotation: kfs[0].rotation,
      opacity: kfs[0].opacity,
    };
  } else if (timeSec >= kfs[kfs.length - 1].timeSec) {
    const last = kfs[kfs.length - 1];
    base = {
      x: last.x,
      y: last.y,
      scale: last.scale,
      rotation: last.rotation,
      opacity: last.opacity,
    };
  } else {
    let prev = kfs[0];
    let next = kfs[kfs.length - 1];
    for (let i = 0; i < kfs.length - 1; i++) {
      if (timeSec >= kfs[i].timeSec && timeSec <= kfs[i + 1].timeSec) {
        prev = kfs[i];
        next = kfs[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, next.timeSec - prev.timeSec);
    const rawT = (timeSec - prev.timeSec) / span;
    const easedT = applyEasing(rawT, next.easing || 'linear');

    base = {
      x: lerp(prev.x, next.x, easedT),
      y: lerp(prev.y, next.y, easedT),
      scale: lerp(prev.scale, next.scale, easedT),
      rotation: interpolateAngleDeg(prev.rotation, next.rotation, easedT),
      opacity: Math.max(0, Math.min(100, lerp(prev.opacity, next.opacity, easedT))),
    };
  }

  if (parallaxEnabled && durationSec > 0) {
    const phase = (Math.max(0, Math.min(durationSec, timeSec)) / durationSec) * Math.PI * 2;
    const depth = layer.parallaxDepth ?? (layer.type === 'image' && layer.isCutoutForeground ? 1.8 : 0.35);
    const offsetX = Math.sin(phase) * 18 * depth;
    const offsetY = Math.cos(phase * 0.5) * 8 * depth;
    return {
      ...base,
      x: base.x + offsetX,
      y: base.y + offsetY,
    };
  }

  return base;
}

/**
 * Generates clean keyframes for the 8 one-click motion presets over the timeline duration.
 */
export function buildKeyframesForMotionPreset(
  preset: MotionPresetId,
  layer: StudioLayer,
  durationSec: number
): LayerKeyframe[] {
  const dur = Math.max(2, Math.min(15, durationSec));
  const mid = Number((dur * 0.5).toFixed(2));
  const q1 = Number((dur * 0.25).toFixed(2));
  const q3 = Number((dur * 0.75).toFixed(2));
  const cx = layer.x;
  const cy = layer.y;
  const baseScale = layer.scale;
  const baseRot = layer.rotation;
  const baseOpacity = layer.opacity;

  const mk = (
    suffix: string,
    timeSec: number,
    patch: Partial<Omit<LayerKeyframe, 'id' | 'timeSec'>>
  ): LayerKeyframe => ({
    id: `kf-${layer.id}-${suffix}-${timeSec}`,
    timeSec,
    x: patch.x ?? cx,
    y: patch.y ?? cy,
    scale: patch.scale ?? baseScale,
    rotation: patch.rotation ?? baseRot,
    opacity: patch.opacity ?? baseOpacity,
    easing: patch.easing ?? 'ease-out',
  });

  switch (preset) {
    case 'zoom-in-slow':
      return [
        mk('start', 0, { scale: baseScale, easing: 'linear' }),
        mk('end', dur, { scale: Number((baseScale * 1.18).toFixed(3)), easing: 'ease-out' }),
      ];
    case 'zoom-out':
      return [
        mk('start', 0, { scale: Number((baseScale * 1.22).toFixed(3)), easing: 'linear' }),
        mk('end', dur, { scale: baseScale, easing: 'ease-out' }),
      ];
    case 'pan-left-right':
      return [
        mk('start', 0, { x: cx - 75, easing: 'linear' }),
        mk('end', dur, { x: cx + 75, easing: 'ease-out' }),
      ];
    case 'pan-up':
      return [
        mk('start', 0, { y: cy + 70, easing: 'linear' }),
        mk('end', dur, { y: cy - 70, easing: 'ease-out' }),
      ];
    case 'float-gentle':
      return [
        mk('start', 0, { y: cy, easing: 'linear' }),
        mk('mid', mid, { y: cy - 26, easing: 'ease-out' }),
        mk('end', dur, { y: cy, easing: 'ease-in' }),
      ];
    case 'shake-gentle':
      return [
        mk('s0', 0, { x: cx, rotation: baseRot, easing: 'linear' }),
        mk('s1', q1, { x: cx - 14, rotation: baseRot - 2, easing: 'ease-out' }),
        mk('s2', mid, { x: cx + 14, rotation: baseRot + 2, easing: 'ease-out' }),
        mk('s3', q3, { x: cx - 10, rotation: baseRot - 1.5, easing: 'ease-out' }),
        mk('s4', dur, { x: cx, rotation: baseRot, easing: 'ease-out' }),
      ];
    case 'fade-in':
      return [
        mk('start', 0, { opacity: 0, scale: Number((baseScale * 0.96).toFixed(3)), easing: 'linear' }),
        mk('end', Math.min(dur, Number((dur * 0.65).toFixed(2))), {
          opacity: baseOpacity,
          scale: baseScale,
          easing: 'ease-out',
        }),
      ];
    case 'spin-slow':
      return [
        mk('start', 0, { rotation: baseRot, easing: 'linear' }),
        mk('end', dur, { rotation: baseRot + 360, easing: 'linear' }),
      ];
  }
}

export interface SnapGuideResult {
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
  guideX: number | null;
  guideY: number | null;
}

/**
 * Magnetic snapping to canvas center and safe edges within thresholdPx.
 */
export function computeSnapPosition(
  targetX: number,
  targetY: number,
  canvasWidth: number,
  canvasHeight: number,
  halfW: number,
  halfH: number,
  snapEnabled: boolean = true,
  thresholdPx: number = 12
): SnapGuideResult {
  if (!snapEnabled) {
    return { x: targetX, y: targetY, snappedX: false, snappedY: false, guideX: null, guideY: null };
  }

  let outX = targetX;
  let outY = targetY;
  let snappedX = false;
  let snappedY = false;
  let guideX: number | null = null;
  let guideY: number | null = null;

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  const xCandidates: Array<{ target: number; guide: number }> = [
    { target: centerX, guide: centerX },
    { target: halfW, guide: 0 },
    { target: canvasWidth - halfW, guide: canvasWidth },
    { target: 24 + halfW, guide: 24 },
    { target: canvasWidth - 24 - halfW, guide: canvasWidth - 24 },
  ];

  let bestDx = thresholdPx + 1;
  for (const c of xCandidates) {
    const dist = Math.abs(targetX - c.target);
    if (dist <= thresholdPx && dist < bestDx) {
      bestDx = dist;
      outX = c.target;
      snappedX = true;
      guideX = c.guide;
    }
  }

  const yCandidates: Array<{ target: number; guide: number }> = [
    { target: centerY, guide: centerY },
    { target: halfH, guide: 0 },
    { target: canvasHeight - halfH, guide: canvasHeight },
    { target: 24 + halfH, guide: 24 },
    { target: canvasHeight - 24 - halfH, guide: canvasHeight - 24 },
  ];

  let bestDy = thresholdPx + 1;
  for (const c of yCandidates) {
    const dist = Math.abs(targetY - c.target);
    if (dist <= thresholdPx && dist < bestDy) {
      bestDy = dist;
      outY = c.target;
      snappedY = true;
      guideY = c.guide;
    }
  }

  return { x: outX, y: outY, snappedX, snappedY, guideX, guideY };
}
