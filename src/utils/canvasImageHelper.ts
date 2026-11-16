import {
  applyRoundedCornersRgba,
  encodeBmpFromRgba,
  encodeIcoFromPngBytes,
  encodePdfFromJpegBytes,
  encodeSvgWrapper,
  encodeTiffFromRgba,
  removeBackgroundFromRgba,
  vectorizeRgbaToSvg,
} from './imageProcessing';
import type { ExportFormatId, RemoveBgOptions } from './imageProcessing';

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ไม่สามารถโหลดไฟล์ภาพได้ (ตรวจสอบนามสกุลไฟล์)'));
    img.src = src;
  });
}

export async function sourceUrlToCanvas(sourceUrl: string): Promise<HTMLCanvasElement> {
  const img = await loadHtmlImage(sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 1024;
  canvas.height = img.naturalHeight || 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Resizes/center-covers an image URL to exact requested pixel width and height, returning genuine PNG data URL.
 */
export async function resizeUrlToExactPixels(
  sourceUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  const img = await loadHtmlImage(sourceUrl);
  const sw = img.naturalWidth || targetWidth;
  const sh = img.naturalHeight || targetHeight;
  const tw = Math.max(16, Math.round(targetWidth));
  const th = Math.max(16, Math.round(targetHeight));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return sourceUrl;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const scale = Math.max(tw / sw, th / sh);
  const drawW = sw * scale;
  const drawH = sh * scale;
  const dx = (tw - drawW) / 2;
  const dy = (th - drawH) / 2;
  ctx.clearRect(0, 0, tw, th);
  ctx.drawImage(img, dx, dy, drawW, drawH);
  return canvas.toDataURL('image/png');
}

/**
 * Converts any image URL into a genuine lossless PNG data URL.
 */
export async function convertUrlToPngDataUrl(
  sourceUrl: string,
  maxChars?: number
): Promise<string> {
  if (!maxChars && sourceUrl.startsWith('data:image/png;base64,')) {
    return sourceUrl;
  }
  const img = await loadHtmlImage(sourceUrl);
  let width = img.naturalWidth || 1024;
  let height = img.naturalHeight || 1024;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return sourceUrl;

  if (!maxChars) {
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  }

  const initialMax = 896;
  if (width > initialMax || height > initialMax) {
    const scale = initialMax / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  for (let step = 0; step < 7; step++) {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const pngUrl = canvas.toDataURL('image/png');
    if (pngUrl.length <= maxChars) {
      return pngUrl;
    }
    width = Math.max(128, Math.round(width * 0.8));
    height = Math.max(128, Math.round(height * 0.8));
  }

  return canvas.toDataURL('image/png');
}

export async function removeBackgroundFromUrl(
  sourceUrl: string,
  options: RemoveBgOptions = { tolerance: 24, feather: 1, globalColorKey: false }
): Promise<string> {
  const img = await loadHtmlImage(sourceUrl);
  const width = img.naturalWidth || 1024;
  const height = img.naturalHeight || 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  ctx.drawImage(img, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height);
  const processed = removeBackgroundFromRgba(imgData.data, width, height, options);
  imgData.data.set(processed);
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadUrlAsPng(sourceUrl: string, filenameBase: string): Promise<void> {
  const pngUrl = await convertUrlToPngDataUrl(sourceUrl);
  const res = await fetch(pngUrl);
  const blob = await res.blob();
  const safeName = filenameBase.endsWith('.png') ? filenameBase : `${filenameBase}.png`;
  triggerBlobDownload(blob, safeName);
}

export function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`เบราว์เซอร์ไม่รองรับการส่งออกไฟล์ ${mime}`));
      },
      mime,
      quality
    );
  });
}

export function createOpaqueCanvas(
  sourceCanvas: HTMLCanvasElement,
  backgroundHex: string
): HTMLCanvasElement {
  const temp = document.createElement('canvas');
  temp.width = sourceCanvas.width;
  temp.height = sourceCanvas.height;
  const ctx = temp.getContext('2d');
  if (!ctx) return sourceCanvas;
  ctx.fillStyle = backgroundHex;
  ctx.fillRect(0, 0, temp.width, temp.height);
  ctx.drawImage(sourceCanvas, 0, 0);
  return temp;
}

/**
 * Compresses a canvas cleanly until its encoded size fits <= targetBytes (e.g. <= 200KB).
 */
export async function compressCanvasToTargetBytes(
  sourceCanvas: HTMLCanvasElement,
  format: 'jpg' | 'webp' | 'png',
  targetBytes: number,
  opaqueBackgroundHex: string = '#ffffff'
): Promise<{ blob: Blob; qualityUsed: number; finalWidth: number; finalHeight: number }> {
  const mime = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  let workCanvas = format === 'jpg' ? createOpaqueCanvas(sourceCanvas, opaqueBackgroundHex) : sourceCanvas;

  if (format === 'jpg' || format === 'webp') {
    // Binary search quality between 0.12 and 0.96
    let low = 0.12;
    let high = 0.96;
    let bestBlob: Blob | null = null;
    let bestQuality = 0.85;

    for (let i = 0; i < 7; i++) {
      const mid = (low + high) / 2;
      const attempt = await canvasToBlob(workCanvas, mime, mid);
      if (attempt.size <= targetBytes) {
        bestBlob = attempt;
        bestQuality = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    if (bestBlob && bestBlob.size <= targetBytes) {
      return {
        blob: bestBlob,
        qualityUsed: Math.round(bestQuality * 100),
        finalWidth: workCanvas.width,
        finalHeight: workCanvas.height,
      };
    }
  }

  // Fallback progressive dimension downscale for PNG or very tight KB targets
  let scale = 0.88;
  for (let step = 0; step < 8; step++) {
    const w = Math.max(48, Math.round(sourceCanvas.width * scale));
    const h = Math.max(48, Math.round(sourceCanvas.height * scale));
    const scaled = document.createElement('canvas');
    scaled.width = w;
    scaled.height = h;
    const ctx = scaled.getContext('2d');
    if (ctx) {
      if (format === 'jpg') {
        ctx.fillStyle = opaqueBackgroundHex;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sourceCanvas, 0, 0, w, h);
      workCanvas = scaled;
      const attempt = await canvasToBlob(workCanvas, mime, format === 'png' ? undefined : 0.72);
      if (attempt.size <= targetBytes || step === 7) {
        return {
          blob: attempt,
          qualityUsed: format === 'png' ? 100 : 72,
          finalWidth: w,
          finalHeight: h,
        };
      }
    }
    scale *= 0.8;
  }

  const finalBlob = await canvasToBlob(workCanvas, mime, 0.7);
  return {
    blob: finalBlob,
    qualityUsed: 70,
    finalWidth: workCanvas.width,
    finalHeight: workCanvas.height,
  };
}

/**
 * Applies rotation angle, horizontal/vertical perspective keystone tilt, rounded corners, border & padding.
 */
export function renderStyledCanvas(
  sourceCanvas: HTMLCanvasElement,
  opts: {
    straightenDeg?: number;
    skewX?: number;
    skewY?: number;
    cornerRadius?: number;
    borderPx?: number;
    borderColor?: string;
    paddingPx?: number;
    paddingColor?: string;
    transparentPadding?: boolean;
  }
): HTMLCanvasElement {
  const pad = Math.max(0, Math.round(opts.paddingPx || 0));
  const brd = Math.max(0, Math.round(opts.borderPx || 0));
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  // Step 1: Straighten + Perspective transform inside inner canvas
  const inner = document.createElement('canvas');
  inner.width = w;
  inner.height = h;
  const iCtx = inner.getContext('2d');
  if (!iCtx) return sourceCanvas;

  const rad = ((opts.straightenDeg || 0) * Math.PI) / 180;
  const sx = (opts.skewX || 0) * 0.01;
  const sy = (opts.skewY || 0) * 0.01;

  iCtx.save();
  iCtx.translate(w / 2, h / 2);
  if (rad !== 0) iCtx.rotate(rad);
  if (sx !== 0 || sy !== 0) iCtx.transform(1, sy, sx, 1, 0, 0);
  iCtx.drawImage(sourceCanvas, -w / 2, -h / 2, w, h);
  iCtx.restore();

  // Step 2: Optional rounded corners on inner image
  if (opts.cornerRadius && opts.cornerRadius > 0) {
    const imgData = iCtx.getImageData(0, 0, w, h);
    const rounded = applyRoundedCornersRgba(imgData.data, w, h, opts.cornerRadius);
    imgData.data.set(rounded);
    iCtx.putImageData(imgData, 0, 0);
  }

  if (pad === 0 && brd === 0) return inner;

  // Step 3: Outer border & padding canvas
  const outW = w + (pad + brd) * 2;
  const outH = h + (pad + brd) * 2;
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const oCtx = out.getContext('2d');
  if (!oCtx) return inner;

  if (!opts.transparentPadding) {
    oCtx.fillStyle = opts.paddingColor || '#ffffff';
    oCtx.fillRect(0, 0, outW, outH);
  }
  if (brd > 0) {
    oCtx.fillStyle = opts.borderColor || '#111111';
    oCtx.fillRect(pad, pad, w + brd * 2, h + brd * 2);
  }
  oCtx.drawImage(inner, pad + brd, pad + brd);
  return out;
}

/**
 * Generates a 300-DPI A4 print layout sheet (2480 x 3508 px) tiling multiple ID photos with crop marks.
 */
export function generateA4PrintSheetCanvas(
  photoCanvas: HTMLCanvasElement,
  cols: number = 4,
  rows: number = 4
): HTMLCanvasElement {
  const a4W = 2480;
  const a4H = 3508;
  const sheet = document.createElement('canvas');
  sheet.width = a4W;
  sheet.height = a4H;
  const ctx = sheet.getContext('2d');
  if (!ctx) return photoCanvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, a4W, a4H);

  const marginX = 120;
  const marginY = 140;
  const gap = 36;
  const maxCellW = Math.floor((a4W - marginX * 2 - gap * (cols - 1)) / cols);
  const maxCellH = Math.floor((a4H - marginY * 2 - gap * (rows - 1)) / rows);

  const ratio = photoCanvas.width / photoCanvas.height;
  let drawW = maxCellW;
  let drawH = Math.round(drawW / ratio);
  if (drawH > maxCellH) {
    drawH = maxCellH;
    drawW = Math.round(drawH * ratio);
  }

  const totalGridW = cols * drawW + (cols - 1) * gap;
  const startX = Math.floor((a4W - totalGridW) / 2);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (drawW + gap);
      const y = marginY + r * (drawH + gap);
      ctx.drawImage(photoCanvas, x, y, drawW, drawH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, drawW, drawH);
    }
  }
  return sheet;
}

export async function exportCanvasInFormat(
  sourceCanvas: HTMLCanvasElement,
  format: ExportFormatId,
  qualityPercent: number = 92,
  opaqueBackgroundHex: string = '#ffffff'
): Promise<{ blob: Blob; mime: string; extension: string }> {
  const quality = Math.max(0.1, Math.min(1, qualityPercent / 100));

  if (format === 'png') {
    const blob = await canvasToBlob(sourceCanvas, 'image/png');
    return { blob, mime: 'image/png', extension: 'png' };
  }

  if (format === 'webp') {
    const blob = await canvasToBlob(sourceCanvas, 'image/webp', quality);
    return { blob, mime: 'image/webp', extension: 'webp' };
  }

  if (format === 'avif') {
    try {
      const blob = await canvasToBlob(sourceCanvas, 'image/avif', quality);
      if (blob.type === 'image/avif') {
        return { blob, mime: 'image/avif', extension: 'avif' };
      }
    } catch {
      // Fallback below if browser lacks AVIF encoder
    }
    const blob = await canvasToBlob(sourceCanvas, 'image/webp', quality);
    return { blob, mime: 'image/webp', extension: 'webp' };
  }

  if (format === 'jpg') {
    const flat = createOpaqueCanvas(sourceCanvas, opaqueBackgroundHex);
    const blob = await canvasToBlob(flat, 'image/jpeg', quality);
    return { blob, mime: 'image/jpeg', extension: 'jpg' };
  }

  if (format === 'bmp') {
    const flat = createOpaqueCanvas(sourceCanvas, opaqueBackgroundHex);
    const ctx = flat.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    const imgData = ctx.getImageData(0, 0, flat.width, flat.height);
    const bytes = encodeBmpFromRgba(imgData.data, flat.width, flat.height);
    return {
      blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'image/bmp' }),
      mime: 'image/bmp',
      extension: 'bmp',
    };
  }

  if (format === 'tiff') {
    const flat = createOpaqueCanvas(sourceCanvas, opaqueBackgroundHex);
    const ctx = flat.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    const imgData = ctx.getImageData(0, 0, flat.width, flat.height);
    const bytes = encodeTiffFromRgba(imgData.data, flat.width, flat.height);
    return {
      blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'image/tiff' }),
      mime: 'image/tiff',
      extension: 'tiff',
    };
  }

  if (format === 'ico') {
    const maxIco = 256;
    const icoCanvas = document.createElement('canvas');
    const scale = Math.min(1, maxIco / Math.max(sourceCanvas.width, sourceCanvas.height));
    icoCanvas.width = Math.max(16, Math.round(sourceCanvas.width * scale));
    icoCanvas.height = Math.max(16, Math.round(sourceCanvas.height * scale));
    const ctx = icoCanvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(sourceCanvas, 0, 0, icoCanvas.width, icoCanvas.height);
    const pngBlob = await canvasToBlob(icoCanvas, 'image/png');
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    const icoBytes = encodeIcoFromPngBytes(pngBytes, icoCanvas.width, icoCanvas.height);
    return {
      blob: new Blob([icoBytes.buffer as ArrayBuffer], { type: 'image/x-icon' }),
      mime: 'image/x-icon',
      extension: 'ico',
    };
  }

  if (format === 'svg-vector') {
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    const imgData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const svgText = vectorizeRgbaToSvg(imgData.data, sourceCanvas.width, sourceCanvas.height, 28);
    return {
      blob: new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }),
      mime: 'image/svg+xml',
      extension: 'svg',
    };
  }

  if (format === 'svg') {
    const pngUrl = sourceCanvas.toDataURL('image/png');
    const svgText = encodeSvgWrapper(pngUrl, sourceCanvas.width, sourceCanvas.height);
    return {
      blob: new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }),
      mime: 'image/svg+xml',
      extension: 'svg',
    };
  }

  // PDF
  const flat = createOpaqueCanvas(sourceCanvas, opaqueBackgroundHex);
  const jpgBlob = await canvasToBlob(flat, 'image/jpeg', quality);
  const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
  const pdfBytes = encodePdfFromJpegBytes(jpgBytes, flat.width, flat.height);
  return {
    blob: new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    mime: 'application/pdf',
    extension: 'pdf',
  };
}
