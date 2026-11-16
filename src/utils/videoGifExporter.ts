import { GIFEncoder, applyPalette, quantize } from 'gifenc';

export type AnimationQuality = 'standard' | 'high';

export interface GifExportOptions {
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  quality: AnimationQuality;
  renderFrameAtTime: (targetCanvas: HTMLCanvasElement, timeSec: number) => void;
  onProgress?: (percent: number) => void;
}

export async function exportTimelineToGif(options: GifExportOptions): Promise<Blob> {
  const maxDim = options.quality === 'high' ? 720 : 480;
  const scale = Math.min(1, maxDim / Math.max(options.width, options.height));
  const outW = Math.max(64, Math.round(options.width * scale));
  const outH = Math.max(64, Math.round(options.height * scale));

  // Cap GIF encoding FPS slightly so encoding completes swiftly on browser main thread
  const effectiveFps = Math.min(options.fps, options.quality === 'high' ? 20 : 15);
  const totalFrames = Math.max(4, Math.round(options.durationSec * effectiveFps));
  const delayMs = Math.round(1000 / effectiveFps);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('ไม่สามารถสร้าง Canvas สำหรับส่งออก GIF ได้');

  const gif = GIFEncoder();

  for (let i = 0; i < totalFrames; i++) {
    const t = totalFrames <= 1 ? 0 : (i / (totalFrames - 1)) * options.durationSec;
    options.renderFrameAtTime(canvas, t);
    const { data } = ctx.getImageData(0, 0, outW, outH);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, outW, outH, {
      palette,
      delay: delayMs,
      repeat: 0,
    });

    if (options.onProgress) {
      options.onProgress(Math.round(((i + 1) / totalFrames) * 100));
    }
    if (i % 4 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  gif.finish();
  const bytes = gif.bytes();
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' });
}

export interface VideoExportResult {
  blob: Blob;
  extension: 'mp4' | 'webm';
  mimeType: string;
  usedWebmFallback: boolean;
}

export async function exportTimelineToVideo(options: {
  width: number;
  height: number;
  durationSec: number;
  fps: 24 | 30;
  preferMp4: boolean;
  quality: AnimationQuality;
  renderFrameAtTime: (targetCanvas: HTMLCanvasElement, timeSec: number) => void;
  onProgress?: (percent: number) => void;
}): Promise<VideoExportResult> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับการบันทึกวิดีโอ MediaRecorder กรุณาส่งออกเป็น GIF แทน');
  }

  const maxDim = options.quality === 'high' ? 1280 : 854;
  const scale = Math.min(1, maxDim / Math.max(options.width, options.height));
  // Ensure even pixel dimensions for hardware codecs
  const outW = Math.max(64, Math.floor((options.width * scale) / 2) * 2);
  const outH = Math.max(64, Math.floor((options.height * scale) / 2) * 2);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  if (!canvas.captureStream) {
    throw new Error('เบราว์เซอร์ไม่รองรับ canvas.captureStream');
  }

  const mp4Candidates = ['video/mp4;codecs=avc1.42E01E', 'video/mp4'];
  const webmCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

  let chosenMime = '';
  let extension: 'mp4' | 'webm' = 'webm';
  let usedWebmFallback = false;

  if (options.preferMp4) {
    for (const mime of mp4Candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        chosenMime = mime;
        extension = 'mp4';
        break;
      }
    }
    if (!chosenMime) {
      usedWebmFallback = true;
    }
  }

  if (!chosenMime) {
    for (const mime of webmCandidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        chosenMime = mime;
        extension = 'webm';
        break;
      }
    }
  }

  const stream = canvas.captureStream(options.fps);
  const recorder = chosenMime
    ? new MediaRecorder(stream, {
        mimeType: chosenMime,
        videoBitsPerSecond: options.quality === 'high' ? 4_500_000 : 2_200_000,
      })
    : new MediaRecorder(stream);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const totalMs = Math.max(500, options.durationSec * 1000);
  const frameIntervalMs = 1000 / options.fps;

  const donePromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const mime = recorder.mimeType || chosenMime || 'video/webm';
      resolve(new Blob(chunks, { type: mime }));
    };
    recorder.onerror = () => reject(new Error('เกิดข้อผิดพลาดระหว่างการบันทึกไฟล์วิดีโอ'));
  });

  options.renderFrameAtTime(canvas, 0);
  recorder.start(100);

  const startTime = performance.now();
  await new Promise<void>((resolve) => {
    const step = () => {
      const elapsedMs = performance.now() - startTime;
      const tSec = Math.min(options.durationSec, elapsedMs / 1000);
      options.renderFrameAtTime(canvas, tSec);
      if (options.onProgress) {
        options.onProgress(Math.min(100, Math.round((elapsedMs / totalMs) * 100)));
      }
      if (elapsedMs >= totalMs) {
        resolve();
        return;
      }
      setTimeout(step, frameIntervalMs);
    };
    setTimeout(step, frameIntervalMs);
  });

  recorder.stop();
  const blob = await donePromise;
  stream.getTracks().forEach((tr) => tr.stop());

  return {
    blob,
    extension,
    mimeType: blob.type || chosenMime || 'video/webm',
    usedWebmFallback,
  };
}
