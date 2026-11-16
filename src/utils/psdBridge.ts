import { readPsd, writePsdBuffer } from 'ag-psd';
import type { BlendMode, Layer as PsdLayer, Psd } from 'ag-psd';
import { DEFAULT_ADJUSTMENTS } from './imageProcessing';
import type {
  CanvasProjectState,
  ImageStudioLayer,
  LayerBlendMode,
  ShapeStudioLayer,
  StudioLayer,
  TextStudioLayer,
  ThaiStudioFontId,
} from './studioTypes';

const STUDIO_TO_PSD_BLEND: Record<LayerBlendMode, BlendMode> = {
  'source-over': 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
};

const PSD_TO_STUDIO_BLEND: Partial<Record<BlendMode, LayerBlendMode>> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
};

export function mapStudioBlendToPsd(blend: LayerBlendMode): BlendMode {
  return STUDIO_TO_PSD_BLEND[blend] || 'normal';
}

export function mapPsdBlendToStudio(blend?: BlendMode): LayerBlendMode {
  if (!blend) return 'source-over';
  return PSD_TO_STUDIO_BLEND[blend] || 'source-over';
}

export interface PsdLayerMetadata {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  opacity: number;
  hidden: boolean;
  blendMode: BlendMode;
  textContent?: string;
  fontSize?: number;
  fillHex?: string;
}

export function buildPsdLayerMetadata(
  layer: StudioLayer,
  canvasWidth: number,
  canvasHeight: number
): PsdLayerMetadata {
  const halfW = (layer.width * layer.scale) / 2;
  const halfH = (layer.height * layer.scale) / 2;
  const left = Math.round(Math.max(-canvasWidth, layer.x - halfW));
  const top = Math.round(Math.max(-canvasHeight, layer.y - halfH));
  const right = Math.round(left + Math.max(1, layer.width * layer.scale));
  const bottom = Math.round(top + Math.max(1, layer.height * layer.scale));

  const meta: PsdLayerMetadata = {
    name: `${layer.name}${layer.provenance ? ` [${layer.provenance}]` : ''}`,
    left,
    top,
    right,
    bottom,
    opacity: Math.max(0, Math.min(1, layer.opacity / 100)),
    hidden: !layer.visible,
    blendMode: mapStudioBlendToPsd(layer.blendMode),
  };

  if (layer.type === 'text') {
    meta.textContent = layer.text;
    meta.fontSize = Math.max(8, Math.round(layer.fontSize * layer.scale));
    meta.fillHex = layer.color;
  }

  return meta;
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('ไม่สามารถโหลดเลเยอร์ภาพสำหรับส่งออก PSD'));
    img.src = url;
  });
}

function createShapeCanvas(layer: ShapeStudioLayer): HTMLCanvasElement {
  const w = Math.max(4, Math.round(layer.width * layer.scale));
  const h = Math.max(4, Math.round(layer.height * layer.scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  ctx.fillStyle = layer.fillColor;
  ctx.strokeStyle = layer.strokeColor;
  ctx.lineWidth = layer.strokeWidth;

  const pad = Math.max(1, layer.strokeWidth);
  const bw = Math.max(2, w - pad * 2);
  const bh = Math.max(2, h - pad * 2);

  ctx.beginPath();
  if (layer.shapeKind === 'rect') {
    ctx.roundRect(pad, pad, bw, bh, Math.min(layer.cornerRadius, Math.min(bw, bh) / 2));
  } else if (layer.shapeKind === 'circle') {
    ctx.ellipse(w / 2, h / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
  } else if (layer.shapeKind === 'triangle') {
    ctx.moveTo(w / 2, pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
  } else if (layer.shapeKind === 'star') {
    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(bw, bh) / 2;
    const innerR = outerR * 0.45;
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (layer.shapeKind === 'polygon') {
    const cx = w / 2;
    const cy = h / 2;
    const rad = Math.min(bw, bh) / 2;
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / 6;
      const px = cx + Math.cos(angle) * rad;
      const py = cy + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (layer.shapeKind === 'line') {
    ctx.moveTo(pad, h / 2);
    ctx.lineTo(w - pad, h / 2);
  } else if (layer.shapeKind === 'path' && layer.points && layer.points.length >= 2) {
    layer.points.forEach((pt, idx) => {
      const px = (pt.x + 0.5) * w;
      const py = (pt.y + 0.5) * h;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
  }
  if (layer.shapeKind !== 'line' && layer.fillColor !== 'transparent') {
    ctx.fill();
  }
  if (layer.strokeWidth > 0) {
    ctx.stroke();
  }
  return c;
}

function createTextCanvas(layer: TextStudioLayer): HTMLCanvasElement {
  const w = Math.max(8, Math.round(layer.width * layer.scale));
  const h = Math.max(8, Math.round(layer.height * layer.scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const fontPx = Math.max(10, Math.round(layer.fontSize * layer.scale));
  ctx.font = `${layer.bold ? '700' : '400'} ${fontPx}px "${layer.fontFamily}", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = layer.align;
  const tx = layer.align === 'left' ? 12 : layer.align === 'right' ? w - 12 : w / 2;
  if (layer.strokeWidth > 0) {
    ctx.strokeStyle = layer.strokeColor;
    ctx.lineWidth = layer.strokeWidth * 2;
    ctx.strokeText(layer.text, tx, h / 2);
  }
  ctx.fillStyle = layer.color;
  ctx.fillText(layer.text, tx, h / 2);
  return c;
}

/**
 * Exports a complete layered PSD ArrayBuffer using ag-psd with preserved bounds,
 * opacity, blend mode, text metadata, and raster canvases.
 */
export async function exportProjectToPsdBuffer(project: CanvasProjectState): Promise<ArrayBuffer> {
  const width = Math.max(16, Math.round(project.canvasWidth));
  const height = Math.max(16, Math.round(project.canvasHeight));

  const composite = document.createElement('canvas');
  composite.width = width;
  composite.height = height;
  const compCtx = composite.getContext('2d');
  if (compCtx && project.backgroundColor !== 'transparent') {
    compCtx.fillStyle = project.backgroundColor;
    compCtx.fillRect(0, 0, width, height);
  }

  const children: PsdLayer[] = [];

  if (project.backgroundColor !== 'transparent') {
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = width;
    bgCanvas.height = height;
    const bctx = bgCanvas.getContext('2d');
    if (bctx) {
      bctx.fillStyle = project.backgroundColor;
      bctx.fillRect(0, 0, width, height);
    }
    children.push({
      name: 'Background Color',
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      canvas: bgCanvas,
    });
  }

  for (const layer of project.layers) {
    const meta = buildPsdLayerMetadata(layer, width, height);
    const layerW = Math.max(4, meta.right - meta.left);
    const layerH = Math.max(4, meta.bottom - meta.top);
    let layerCanvas: HTMLCanvasElement | undefined;

    if (layer.type === 'image') {
      const img = await loadHtmlImage(layer.imageUrl);
      layerCanvas = document.createElement('canvas');
      layerCanvas.width = layerW;
      layerCanvas.height = layerH;
      const lctx = layerCanvas.getContext('2d');
      if (lctx) {
        lctx.drawImage(img, 0, 0, layerW, layerH);
      }
    } else if (layer.type === 'shape') {
      layerCanvas = createShapeCanvas(layer);
    } else if (layer.type === 'text') {
      layerCanvas = createTextCanvas(layer);
    }

    if (compCtx && layerCanvas && layer.visible) {
      compCtx.save();
      compCtx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
      compCtx.globalCompositeOperation = layer.blendMode;
      compCtx.drawImage(layerCanvas, meta.left, meta.top, layerW, layerH);
      compCtx.restore();
    }

    const psdLayer: PsdLayer = {
      name: meta.name,
      left: meta.left,
      top: meta.top,
      right: meta.right,
      bottom: meta.bottom,
      opacity: meta.opacity,
      hidden: meta.hidden,
      blendMode: meta.blendMode,
      ...(layerCanvas ? { canvas: layerCanvas } : {}),
      ...(layer.type === 'text'
        ? {
            text: {
              text: layer.text,
              style: {
                fontSize: meta.fontSize || layer.fontSize,
              },
            },
          }
        : {}),
    };
    children.push(psdLayer);
  }

  const psdDoc: Psd = {
    width,
    height,
    channels: 4,
    bitsPerChannel: 8,
    canvas: composite,
    children,
  };

  return writePsdBuffer(psdDoc);
}

/**
 * Imports a layered .psd binary buffer into ZImage StudioLayer[] preserving bounds,
 * names, visibility, opacity, blend modes, text layers, and raster layers.
 */
export function importPsdBufferToStudioLayers(buffer: ArrayBuffer): {
  width: number;
  height: number;
  layers: StudioLayer[];
} {
  const psd = readPsd(buffer);
  const width = Math.max(16, psd.width || 1080);
  const height = Math.max(16, psd.height || 1080);
  const collected: StudioLayer[] = [];

  const walk = (nodes: PsdLayer[] | undefined, groupTag?: string) => {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        walk(node.children, node.name || groupTag);
        continue;
      }

      const left = node.left ?? 0;
      const top = node.top ?? 0;
      const right = node.right ?? left + (node.canvas?.width || width);
      const bottom = node.bottom ?? top + (node.canvas?.height || height);
      const lw = Math.max(8, right - left);
      const lh = Math.max(8, bottom - top);
      const cx = left + lw / 2;
      const cy = top + lh / 2;
      const opacityPct =
        typeof node.opacity === 'number' ? Math.round(Math.max(0, Math.min(1, node.opacity)) * 100) : 100;
      const blendMode = mapPsdBlendToStudio(node.blendMode);

      if (node.text && node.text.text) {
        const textLayer: TextStudioLayer = {
          id: `psd-txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: node.name || 'PSD Text',
          type: 'text',
          provenance: 'text',
          groupId: groupTag,
          visible: !node.hidden,
          locked: false,
          x: cx,
          y: cy,
          width: lw,
          height: lh,
          scale: 1,
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: opacityPct,
          blendMode,
          parallaxDepth: 0,
          keyframes: [],
          text: node.text.text,
          fontFamily: 'Noto Sans Thai' as ThaiStudioFontId,
          fontSize: Math.max(14, Math.round(node.text.style?.fontSize || 42)),
          color: '#101820',
          bold: false,
          align: 'center',
          shadow: false,
          strokeWidth: 0,
          strokeColor: '#FFFFFF',
        };
        collected.push(textLayer);
        continue;
      }

      if (node.canvas) {
        const dataUrl = node.canvas.toDataURL('image/png');
        const imgLayer: ImageStudioLayer = {
          id: `psd-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: node.name || 'PSD Layer',
          type: 'image',
          provenance: 'raster',
          groupId: groupTag,
          visible: !node.hidden,
          locked: false,
          x: cx,
          y: cy,
          width: lw,
          height: lh,
          scale: 1,
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: opacityPct,
          blendMode,
          parallaxDepth: 0,
          keyframes: [],
          imageUrl: dataUrl,
          originalImageUrl: dataUrl,
          adjustments: { ...DEFAULT_ADJUSTMENTS },
        };
        collected.push(imgLayer);
      }
    }
  };

  walk(psd.children);
  return { width, height, layers: collected };
}
