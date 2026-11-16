import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileCode2,
  FlipHorizontal,
  Layers,
  Paintbrush,
  Pentagon,
  RefreshCw,
  Scissors,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { loadHtmlImage, triggerBlobDownload } from '../utils/canvasImageHelper';
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
} from '../utils/layerDecompose';
import type { DecomposeAiResult } from '../utils/layerDecompose';
import { DEFAULT_ADJUSTMENTS } from '../utils/imageProcessing';
import { exportProjectToPsdBuffer } from '../utils/psdBridge';
import type {
  CanvasProjectState,
  ImageStudioLayer,
  StudioLayer,
  TextStudioLayer,
} from '../utils/studioTypes';
import type { EditorSourceItem } from './EditorView';
import { CURATED_SHOWCASE_ITEMS } from '../data/showcasePresets';

interface LayerDecomposeViewProps {
  user: User | null;
  initialSource?: EditorSourceItem | null;
  onOpenInEditor: (item: EditorSourceItem) => void;
}

type MaskTool = 'none' | 'brush-add' | 'brush-erase' | 'wand-add' | 'wand-erase' | 'lasso-add' | 'lasso-erase';

interface DecomposedItemState {
  layer: StudioLayer;
  mask?: Uint8Array;
  bboxPct?: [number, number, number, number];
}

function makeLayerId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function renderRgbaToPngDataUrl(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Promise<string> {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const id = ctx.createImageData(width, height);
  id.data.set(rgba);
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

export function LayerDecomposeView({
  user,
  initialSource,
  onOpenInEditor,
}: LayerDecomposeViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintingRef = useRef(false);

  const [sourceUrl, setSourceUrl] = useState<string>(
    initialSource?.imageUrl || CURATED_SHOWCASE_ITEMS[0].imageUrl
  );
  const [sourceTitle, setSourceTitle] = useState<string>(
    initialSource?.title || CURATED_SHOWCASE_ITEMS[0].title
  );
  const [imgDimensions, setImgDimensions] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const [srcRgba, setSrcRgba] = useState<Uint8ClampedArray | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<DecomposeAiResult | null>(null);
  const [items, setItems] = useState<DecomposedItemState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Interactive mask refinement
  const [maskTool, setMaskTool] = useState<MaskTool>('none');
  const [brushRadius, setBrushRadius] = useState<number>(20);
  const [wandTolerance, setWandTolerance] = useState<number>(28);
  const [lassoPoints, setLassoPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Update when initialSource changes
  useEffect(() => {
    if (initialSource?.imageUrl) {
      setSourceUrl(initialSource.imageUrl);
      setSourceTitle(initialSource.title || 'ภาพนำเข้า');
    }
  }, [initialSource]);

  // Decode source image into clamped work buffer (max 960px for crisp interactive Canvas editing)
  useEffect(() => {
    let cancelled = false;
    loadHtmlImage(sourceUrl)
      .then((img) => {
        if (cancelled) return;
        const maxSide = 960;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 800, img.naturalHeight || 600));
        const w = Math.max(64, Math.round((img.naturalWidth || 800) * scale));
        const h = Math.max(64, Math.round((img.naturalHeight || 600) * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        setImgDimensions({ w, h });
        setSrcRgba(new Uint8ClampedArray(data));
        setAiResult(null);
        setAiError(null);
        setItems([
          {
            layer: {
              id: makeLayerId('base'),
              name: 'ภาพต้นฉบับ (Original)',
              type: 'image',
              provenance: 'raster',
              visible: true,
              locked: false,
              x: w / 2,
              y: h / 2,
              width: w,
              height: h,
              scale: 1,
              rotation: 0,
              flipX: false,
              flipY: false,
              opacity: 100,
              blendMode: 'source-over',
              parallaxDepth: 0,
              keyframes: [],
              imageUrl: c.toDataURL('image/png'),
              originalImageUrl: c.toDataURL('image/png'),
              adjustments: { ...DEFAULT_ADJUSTMENTS },
            },
          },
        ]);
      })
      .catch(() => {
        if (!cancelled) setAiError('ไม่สามารถโหลดภาพต้นฉบับได้');
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  const selectedItem = useMemo(
    () => items.find((i) => i.layer.id === selectedId) || null,
    [items, selectedId]
  );

  // Draw live preview composite of visible decomposed layers + lasso preview
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    canvas.width = imgDimensions.w;
    canvas.height = imgDimensions.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, imgDimensions.w, imgDimensions.h);

    const drawAll = async () => {
      for (const entry of items) {
        const l = entry.layer;
        if (!l.visible) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, l.opacity / 100));
        ctx.translate(l.x, l.y);
        ctx.rotate((l.rotation * Math.PI) / 180);
        ctx.scale(l.scale, l.scale);
        if (l.type === 'image') {
          try {
            const im = await loadHtmlImage(l.imageUrl);
            ctx.drawImage(im, -l.width / 2, -l.height / 2, l.width, l.height);
          } catch {
            // Skip unreadable
          }
        } else if (l.type === 'text') {
          ctx.font = `${l.bold ? '700' : '500'} ${l.fontSize}px "${l.fontFamily}", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = l.color;
          ctx.fillText(l.text, 0, 0);
        }
        ctx.restore();
      }

      if (lassoPoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        lassoPoints.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
      }
    };
    drawAll();
  }, [items, imgDimensions, lassoPoints]);

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
        setSourceTitle(file.name);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Run Vision AI Structured Decomposition + Local Canvas Cutout & Background Reconstruction
  const handleRunAiDecompose = async () => {
    if (!srcRgba) return;
    setAnalyzing(true);
    setAiError(null);
    setNotice(null);

    try {
      const c = document.createElement('canvas');
      c.width = imgDimensions.w;
      c.height = imgDimensions.h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas ไม่พร้อมใช้งาน');
      const id = ctx.createImageData(imgDimensions.w, imgDimensions.h);
      id.data.set(srcRgba);
      ctx.putImageData(id, 0, 0);
      const jpegDataUrl = c.toDataURL('image/jpeg', 0.85);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user) {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      }

      const res = await fetch('/api/ai/decompose-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageDataUrl: jpegDataUrl }),
      });

      const data = (await res.json()) as DecomposeAiResult & { error?: string };
      if (!res.ok || !Array.isArray(data.objectRegions)) {
        throw new Error(data.error || 'ไม่สามารถวิเคราะห์โครงสร้างภาพด้วย Vision AI ได้ในขณะนี้');
      }

      setAiResult(data);
      const { w, h } = imgDimensions;

      // Build combined foreground mask for background patch reconstruction
      const combinedFgMask = new Uint8Array(w * h);
      const objectEntries: DecomposedItemState[] = [];

      for (const obj of data.objectRegions) {
        const mask = extractForegroundMaskInRegion(srcRgba, w, h, obj.bboxPct, 30);
        for (let p = 0; p < combinedFgMask.length; p++) {
          if (mask[p] > combinedFgMask[p]) combinedFgMask[p] = mask[p];
        }
        const cutoutRgba = applyMaskToRgba(srcRgba, mask);
        const cutoutUrl = await renderRgbaToPngDataUrl(cutoutRgba, w, h);
        const layer: ImageStudioLayer = {
          id: makeLayerId('fg'),
          name: obj.label || 'วัตถุแยกชั้น',
          type: 'image',
          provenance: 'raster',
          visible: true,
          locked: false,
          x: w / 2,
          y: h / 2,
          width: w,
          height: h,
          scale: 1,
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: 100,
          blendMode: 'source-over',
          parallaxDepth: 1.4,
          keyframes: [],
          imageUrl: cutoutUrl,
          originalImageUrl: cutoutUrl,
          isCutoutForeground: true,
          adjustments: { ...DEFAULT_ADJUSTMENTS },
        };
        objectEntries.push({ layer, mask, bboxPct: obj.bboxPct });
      }

      // Clean AI-Reconstructed background plate
      const bgRgba = reconstructBackgroundPatch(srcRgba, combinedFgMask, w, h, 26);
      const bgUrl = await renderRgbaToPngDataUrl(bgRgba, w, h);
      const bgLayer: ImageStudioLayer = {
        id: makeLayerId('bg'),
        name: 'Clean Background (ซ่อมฉากหลังอัตโนมัติ)',
        type: 'image',
        provenance: 'ai-reconstructed',
        visible: true,
        locked: false,
        x: w / 2,
        y: h / 2,
        width: w,
        height: h,
        scale: 1,
        rotation: 0,
        flipX: false,
        flipY: false,
        opacity: 100,
        blendMode: 'source-over',
        parallaxDepth: 0.2,
        keyframes: [],
        imageUrl: bgUrl,
        originalImageUrl: bgUrl,
        adjustments: { ...DEFAULT_ADJUSTMENTS },
      };

      // Editable OCR Text Layers
      const textEntries: DecomposedItemState[] = (data.textRegions || []).map((tr) => {
        const [bx, by, bw, bh] = tr.bboxPct;
        const cx = ((bx + bw / 2) / 100) * w;
        const cy = ((by + bh / 2) / 100) * h;
        const fontSize = Math.max(18, Math.round(((tr.fontSizeRel || 5) / 100) * h));
        const textLayer: TextStudioLayer = {
          id: makeLayerId('txt'),
          name: `Text: ${tr.text.slice(0, 18)}`,
          type: 'text',
          provenance: 'text',
          visible: true,
          locked: false,
          x: cx,
          y: cy,
          width: Math.max(120, Math.round((bw / 100) * w)),
          height: Math.max(48, Math.round((bh / 100) * h)),
          scale: 1,
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: 100,
          blendMode: 'source-over',
          parallaxDepth: 1.8,
          keyframes: [],
          text: tr.text,
          fontFamily: 'Prompt',
          fontSize,
          color: tr.colorHex || '#101820',
          bold: true,
          align: 'center',
          shadow: false,
          strokeWidth: 0,
          strokeColor: '#FFFFFF',
        };
        return { layer: textLayer };
      });

      const nextList: DecomposedItemState[] = [
        { layer: bgLayer },
        ...objectEntries,
        ...textEntries,
      ];
      setItems(nextList);
      setSelectedId(objectEntries[0]?.layer.id || bgLayer.id);
      setNotice(
        `แยกเลเยอร์สำเร็จ: พื้นหลังซ่อมอัตโนมัติ 1 ชั้น, วัตถุ ${objectEntries.length} ชั้น, ข้อความแก้ไขได้ ${textEntries.length} ชั้น (${data.engine})`
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'การวิเคราะห์ภาพล้มเหลว');
    } finally {
      setAnalyzing(false);
    }
  };

  // Manual cutout fallback without AI (uses full-frame foreground extraction for interactive brushing)
  const handleManualForegroundSplit = async () => {
    if (!srcRgba) return;
    const { w, h } = imgDimensions;
    const mask = extractForegroundMaskInRegion(srcRgba, w, h, [6, 6, 88, 88], wandTolerance);
    const cutoutRgba = applyMaskToRgba(srcRgba, mask);
    const cutoutUrl = await renderRgbaToPngDataUrl(cutoutRgba, w, h);
    const bgRgba = reconstructBackgroundPatch(srcRgba, mask, w, h, 24);
    const bgUrl = await renderRgbaToPngDataUrl(bgRgba, w, h);

    const bgLayer: ImageStudioLayer = {
      id: makeLayerId('bg'),
      name: 'Clean Background (ซ่อมฉากหลัง)',
      type: 'image',
      provenance: 'ai-reconstructed',
      visible: true,
      locked: false,
      x: w / 2,
      y: h / 2,
      width: w,
      height: h,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 100,
      blendMode: 'source-over',
      parallaxDepth: 0.2,
      keyframes: [],
      imageUrl: bgUrl,
      originalImageUrl: bgUrl,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
    };

    const fgLayer: ImageStudioLayer = {
      id: makeLayerId('fg'),
      name: 'Subject Mask (แก้ไขได้ด้วยแปรง/Magic Wand)',
      type: 'image',
      provenance: 'raster',
      visible: true,
      locked: false,
      x: w / 2,
      y: h / 2,
      width: w,
      height: h,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 100,
      blendMode: 'source-over',
      parallaxDepth: 1.5,
      keyframes: [],
      imageUrl: cutoutUrl,
      originalImageUrl: cutoutUrl,
      isCutoutForeground: true,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
    };

    setItems([{ layer: bgLayer }, { layer: fgLayer, mask }]);
    setSelectedId(fgLayer.id);
    setMaskTool('brush-add');
    setNotice('แยกซับเจกต์แบบ Manual พร้อมแก้ไข Mask ด้วย Brush / Lasso / Magic Wand แล้ว');
  };

  const updateSelectedMask = async (nextMask: Uint8Array) => {
    if (!selectedItem || !srcRgba || selectedItem.layer.type !== 'image') return;
    const { w, h } = imgDimensions;
    const nextRgba = applyMaskToRgba(srcRgba, nextMask);
    const nextUrl = await renderRgbaToPngDataUrl(nextRgba, w, h);
    setItems((prev) =>
      prev.map((entry) =>
        entry.layer.id === selectedItem.layer.id
          ? {
              ...entry,
              mask: nextMask,
              layer: { ...entry.layer, imageUrl: nextUrl } as ImageStudioLayer,
            }
          : entry
      )
    );
  };

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * imgDimensions.w,
      y: ((e.clientY - rect.top) / rect.height) * imgDimensions.h,
    };
  };

  const handleCanvasPointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (maskTool === 'none' || !selectedItem?.mask || !srcRgba) return;
    const pt = toCanvasPoint(e);
    if (!pt) return;

    if (maskTool === 'wand-add' || maskTool === 'wand-erase') {
      const nextMask = applyMagicWandToMask(
        srcRgba,
        selectedItem.mask,
        imgDimensions.w,
        imgDimensions.h,
        pt.x,
        pt.y,
        wandTolerance,
        maskTool === 'wand-add' ? 'add' : 'erase'
      );
      await updateSelectedMask(nextMask);
      return;
    }

    if (maskTool === 'lasso-add' || maskTool === 'lasso-erase') {
      setLassoPoints((prev) => [...prev, pt]);
      return;
    }

    paintingRef.current = true;
    const nextMask = applyBrushToMask(
      selectedItem.mask,
      imgDimensions.w,
      imgDimensions.h,
      pt.x,
      pt.y,
      brushRadius,
      maskTool === 'brush-add' ? 'add' : 'erase'
    );
    await updateSelectedMask(nextMask);
  };

  const handleCanvasPointerMove = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current || !selectedItem?.mask || !srcRgba) return;
    if (maskTool !== 'brush-add' && maskTool !== 'brush-erase') return;
    const pt = toCanvasPoint(e);
    if (!pt) return;
    const nextMask = applyBrushToMask(
      selectedItem.mask,
      imgDimensions.w,
      imgDimensions.h,
      pt.x,
      pt.y,
      brushRadius,
      maskTool === 'brush-add' ? 'add' : 'erase'
    );
    await updateSelectedMask(nextMask);
  };

  const handleCanvasPointerUp = () => {
    paintingRef.current = false;
  };

  const handleApplyLasso = async () => {
    if (!selectedItem?.mask || lassoPoints.length < 3) return;
    const nextMask = applyLassoToMask(
      selectedItem.mask,
      imgDimensions.w,
      imgDimensions.h,
      lassoPoints,
      maskTool === 'lasso-erase' ? 'erase' : 'add'
    );
    setLassoPoints([]);
    await updateSelectedMask(nextMask);
  };

  const buildStudioProjectState = (): CanvasProjectState => ({
    version: 2,
    title: `${sourceTitle} (แยกเลเยอร์ AI)`,
    aspectId: 'custom',
    canvasWidth: imgDimensions.w,
    canvasHeight: imgDimensions.h,
    backgroundColor: 'transparent',
    layers: items.map((i) => i.layer),
    activeFrameId: null,
    activeFrameColor: '#2563EB',
    mode: 'still',
    durationSec: 4,
    fps: 30,
    parallaxEnabled: false,
    loopPlayback: true,
    updatedAtIso: new Date().toISOString(),
  });

  const handleSendToProEditor = () => {
    const project = buildStudioProjectState();
    const compositeUrl = previewCanvasRef.current?.toDataURL('image/png') || sourceUrl;
    onOpenInEditor({
      id: `decomp-${Date.now()}`,
      title: project.title,
      imageUrl: compositeUrl,
      originalPrompt: sourceTitle,
      enhancedPrompt: aiResult?.backgroundDescription || 'AI Decomposed Multi-Layer Project',
      stylePreset: 'auto',
      aspectRatio: 'custom',
      projectJson: JSON.stringify(project),
    });
  };

  const handleExportPsd = async () => {
    setExportBusy(true);
    try {
      const buf = await exportProjectToPsdBuffer(buildStudioProjectState());
      triggerBlobDownload(
        new Blob([buf], { type: 'application/octet-stream' }),
        `zimage-decomposed-${Date.now()}.psd`
      );
      setNotice('ส่งออกไฟล์ Layered .PSD สำเร็จ (เปิดต่อใน Photoshop ได้ทันที)');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'ส่งออกไฟล์ .PSD ไม่สำเร็จ');
    } finally {
      setExportBusy(false);
    }
  };

  const handleExportManifestJson = () => {
    const json = exportDecomposedLayersManifestJson(items.map((i) => i.layer));
    triggerBlobDownload(
      new Blob([json], { type: 'application/json' }),
      `zimage-layers-${Date.now()}.json`
    );
  };

  const handleExportPng = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) triggerBlobDownload(blob, `zimage-composite-${Date.now()}.png`);
    }, 'image/png');
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleUploadImage}
        className="hidden"
      />

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
            AI Image to Editable Layers
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#475569] dark:text-slate-300">
            วิเคราะห์ภาพแยกองค์ประกอบ ซับเจกต์ ข้อความแก้ไขได้ และซ่อมพื้นหลังอัตโนมัติ พร้อม Brush / Lasso / Magic Wand และส่งออก .PSD
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-4 py-2 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
          >
            <Upload className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
            <span>อัปโหลดภาพ (PNG/JPG/WebP)</span>
          </button>

          <button
            type="button"
            disabled={analyzing || !srcRgba}
            onClick={handleRunAiDecompose}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            {analyzing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>{analyzing ? 'กำลังวิเคราะห์ภาพด้วย AI...' : 'แยกเลเยอร์ด้วย Vision AI'}</span>
          </button>

          <button
            type="button"
            disabled={!srcRgba}
            onClick={handleManualForegroundSplit}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-4 py-2 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
          >
            <Scissors className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
            <span>แยกซับเจกต์แบบ Manual (ฟรีทันที)</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-[#2563EB]/30 bg-[#EEF3FA] dark:bg-[#162947] px-4 py-3 text-xs text-[#101820] dark:text-[#F8FAFC]">
          {notice}
        </div>
      )}

      {aiError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-900 dark:text-amber-100"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{aiError}</span>
          </div>
          <button
            type="button"
            onClick={handleRunAiDecompose}
            className="rounded-lg bg-[#2563EB] px-3 py-1.5 font-semibold text-white cursor-pointer"
          >
            ลองวิเคราะห์ใหม่
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        {/* Left: Interactive Canvas + Mask Refinement Bar */}
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] dark:border-slate-800 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'none' as MaskTool, label: 'ดูผลลัพธ์', icon: Layers },
                { id: 'brush-add' as MaskTool, label: 'แปรงเพิ่ม', icon: Paintbrush },
                { id: 'brush-erase' as MaskTool, label: 'แปรงลบ', icon: Eraser },
                { id: 'wand-add' as MaskTool, label: 'Wand เลือก', icon: Wand2 },
                { id: 'wand-erase' as MaskTool, label: 'Wand ลบ', icon: Wand2 },
                { id: 'lasso-add' as MaskTool, label: 'Lasso เลือก', icon: Pentagon },
              ].map((t) => {
                const Ico = t.icon;
                const active = maskTool === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setMaskTool(t.id);
                      if (t.id !== 'lasso-add' && t.id !== 'lasso-erase') setLassoPoints([]);
                    }}
                    className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                      active
                        ? 'border-[#2563EB] bg-[#2563EB] text-white'
                        : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#475569] dark:text-slate-300'
                    }`}
                  >
                    <Ico className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#64748B] dark:text-slate-400">
              <span>{imgDimensions.w}×{imgDimensions.h} px</span>
            </div>
          </div>

          {selectedItem?.mask && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 text-xs">
              <label className="inline-flex items-center gap-2">
                <span>หัวแปรง: {brushRadius}px</span>
                <input
                  type="range"
                  min={4}
                  max={64}
                  value={brushRadius}
                  onChange={(e) => setBrushRadius(Number(e.target.value))}
                  className="accent-[#2563EB]"
                />
              </label>
              <label className="inline-flex items-center gap-2">
                <span>Wand Tolerance: {wandTolerance}</span>
                <input
                  type="range"
                  min={8}
                  max={70}
                  value={wandTolerance}
                  onChange={(e) => setWandTolerance(Number(e.target.value))}
                  className="accent-[#2563EB]"
                />
              </label>
              <button
                type="button"
                onClick={() => updateSelectedMask(invertMask(selectedItem.mask!))}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1 cursor-pointer"
              >
                <FlipHorizontal className="h-3.5 w-3.5" />
                <span>Invert Mask</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  updateSelectedMask(featherMask(selectedItem.mask!, imgDimensions.w, imgDimensions.h, 2))
                }
                className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1 cursor-pointer"
              >
                Feather Edge
              </button>
              {lassoPoints.length >= 3 && (
                <button
                  type="button"
                  onClick={handleApplyLasso}
                  className="rounded-lg bg-[#2563EB] px-2.5 py-1 font-semibold text-white cursor-pointer"
                >
                  Apply Lasso ({lassoPoints.length} pts)
                </button>
              )}
            </div>
          )}

          <div className="checkerboard-stage flex items-center justify-center overflow-hidden rounded-xl border border-[#E2E8F0] dark:border-slate-800 p-4">
            <canvas
              ref={previewCanvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className="max-h-[540px] max-w-full object-contain rounded shadow-lg touch-none cursor-crosshair"
            />
          </div>

          {/* Quick Sample Switcher */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-[#64748B] dark:text-slate-400">ภาพทดสอบด่วน:</span>
            {CURATED_SHOWCASE_ITEMS.slice(0, 5).map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => {
                  setSourceUrl(sample.imageUrl);
                  setSourceTitle(sample.title);
                }}
                className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1 text-[11px] hover:border-[#2563EB] cursor-pointer"
              >
                {sample.category}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Decomposed Layer Tree + Provenance + Exports */}
        <aside className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-[#101820] dark:text-[#F8FAFC]">
              เลเยอร์ที่แยกได้ ({items.length})
            </h2>
            {aiResult?.engine && (
              <span className="font-mono-tabular text-[11px] text-[#64748B] dark:text-slate-400">
                {aiResult.engine}
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {[...items].reverse().map((entry) => {
              const l = entry.layer;
              const active = l.id === selectedId;
              return (
                <div
                  key={l.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors ${
                    active
                      ? 'border-[#2563EB] bg-[#EEF3FA] dark:bg-[#162947]'
                      : 'border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    className="flex flex-1 flex-col text-left min-w-0 cursor-pointer"
                  >
                    <span className="truncate text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                      {l.name}
                    </span>
                    <span className="font-mono-tabular text-[10px] text-[#64748B] dark:text-slate-400">
                      {getProvenanceLabel(l.provenance)} · Opacity {l.opacity}%
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={l.visible ? 'ซ่อนเลเยอร์' : 'แสดงเลเยอร์'}
                    onClick={() =>
                      setItems((prev) =>
                        prev.map((it) =>
                          it.layer.id === l.id
                            ? { ...it, layer: { ...it.layer, visible: !it.layer.visible } }
                            : it
                        )
                      )
                    }
                    className="rounded-lg p-1.5 text-[#475569] dark:text-slate-300 hover:bg-white dark:hover:bg-[#101820] cursor-pointer"
                  >
                    {l.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-50" />}
                  </button>
                </div>
              );
            })}
          </div>

          {selectedItem?.layer.type === 'text' && (
            <div className="space-y-2 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3">
              <label className="block text-xs font-semibold">แก้ไขข้อความที่ตรวจพบ (Editable Text)</label>
              <input
                type="text"
                value={selectedItem.layer.text}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((it) =>
                      it.layer.id === selectedItem.layer.id && it.layer.type === 'text'
                        ? { ...it, layer: { ...it.layer, text: e.target.value } }
                        : it
                    )
                  )
                }
                className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs"
              />
            </div>
          )}

          {/* Export & Pro Editor Handoff */}
          <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
            <button
              type="button"
              disabled={items.length === 0}
              onClick={handleSendToProEditor}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
            >
              <Layers className="h-4 w-4" />
              <span>เปิดทั้งหมดใน Pro Layer Editor</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={exportBusy || items.length === 0}
                onClick={handleExportPsd}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] hover:border-[#2563EB] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>ส่งออก .PSD</span>
              </button>
              <button
                type="button"
                disabled={items.length === 0}
                onClick={handleExportPng}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>ส่งออก PNG</span>
              </button>
              <button
                type="button"
                disabled={items.length === 0}
                onClick={handleExportManifestJson}
                className="col-span-2 inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 text-xs font-medium text-[#475569] dark:text-slate-300 hover:border-[#2563EB] cursor-pointer"
              >
                <FileCode2 className="h-3.5 w-3.5" />
                <span>ดาวน์โหลด Layer Manifest (JSON)</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
