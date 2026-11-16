import type { TimelineClip, VideoTrack } from './videoTimelineLogic';
import { computeTimelineAudioGain, interpolateClipTransformAtTime } from './videoTimelineLogic';

export interface WaveformResult {
  peaks: number[]; // normalized 0..1
  durationSec: number;
}

/**
 * Extracts normalized waveform amplitude peaks from an audio file/blob URL for timeline rendering.
 */
export async function extractAudioWaveformPeaks(
  audioUrl: string,
  bars: number = 64
): Promise<WaveformResult> {
  const res = await fetch(audioUrl);
  const arrBuf = await res.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuf = await ctx.decodeAudioData(arrBuf);
    const channelData = audioBuf.getChannelData(0);
    const totalSamples = channelData.length;
    const step = Math.max(1, Math.floor(totalSamples / bars));
    const peaks: number[] = [];
    let maxPeak = 0.001;
    for (let i = 0; i < bars; i++) {
      const start = i * step;
      const end = Math.min(totalSamples, start + step);
      let peak = 0;
      for (let s = start; s < end; s++) {
        const abs = Math.abs(channelData[s]);
        if (abs > peak) peak = abs;
      }
      if (peak > maxPeak) maxPeak = peak;
      peaks.push(peak);
    }
    return {
      peaks: peaks.map((p) => Number((p / maxPeak).toFixed(3))),
      durationSec: Number(audioBuf.duration.toFixed(2)),
    };
  } finally {
    await ctx.close();
  }
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ไม่สามารถโหลดไฟล์ภาพในไทม์ไลน์ได้'));
    img.src = url;
  });
}

function loadVideoEl(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const vid = document.createElement('video');
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      vid.crossOrigin = 'anonymous';
    }
    vid.onloadeddata = () => resolve(vid);
    vid.onerror = () => reject(new Error('ไม่สามารถโหลดไฟล์วิดีโอในไทม์ไลน์ได้'));
    vid.src = url;
  });
}

function selectSupportedVideoMime(preferMp4: boolean): string {
  const mp4Candidates = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
  const webmCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const list = preferMp4 ? [...mp4Candidates, ...webmCandidates] : [...webmCandidates, ...mp4Candidates];
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  for (const m of list) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'video/webm';
}

export async function exportTimelineVideoWithAudio(options: {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  tracks: VideoTrack[];
  clips: TimelineClip[];
  preferMp4?: boolean;
  onProgress?: (pct: number) => void;
}): Promise<{ blob: Blob; mimeType: string; extension: 'mp4' | 'webm' }> {
  const { width, height, fps, durationSec, tracks, clips, preferMp4 = false, onProgress } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับการสร้าง Video Canvas');

  // Preload visual & audio sources
  const imgCache = new Map<string, HTMLImageElement>();
  const videoCache = new Map<string, HTMLVideoElement>();

  for (const clip of clips) {
    if ((clip.kind === 'image' || clip.kind === 'overlay') && clip.sourceUrl && !imgCache.has(clip.sourceUrl)) {
      imgCache.set(clip.sourceUrl, await loadImageEl(clip.sourceUrl));
    } else if (clip.kind === 'video' && clip.sourceUrl && !videoCache.has(clip.sourceUrl)) {
      videoCache.set(clip.sourceUrl, await loadVideoEl(clip.sourceUrl));
    }
  }

  // Decode audio tracks & schedule into MediaStreamDestination
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const destNode = audioCtx.createMediaStreamDestination();

  const anySolo = tracks.some((t) => t.solo);
  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  const audioBuffers = new Map<string, AudioBuffer>();

  const audioClips = clips.filter((c) => {
    const tr = trackMap.get(c.trackId);
    if (!tr || tr.muted || (anySolo && !tr.solo)) return false;
    return c.kind === 'audio' && !c.muted && c.volume > 0 && Boolean(c.sourceUrl);
  });

  for (const ac of audioClips) {
    if (!audioBuffers.has(ac.sourceUrl)) {
      try {
        const res = await fetch(ac.sourceUrl);
        const ab = await res.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(ab);
        audioBuffers.set(ac.sourceUrl, decoded);
      } catch {
        // Skip unreadable audio blob gracefully
      }
    }
  }

  const videoStream = canvas.captureStream(fps);
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...(audioBuffers.size > 0 ? destNode.stream.getAudioTracks() : []),
  ]);

  const mimeType = selectSupportedVideoMime(preferMp4);
  const extension: 'mp4' | 'webm' = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 4_500_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stoppedPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  // Schedule audio nodes aligned with recorder start
  const baseAudioTime = audioCtx.currentTime + 0.05;
  for (const ac of audioClips) {
    const buf = audioBuffers.get(ac.sourceUrl);
    if (!buf) continue;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(4, ac.speed || 1));

    const gainNode = audioCtx.createGain();
    const startAt = baseAudioTime + ac.startSec;
    const endAt = startAt + ac.durationSec;
    const baseGain = computeTimelineAudioGain({ ...ac, fadeInSec: 0, fadeOutSec: 0 }, ac.startSec + 0.01);
    if (ac.fadeInSec > 0) {
      gainNode.gain.setValueAtTime(0, startAt);
      gainNode.gain.linearRampToValueAtTime(baseGain, Math.min(endAt, startAt + ac.fadeInSec));
    } else {
      gainNode.gain.setValueAtTime(baseGain, startAt);
    }
    if (ac.fadeOutSec > 0) {
      const fadeOutStart = Math.max(startAt, endAt - ac.fadeOutSec);
      gainNode.gain.setValueAtTime(baseGain, fadeOutStart);
      gainNode.gain.linearRampToValueAtTime(0, endAt);
    }

    src.connect(gainNode);
    gainNode.connect(destNode);
    src.start(startAt, Math.max(0, ac.inPointSec), ac.durationSec * (ac.speed || 1));
  }

  recorder.start(120);
  const startWallMs = performance.now();
  const totalMs = durationSec * 1000;
  const frameIntervalMs = 1000 / fps;

  while (true) {
    const elapsedMs = performance.now() - startWallMs;
    const tSec = Math.min(durationSec, elapsedMs / 1000);

    // Draw frame onto canvas
    ctx.fillStyle = '#080F1E';
    ctx.fillRect(0, 0, width, height);

    const activeClips = clips.filter((c) => {
      const tr = trackMap.get(c.trackId);
      if (!tr || tr.hidden) return false;
      return c.kind !== 'audio' && tSec >= c.startSec && tSec <= c.startSec + c.durationSec;
    });

    for (const clip of activeClips) {
      const tf = interpolateClipTransformAtTime(clip, tSec);
      const localT = tSec - clip.startSec;
      let alpha = tf.opacity / 100;
      if (clip.transitionIn === 'crossfade' && clip.transitionDurationSec > 0 && localT < clip.transitionDurationSec) {
        alpha *= Math.max(0, localT / clip.transitionDurationSec);
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate((tf.xPct / 100) * width, (tf.yPct / 100) * height);
      ctx.rotate((tf.rotationDeg * Math.PI) / 180);
      ctx.scale(tf.scale, tf.scale);

      const brightness = 100 + clip.effects.exposure;
      const contrast = 100 + clip.effects.contrast;
      const saturate = 100 + clip.effects.saturation;
      const blur = Math.max(0, clip.effects.blur);
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) blur(${blur}px)`;

      if (clip.kind === 'text') {
        const fs = clip.textFontSize || 64;
        ctx.font = `700 ${fs}px "Kanit", "Noto Sans Thai", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = clip.textColor || '#FFFFFF';
        ctx.fillText(clip.textContent || clip.name, 0, 0);
      } else if (clip.kind === 'image' || clip.kind === 'overlay') {
        const img = imgCache.get(clip.sourceUrl);
        if (img) {
          const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
          let dw = width;
          let dh = width / aspect;
          if (dh > height) {
            dh = height;
            dw = height * aspect;
          }
          if (clip.kind === 'overlay') {
            dw *= 0.45;
            dh *= 0.45;
          }
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        }
      } else if (clip.kind === 'video') {
        const vid = videoCache.get(clip.sourceUrl);
        if (vid) {
          const targetVidTime = Math.min(
            vid.duration || durationSec,
            clip.inPointSec + localT * (clip.speed || 1)
          );
          if (Math.abs(vid.currentTime - targetVidTime) > 0.08) {
            vid.currentTime = targetVidTime;
          }
          const vw = vid.videoWidth || width;
          const vh = vid.videoHeight || height;
          const scaleFit = Math.min(width / vw, height / vh);
          ctx.drawImage(vid, (-vw * scaleFit) / 2, (-vh * scaleFit) / 2, vw * scaleFit, vh * scaleFit);
        }
      }
      ctx.restore();

      if (clip.effects.vignette > 0) {
        const grad = ctx.createRadialGradient(
          width / 2,
          height / 2,
          width * 0.25,
          width / 2,
          height / 2,
          width * 0.72
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${(clip.effects.vignette / 100) * 0.78})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }
    }

    onProgress?.(Math.min(99, Math.round((elapsedMs / Math.max(1, totalMs)) * 100)));
    if (elapsedMs >= totalMs) break;
    await new Promise((r) => setTimeout(r, Math.max(12, frameIntervalMs)));
  }

  recorder.stop();
  const blob = await stoppedPromise;
  await audioCtx.close();
  onProgress?.(100);
  return { blob, mimeType, extension };
}
