import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Check,
  Combine,
  Copy,
  Crop,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileCode2,
  Film,
  FlipHorizontal2,
  FlipVertical2,
  Folder,
  FolderOpen,
  Frame,
  Grid,
  Hand,
  Image as ImageIcon,
  Layers,
  Lock,
  Magnet,
  MousePointer,
  Paintbrush,
  Pause,
  PenTool,
  Play,
  Plus,
  Redo2,
  Repeat,
  RotateCcw,
  RotateCw,
  Scissors,
  Shapes,
  Sliders,
  Sparkles,
  Sticker,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Unlock,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import {
  DEFAULT_ADJUSTMENTS,
  EDITOR_FILTER_PRESETS,
  applyAdjustmentsToRgba,
  removeBackgroundFromRgba,
} from '../utils/imageProcessing';
import type { ImageAdjustments } from '../utils/imageProcessing';
import {
  exportCanvasInFormat,
  loadHtmlImage,
  triggerBlobDownload,
} from '../utils/canvasImageHelper';
import { CURATED_SHOWCASE_ITEMS } from '../data/showcasePresets';
import type { AspectRatioId, StylePresetId, VaultItemType } from '../utils/promptLogic';
import {
  CANVAS_ASPECT_PRESETS,
  EASING_OPTIONS,
  LAYER_BLEND_MODES,
  MOTION_PRESETS,
  THAI_STUDIO_FONTS,
} from '../utils/studioTypes';
import type {
  CanvasAspectId,
  CanvasProjectState,
  EasingType,
  ImageStudioLayer,
  LayerBlendMode,
  LayerKeyframe,
  MotionPresetId,
  ShapeKind,
  ShapeStudioLayer,
  StudioLayer,
  StudioMode,
  SvgStudioLayer,
  TextStudioLayer,
  ThaiStudioFontId,
} from '../utils/studioTypes';
import {
  buildKeyframesForMotionPreset,
  computeSnapPosition,
  interpolateLayerAtTime,
} from '../utils/studioAnimation';
import {
  KANOK_FRAME_ASSETS,
  KANOK_STICKER_ASSETS,
  loadSvgAssetImage,
} from '../utils/kanokAssets';
import {
  clearStudioDraftFromIndexedDb,
  loadStudioDraftFromIndexedDb,
  saveStudioDraftToIndexedDb,
} from '../utils/indexedDbDrafts';
import {
  exportTimelineToGif,
  exportTimelineToVideo,
} from '../utils/videoGifExporter';
import type { AnimationQuality } from '../utils/videoGifExporter';
import {
  exportProjectToPsdBuffer,
  importPsdBufferToStudioLayers,
} from '../utils/psdBridge';
import { getProvenanceLabel } from '../utils/layerDecompose';

export interface EditorSourceItem {
  id: string;
  title: string;
  imageUrl: string;
  originalPrompt: string;
  enhancedPrompt: string;
  stylePreset: StylePresetId;
  aspectRatio: AspectRatioId;
  dimensionsLabel?: string;
  sourceImageId?: string;
  projectJson?: string;
}

interface EditorViewProps {
  user: User | null;
  sourceItem: EditorSourceItem | null;
  initialMultiSources?: EditorSourceItem[];
  onSelectSource: (item: EditorSourceItem | null) => void;
  onClearMultiSources?: () => void;
  onSaveEditedPngToVault: (payload: {
    imageDataUrl: string;
    originalPrompt: string;
    enhancedPrompt: string;
    stylePreset: StylePresetId;
    aspectRatio: AspectRatioId;
    dimensionsLabel?: string;
    itemType: VaultItemType;
    sourceImageId?: string;
    projectJson?: string;
  }) => Promise<void>;
  onSaveStudioProjectToCloud?: (payload: {
    title: string;
    kind: 'editor';
    projectJson: string;
  }) => Promise<void>;
  onRequireSignIn: () => void;
}

type StudioToolTab =
  | 'layers'
  | 'bg'
  | 'text'
  | 'shapes'
  | 'frames'
  | 'stickers'
  | 'adjust'
  | 'canvas'
  | 'export';

type PointerMode = 'select' | 'pan' | 'wand' | 'eraser' | 'restore' | 'pen';
type StillExportFormat = 'png' | 'jpg' | 'webp' | 'pdf';

function makeLayerId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function getAspectPresetDimensions(aspectId: CanvasAspectId): { w: number; h: number } {
  const found = CANVAS_ASPECT_PRESETS.find((a) => a.id === aspectId);
  return found ? { w: found.width, h: found.height } : { w: 1080, h: 1080 };
}

function mapPromptRatioToCanvasAspect(aspectRatio?: AspectRatioId): CanvasAspectId {
  if (aspectRatio === '16:9') return '16:9';
  if (aspectRatio === '9:16') return '9:16';
  if (aspectRatio === '3:4') return '4:5';
  if (aspectRatio === '4:3') return '3:2';
  return '1:1';
}

function createEmptyProject(title: string = 'งานสร้างสรรค์ ZImage'): CanvasProjectState {
  return {
    version: 2,
    title,
    aspectId: '1:1',
    canvasWidth: 1080,
    canvasHeight: 1080,
    backgroundColor: '#FFFFFF',
    layers: [],
    activeFrameId: null,
    activeFrameColor: '#2563EB',
    mode: 'still',
    durationSec: 4,
    fps: 30,
    parallaxEnabled: false,
    loopPlayback: true,
    updatedAtIso: new Date().toISOString(),
  };
}

/**
 * Downscale a dataUrl/image URL safely so serialized projectJson stays cleanly under 220KB in Firestore.
 */
async function compactDataUrl(url: string, maxDim: number): Promise<string> {
  try {
    const img = await loadHtmlImage(url);
    const sw = img.naturalWidth || maxDim;
    const sh = img.naturalHeight || maxDim;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const w = Math.max(32, Math.round(sw * scale));
    const h = Math.max(32, Math.round(sh * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return url;
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png');
  } catch {
    return url;
  }
}

export function EditorView({
  user,
  sourceItem,
  initialMultiSources,
  onSelectSource,
  onClearMultiSources,
  onSaveEditedPngToVault,
  onSaveStudioProjectToCloud,
  onRequireSignIn,
}: EditorViewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadNewLayerInputRef = useRef<HTMLInputElement | null>(null);
  const uploadMainImageInputRef = useRef<HTMLInputElement | null>(null);
  const psdImportInputRef = useRef<HTMLInputElement | null>(null);

  // Core Project State & Undo/Redo Stack
  const [project, setProject] = useState<CanvasProjectState>(() => createEmptyProject());
  const [historyStack, setHistoryStack] = useState<CanvasProjectState[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number>(-1);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [checkedLayerIds, setCheckedLayerIds] = useState<string[]>([]);

  // Studio Workspace Controls
  const [activeToolTab, setActiveToolTab] = useState<StudioToolTab>('layers');
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);
  const [pointerMode, setPointerMode] = useState<PointerMode>('select');
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [holdCompareOriginal, setHoldCompareOriginal] = useState<boolean>(false);

  // Tool Specific States
  const [bgTolerance, setBgTolerance] = useState<number>(26);
  const [bgFeather, setBgFeather] = useState<number>(1);
  const [bgGlobalKey, setBgGlobalKey] = useState<boolean>(false);
  const [brushSize, setBrushSize] = useState<number>(28);
  const [stickerColor, setStickerColor] = useState<string>('#2563EB');
  const [shapeFillColor, setShapeFillColor] = useState<string>('#2563EB');
  const [shapeStrokeColor, setShapeStrokeColor] = useState<string>('#0B1F3A');
  const [shapeStrokeWidth, setShapeStrokeWidth] = useState<number>(4);
  const [penPoints, setPenPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [customCanvasW, setCustomCanvasW] = useState<number>(1080);
  const [customCanvasH, setCustomCanvasH] = useState<number>(1080);

  // Motion & Timeline States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playheadSec, setPlayheadSec] = useState<number>(0);
  const [keyframeEasing, setKeyframeEasing] = useState<EasingType>('ease-out');

  // Export States
  const [stillScale, setStillScale] = useState<1 | 2 | 4>(1);
  const [stillFormat, setStillFormat] = useState<StillExportFormat>('png');
  const [stillQuality, setStillQuality] = useState<number>(92);
  const [animQuality, setAnimQuality] = useState<AnimationQuality>('standard');
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportBusy, setExportBusy] = useState<boolean>(false);
  const [savingVault, setSavingVault] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Draft recovery banner
  const [pendingDraft, setPendingDraft] = useState<CanvasProjectState | null>(null);
  const [loadingProject, setLoadingProject] = useState<boolean>(false);

  // Live Snap Guides during drag
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  // In-memory Asset & Processed Layer Caches (kept outside React render state for 60fps speed)
  const rawImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const processedLayerCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const frameSvgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const projectRef = useRef<CanvasProjectState>(project);
  projectRef.current = project;

  // Drag / Transform / Brush interaction refs
  const dragSessionRef = useRef<
    | {
        kind: 'move' | 'scale' | 'rotate';
        layerId: string;
        startCanvasX: number;
        startCanvasY: number;
        origX: number;
        origY: number;
        origScale: number;
        origRotation: number;
        startDist: number;
        startAngle: number;
      }
    | {
        kind: 'pan';
        startClientX: number;
        startClientY: number;
        origPanX: number;
        origPanY: number;
      }
    | {
        kind: 'brush';
        layerId: string;
        mode: 'eraser' | 'restore';
        canvas: HTMLCanvasElement;
        origImg: HTMLImageElement | null;
        dirty: boolean;
      }
    | null
  >(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const commitProject = useCallback(
    (updater: CanvasProjectState | ((prev: CanvasProjectState) => CanvasProjectState), recordHistory = true) => {
      setProject((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const stamped: CanvasProjectState = {
          ...next,
          updatedAtIso: new Date().toISOString(),
        };
        if (recordHistory) {
          setHistoryStack((stack) => {
            const sliced = stack.slice(0, historyCursor + 1);
            const updated = [...sliced, stamped].slice(-36);
            setHistoryCursor(updated.length - 1);
            return updated;
          });
        }
        return stamped;
      });
    },
    [historyCursor]
  );

  const handleUndo = useCallback(() => {
    if (historyCursor <= 0) return;
    const prevIdx = historyCursor - 1;
    const snap = historyStack[prevIdx];
    if (snap) {
      setHistoryCursor(prevIdx);
      setProject(snap);
    }
  }, [historyCursor, historyStack]);

  const handleRedo = useCallback(() => {
    if (historyCursor >= historyStack.length - 1) return;
    const nextIdx = historyCursor + 1;
    const snap = historyStack[nextIdx];
    if (snap) {
      setHistoryCursor(nextIdx);
      setProject(snap);
    }
  }, [historyCursor, historyStack]);

  // Keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Spacebar pan, Delete layer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (inInput) return;
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.code === 'Space' && !inInput) {
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleUndo, handleRedo]);

  // Check IndexedDB draft if user opened Editor without incoming source
  useEffect(() => {
    if (sourceItem || (initialMultiSources && initialMultiSources.length > 0)) return;
    if (projectRef.current.layers.length > 0) return;
    loadStudioDraftFromIndexedDb().then((draft) => {
      if (draft && draft.layers && draft.layers.length > 0) {
        setPendingDraft(draft);
      }
    });
  }, [sourceItem, initialMultiSources]);

  // Auto-save to IndexedDB every 10 seconds when canvas has layers
  useEffect(() => {
    if (project.layers.length === 0) return;
    const timer = window.setInterval(() => {
      saveStudioDraftToIndexedDb(projectRef.current);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [project.layers.length]);

  // Ensure image & SVG elements are preloaded into cache whenever layers or activeFrameId change
  const ensureAssetsLoaded = useCallback(async (proj: CanvasProjectState) => {
    const tasks: Array<Promise<void>> = [];
    for (const layer of proj.layers) {
      if (layer.type === 'image') {
        if (!rawImageCacheRef.current.has(layer.imageUrl)) {
          tasks.push(
            loadHtmlImage(layer.imageUrl)
              .then((img) => {
                rawImageCacheRef.current.set(layer.imageUrl, img);
              })
              .catch(() => {})
          );
        }
        if (layer.originalImageUrl && !rawImageCacheRef.current.has(layer.originalImageUrl)) {
          tasks.push(
            loadHtmlImage(layer.originalImageUrl)
              .then((img) => {
                rawImageCacheRef.current.set(layer.originalImageUrl, img);
              })
              .catch(() => {})
          );
        }
      } else if (layer.type === 'svg') {
        const stickerDef = KANOK_STICKER_ASSETS.find((s) => s.id === layer.assetId);
        if (stickerDef) {
          const svgStr = stickerDef.buildSvg(layer.color);
          const cacheKey = `sticker:${layer.assetId}:${layer.color}`;
          if (!rawImageCacheRef.current.has(cacheKey)) {
            tasks.push(
              loadSvgAssetImage(svgStr)
                .then((img) => {
                  rawImageCacheRef.current.set(cacheKey, img);
                })
                .catch(() => {})
            );
          }
        }
      }
    }
    if (proj.activeFrameId) {
      const frameDef = KANOK_FRAME_ASSETS.find((f) => f.id === proj.activeFrameId);
      if (frameDef) {
        const key = `${frameDef.id}:${proj.activeFrameColor}:${proj.canvasWidth}x${proj.canvasHeight}`;
        if (!frameSvgCacheRef.current.has(key)) {
          const svg = frameDef.buildSvg(proj.activeFrameColor, proj.canvasWidth, proj.canvasHeight);
          tasks.push(
            loadSvgAssetImage(svg)
              .then((img) => {
                frameSvgCacheRef.current.set(key, img);
              })
              .catch(() => {})
          );
        }
      }
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }, []);

  // Load incoming single sourceItem (including Vault projectJson restore!) or multi sources
  useEffect(() => {
    if (initialMultiSources && initialMultiSources.length > 0) {
      let cancelled = false;
      setLoadingProject(true);
      setErrorMsg(null);
      Promise.all(
        initialMultiSources.map(async (item, idx) => {
          const img = await loadHtmlImage(item.imageUrl);
          rawImageCacheRef.current.set(item.imageUrl, img);
          const cw = 1080;
          const ch = 1080;
          const natW = img.naturalWidth || 1024;
          const natH = img.naturalHeight || 1024;
          const fitScale = Math.min((cw * 0.72) / natW, (ch * 0.72) / natH);
          const layer: ImageStudioLayer = {
            id: makeLayerId('img'),
            name: item.title || `ภาพที่ ${idx + 1}`,
            type: 'image',
            visible: true,
            locked: false,
            x: cw / 2 + (idx - (initialMultiSources.length - 1) / 2) * 55,
            y: ch / 2 + (idx - (initialMultiSources.length - 1) / 2) * 35,
            width: natW,
            height: natH,
            scale: Number(fitScale.toFixed(3)),
            rotation: 0,
            flipX: false,
            flipY: false,
            opacity: 100,
            blendMode: 'source-over',
            parallaxDepth: 0.35 + idx * 0.3,
            keyframes: [],
            imageUrl: item.imageUrl,
            originalImageUrl: item.imageUrl,
            adjustments: { ...DEFAULT_ADJUSTMENTS },
          };
          return layer;
        })
      )
        .then(async (layers) => {
          if (cancelled) return;
          const nextProj: CanvasProjectState = {
            ...createEmptyProject(`คอลลาจ ${initialMultiSources.length} ภาพ`),
            layers,
          };
          await ensureAssetsLoaded(nextProj);
          setProject(nextProj);
          setHistoryStack([nextProj]);
          setHistoryCursor(0);
          setSelectedLayerId(layers[layers.length - 1]?.id || null);
          setCustomCanvasW(nextProj.canvasWidth);
          setCustomCanvasH(nextProj.canvasHeight);
          onClearMultiSources?.();
        })
        .catch((err) => {
          if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'โหลดภาพเข้าสตูดิโอไม่สำเร็จ');
        })
        .finally(() => {
          if (!cancelled) setLoadingProject(false);
        });
      return () => {
        cancelled = true;
      };
    }

    if (!sourceItem) return;

    // Case A: Restore rich multi-layer project from Vault projectJson
    if (sourceItem.projectJson) {
      try {
        const parsed = JSON.parse(sourceItem.projectJson) as CanvasProjectState;
        if (parsed && parsed.version === 2 && Array.isArray(parsed.layers)) {
          setLoadingProject(true);
          ensureAssetsLoaded(parsed).then(() => {
            setProject(parsed);
            setHistoryStack([parsed]);
            setHistoryCursor(0);
            setSelectedLayerId(parsed.layers[parsed.layers.length - 1]?.id || null);
            setCustomCanvasW(parsed.canvasWidth);
            setCustomCanvasH(parsed.canvasHeight);
            setIsPlaying(false);
            setPlayheadSec(0);
            setLoadingProject(false);
            showToast('กู้คืนโปรเจกต์หลายเลเยอร์และไทม์ไลน์จากคลังแล้ว');
          });
          return;
        }
      } catch {
        // Fallback to opening as flat single image below
      }
    }

    // Case B: Open single source image cleanly fitted onto canvas
    let cancelled = false;
    setLoadingProject(true);
    setErrorMsg(null);
    loadHtmlImage(sourceItem.imageUrl)
      .then(async (img) => {
        if (cancelled) return;
        rawImageCacheRef.current.set(sourceItem.imageUrl, img);
        const aspectId = mapPromptRatioToCanvasAspect(sourceItem.aspectRatio);
        const natW = img.naturalWidth || 1024;
        const natH = img.naturalHeight || 1024;
        const presetDim = getAspectPresetDimensions(aspectId);
        // Use natural aspect ratio if close or fit nicely on standard preset canvas
        const cw = natW >= 600 && natH >= 600 ? Math.min(1600, natW) : presetDim.w;
        const ch = natW >= 600 && natH >= 600 ? Math.min(1600, natH) : presetDim.h;
        const fitScale = Math.min(cw / natW, ch / natH);

        const baseLayer: ImageStudioLayer = {
          id: makeLayerId('img'),
          name: sourceItem.title ? sourceItem.title.slice(0, 28) : 'ภาพหลัก',
          type: 'image',
          visible: true,
          locked: false,
          x: cw / 2,
          y: ch / 2,
          width: natW,
          height: natH,
          scale: Number(fitScale.toFixed(4)),
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: 100,
          blendMode: 'source-over',
          parallaxDepth: 0.4,
          keyframes: [],
          imageUrl: sourceItem.imageUrl,
          originalImageUrl: sourceItem.imageUrl,
          adjustments: { ...DEFAULT_ADJUSTMENTS },
        };

        const nextProj: CanvasProjectState = {
          ...createEmptyProject(sourceItem.title || sourceItem.originalPrompt),
          sourceImageId: sourceItem.sourceImageId || sourceItem.id,
          aspectId,
          canvasWidth: cw,
          canvasHeight: ch,
          layers: [baseLayer],
        };
        await ensureAssetsLoaded(nextProj);
        if (cancelled) return;
        setProject(nextProj);
        setHistoryStack([nextProj]);
        setHistoryCursor(0);
        setSelectedLayerId(baseLayer.id);
        setCustomCanvasW(cw);
        setCustomCanvasH(ch);
        setIsPlaying(false);
        setPlayheadSec(0);
        setPointerMode('select');
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดภาพเข้าสู่สตูดิโอได้');
      })
      .finally(() => {
        if (!cancelled) setLoadingProject(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceItem, initialMultiSources, ensureAssetsLoaded, onClearMultiSources, showToast]);

  // Helper: obtain cached adjusted offscreen canvas for an ImageStudioLayer
  const getProcessedLayerCanvas = useCallback(
    (layer: ImageStudioLayer, useRawOriginal: boolean): HTMLCanvasElement | null => {
      const targetUrl = useRawOriginal ? layer.originalImageUrl : layer.imageUrl;
      const rawImg = rawImageCacheRef.current.get(targetUrl);
      if (!rawImg || !rawImg.complete || rawImg.naturalWidth === 0) return null;

      const adj = useRawOriginal ? DEFAULT_ADJUSTMENTS : layer.adjustments;
      const isNeutral =
        adj.brightness === 0 &&
        adj.contrast === 0 &&
        adj.saturation === 0 &&
        adj.warmth === 0 &&
        adj.vignette === 0 &&
        (adj.sharpness || 0) === 0 &&
        (adj.grain || 0) === 0 &&
        adj.filter === 'none';

      const cacheKey = `${layer.id}|${targetUrl.slice(0, 42)}|${targetUrl.length}|${
        isNeutral ? 'neutral' : JSON.stringify({ ...adj, blur: 0 })
      }`;

      const existing = processedLayerCacheRef.current.get(cacheKey);
      if (existing) return existing;

      // Limit work buffer to max 1400px for crisp real-time adjustments
      const maxWork = 1400;
      const s = Math.min(1, maxWork / Math.max(rawImg.naturalWidth, rawImg.naturalHeight));
      const w = Math.max(1, Math.round(rawImg.naturalWidth * s));
      const h = Math.max(1, Math.round(rawImg.naturalHeight * s));

      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d', { willReadFrequently: !isNeutral });
      if (!ctx) return null;
      ctx.drawImage(rawImg, 0, 0, w, h);

      if (!isNeutral) {
        const imgData = ctx.getImageData(0, 0, w, h);
        const processed = applyAdjustmentsToRgba(imgData.data, w, h, { ...adj, blur: 0 });
        imgData.data.set(processed);
        ctx.putImageData(imgData, 0, 0);
      }

      if (processedLayerCacheRef.current.size > 40) {
        const firstKey = processedLayerCacheRef.current.keys().next().value;
        if (firstKey) processedLayerCacheRef.current.delete(firstKey);
      }
      processedLayerCacheRef.current.set(cacheKey, off);
      return off;
    },
    []
  );

  // Render full multi-layer composite to ANY target canvas (live stage, still export, or animation frame)
  const renderProjectToCanvas = useCallback(
    (
      targetCanvas: HTMLCanvasElement,
      proj: CanvasProjectState,
      opts: {
        timeSec: number;
        includeOverlayUi: boolean;
        compareRawOriginal?: boolean;
        forceOpaqueForVideo?: boolean;
      }
    ) => {
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;

      const cw = proj.canvasWidth;
      const ch = proj.canvasHeight;
      if (targetCanvas.width !== cw) targetCanvas.width = cw;
      if (targetCanvas.height !== ch) targetCanvas.height = ch;

      const scaleX = targetCanvas.width / cw;
      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

      // Background Fill
      if (proj.backgroundColor !== 'transparent') {
        ctx.fillStyle = proj.backgroundColor;
        ctx.fillRect(0, 0, cw, ch);
      } else if (opts.forceOpaqueForVideo) {
        ctx.fillStyle = '#091B42';
        ctx.fillRect(0, 0, cw, ch);
      }

      // Draw each visible layer bottom -> top
      for (const layer of proj.layers) {
        if (!layer.visible) continue;

        const transform =
          proj.mode === 'motion'
            ? interpolateLayerAtTime(layer, opts.timeSec, proj.durationSec, proj.parallaxEnabled)
            : {
                x: layer.x,
                y: layer.y,
                scale: layer.scale,
                rotation: layer.rotation,
                opacity: layer.opacity,
              };

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity / 100));
        ctx.globalCompositeOperation = (layer.blendMode || 'source-over') as GlobalCompositeOperation;
        ctx.translate(transform.x, transform.y);
        if (transform.rotation !== 0) {
          ctx.rotate((transform.rotation * Math.PI) / 180);
        }
        ctx.scale(
          transform.scale * (layer.flipX ? -1 : 1),
          transform.scale * (layer.flipY ? -1 : 1)
        );

        if (layer.type === 'image') {
          const imgCanvas = getProcessedLayerCanvas(layer, Boolean(opts.compareRawOriginal));
          if (imgCanvas) {
            if (!opts.compareRawOriginal && layer.adjustments.blur > 0) {
              ctx.filter = `blur(${layer.adjustments.blur}px)`;
            }
            ctx.drawImage(imgCanvas, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
            ctx.filter = 'none';
          }
        } else if (layer.type === 'svg') {
          const cacheKey = `sticker:${layer.assetId}:${layer.color}`;
          const svgImg = rawImageCacheRef.current.get(cacheKey);
          if (svgImg && svgImg.complete) {
            ctx.drawImage(svgImg, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
          }
        } else if (layer.type === 'text') {
          const lines = (layer.text || '').split('\n');
          const lineHeight = layer.fontSize * 1.24;
          ctx.font = `${layer.bold ? '700' : '500'} ${layer.fontSize}px "${layer.fontFamily}", "Noto Sans Thai", sans-serif`;
          ctx.textAlign = layer.align;
          ctx.textBaseline = 'middle';
          if (layer.shadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.58)';
            ctx.shadowBlur = Math.max(6, layer.fontSize * 0.16);
            ctx.shadowOffsetY = Math.max(2, layer.fontSize * 0.06);
          }
          const xOffset =
            layer.align === 'left'
              ? -layer.width / 2 + 12
              : layer.align === 'right'
                ? layer.width / 2 - 12
                : 0;
          const totalH = lines.length * lineHeight;
          lines.forEach((ln, idx) => {
            const yPos = -totalH / 2 + lineHeight * (idx + 0.5);
            if (layer.strokeWidth > 0) {
              ctx.lineWidth = layer.strokeWidth;
              ctx.strokeStyle = layer.strokeColor;
              ctx.strokeText(ln, xOffset, yPos);
            }
            ctx.fillStyle = layer.color;
            ctx.fillText(ln, xOffset, yPos);
          });
        } else if (layer.type === 'shape') {
          const w = layer.width;
          const h = layer.height;
          const pad = Math.max(0, layer.strokeWidth / 2);
          const bw = Math.max(4, w - pad * 2);
          const bh = Math.max(4, h - pad * 2);
          ctx.fillStyle = layer.fillColor;
          ctx.strokeStyle = layer.strokeColor;
          ctx.lineWidth = layer.strokeWidth;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.beginPath();
          if (layer.shapeKind === 'rect') {
            ctx.roundRect(-bw / 2, -bh / 2, bw, bh, Math.min(layer.cornerRadius, Math.min(bw, bh) / 2));
          } else if (layer.shapeKind === 'circle') {
            ctx.ellipse(0, 0, bw / 2, bh / 2, 0, 0, Math.PI * 2);
          } else if (layer.shapeKind === 'triangle') {
            ctx.moveTo(0, -bh / 2);
            ctx.lineTo(bw / 2, bh / 2);
            ctx.lineTo(-bw / 2, bh / 2);
            ctx.closePath();
          } else if (layer.shapeKind === 'star') {
            const outerR = Math.min(bw, bh) / 2;
            const innerR = outerR * 0.44;
            for (let i = 0; i < 10; i++) {
              const r = i % 2 === 0 ? outerR : innerR;
              const angle = -Math.PI / 2 + (i * Math.PI) / 5;
              const px = Math.cos(angle) * r;
              const py = Math.sin(angle) * r;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
          } else if (layer.shapeKind === 'polygon') {
            const rad = Math.min(bw, bh) / 2;
            for (let i = 0; i < 6; i++) {
              const angle = -Math.PI / 2 + (i * Math.PI * 2) / 6;
              const px = Math.cos(angle) * rad;
              const py = Math.sin(angle) * rad;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
          } else if (layer.shapeKind === 'line') {
            ctx.moveTo(-bw / 2, 0);
            ctx.lineTo(bw / 2, 0);
          } else if (layer.shapeKind === 'path' && layer.points && layer.points.length >= 2) {
            layer.points.forEach((pt, idx) => {
              const px = pt.x * w;
              const py = pt.y * h;
              if (idx === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.closePath();
          }
          if (layer.shapeKind !== 'line' && layer.fillColor !== 'transparent') {
            ctx.fill();
          }
          if (layer.strokeWidth > 0) {
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Draw Kanok Frame Overlay on top of layers
      if (proj.activeFrameId) {
        const key = `${proj.activeFrameId}:${proj.activeFrameColor}:${cw}x${ch}`;
        const frameImg = frameSvgCacheRef.current.get(key);
        if (frameImg && frameImg.complete) {
          ctx.drawImage(frameImg, 0, 0, cw, ch);
        }
      }

      // Interactive Editor Guides (Selection handles, snap lines, alignment grid, Pen live preview)
      if (opts.includeOverlayUi) {
        if (penPoints.length > 0) {
          ctx.save();
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 3;
          ctx.beginPath();
          penPoints.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
          penPoints.forEach((pt) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = '#2563EB';
            ctx.lineWidth = 2;
            ctx.stroke();
          });
          ctx.restore();
        }
        if (showGrid) {
          ctx.save();
          ctx.strokeStyle = 'rgba(201, 162, 75, 0.25)';
          ctx.lineWidth = 1.5;
          // Rule of thirds
          [cw / 3, (cw * 2) / 3].forEach((gx) => {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, ch);
            ctx.stroke();
          });
          [ch / 3, (ch * 2) / 3].forEach((gy) => {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(cw, gy);
            ctx.stroke();
          });
          ctx.restore();
        }

        if (snapGuides.x !== null || snapGuides.y !== null) {
          ctx.save();
          ctx.strokeStyle = '#C9A24B';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          if (snapGuides.x !== null) {
            ctx.beginPath();
            ctx.moveTo(snapGuides.x, 0);
            ctx.lineTo(snapGuides.x, ch);
            ctx.stroke();
          }
          if (snapGuides.y !== null) {
            ctx.beginPath();
            ctx.moveTo(0, snapGuides.y);
            ctx.lineTo(cw, snapGuides.y);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Selection bounding box & corner/rotate handles
        const sel = proj.layers.find((l) => l.id === selectedLayerId && l.visible);
        if (sel && scaleX > 0) {
          const t =
            proj.mode === 'motion'
              ? interpolateLayerAtTime(sel, opts.timeSec, proj.durationSec, proj.parallaxEnabled)
              : {
                  x: sel.x,
                  y: sel.y,
                  scale: sel.scale,
                  rotation: sel.rotation,
                  opacity: sel.opacity,
                };
          const hw = (sel.width * t.scale) / 2;
          const hh = (sel.height * t.scale) / 2;

          ctx.save();
          ctx.translate(t.x, t.y);
          ctx.rotate((t.rotation * Math.PI) / 180);

          ctx.strokeStyle = '#C9A24B';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);

          if (!sel.locked && pointerMode === 'select') {
            const corners = [
              [-hw, -hh],
              [hw, -hh],
              [hw, hh],
              [-hw, hh],
            ];
            for (const [cx, cy] of corners) {
              ctx.fillStyle = '#091B42';
              ctx.strokeStyle = '#F3E9D2';
              ctx.lineWidth = 2;
              ctx.fillRect(cx - 8, cy - 8, 16, 16);
              ctx.strokeRect(cx - 8, cy - 8, 16, 16);
            }
            // Rotation handle stem + circle at top
            ctx.beginPath();
            ctx.moveTo(0, -hh);
            ctx.lineTo(0, -hh - 36);
            ctx.strokeStyle = '#C9A24B';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, -hh - 42, 9, 0, Math.PI * 2);
            ctx.fillStyle = '#C9A24B';
            ctx.fill();
            ctx.strokeStyle = '#091B42';
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    },
    [getProcessedLayerCanvas, pointerMode, selectedLayerId, showGrid, snapGuides, penPoints]
  );

  // Sync canvas display whenever project, playhead, selection, grid, or compare state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ensureAssetsLoaded(project).then(() => {
      if (!canvasRef.current) return;
      renderProjectToCanvas(canvasRef.current, project, {
        timeSec: playheadSec,
        includeOverlayUi: !isPlaying,
        compareRawOriginal: holdCompareOriginal,
      });
    });
  }, [
    project,
    playheadSec,
    selectedLayerId,
    showGrid,
    snapGuides,
    penPoints,
    isPlaying,
    holdCompareOriginal,
    ensureAssetsLoaded,
    renderProjectToCanvas,
  ]);

  // 60fps requestAnimationFrame Motion Playback Loop
  useEffect(() => {
    if (!isPlaying || project.mode !== 'motion') return;
    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      setPlayheadSec((prev) => {
        let next = prev + dt;
        if (next >= project.durationSec) {
          if (project.loopPlayback) {
            next = next % project.durationSec;
          } else {
            setIsPlaying(false);
            return project.durationSec;
          }
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, project.mode, project.durationSec, project.loopPlayback]);

  // Selected layer convenience accessor
  const selectedLayer = useMemo(
    () => project.layers.find((l) => l.id === selectedLayerId) || null,
    [project.layers, selectedLayerId]
  );

  // Convert pointer event to canvas coordinates
  const toCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * project.canvasWidth;
    const y = ((clientY - rect.top) / rect.height) * project.canvasHeight;
    return { x, y };
  };

  // Hit-test topmost visible layer at canvas coordinates
  const hitTestLayer = (cx: number, cy: number): StudioLayer | null => {
    for (let i = project.layers.length - 1; i >= 0; i--) {
      const layer = project.layers[i];
      if (!layer.visible || layer.locked) continue;
      const t =
        project.mode === 'motion'
          ? interpolateLayerAtTime(layer, playheadSec, project.durationSec, project.parallaxEnabled)
          : { x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation, opacity: layer.opacity };
      const dx = cx - t.x;
      const dy = cy - t.y;
      const rad = (-t.rotation * Math.PI) / 180;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      const hw = (layer.width * t.scale) / 2;
      const hh = (layer.height * t.scale) / 2;
      if (Math.abs(lx) <= hw + 12 && Math.abs(ly) <= hh + 12) {
        return layer;
      }
    }
    return null;
  };

  // Convert canvas coordinates into selected image layer pixel coordinates for wand/brush
  const toImageLayerPixelCoords = (layer: ImageStudioLayer, cx: number, cy: number) => {
    const dx = cx - layer.x;
    const dy = cy - layer.y;
    const rad = (-layer.rotation * Math.PI) / 180;
    const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / (layer.scale * (layer.flipX ? -1 : 1));
    const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / (layer.scale * (layer.flipY ? -1 : 1));
    const px = Math.round(lx + layer.width / 2);
    const py = Math.round(ly + layer.height / 2);
    if (px < 0 || py < 0 || px >= layer.width || py >= layer.height) return null;
    return { x: px, y: py };
  };

  const paintBrushOnCanvas = (
    c: HTMLCanvasElement,
    origImg: HTMLImageElement | null,
    px: number,
    py: number,
    radius: number,
    mode: 'eraser' | 'restore'
  ) => {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    const x0 = Math.max(0, px - radius);
    const y0 = Math.max(0, py - radius);
    const x1 = Math.min(w - 1, px + radius);
    const y1 = Math.min(h - 1, py + radius);
    const rw = x1 - x0 + 1;
    const rh = y1 - y0 + 1;
    if (rw <= 0 || rh <= 0) return;

    const imgData = ctx.getImageData(x0, y0, rw, rh);
    let origData: ImageData | null = null;
    if (mode === 'restore' && origImg) {
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      const tCtx = tmp.getContext('2d');
      if (tCtx) {
        tCtx.drawImage(origImg, 0, 0, w, h);
        origData = tCtx.getImageData(x0, y0, rw, rh);
      }
    }

    const rSq = radius * radius;
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const distSq = (x0 + dx - px) ** 2 + (y0 + dy - py) ** 2;
        if (distSq <= rSq) {
          const i = (dy * rw + dx) * 4;
          if (mode === 'eraser') {
            imgData.data[i + 3] = 0;
          } else if (origData) {
            imgData.data[i] = origData.data[i];
            imgData.data[i + 1] = origData.data[i + 1];
            imgData.data[i + 2] = origData.data[i + 2];
            imgData.data[i + 3] = origData.data[i + 3];
          }
        }
      }
    }
    ctx.putImageData(imgData, x0, y0);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerMode === 'pan' || spacePressed) {
      dragSessionRef.current = {
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        origPanX: panOffset.x,
        origPanY: panOffset.y,
      };
      return;
    }

    const pt = toCanvasCoords(e.clientX, e.clientY);
    if (!pt) return;

    if (pointerMode === 'pen') {
      setPenPoints((prev) => [...prev, { x: Math.round(pt.x), y: Math.round(pt.y) }]);
      return;
    }

    // Magic Wand / Eraser / Restore Brush on active image layer
    if (
      (pointerMode === 'wand' || pointerMode === 'eraser' || pointerMode === 'restore') &&
      selectedLayer?.type === 'image' &&
      !selectedLayer.locked
    ) {
      const localPt = toImageLayerPixelCoords(selectedLayer, pt.x, pt.y);
      if (!localPt) return;

      const rawImg = rawImageCacheRef.current.get(selectedLayer.imageUrl);
      if (!rawImg) return;
      const off = document.createElement('canvas');
      off.width = selectedLayer.width;
      off.height = selectedLayer.height;
      const oCtx = off.getContext('2d');
      if (!oCtx) return;
      oCtx.drawImage(rawImg, 0, 0, off.width, off.height);

      if (pointerMode === 'wand') {
        const d = oCtx.getImageData(0, 0, off.width, off.height);
        const cut = removeBackgroundFromRgba(d.data, off.width, off.height, {
          tolerance: bgTolerance,
          feather: bgFeather,
          seedPoint: localPt,
        });
        d.data.set(cut);
        oCtx.putImageData(d, 0, 0);
        const nextUrl = off.toDataURL('image/png');
        loadHtmlImage(nextUrl).then((img) => {
          rawImageCacheRef.current.set(nextUrl, img);
          commitProject((prev) => ({
            ...prev,
            layers: prev.layers.map((l) =>
              l.id === selectedLayer.id && l.type === 'image' ? { ...l, imageUrl: nextUrl } : l
            ),
          }));
        });
        return;
      }

      const origImg = rawImageCacheRef.current.get(selectedLayer.originalImageUrl) || null;
      paintBrushOnCanvas(off, origImg, localPt.x, localPt.y, Math.round(brushSize / 2), pointerMode);
      dragSessionRef.current = {
        kind: 'brush',
        layerId: selectedLayer.id,
        mode: pointerMode,
        canvas: off,
        origImg,
        dirty: true,
      };
      return;
    }

    // Select / Transform mode
    if (selectedLayer && !selectedLayer.locked && selectedLayer.visible) {
      const hw = (selectedLayer.width * selectedLayer.scale) / 2;
      const hh = (selectedLayer.height * selectedLayer.scale) / 2;
      const dx = pt.x - selectedLayer.x;
      const dy = pt.y - selectedLayer.y;
      const rad = (-selectedLayer.rotation * Math.PI) / 180;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);

      // Check top rotation handle
      if (Math.hypot(lx, ly - (-hh - 42)) <= 24) {
        dragSessionRef.current = {
          kind: 'rotate',
          layerId: selectedLayer.id,
          startCanvasX: pt.x,
          startCanvasY: pt.y,
          origX: selectedLayer.x,
          origY: selectedLayer.y,
          origScale: selectedLayer.scale,
          origRotation: selectedLayer.rotation,
          startDist: 1,
          startAngle: Math.atan2(pt.y - selectedLayer.y, pt.x - selectedLayer.x),
        };
        return;
      }

      // Check 4 corner scale handles
      const corners = [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ];
      if (corners.some(([cx, cy]) => Math.hypot(lx - cx, ly - cy) <= 24)) {
        dragSessionRef.current = {
          kind: 'scale',
          layerId: selectedLayer.id,
          startCanvasX: pt.x,
          startCanvasY: pt.y,
          origX: selectedLayer.x,
          origY: selectedLayer.y,
          origScale: selectedLayer.scale,
          origRotation: selectedLayer.rotation,
          startDist: Math.max(12, Math.hypot(pt.x - selectedLayer.x, pt.y - selectedLayer.y)),
          startAngle: 0,
        };
        return;
      }
    }

    const hit = hitTestLayer(pt.x, pt.y);
    if (hit) {
      setSelectedLayerId(hit.id);
      dragSessionRef.current = {
        kind: 'move',
        layerId: hit.id,
        startCanvasX: pt.x,
        startCanvasY: pt.y,
        origX: hit.x,
        origY: hit.y,
        origScale: hit.scale,
        origRotation: hit.rotation,
        startDist: 1,
        startAngle: 0,
      };
    } else {
      setSelectedLayerId(null);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sess = dragSessionRef.current;
    if (!sess) return;

    if (sess.kind === 'pan') {
      setPanOffset({
        x: sess.origPanX + (e.clientX - sess.startClientX),
        y: sess.origPanY + (e.clientY - sess.startClientY),
      });
      return;
    }

    const pt = toCanvasCoords(e.clientX, e.clientY);
    if (!pt) return;

    if (sess.kind === 'brush') {
      const layer = projectRef.current.layers.find((l) => l.id === sess.layerId);
      if (layer?.type !== 'image') return;
      const localPt = toImageLayerPixelCoords(layer, pt.x, pt.y);
      if (!localPt) return;
      paintBrushOnCanvas(sess.canvas, sess.origImg, localPt.x, localPt.y, Math.round(brushSize / 2), sess.mode);
      // Fast visual feedback directly on stage via temporary image cache
      const previewUrl = sess.canvas.toDataURL('image/png');
      loadHtmlImage(previewUrl).then((img) => {
        rawImageCacheRef.current.set(previewUrl, img);
        setProject((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === sess.layerId && l.type === 'image' ? { ...l, imageUrl: previewUrl } : l
          ),
        }));
      });
      return;
    }

    if (sess.kind === 'move') {
      const layer = projectRef.current.layers.find((l) => l.id === sess.layerId);
      if (!layer) return;
      const rawX = sess.origX + (pt.x - sess.startCanvasX);
      const rawY = sess.origY + (pt.y - sess.startCanvasY);
      const snap = computeSnapPosition(
        rawX,
        rawY,
        projectRef.current.canvasWidth,
        projectRef.current.canvasHeight,
        (layer.width * layer.scale) / 2,
        (layer.height * layer.scale) / 2,
        snapEnabled,
        14
      );
      setSnapGuides({ x: snap.guideX, y: snap.guideY });
      setProject((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.id === sess.layerId ? { ...l, x: snap.x, y: snap.y } : l)),
      }));
      return;
    }

    if (sess.kind === 'scale') {
      const dist = Math.max(12, Math.hypot(pt.x - sess.origX, pt.y - sess.origY));
      const ratio = dist / sess.startDist;
      const nextScale = Math.max(0.08, Math.min(5, Number((sess.origScale * ratio).toFixed(3))));
      setProject((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.id === sess.layerId ? { ...l, scale: nextScale } : l)),
      }));
      return;
    }

    if (sess.kind === 'rotate') {
      const curAngle = Math.atan2(pt.y - sess.origY, pt.x - sess.origX);
      const degDelta = ((curAngle - sess.startAngle) * 180) / Math.PI;
      const nextRot = Math.round(sess.origRotation + degDelta);
      setProject((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.id === sess.layerId ? { ...l, rotation: nextRot } : l)),
      }));
    }
  };

  const handleCanvasPointerUp = () => {
    const sess = dragSessionRef.current;
    if (!sess) return;
    dragSessionRef.current = null;
    setSnapGuides({ x: null, y: null });

    if (sess.kind === 'brush' && sess.dirty) {
      const finalUrl = sess.canvas.toDataURL('image/png');
      loadHtmlImage(finalUrl).then((img) => {
        rawImageCacheRef.current.set(finalUrl, img);
        commitProject((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === sess.layerId && l.type === 'image' ? { ...l, imageUrl: finalUrl } : l
          ),
        }));
      });
      return;
    }

    if (sess.kind === 'move' || sess.kind === 'scale' || sess.kind === 'rotate') {
      commitProject(projectRef.current, true);
    }
  };

  // Layer actions
  const updateSelectedLayer = (patch: Partial<StudioLayer>, recordHistory = true) => {
    if (!selectedLayerId) return;
    commitProject(
      (prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.id === selectedLayerId ? ({ ...l, ...patch } as StudioLayer) : l)),
      }),
      recordHistory
    );
  };

  const handleAddImageLayerFromFile = (e: React.ChangeEvent<HTMLInputElement>, replaceProject: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      if (!url) return;
      if (replaceProject) {
        onSelectSource({
          id: `local-${Date.now()}`,
          title: file.name,
          imageUrl: url,
          originalPrompt: file.name,
          enhancedPrompt: `ผลงานตกแต่งในสตูดิโอ ZImage (${file.name})`,
          stylePreset: 'auto',
          aspectRatio: '1:1',
        });
        return;
      }
      try {
        const img = await loadHtmlImage(url);
        rawImageCacheRef.current.set(url, img);
        const nw = img.naturalWidth || 800;
        const nh = img.naturalHeight || 800;
        const fit = Math.min((project.canvasWidth * 0.72) / nw, (project.canvasHeight * 0.72) / nh);
        const layer: ImageStudioLayer = {
          id: makeLayerId('img'),
          name: file.name.slice(0, 24),
          type: 'image',
          visible: true,
          locked: false,
          x: project.canvasWidth / 2,
          y: project.canvasHeight / 2,
          width: nw,
          height: nh,
          scale: Number(fit.toFixed(3)),
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: 100,
          blendMode: 'source-over',
          parallaxDepth: 1.2,
          keyframes: [],
          imageUrl: url,
          originalImageUrl: url,
          adjustments: { ...DEFAULT_ADJUSTMENTS },
        };
        commitProject((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
        setSelectedLayerId(layer.id);
        setPointerMode('select');
      } catch {
        setErrorMsg('ไม่สามารถอ่านไฟล์ภาพที่เลือกได้');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddTextLayer = () => {
    const layer: TextStudioLayer = {
      id: makeLayerId('txt'),
      name: 'ข้อความไทย',
      type: 'text',
      visible: true,
      locked: false,
      x: project.canvasWidth / 2,
      y: Math.round(project.canvasHeight * 0.82),
      width: Math.round(project.canvasWidth * 0.76),
      height: 150,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 100,
      blendMode: 'source-over',
      parallaxDepth: 1.5,
      keyframes: [],
      text: 'วิจิตรศิลป์ ZImage',
      fontFamily: 'Prompt',
      fontSize: 68,
      color: '#F3E9D2',
      bold: true,
      align: 'center',
      shadow: true,
      strokeWidth: 4,
      strokeColor: '#091B42',
    };
    commitProject((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedLayerId(layer.id);
    setActiveToolTab('text');
    setPointerMode('select');
  };

  const handleAddStickerLayer = async (stickerId: string) => {
    const def = KANOK_STICKER_ASSETS.find((s) => s.id === stickerId);
    if (!def) return;
    const svg = def.buildSvg(stickerColor);
    const key = `sticker:${def.id}:${stickerColor}`;
    const img = await loadSvgAssetImage(svg);
    rawImageCacheRef.current.set(key, img);

    const layer: SvgStudioLayer = {
      id: makeLayerId('svg'),
      name: def.name,
      type: 'svg',
      visible: true,
      locked: false,
      x: project.canvasWidth / 2,
      y: project.canvasHeight / 2,
      width: def.defaultWidth,
      height: def.defaultHeight,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 100,
      blendMode: 'source-over',
      parallaxDepth: 1.6,
      keyframes: [],
      assetId: def.id,
      assetKind: 'sticker',
      color: stickerColor,
    };
    commitProject((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedLayerId(layer.id);
    setPointerMode('select');
  };

  const handleAddShapeLayer = (shapeKind: Exclude<ShapeKind, 'path'>) => {
    const size = Math.round(Math.min(project.canvasWidth, project.canvasHeight) * 0.28);
    const labelMap: Record<Exclude<ShapeKind, 'path'>, string> = {
      rect: 'สี่เหลี่ยม',
      circle: 'วงกลม',
      triangle: 'สามเหลี่ยม',
      star: 'ดาว 5 แฉก',
      polygon: 'หกเหลี่ยม',
      line: 'เส้นตรง',
    };
    const layer: ShapeStudioLayer = {
      id: makeLayerId('shp'),
      name: `รูปทรง: ${labelMap[shapeKind]}`,
      type: 'shape',
      provenance: 'vector',
      visible: true,
      locked: false,
      x: project.canvasWidth / 2,
      y: project.canvasHeight / 2,
      width: size,
      height: shapeKind === 'line' ? Math.max(24, shapeStrokeWidth * 4) : size,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 100,
      blendMode: 'source-over',
      parallaxDepth: 1.4,
      keyframes: [],
      shapeKind,
      fillColor: shapeFillColor,
      strokeColor: shapeStrokeColor,
      strokeWidth: shapeStrokeWidth,
      cornerRadius: shapeKind === 'rect' ? 20 : 0,
    };
    commitProject((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedLayerId(layer.id);
    setActiveToolTab('shapes');
    setPointerMode('select');
  };

  const handleCommitPenPath = () => {
    if (penPoints.length < 2) {
      setErrorMsg('กรุณาคลิกอย่างน้อย 2 จุดบนผืนผ้าใบเพื่อสร้างเส้น Vector');
      return;
    }
    const xs = penPoints.map((p) => p.x);
    const ys = penPoints.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bw = Math.max(40, maxX - minX);
    const bh = Math.max(40, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const normPts = penPoints.map((p) => ({
      x: (p.x - cx) / bw,
      y: (p.y - cy) / bh,
    }));
    const layer: ShapeStudioLayer = {
      id: makeLayerId('pen'),
      name: 'ลายเส้น Vector (Pen)',
      type: 'shape',
      provenance: 'vector',
      visible: true,
      locked: false,
      x: cx,
      y: cy,
      width: bw,
      height: bh,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 100,
      blendMode: 'source-over',
      parallaxDepth: 1.4,
      keyframes: [],
      shapeKind: 'path',
      fillColor: shapeFillColor,
      strokeColor: shapeStrokeColor,
      strokeWidth: shapeStrokeWidth,
      cornerRadius: 0,
      points: normPts,
    };
    commitProject((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedLayerId(layer.id);
    setPenPoints([]);
    setPointerMode('select');
    showToast('สร้างเลเยอร์ Vector Pen สำเร็จ');
  };

  const handleGroupCheckedLayers = () => {
    if (checkedLayerIds.length < 2) return;
    const gid = `grp-${Date.now().toString(36)}`;
    commitProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (checkedLayerIds.includes(l.id) ? { ...l, groupId: gid } : l)),
    }));
    setCheckedLayerIds([]);
    showToast(`จัดกลุ่ม ${checkedLayerIds.length} เลเยอร์สำเร็จ`);
  };

  const handleUngroupLayer = (groupId: string) => {
    commitProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.groupId === groupId ? { ...l, groupId: undefined } : l)),
    }));
    showToast('แยกกลุ่มเลเยอร์แล้ว');
  };

  const handleMergeVisibleLayers = async () => {
    const visibleCount = project.layers.filter((l) => l.visible).length;
    if (visibleCount < 2) {
      setErrorMsg('ต้องมีเลเยอร์ที่แสดงอยู่อย่างน้อย 2 ชั้นจึงจะรวมเลเยอร์ได้');
      return;
    }
    await ensureAssetsLoaded(project);
    const flatCanvas = document.createElement('canvas');
    renderProjectToCanvas(flatCanvas, { ...project, backgroundColor: 'transparent', activeFrameId: null }, {
      timeSec: playheadSec,
      includeOverlayUi: false,
    });
    const mergedUrl = flatCanvas.toDataURL('image/png');
    const mergedImg = await loadHtmlImage(mergedUrl);
    rawImageCacheRef.current.set(mergedUrl, mergedImg);
    const mergedLayer: ImageStudioLayer = {
      id: makeLayerId('mrg'),
      name: `รวมเลเยอร์ (${visibleCount} ชั้น)`,
      type: 'image',
      provenance: 'raster',
      visible: true,
      locked: false,
      x: project.canvasWidth / 2,
      y: project.canvasHeight / 2,
      width: project.canvasWidth,
      height: project.canvasHeight,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 100,
      blendMode: 'source-over',
      parallaxDepth: 0.8,
      keyframes: [],
      imageUrl: mergedUrl,
      originalImageUrl: mergedUrl,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
    };
    commitProject((prev) => ({
      ...prev,
      layers: [...prev.layers.filter((l) => !l.visible), mergedLayer],
    }));
    setSelectedLayerId(mergedLayer.id);
    showToast('รวมเลเยอร์ที่แสดงเป็นชั้นเดียวสำเร็จ');
  };

  const handleImportPsdFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingProject(true);
    setErrorMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const imported = importPsdBufferToStudioLayers(buf);
      if (imported.layers.length === 0) {
        setErrorMsg('ไฟล์ .PSD นี้ไม่มีเลเยอร์ภาพหรือข้อความที่สามารถเปิดได้');
        return;
      }
      const nextProj: CanvasProjectState = {
        ...createEmptyProject(file.name.replace(/\.psd$/i, '')),
        aspectId: 'custom',
        canvasWidth: imported.width,
        canvasHeight: imported.height,
        backgroundColor: '#FFFFFF',
        layers: imported.layers,
      };
      await ensureAssetsLoaded(nextProj);
      setProject(nextProj);
      setHistoryStack([nextProj]);
      setHistoryCursor(0);
      setSelectedLayerId(imported.layers[imported.layers.length - 1]?.id || null);
      setCustomCanvasW(imported.width);
      setCustomCanvasH(imported.height);
      showToast(`นำเข้าไฟล์ PSD สำเร็จ (${imported.layers.length} เลเยอร์)`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถอ่านไฟล์ .PSD ได้');
    } finally {
      setLoadingProject(false);
      e.target.value = '';
    }
  };

  const handleExportPsd = async () => {
    if (project.layers.length === 0) return;
    setExportBusy(true);
    setErrorMsg(null);
    try {
      await ensureAssetsLoaded(project);
      const buf = await exportProjectToPsdBuffer(project);
      triggerBlobDownload(
        new Blob([buf], { type: 'application/octet-stream' }),
        `zimage-project-${Date.now()}.psd`
      );
      showToast(`ส่งออกไฟล์ .PSD แยก ${project.layers.length} เลเยอร์สำเร็จ`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถส่งออกไฟล์ .PSD ได้');
    } finally {
      setExportBusy(false);
    }
  };

  // Background removal on selected image layer (optionally spawning a new foreground layer above!)
  const handleRemoveBackgroundOnLayer = async (splitAsNewLayer: boolean) => {
    const targetLayer =
      selectedLayer?.type === 'image'
        ? selectedLayer
        : (project.layers.find((l) => l.type === 'image') as ImageStudioLayer | undefined);
    if (!targetLayer) return;

    const rawImg = rawImageCacheRef.current.get(targetLayer.imageUrl);
    if (!rawImg) return;

    const off = document.createElement('canvas');
    off.width = targetLayer.width;
    off.height = targetLayer.height;
    const oCtx = off.getContext('2d');
    if (!oCtx) return;
    oCtx.drawImage(rawImg, 0, 0, off.width, off.height);
    const imgData = oCtx.getImageData(0, 0, off.width, off.height);
    const processed = removeBackgroundFromRgba(imgData.data, off.width, off.height, {
      tolerance: bgTolerance,
      feather: bgFeather,
      globalColorKey: bgGlobalKey,
    });
    imgData.data.set(processed);
    oCtx.putImageData(imgData, 0, 0);
    const nextUrl = off.toDataURL('image/png');
    const nextImg = await loadHtmlImage(nextUrl);
    rawImageCacheRef.current.set(nextUrl, nextImg);

    if (splitAsNewLayer) {
      const fgLayer: ImageStudioLayer = {
        ...targetLayer,
        id: makeLayerId('fg'),
        name: `${targetLayer.name} (วัตถุแยกชั้น)`,
        imageUrl: nextUrl,
        isCutoutForeground: true,
        parallaxDepth: 2.0,
        keyframes: [],
      };
      commitProject((prev) => ({
        ...prev,
        layers: [...prev.layers, fgLayer],
      }));
      setSelectedLayerId(fgLayer.id);
      showToast('แยกวัตถุหลักเป็นเลเยอร์ใหม่แล้ว (เหมาะสำหรับทำ Parallax)');
    } else {
      commitProject((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === targetLayer.id && l.type === 'image'
            ? { ...l, imageUrl: nextUrl, isCutoutForeground: true }
            : l
        ),
      }));
      showToast('ตัดพื้นหลังโปร่งใสในเลเยอร์เรียบร้อย');
    }
  };

  // Motion Preset & Keyframe Handlers
  const handleApplyMotionPreset = (presetId: MotionPresetId) => {
    const target = selectedLayer || project.layers[project.layers.length - 1];
    if (!target) {
      setErrorMsg('กรุณาเพิ่มหรือเลือกอย่างน้อย 1 เลเยอร์ก่อนใส่การเคลื่อนไหว');
      return;
    }
    const kfs = buildKeyframesForMotionPreset(presetId, target, project.durationSec);
    commitProject((prev) => ({
      ...prev,
      mode: 'motion',
      layers: prev.layers.map((l) => (l.id === target.id ? { ...l, keyframes: kfs } : l)),
    }));
    setSelectedLayerId(target.id);
    setPlayheadSec(0);
    setIsPlaying(true);
    const presetLabel = MOTION_PRESETS.find((p) => p.id === presetId)?.label || presetId;
    showToast(`ใส่การเคลื่อนไหว "${presetLabel}" ให้เลเยอร์ "${target.name}" แล้ว`);
  };

  const handleAddOrUpdateKeyframe = () => {
    if (!selectedLayer) return;
    const t = Number(playheadSec.toFixed(2));
    const kf: LayerKeyframe = {
      id: makeLayerId('kf'),
      timeSec: t,
      x: selectedLayer.x,
      y: selectedLayer.y,
      scale: selectedLayer.scale,
      rotation: selectedLayer.rotation,
      opacity: selectedLayer.opacity,
      easing: keyframeEasing,
    };
    commitProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => {
        if (l.id !== selectedLayer.id) return l;
        const filtered = l.keyframes.filter((k) => Math.abs(k.timeSec - t) > 0.08);
        return { ...l, keyframes: [...filtered, kf].sort((a, b) => a.timeSec - b.timeSec) };
      }),
    }));
    showToast(`ปักคีย์เฟรม ณ ${t}s แล้ว`);
  };

  // Canvas Resize / Aspect Change
  const applyCanvasDimensions = (w: number, h: number, aspectId: CanvasAspectId) => {
    const cw = Math.max(128, Math.min(3840, Math.round(w)));
    const ch = Math.max(128, Math.min(3840, Math.round(h)));
    const dx = (cw - project.canvasWidth) / 2;
    const dy = (ch - project.canvasHeight) / 2;
    setCustomCanvasW(cw);
    setCustomCanvasH(ch);
    commitProject((prev) => ({
      ...prev,
      aspectId,
      canvasWidth: cw,
      canvasHeight: ch,
      layers: prev.layers.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })),
    }));
  };

  // Still Export (1x / 2x / 4x)
  const handleExportStill = async () => {
    if (project.layers.length === 0) return;
    setExportBusy(true);
    setErrorMsg(null);
    try {
      await ensureAssetsLoaded(project);
      const outW = Math.min(4096, project.canvasWidth * stillScale);
      const outH = Math.min(4096, project.canvasHeight * stillScale);
      const baseCanvas = document.createElement('canvas');
      renderProjectToCanvas(baseCanvas, project, { timeSec: playheadSec, includeOverlayUi: false });

      let finalCanvas = baseCanvas;
      if (outW !== baseCanvas.width || outH !== baseCanvas.height) {
        const scaled = document.createElement('canvas');
        scaled.width = outW;
        scaled.height = outH;
        const sCtx = scaled.getContext('2d');
        if (sCtx) {
          sCtx.imageSmoothingEnabled = true;
          sCtx.imageSmoothingQuality = 'high';
          sCtx.drawImage(baseCanvas, 0, 0, outW, outH);
          finalCanvas = scaled;
        }
      }

      const { blob, extension } = await exportCanvasInFormat(
        finalCanvas,
        stillFormat,
        stillQuality,
        project.backgroundColor === 'transparent' ? '#091B42' : project.backgroundColor
      );
      triggerBlobDownload(blob, `zimage-studio-${Date.now()}.${extension}`);
      showToast(`ส่งออกไฟล์ .${extension.toUpperCase()} (${outW}×${outH} px) สำเร็จ`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถส่งออกไฟล์ภาพได้');
    } finally {
      setExportBusy(false);
    }
  };

  // Export Animated GIF
  const handleExportGif = async () => {
    if (project.layers.length === 0) return;
    setExportBusy(true);
    setExportProgress(1);
    setErrorMsg(null);
    setIsPlaying(false);
    try {
      await ensureAssetsLoaded(project);
      const fullFrame = document.createElement('canvas');
      fullFrame.width = project.canvasWidth;
      fullFrame.height = project.canvasHeight;

      const blob = await exportTimelineToGif({
        width: project.canvasWidth,
        height: project.canvasHeight,
        durationSec: project.durationSec,
        fps: project.fps,
        quality: animQuality,
        onProgress: setExportProgress,
        renderFrameAtTime: (targetCanvas, tSec) => {
          renderProjectToCanvas(fullFrame, project, {
            timeSec: tSec,
            includeOverlayUi: false,
            forceOpaqueForVideo: true,
          });
          const ctx = targetCanvas.getContext('2d');
          ctx?.drawImage(fullFrame, 0, 0, targetCanvas.width, targetCanvas.height);
        },
      });
      triggerBlobDownload(blob, `zimage-motion-${Date.now()}.gif`);
      showToast('ส่งออก GIF เคลื่อนไหวเรียบร้อยแล้ว');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถสร้างไฟล์ GIF ได้');
    } finally {
      setExportBusy(false);
      setExportProgress(null);
    }
  };

  // Export Video (MP4 or WebM fallback)
  const handleExportVideo = async () => {
    if (project.layers.length === 0) return;
    setExportBusy(true);
    setExportProgress(1);
    setErrorMsg(null);
    setIsPlaying(false);
    try {
      await ensureAssetsLoaded(project);
      const fullFrame = document.createElement('canvas');
      fullFrame.width = project.canvasWidth;
      fullFrame.height = project.canvasHeight;

      const res = await exportTimelineToVideo({
        width: project.canvasWidth,
        height: project.canvasHeight,
        durationSec: project.durationSec,
        fps: project.fps,
        preferMp4: true,
        quality: animQuality,
        onProgress: setExportProgress,
        renderFrameAtTime: (targetCanvas, tSec) => {
          renderProjectToCanvas(fullFrame, project, {
            timeSec: tSec,
            includeOverlayUi: false,
            forceOpaqueForVideo: true,
          });
          const ctx = targetCanvas.getContext('2d');
          ctx?.drawImage(fullFrame, 0, 0, targetCanvas.width, targetCanvas.height);
        },
      });
      triggerBlobDownload(res.blob, `zimage-video-${Date.now()}.${res.extension}`);
      showToast(
        res.usedWebmFallback
          ? 'ส่งออกวิดีโอเป็นไฟล์ WebM เรียบร้อย (เบราว์เซอร์นี้บันทึกสตรีมเป็น WebM อัตโนมัติ)'
          : `ส่งออกวิดีโอ .${res.extension.toUpperCase()} เรียบร้อยแล้ว`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถส่งออกวิดีโอได้');
    } finally {
      setExportBusy(false);
      setExportProgress(null);
    }
  };

  // Save Project + PNG Snapshot to Personal Vault
  const handleSaveProjectToVault = async () => {
    if (!user) {
      onRequireSignIn();
      return;
    }
    if (project.layers.length === 0) return;
    setSavingVault(true);
    setErrorMsg(null);
    try {
      await ensureAssetsLoaded(project);
      const snapCanvas = document.createElement('canvas');
      renderProjectToCanvas(snapCanvas, project, { timeSec: 0, includeOverlayUi: false });
      const pngSnapshot = snapCanvas.toDataURL('image/png');

      // Compact layer images so projectJson fits comfortably within 250KB Firestore budget
      const compactLayers = await Promise.all(
        project.layers.map(async (l) => {
          if (l.type !== 'image') return l;
          const compactUrl = await compactDataUrl(l.imageUrl, 512);
          return {
            ...l,
            imageUrl: compactUrl,
            originalImageUrl: compactUrl,
          };
        })
      );
      const compactProj: CanvasProjectState = {
        ...project,
        layers: compactLayers,
      };
      let serialized = JSON.stringify(compactProj);
      if (serialized.length > 240000) {
        // Fallback further compaction if user placed many high-res photos
        const tinyLayers = await Promise.all(
          compactProj.layers.map(async (l) => {
            if (l.type !== 'image') return l;
            const u = await compactDataUrl(l.imageUrl, 256);
            return { ...l, imageUrl: u, originalImageUrl: u };
          })
        );
        serialized = JSON.stringify({ ...compactProj, layers: tinyLayers });
      }

      await onSaveEditedPngToVault({
        imageDataUrl: pngSnapshot,
        originalPrompt: sourceItem?.originalPrompt || project.title || 'ผลงานจากสตูดิโอ ZImage',
        enhancedPrompt:
          sourceItem?.enhancedPrompt || `Composed in ZImage Studio (${project.layers.length} layers)`,
        stylePreset: sourceItem?.stylePreset || 'auto',
        aspectRatio: sourceItem?.aspectRatio || '1:1',
        dimensionsLabel: `${project.canvasWidth} × ${project.canvasHeight} px`,
        itemType: project.mode === 'motion' ? 'animation' : 'edited',
        sourceImageId: sourceItem?.sourceImageId || sourceItem?.id,
        projectJson: serialized.length <= 248000 ? serialized : undefined,
      });

      await clearStudioDraftFromIndexedDb();
      showToast('บันทึกผลงานและโปรเจกต์ลงคลังส่วนตัวเรียบร้อยแล้ว');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกผลงานลงคลังได้');
    } finally {
      setSavingVault(false);
    }
  };

  // Empty Starter Landing inside Studio (when no layers loaded yet)
  if (project.layers.length === 0 && !loadingProject) {
    return (
      <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 space-y-8">
        <input
          ref={uploadMainImageInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleAddImageLayerFromFile(e, true)}
          className="hidden"
        />
        <input
          ref={psdImportInputRef}
          type="file"
          accept=".psd"
          onChange={handleImportPsdFile}
          className="hidden"
        />

        {pendingDraft && (
          <div
            role="region"
            aria-label="กู้คืนงานค้างในสตูดิโอ"
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-5 py-4 shadow-sm"
          >
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-[#101820] dark:text-[#F8FAFC]">
                พบงานที่ค้างไว้ในเครื่อง ({pendingDraft.layers.length} เลเยอร์) — ต้องการกู้คืนหรือไม่
              </p>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                บันทึกอัตโนมัติล่าสุดเมื่อ{' '}
                {new Date(pendingDraft.updatedAtIso).toLocaleTimeString('th-TH')}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  await ensureAssetsLoaded(pendingDraft);
                  setProject(pendingDraft);
                  setHistoryStack([pendingDraft]);
                  setHistoryCursor(0);
                  setSelectedLayerId(pendingDraft.layers[pendingDraft.layers.length - 1]?.id || null);
                  setCustomCanvasW(pendingDraft.canvasWidth);
                  setCustomCanvasH(pendingDraft.canvasHeight);
                  setPendingDraft(null);
                  showToast('กู้คืนงานเดิมสำเร็จ');
                }}
                className="min-h-[42px] rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
              >
                กู้คืนงานเดิม
              </button>
              <button
                type="button"
                onClick={async () => {
                  await clearStudioDraftFromIndexedDb();
                  setPendingDraft(null);
                }}
                className="min-h-[42px] rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-4 py-2 text-xs font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                เริ่มใหม่
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-8 text-center space-y-5 shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#2563EB] dark:text-[#60A5FA]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Pro Layer Studio · ทำงานบนเบราว์เซอร์ 100% · รองรับ .PSD และ Vector</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#101820] dark:text-[#F8FAFC]">
            สตูดิโอแต่งภาพหลายเลเยอร์ รูปทรง Vector &amp; ภาพเคลื่อนไหว ZImage
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-[#64748B] dark:text-slate-400">
            ซ้อนเลเยอร์ จัดกลุ่ม รวมเลเยอร์ วาด Vector Shape &amp; Pen Tool ตัดพื้นหลัง ใส่ข้อความไทย 6 ฟอนต์ กรอบกนก 8 แบบ
            พร้อมนำเข้า-ส่งออกไฟล์ .PSD, GIF, วิดีโอ และ PNG ได้ไม่จำกัดครั้ง
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => uploadMainImageInputRef.current?.click()}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer shadow-sm"
            >
              <Upload className="h-4 w-4" />
              <span>อัปโหลดภาพจากเครื่องเพื่อเริ่มแต่ง</span>
            </button>
            <button
              type="button"
              onClick={() => psdImportInputRef.current?.click()}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-5 py-3 text-sm font-semibold text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <FileCode2 className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>นำเข้าไฟล์ .PSD</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const blank = createEmptyProject('ผืนผ้าใบเปล่า ZImage');
                setProject(blank);
                setHistoryStack([blank]);
                setHistoryCursor(0);
                handleAddTextLayer();
              }}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-5 py-3 text-sm font-semibold text-[#101820] dark:text-slate-200 hover:bg-[#F7F9FC] dark:hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>สร้างผืนผ้าใบใหม่</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-[#101820] dark:text-[#F8FAFC]">
            หรือเลือกภาพตัวอย่างเปิดเข้าสตูดิโอทันที
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CURATED_SHOWCASE_ITEMS.slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  onSelectSource({
                    id: item.id,
                    title: item.title,
                    imageUrl: item.imageUrl,
                    originalPrompt: item.originalPrompt,
                    enhancedPrompt: item.enhancedPrompt,
                    stylePreset: item.stylePreset,
                    aspectRatio: item.aspectRatio,
                  })
                }
                className="group overflow-hidden rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] text-left hover:border-[#2563EB] transition-colors cursor-pointer shadow-sm"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-[#F7F9FC] dark:bg-[#0B1F3A]">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-3.5">
                  <p className="font-display text-sm font-semibold text-[#101820] dark:text-[#F8FAFC] line-clamp-1">{item.title}</p>
                  <p className="mt-0.5 text-xs text-[#2563EB] dark:text-[#60A5FA]">เปิดในสตูดิโอ →</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const toolItems: Array<{ id: StudioToolTab; label: string; icon: typeof Layers }> = [
    { id: 'layers', label: 'ชั้นภาพ', icon: Layers },
    { id: 'bg', label: 'ตัดพื้นหลัง', icon: Scissors },
    { id: 'text', label: 'ข้อความ', icon: TypeIcon },
    { id: 'shapes', label: 'รูปทรง & ปากกา', icon: Shapes },
    { id: 'frames', label: 'กรอบกนก', icon: Frame },
    { id: 'stickers', label: 'สติกเกอร์', icon: Sticker },
    { id: 'adjust', label: 'แสงสี & ฟิลเตอร์', icon: Sliders },
    { id: 'canvas', label: 'ครอป & ผืนผ้าใบ', icon: Crop },
    { id: 'export', label: 'ส่งออก / บันทึก', icon: Download },
  ];

  // Shared Inspector Panel Renderer (used in Desktop Right Column AND Mobile Slide-Up Sheet)
  const renderToolInspector = () => (
    <div className="space-y-4 text-xs text-[#101820] dark:text-[#F8FAFC]">
      {/* 1. LAYERS */}
      {activeToolTab === 'layers' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => uploadNewLayerInputRef.current?.click()}
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>เพิ่มภาพอีกชั้น</span>
            </button>
            <button
              type="button"
              onClick={handleAddTextLayer}
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 text-xs font-semibold text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <TypeIcon className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>เพิ่มข้อความ</span>
            </button>
          </div>

          {/* Group / Merge / Import PSD Batch Controls */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={checkedLayerIds.length < 2}
              onClick={handleGroupCheckedLayers}
              className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 text-[11px] font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <Folder className="h-3 w-3 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>จัดกลุ่ม ({checkedLayerIds.length})</span>
            </button>
            <button
              type="button"
              onClick={handleMergeVisibleLayers}
              className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 text-[11px] font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Combine className="h-3 w-3 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>รวมเลเยอร์</span>
            </button>
            <button
              type="button"
              onClick={() => psdImportInputRef.current?.click()}
              className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 text-[11px] font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <FileCode2 className="h-3 w-3 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>นำเข้า PSD</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400">
              ลำดับชั้นภาพ ({project.layers.length} ชั้น · บนสุดแสดงด้านหน้า)
            </span>
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {[...project.layers].reverse().map((layer) => {
                const active = layer.id === selectedLayerId;
                const isChecked = checkedLayerIds.includes(layer.id);
                const prov =
                  layer.provenance ||
                  (layer.type === 'text'
                    ? 'text'
                    : layer.type === 'shape'
                      ? 'vector'
                      : layer.type === 'svg'
                        ? 'vector'
                        : 'raster');
                return (
                  <div
                    key={layer.id}
                    className={`flex items-center justify-between gap-1.5 rounded-xl border p-2 transition-colors ${
                      active
                        ? 'border-[#2563EB] bg-blue-50/70 dark:bg-[#0B1F3A]'
                        : 'border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A]/60 hover:border-[#2563EB]/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      aria-label={`เลือก ${layer.name} เพื่อจัดกลุ่ม`}
                      onChange={(e) => {
                        setCheckedLayerIds((prev) =>
                          e.target.checked ? [...prev, layer.id] : prev.filter((id) => id !== layer.id)
                        );
                      }}
                      className="h-3.5 w-3.5 shrink-0 accent-[#2563EB] cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedLayerId(layer.id)}
                      className="flex flex-1 flex-col text-left min-w-0 cursor-pointer py-0.5"
                    >
                      <span className="truncate font-medium text-[#101820] dark:text-[#F8FAFC]">{layer.name}</span>
                      <span className="text-[10px] text-[#64748B] dark:text-slate-400 truncate">
                        {getProvenanceLabel(prov)}
                        {layer.groupId ? ' · ในกลุ่ม' : ''}
                      </span>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {layer.groupId && (
                        <button
                          type="button"
                          aria-label="แยกกลุ่มเลเยอร์"
                          title="แยกกลุ่มเลเยอร์"
                          onClick={() => handleUngroupLayer(layer.groupId!)}
                          className="rounded p-1 text-[#2563EB] dark:text-[#60A5FA] hover:bg-blue-100/60 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="เลื่อนชั้นขึ้น"
                        onClick={() => {
                          commitProject((prev) => {
                            const idx = prev.layers.findIndex((l) => l.id === layer.id);
                            if (idx < 0 || idx >= prev.layers.length - 1) return prev;
                            const next = [...prev.layers];
                            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                            return { ...prev, layers: next };
                          });
                        }}
                        className="rounded p-1 text-[#64748B] dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="เลื่อนชั้นลง"
                        onClick={() => {
                          commitProject((prev) => {
                            const idx = prev.layers.findIndex((l) => l.id === layer.id);
                            if (idx <= 0) return prev;
                            const next = [...prev.layers];
                            [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
                            return { ...prev, layers: next };
                          });
                        }}
                        className="rounded p-1 text-[#64748B] dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={layer.visible ? 'ซ่อนชั้นภาพ' : 'แสดงชั้นภาพ'}
                        onClick={() =>
                          commitProject((prev) => ({
                            ...prev,
                            layers: prev.layers.map((l) =>
                              l.id === layer.id ? { ...l, visible: !l.visible } : l
                            ),
                          }))
                        }
                        className="rounded p-1 text-[#64748B] dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 opacity-45" />}
                      </button>
                      <button
                        type="button"
                        aria-label={layer.locked ? 'ปลดล็อกชั้นภาพ' : 'ล็อกชั้นภาพ'}
                        onClick={() =>
                          commitProject((prev) => ({
                            ...prev,
                            layers: prev.layers.map((l) =>
                              l.id === layer.id ? { ...l, locked: !l.locked } : l
                            ),
                          }))
                        }
                        className="rounded p-1 text-[#64748B] dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {layer.locked ? <Lock className="h-3.5 w-3.5 text-[#2563EB]" /> : <Unlock className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedLayer && (
            <div className="space-y-3 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#2563EB] dark:text-[#60A5FA] truncate">
                  ปรับแต่ง: {selectedLayer.name}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const cloned: StudioLayer = {
                        ...selectedLayer,
                        id: makeLayerId('dup'),
                        name: `${selectedLayer.name} (สำเนา)`,
                        x: selectedLayer.x + 28,
                        y: selectedLayer.y + 28,
                      };
                      commitProject((prev) => ({ ...prev, layers: [...prev.layers, cloned] }));
                      setSelectedLayerId(cloned.id);
                    }}
                    aria-label="ทำสำเนาชั้นภาพ"
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 p-1.5 hover:bg-[#F7F9FC] dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      commitProject((prev) => ({
                        ...prev,
                        layers: prev.layers.filter((l) => l.id !== selectedLayer.id),
                      }));
                      setSelectedLayerId(null);
                    }}
                    aria-label="ลบชั้นภาพ"
                    className="rounded-lg border border-red-200 dark:border-red-900/50 p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
                  <span>ความโปร่งใส (Opacity)</span>
                  <span className="font-mono-tabular">{selectedLayer.opacity}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={selectedLayer.opacity}
                  onChange={(e) => updateSelectedLayer({ opacity: Number(e.target.value) }, false)}
                  onMouseUp={() => commitProject(projectRef.current, true)}
                  className="w-full accent-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#64748B] dark:text-slate-400 mb-1">
                  โหมดการซ้อนภาพ (Blend Mode)
                </label>
                <select
                  value={selectedLayer.blendMode}
                  onChange={(e) => updateSelectedLayer({ blendMode: e.target.value as LayerBlendMode })}
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-2 text-xs text-[#101820] dark:text-[#F8FAFC]"
                >
                  {LAYER_BLEND_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateSelectedLayer({ flipX: !selectedLayer.flipX })}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <FlipHorizontal2 className="h-3.5 w-3.5" />
                  <span>พลิกแนวนอน</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedLayer({ flipY: !selectedLayer.flipY })}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <FlipVertical2 className="h-3.5 w-3.5" />
                  <span>พลิกแนวตั้ง</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. BACKGROUND REMOVAL */}
      {activeToolTab === 'bg' && (
        <div className="space-y-3.5">
          <button
            type="button"
            onClick={() => handleRemoveBackgroundOnLayer(false)}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
          >
            <Scissors className="h-4 w-4" />
            <span>ลบพื้นหลังอัตโนมัติ (โปร่งใส PNG)</span>
          </button>

          <button
            type="button"
            onClick={() => handleRemoveBackgroundOnLayer(true)}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-4 py-2 text-xs font-semibold text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Layers className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
            <span>แยกเป็นเลเยอร์ใหม่ (ซ้อน Parallax)</span>
          </button>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
              <span>ความไวในการตัดขอบ</span>
              <span className="font-mono-tabular">{bgTolerance}</span>
            </div>
            <input
              type="range"
              min={5}
              max={85}
              value={bgTolerance}
              onChange={(e) => setBgTolerance(Number(e.target.value))}
              className="w-full accent-[#2563EB]"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
              <span>ความนุ่มขอบ (Feather)</span>
              <span className="font-mono-tabular">{bgFeather}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={4}
              value={bgFeather}
              onChange={(e) => setBgFeather(Number(e.target.value))}
              className="w-full accent-[#2563EB]"
            />
          </div>

          <label className="flex items-center justify-between text-xs text-[#64748B] dark:text-slate-400 cursor-pointer">
            <span>ลบสีเดียวกันทุกจุด (Global Key)</span>
            <input
              type="checkbox"
              checked={bgGlobalKey}
              onChange={(e) => setBgGlobalKey(e.target.checked)}
              className="h-4 w-4 accent-[#2563EB]"
            />
          </label>

          <div className="border-t border-[#E2E8F0] dark:border-slate-800 pt-3 space-y-2">
            <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
              เครื่องมือจิ้ม/ระบายบนผืนผ้าใบ
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'wand' as PointerMode, label: 'จิ้มลบ', icon: Wand2 },
                { id: 'eraser' as PointerMode, label: 'ยางลบ', icon: Eraser },
                { id: 'restore' as PointerMode, label: 'ระบายคืน', icon: Paintbrush },
              ].map((m) => {
                const Ico = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPointerMode(pointerMode === m.id ? 'select' : m.id)}
                    className={`inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border text-xs font-medium cursor-pointer ${
                      pointerMode === m.id
                        ? 'border-[#2563EB] bg-[#2563EB] text-white'
                        : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                    }`}
                  >
                    <Ico className="h-3.5 w-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
              <span>ขนาดหัวแปรง</span>
              <span className="font-mono-tabular">{brushSize}px</span>
            </div>
            <input
              type="range"
              min={8}
              max={96}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-full accent-[#2563EB]"
            />
          </div>
        </div>
      )}

      {/* 3. THAI TEXT */}
      {activeToolTab === 'text' && (
        <div className="space-y-3.5">
          <button
            type="button"
            onClick={handleAddTextLayer}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>เพิ่มเลเยอร์ข้อความใหม่</span>
          </button>

          {selectedLayer?.type === 'text' ? (
            <div className="space-y-3 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
              <div>
                <label className="block text-[11px] text-[#64748B] dark:text-slate-400 mb-1">ข้อความ</label>
                <textarea
                  rows={2}
                  value={selectedLayer.text}
                  onChange={(e) => updateSelectedLayer({ text: e.target.value }, false)}
                  onBlur={() => commitProject(projectRef.current, true)}
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 text-sm text-[#101820] dark:text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#64748B] dark:text-slate-400 mb-1">ฟอนต์ภาษาไทย</label>
                <select
                  value={selectedLayer.fontFamily}
                  onChange={(e) => updateSelectedLayer({ fontFamily: e.target.value as ThaiStudioFontId })}
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-2 text-xs text-[#101820] dark:text-[#F8FAFC]"
                >
                  {THAI_STUDIO_FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
                  <span>ขนาดอักษร</span>
                  <span className="font-mono-tabular">{selectedLayer.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={18}
                  max={180}
                  value={selectedLayer.fontSize}
                  onChange={(e) => updateSelectedLayer({ fontSize: Number(e.target.value) }, false)}
                  onMouseUp={() => commitProject(projectRef.current, true)}
                  className="w-full accent-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5">
                  <span className="text-[11px]">สีตัวอักษร</span>
                  <input
                    type="color"
                    value={selectedLayer.color}
                    onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                    className="h-6 w-8 rounded border-0 bg-transparent cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5">
                  <span className="text-[11px]">สีเส้นขอบ</span>
                  <input
                    type="color"
                    value={selectedLayer.strokeColor}
                    onChange={(e) => updateSelectedLayer({ strokeColor: e.target.value })}
                    className="h-6 w-8 rounded border-0 bg-transparent cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {(['left', 'center', 'right'] as const).map((al) => {
                  const Ico = al === 'left' ? AlignLeft : al === 'center' ? AlignCenter : AlignRight;
                  return (
                    <button
                      key={al}
                      type="button"
                      onClick={() => updateSelectedLayer({ align: al })}
                      className={`inline-flex min-h-[38px] items-center justify-center rounded-lg border cursor-pointer ${
                        selectedLayer.align === al
                          ? 'border-[#2563EB] bg-[#2563EB] text-white'
                          : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                      }`}
                    >
                      <Ico className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => updateSelectedLayer({ bold: !selectedLayer.bold })}
                  className={`min-h-[38px] rounded-lg border font-bold cursor-pointer ${
                    selectedLayer.bold
                      ? 'border-[#2563EB] bg-[#2563EB] text-white'
                      : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                  }`}
                >
                  หนา
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedLayer({ shadow: !selectedLayer.shadow })}
                  className={`min-h-[38px] rounded-lg border cursor-pointer ${
                    selectedLayer.shadow
                      ? 'border-[#2563EB] bg-[#2563EB] text-white'
                      : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                  }`}
                >
                  เงา
                </button>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
                  <span>ความหนาขอบตัวอักษร</span>
                  <span className="font-mono-tabular">{selectedLayer.strokeWidth}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={16}
                  value={selectedLayer.strokeWidth}
                  onChange={(e) => updateSelectedLayer({ strokeWidth: Number(e.target.value) })}
                  className="w-full accent-[#2563EB]"
                />
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3 text-[11px] text-[#64748B] dark:text-slate-400">
              คลิกข้อความบนผืนผ้าใบ หรือกด &ldquo;เพิ่มเลเยอร์ข้อความใหม่&rdquo; เพื่อเลือกฟอนต์ไทยและปรับแต่งสี
            </p>
          )}
        </div>
      )}

      {/* 3.5 VECTOR SHAPES & PEN TOOL */}
      {activeToolTab === 'shapes' && (
        <div className="space-y-4">
          <div>
            <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400 mb-2">
              เพิ่มรูปทรง Vector พื้นฐาน
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'rect', label: 'สี่เหลี่ยม' },
                  { id: 'circle', label: 'วงกลม' },
                  { id: 'triangle', label: 'สามเหลี่ยม' },
                  { id: 'star', label: 'ดาว 5 แฉก' },
                  { id: 'polygon', label: 'หกเหลี่ยม' },
                  { id: 'line', label: 'เส้นตรง' },
                ] as Array<{ id: Exclude<ShapeKind, 'path'>; label: string }>
              ).map((sh) => (
                <button
                  key={sh.id}
                  type="button"
                  onClick={() => handleAddShapeLayer(sh.id)}
                  className="min-h-[38px] rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 text-[11px] font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer"
                >
                  + {sh.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5">
              <span className="text-[11px]">สีพื้นรูปทรง</span>
              <input
                type="color"
                value={selectedLayer?.type === 'shape' ? selectedLayer.fillColor : shapeFillColor}
                onChange={(e) => {
                  setShapeFillColor(e.target.value);
                  if (selectedLayer?.type === 'shape') {
                    updateSelectedLayer({ fillColor: e.target.value });
                  }
                }}
                className="h-6 w-8 rounded border-0 bg-transparent cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5">
              <span className="text-[11px]">สีเส้นขอบ</span>
              <input
                type="color"
                value={selectedLayer?.type === 'shape' ? selectedLayer.strokeColor : shapeStrokeColor}
                onChange={(e) => {
                  setShapeStrokeColor(e.target.value);
                  if (selectedLayer?.type === 'shape') {
                    updateSelectedLayer({ strokeColor: e.target.value });
                  }
                }}
                className="h-6 w-8 rounded border-0 bg-transparent cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
              <span>ความหนาเส้นขอบ</span>
              <span className="font-mono-tabular">
                {selectedLayer?.type === 'shape' ? selectedLayer.strokeWidth : shapeStrokeWidth}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={selectedLayer?.type === 'shape' ? selectedLayer.strokeWidth : shapeStrokeWidth}
              onChange={(e) => {
                const v = Number(e.target.value);
                setShapeStrokeWidth(v);
                if (selectedLayer?.type === 'shape') {
                  updateSelectedLayer({ strokeWidth: v }, false);
                }
              }}
              onMouseUp={() => {
                if (selectedLayer?.type === 'shape') commitProject(projectRef.current, true);
              }}
              className="w-full accent-[#2563EB]"
            />
          </div>

          {selectedLayer?.type === 'shape' && selectedLayer.shapeKind === 'rect' && (
            <div>
              <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
                <span>มุมโค้งสี่เหลี่ยม</span>
                <span className="font-mono-tabular">{selectedLayer.cornerRadius}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={120}
                value={selectedLayer.cornerRadius}
                onChange={(e) => updateSelectedLayer({ cornerRadius: Number(e.target.value) }, false)}
                onMouseUp={() => commitProject(projectRef.current, true)}
                className="w-full accent-[#2563EB]"
              />
            </div>
          )}

          <div className="border-t border-[#E2E8F0] dark:border-slate-800 pt-3 space-y-2">
            <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
              เครื่องมือปากกา Vector Pen Tool
            </span>
            <button
              type="button"
              onClick={() => {
                if (pointerMode === 'pen') {
                  setPointerMode('select');
                } else {
                  setPenPoints([]);
                  setPointerMode('pen');
                }
              }}
              className={`flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                pointerMode === 'pen'
                  ? 'border-[#2563EB] bg-[#2563EB] text-white'
                  : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
              }`}
            >
              <PenTool className="h-3.5 w-3.5" />
              <span>
                {pointerMode === 'pen'
                  ? 'กำลังวาด Pen Tool (คลิกจุดบนผืนผ้าใบ)'
                  : 'เริ่มวาดเส้นด้วย Vector Pen'}
              </span>
            </button>
            {pointerMode === 'pen' && (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={penPoints.length < 2}
                  onClick={handleCommitPenPath}
                  className="min-h-[38px] rounded-lg bg-[#2563EB] text-xs font-semibold text-white disabled:opacity-40 cursor-pointer"
                >
                  บันทึกเส้น ({penPoints.length} จุด)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPenPoints([]);
                    setPointerMode('select');
                  }}
                  className="min-h-[38px] rounded-lg border border-[#E2E8F0] dark:border-slate-700 text-xs cursor-pointer"
                >
                  ยกเลิกเส้น
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. KANOK FRAMES */}
      {activeToolTab === 'frames' && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#64748B] dark:text-slate-400">สีลายเส้นกรอบ</span>
            <div className="flex items-center gap-1.5">
              {['#2563EB', '#C9A24B', '#101820', '#FFFFFF'].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`ใช้สีกรอบ ${c}`}
                  onClick={() => commitProject((prev) => ({ ...prev, activeFrameColor: c }))}
                  className={`h-7 w-7 rounded-md border cursor-pointer ${
                    project.activeFrameColor === c ? 'border-[#2563EB] ring-2 ring-[#2563EB]' : 'border-[#E2E8F0] dark:border-slate-700'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={project.activeFrameColor}
                onChange={(e) => commitProject((prev) => ({ ...prev, activeFrameColor: e.target.value }))}
                className="h-7 w-8 rounded border border-[#E2E8F0] dark:border-slate-700 bg-transparent cursor-pointer"
              />
            </div>
          </div>

          {project.activeFrameId && (
            <button
              type="button"
              onClick={() => commitProject((prev) => ({ ...prev, activeFrameId: null }))}
              className="w-full min-h-[38px] rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 py-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 cursor-pointer"
            >
              นำกรอบกนกออก
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            {KANOK_FRAME_ASSETS.map((f) => {
              const selected = project.activeFrameId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => commitProject((prev) => ({ ...prev, activeFrameId: f.id }))}
                  className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                    selected
                      ? 'border-[#2563EB] bg-blue-50/70 dark:bg-[#0B1F3A]'
                      : 'border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A]/60 hover:border-[#2563EB]/60'
                  }`}
                >
                  <div
                    className="mb-1.5 aspect-[4/3] w-full rounded bg-slate-900 p-1"
                    dangerouslySetInnerHTML={{ __html: f.buildSvg(project.activeFrameColor, 200, 150) }}
                  />
                  <p className="text-[11px] font-medium text-[#101820] dark:text-[#F8FAFC] line-clamp-1">{f.name}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. KANOK STICKERS */}
      {activeToolTab === 'stickers' && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#64748B] dark:text-slate-400">สีสติกเกอร์ลายไทย</span>
            <div className="flex items-center gap-1.5">
              {['#2563EB', '#C9A24B', '#F59E0B', '#E11D48'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setStickerColor(c)}
                  className={`h-7 w-7 rounded-md border cursor-pointer ${
                    stickerColor === c ? 'border-[#2563EB] ring-2 ring-[#2563EB]' : 'border-[#E2E8F0] dark:border-slate-700'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={stickerColor}
                onChange={(e) => setStickerColor(e.target.value)}
                className="h-7 w-8 rounded border border-[#E2E8F0] dark:border-slate-700 bg-transparent cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {KANOK_STICKER_ASSETS.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => handleAddStickerLayer(st.id)}
                className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-2.5 text-center hover:border-[#2563EB] transition-colors cursor-pointer"
              >
                <div
                  className="mx-auto mb-1.5 flex h-16 w-16 items-center justify-center rounded bg-slate-900 p-1.5"
                  dangerouslySetInnerHTML={{ __html: st.buildSvg(stickerColor) }}
                />
                <p className="text-[11px] font-medium text-[#101820] dark:text-[#F8FAFC] line-clamp-1">{st.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 6. ADJUSTMENTS & FILTERS */}
      {activeToolTab === 'adjust' && (
        <div className="space-y-4">
          {selectedLayer?.type === 'image' ? (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {EDITOR_FILTER_PRESETS.map((preset) => {
                  const active = selectedLayer.adjustments.filter === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        updateSelectedLayer({
                          adjustments: { ...selectedLayer.adjustments, filter: preset.id },
                        })
                      }
                      className={`min-h-[38px] rounded-xl border px-2.5 py-1.5 text-[11px] font-medium cursor-pointer ${
                        active
                          ? 'border-[#2563EB] bg-[#2563EB] text-white font-semibold'
                          : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200 hover:border-[#2563EB]/60'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2.5 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                {[
                  { key: 'brightness' as keyof ImageAdjustments, label: 'ความสว่าง', min: -80, max: 80 },
                  { key: 'contrast' as keyof ImageAdjustments, label: 'คอนทราสต์', min: -80, max: 80 },
                  { key: 'saturation' as keyof ImageAdjustments, label: 'ความอิ่มสี', min: -100, max: 100 },
                  { key: 'warmth' as keyof ImageAdjustments, label: 'อุณหภูมิสี', min: -50, max: 50 },
                  { key: 'sharpness' as keyof ImageAdjustments, label: 'ความคมชัด (Sharpness)', min: 0, max: 100 },
                  { key: 'vignette' as keyof ImageAdjustments, label: 'ขอบมืด (Vignette)', min: 0, max: 100 },
                  { key: 'grain' as keyof ImageAdjustments, label: 'เกรนฟิล์ม (Grain)', min: 0, max: 100 },
                  { key: 'blur' as keyof ImageAdjustments, label: 'ความเบลอ (Blur)', min: 0, max: 16 },
                ].map((ctrl) => {
                  const val = Number(selectedLayer.adjustments[ctrl.key] || 0);
                  return (
                    <div key={String(ctrl.key)}>
                      <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
                        <span>{ctrl.label}</span>
                        <span className="font-mono-tabular">{val}</span>
                      </div>
                      <input
                        type="range"
                        min={ctrl.min}
                        max={ctrl.max}
                        value={val}
                        onChange={(e) =>
                          updateSelectedLayer(
                            {
                              adjustments: {
                                ...selectedLayer.adjustments,
                                [ctrl.key]: Number(e.target.value),
                              },
                            },
                            false
                          )
                        }
                        onMouseUp={() => commitProject(projectRef.current, true)}
                        className="w-full accent-[#2563EB]"
                      />
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => updateSelectedLayer({ adjustments: { ...DEFAULT_ADJUSTMENTS } })}
                  className="w-full min-h-[38px] rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-xs font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  รีเซ็ตแสงสีและฟิลเตอร์
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3 text-[#64748B] dark:text-slate-400">
              กรุณาคลิกเลือกเลเยอร์รูปภาพบนผืนผ้าใบ หรือในแท็บ &ldquo;ชั้นภาพ&rdquo; เพื่อปรับแสงสีและฟิลเตอร์
            </p>
          )}
        </div>
      )}

      {/* 7. CROP & CANVAS */}
      {activeToolTab === 'canvas' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
              สัดส่วนผืนผ้าใบมาตรฐาน
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {CANVAS_ASPECT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyCanvasDimensions(p.width, p.height, p.id)}
                  className={`min-h-[40px] rounded-xl border px-2.5 py-1.5 text-left text-[11px] cursor-pointer ${
                    project.aspectId === p.id
                      ? 'border-[#2563EB] bg-[#2563EB] text-white font-semibold'
                      : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                  }`}
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="font-mono-tabular opacity-80">
                    {p.width}×{p.height}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
            <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
              กำหนดขนาดผืนผ้าใบเอง (px)
            </span>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <input
                type="number"
                min={128}
                max={3840}
                value={customCanvasW}
                onChange={(e) => setCustomCanvasW(Number(e.target.value) || 1080)}
                aria-label="ความกว้าง px"
                className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 font-mono-tabular text-xs text-[#101820] dark:text-[#F8FAFC]"
              />
              <input
                type="number"
                min={128}
                max={3840}
                value={customCanvasH}
                onChange={(e) => setCustomCanvasH(Number(e.target.value) || 1080)}
                aria-label="ความสูง px"
                className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 font-mono-tabular text-xs text-[#101820] dark:text-[#F8FAFC]"
              />
              <button
                type="button"
                onClick={() => applyCanvasDimensions(customCanvasW, customCanvasH, 'custom')}
                className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
              >
                ปรับ
              </button>
            </div>
          </div>

          <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
            <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400">พื้นหลังผืนผ้าใบ</span>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: 'โปร่งใส', val: 'transparent' },
                { label: 'ขาว', val: '#FFFFFF' },
                { label: 'กรมท่า', val: '#0B1F3A' },
                { label: 'ดำ', val: '#000000' },
              ].map((bg) => (
                <button
                  key={bg.val}
                  type="button"
                  onClick={() => commitProject((prev) => ({ ...prev, backgroundColor: bg.val }))}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] cursor-pointer ${
                    project.backgroundColor === bg.val
                      ? 'border-[#2563EB] bg-[#2563EB] text-white font-semibold'
                      : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                  }`}
                >
                  {bg.label}
                </button>
              ))}
              <input
                type="color"
                value={project.backgroundColor === 'transparent' ? '#FFFFFF' : project.backgroundColor}
                onChange={(e) => commitProject((prev) => ({ ...prev, backgroundColor: e.target.value }))}
                className="h-8 w-9 rounded border border-[#E2E8F0] dark:border-slate-700 bg-transparent cursor-pointer"
              />
            </div>
          </div>

          {selectedLayer && (
            <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
              <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400">หมุนเลเยอร์ทีละ 90°</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateSelectedLayer({ rotation: selectedLayer.rotation - 90 })}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>หมุนซ้าย 90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedLayer({ rotation: selectedLayer.rotation + 90 })}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>หมุนขวา 90°</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. EXPORT, PSD & SAVE TO VAULT */}
      {activeToolTab === 'export' && (
        <div className="space-y-4">
          {project.mode === 'still' ? (
            <div className="space-y-3">
              <div>
                <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400 mb-1.5">
                  ความละเอียดตอนส่งออก
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {([1, 2, 4] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStillScale(s)}
                      className={`min-h-[38px] rounded-lg border font-mono-tabular text-xs font-semibold cursor-pointer ${
                        stillScale === s
                          ? 'border-[#2563EB] bg-[#2563EB] text-white'
                          : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400 mb-1.5">
                  รูปแบบไฟล์
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'png' as StillExportFormat, label: 'PNG โปร่งใส' },
                    { id: 'jpg' as StillExportFormat, label: 'JPG ขนาดเล็ก' },
                    { id: 'webp' as StillExportFormat, label: 'WebP คมชัด' },
                    { id: 'pdf' as StillExportFormat, label: 'PDF พิมพ์' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStillFormat(f.id)}
                      className={`min-h-[38px] rounded-lg border text-xs font-medium cursor-pointer ${
                        stillFormat === f.id
                          ? 'border-[#2563EB] bg-[#2563EB] text-white font-semibold'
                          : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {(stillFormat === 'jpg' || stillFormat === 'webp' || stillFormat === 'pdf') && (
                <div>
                  <div className="flex justify-between text-[11px] text-[#64748B] dark:text-slate-400">
                    <span>คุณภาพไฟล์</span>
                    <span className="font-mono-tabular">{stillQuality}%</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    value={stillQuality}
                    onChange={(e) => setStillQuality(Number(e.target.value))}
                    className="w-full accent-[#2563EB]"
                  />
                </div>
              )}

              <button
                type="button"
                disabled={exportBusy}
                onClick={handleExportStill}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>{exportBusy ? 'กำลังสร้างไฟล์...' : `ดาวน์โหลดภาพนิ่ง .${stillFormat.toUpperCase()}`}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400 mb-1.5">
                  คุณภาพการเรนเดอร์เคลื่อนไหว
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'standard' as AnimationQuality, label: 'มาตรฐาน (เร็ว)' },
                    { id: 'high' as AnimationQuality, label: 'คมชัดสูง (HD)' },
                  ].map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setAnimQuality(q.id)}
                      className={`min-h-[38px] rounded-lg border text-xs font-medium cursor-pointer ${
                        animQuality === q.id
                          ? 'border-[#2563EB] bg-[#2563EB] text-white font-semibold'
                          : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {exportProgress !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono-tabular text-[#2563EB] dark:text-[#60A5FA]">
                    <span>กำลังเรนเดอร์เฟรม...</span>
                    <span>{exportProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full bg-[#2563EB] transition-all"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={exportBusy}
                onClick={handleExportGif}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50"
              >
                <Film className="h-4 w-4" />
                <span>ส่งออก GIF เคลื่อนไหว</span>
              </button>

              <button
                type="button"
                disabled={exportBusy}
                onClick={handleExportVideo}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] py-2.5 text-xs font-semibold text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                <Download className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>ส่งออกวิดีโอ (MP4 / WebM)</span>
              </button>
            </div>
          )}

          <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
            <button
              type="button"
              disabled={exportBusy}
              onClick={handleExportPsd}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] py-2.5 text-xs font-semibold text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <FileCode2 className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>ส่งออกไฟล์ .PSD (แยก {project.layers.length} เลเยอร์)</span>
            </button>

            <button
              type="button"
              disabled={savingVault}
              onClick={handleSaveProjectToVault}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[#2563EB]/40 bg-blue-50 dark:bg-[#0B1F3A] py-2.5 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-blue-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <BookmarkPlus className="h-4 w-4" />
              <span>
                {savingVault
                  ? 'กำลังบันทึกโปรเจกต์ลงคลัง...'
                  : user
                    ? 'บันทึกลงคลังส่วนตัว (PNG + โปรเจกต์)'
                    : 'เข้าสู่ระบบ Google เพื่อบันทึกคลัง'}
              </span>
            </button>

            {onSaveStudioProjectToCloud && user && (
              <button
                type="button"
                disabled={savingVault}
                onClick={async () => {
                  try {
                    setSavingVault(true);
                    await onSaveStudioProjectToCloud({
                      title: project.title || 'ZImage Studio Project',
                      kind: 'editor',
                      projectJson: JSON.stringify(project),
                    });
                    showToast('บันทึกโปรเจกต์เข้าหน้า Dashboard Cloud เรียบร้อย');
                  } catch (err) {
                    setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึก Cloud Project ได้');
                  } finally {
                    setSavingVault(false);
                  }
                }}
                className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] py-2 text-xs font-medium text-[#101820] dark:text-slate-200 hover:bg-[#F7F9FC] dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                <Layers className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>บันทึกโปรเจกต์ลง Cloud Projects</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-3 py-4 sm:px-5 space-y-3">
      <input
        ref={uploadNewLayerInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleAddImageLayerFromFile(e, false)}
        className="hidden"
      />
      <input
        ref={uploadMainImageInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleAddImageLayerFromFile(e, true)}
        className="hidden"
      />
      <input
        ref={psdImportInputRef}
        type="file"
        accept=".psd"
        onChange={handleImportPsdFile}
        className="hidden"
      />

      {/* Top Studio Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] px-3 py-2.5 sm:px-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Still vs Motion Mode Switcher */}
          <div className="inline-flex rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-0.5">
            {(['still', 'motion'] as StudioMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  commitProject((prev) => ({ ...prev, mode: m }));
                }}
                className={`min-h-[36px] rounded-lg px-3.5 text-xs font-semibold cursor-pointer transition-colors ${
                  project.mode === m
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#64748B] dark:text-slate-400 hover:text-[#101820] dark:hover:text-white'
                }`}
              >
                {m === 'still' ? 'ภาพนิ่ง' : 'เคลื่อนไหว'}
              </button>
            ))}
          </div>

          <span className="hidden md:inline font-mono-tabular text-xs text-[#64748B] dark:text-slate-400">
            {project.canvasWidth} × {project.canvasHeight} px
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={historyCursor <= 0}
            onClick={handleUndo}
            aria-label="ย้อนกลับ (Ctrl+Z)"
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-xs text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">ย้อนกลับ</span>
          </button>

          <button
            type="button"
            disabled={historyCursor >= historyStack.length - 1}
            onClick={handleRedo}
            aria-label="ทำซ้ำ (Ctrl+Shift+Z)"
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-xs text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <Redo2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">ทำซ้ำ</span>
          </button>

          <button
            type="button"
            onPointerDown={() => setHoldCompareOriginal(true)}
            onPointerUp={() => setHoldCompareOriginal(false)}
            onPointerLeave={() => setHoldCompareOriginal(false)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-xs text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
            <span className="hidden md:inline">เทียบต้นฉบับ</span>
          </button>

          <button
            type="button"
            onClick={() => psdImportInputRef.current?.click()}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-xs text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <FileCode2 className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
            <span className="hidden sm:inline">นำเข้า .PSD</span>
          </button>

          <button
            type="button"
            onClick={() => uploadMainImageInputRef.current?.click()}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-xs text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
            <span className="hidden sm:inline">เปิดภาพใหม่</span>
          </button>

          <button
            type="button"
            disabled={savingVault}
            onClick={handleSaveProjectToVault}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            <span>{savingVault ? 'กำลังบันทึก...' : 'บันทึกคลัง'}</span>
          </button>
        </div>
      </div>

      {toastMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-[#0B1F3A] px-3.5 py-2 text-xs text-[#2563EB] dark:text-[#60A5FA]">
          <Check className="h-4 w-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-3.5 py-2 text-xs text-red-700 dark:text-red-200">
          {errorMsg}
        </div>
      )}

      {/* Main 3-Zone Studio Grid (Desktop): Left Tool Rail | Center Interactive Canvas | Right Inspector */}
      <div className="grid gap-3 lg:grid-cols-[88px_1fr_340px] lg:items-start">
        {/* Desktop Left Tool Rail */}
        <aside
          aria-label="แถบเครื่องมือสตูดิโอ"
          className="hidden lg:flex flex-col gap-1.5 rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-2 shadow-sm"
        >
          {toolItems.map((t) => {
            const Icon = t.icon;
            const active = activeToolTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveToolTab(t.id);
                  if (t.id !== 'bg' && (pointerMode === 'wand' || pointerMode === 'eraser' || pointerMode === 'restore')) {
                    setPointerMode('select');
                  }
                }}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium text-center transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#2563EB] text-white font-semibold'
                    : 'text-[#64748B] dark:text-slate-400 hover:bg-[#F7F9FC] dark:hover:bg-[#0B1F3A] hover:text-[#101820] dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="leading-tight">{t.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Center Interactive Canvas Stage */}
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-3 space-y-2.5 shadow-sm">
          {/* Canvas Sub-Toolbar (Pointer / Grid / Snap / Zoom) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPointerMode('select')}
                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium cursor-pointer ${
                  pointerMode === 'select'
                    ? 'bg-[#2563EB] text-white font-semibold'
                    : 'bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-300'
                }`}
              >
                <MousePointer className="h-3.5 w-3.5" />
                <span>เลือก/ย้าย</span>
              </button>
              <button
                type="button"
                onClick={() => setPointerMode('pan')}
                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium cursor-pointer ${
                  pointerMode === 'pan'
                    ? 'bg-[#2563EB] text-white font-semibold'
                    : 'bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-300'
                }`}
              >
                <Hand className="h-3.5 w-3.5" />
                <span>เลื่อนมุมมอง</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGrid((g) => !g)}
                aria-label="เปิด/ปิดเส้นกริด"
                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium cursor-pointer ${
                  showGrid
                    ? 'bg-blue-50 dark:bg-[#0B1F3A] text-[#2563EB] dark:text-[#60A5FA] border border-[#2563EB]'
                    : 'bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-300'
                }`}
              >
                <Grid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">กริด</span>
              </button>
              <button
                type="button"
                onClick={() => setSnapEnabled((s) => !s)}
                aria-label="เปิด/ปิดแม่เหล็กจัดกึ่งกลาง"
                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium cursor-pointer ${
                  snapEnabled
                    ? 'bg-blue-50 dark:bg-[#0B1F3A] text-[#2563EB] dark:text-[#60A5FA] border border-[#2563EB]'
                    : 'bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-300'
                }`}
              >
                <Magnet className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ดูดเส้น</span>
              </button>
            </div>

            <div className="flex items-center gap-1 text-xs font-mono-tabular">
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.max(25, z - 25))}
                className="h-8 w-8 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200 cursor-pointer"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoomPercent(100);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="h-8 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-[#101820] dark:text-slate-200 cursor-pointer"
              >
                {zoomPercent}%
              </button>
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.min(250, z + 25))}
                className="h-8 w-8 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Interactive Canvas Surface */}
          <div
            ref={viewportRef}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                setZoomPercent((z) =>
                  Math.max(25, Math.min(250, z + (e.deltaY < 0 ? 15 : -15)))
                );
              }
            }}
            className="checkerboard-stage relative flex min-h-[360px] max-h-[600px] items-center justify-center overflow-hidden rounded-xl border border-[#E2E8F0] dark:border-slate-800 p-3 select-none"
          >
            {loadingProject ? (
              <p className="text-sm text-[#64748B] dark:text-slate-400">กำลังเตรียมเลเยอร์บนผืนผ้าใบ...</p>
            ) : (
              <div
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomPercent / 100})`,
                  transformOrigin: 'center center',
                }}
                className="transition-transform duration-75"
              >
                <canvas
                  ref={canvasRef}
                  data-testid="zimage-editor-canvas"
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerLeave={handleCanvasPointerUp}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '460px',
                    width: 'auto',
                    height: 'auto',
                    touchAction: 'none',
                  }}
                  className={`rounded shadow-lg ${
                    pointerMode === 'pan' || spacePressed
                      ? 'cursor-grab'
                      : pointerMode === 'wand' || pointerMode === 'pen'
                        ? 'cursor-crosshair'
                        : 'cursor-move'
                  }`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Desktop Right Inspector Panel */}
        <aside className="hidden lg:block rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 shadow-sm">
          <h2 className="mb-3 font-display text-sm font-semibold text-[#101820] dark:text-[#F8FAFC] border-b border-[#E2E8F0] dark:border-slate-800 pb-2">
            {toolItems.find((t) => t.id === activeToolTab)?.label}
          </h2>
          {renderToolInspector()}
        </aside>
      </div>

      {/* Mobile Scrollable Tool Rail directly below canvas (opens Slide-up Bottom Sheet) */}
      <div className="lg:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-2">
          {toolItems.map((t) => {
            const Icon = t.icon;
            const active = mobileSheetOpen && activeToolTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveToolTab(t.id);
                  setMobileSheetOpen(true);
                }}
                className={`inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                  active
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200 border border-[#E2E8F0] dark:border-slate-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {mobileSheetOpen && (
          <div
            role="dialog"
            aria-label="แผงปรับแต่งสตูดิโอ"
            className="fixed inset-x-0 bottom-0 z-[60] max-h-[76vh] overflow-y-auto rounded-t-3xl border-t border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between border-b border-[#E2E8F0] dark:border-slate-800 pb-2.5">
              <span className="font-display text-base font-semibold text-[#101820] dark:text-[#F8FAFC]">
                {toolItems.find((t) => t.id === activeToolTab)?.label}
              </span>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                aria-label="ปิดแผงเครื่องมือ"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderToolInspector()}
          </div>
        )}
      </div>

      {/* Motion Mode Timeline Dock (visible when project.mode === 'motion') */}
      {project.mode === 'motion' && (
        <section
          aria-label="ไทม์ไลน์ภาพเคลื่อนไหว"
          className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 space-y-3 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (playheadSec >= project.durationSec) setPlayheadSec(0);
                  setIsPlaying((p) => !p);
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                <span>{isPlaying ? 'หยุดชั่วคราว' : 'เล่นตัวอย่าง'}</span>
              </button>

              <button
                type="button"
                onClick={() => commitProject((prev) => ({ ...prev, loopPlayback: !prev.loopPlayback }))}
                className={`inline-flex min-h-[38px] items-center gap-1 rounded-lg border px-2.5 text-xs cursor-pointer ${
                  project.loopPlayback
                    ? 'border-[#2563EB] bg-blue-50 dark:bg-[#0B1F3A] text-[#2563EB] dark:text-[#60A5FA]'
                    : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-400'
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                <span>วนลูป</span>
              </button>

              <span className="font-mono-tabular text-xs text-[#101820] dark:text-[#F8FAFC]">
                {playheadSec.toFixed(1)}s / {project.durationSec}s
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-slate-400">
                <span>ความยาว:</span>
                <select
                  value={project.durationSec}
                  onChange={(e) =>
                    commitProject((prev) => ({ ...prev, durationSec: Number(e.target.value) }))
                  }
                  className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 py-1 text-xs text-[#101820] dark:text-[#F8FAFC]"
                >
                  {[2, 3, 4, 5, 6, 8, 10, 12, 15].map((s) => (
                    <option key={s} value={s}>
                      {s} วินาที
                    </option>
                  ))}
                </select>
              </label>

              <label className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-slate-400">
                <span>FPS:</span>
                <select
                  value={project.fps}
                  onChange={(e) =>
                    commitProject((prev) => ({ ...prev, fps: Number(e.target.value) as 24 | 30 }))
                  }
                  className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 py-1 text-xs text-[#101820] dark:text-[#F8FAFC]"
                >
                  <option value={24}>24 FPS</option>
                  <option value={30}>30 FPS</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() =>
                  commitProject((prev) => ({ ...prev, parallaxEnabled: !prev.parallaxEnabled }))
                }
                className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-medium cursor-pointer ${
                  project.parallaxEnabled
                    ? 'border-[#2563EB] bg-[#2563EB] text-white font-semibold'
                    : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-300'
                }`}
              >
                Parallax ต่างระดับ
              </button>
            </div>
          </div>

          {/* Playhead Scrubber */}
          <input
            type="range"
            min={0}
            max={project.durationSec}
            step={0.05}
            value={playheadSec}
            onChange={(e) => {
              setIsPlaying(false);
              setPlayheadSec(Number(e.target.value));
            }}
            aria-label="เลื่อนเวลาบนไทม์ไลน์"
            className="w-full accent-[#2563EB]"
          />

          {/* 8 One-Click Motion Presets + Keyframe Controls */}
          <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                พรีเซ็ตการเคลื่อนไหวสำเร็จรูป (1 คลิกใส่ให้ชั้นที่เลือก: {selectedLayer?.name || '—'})
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  value={keyframeEasing}
                  onChange={(e) => setKeyframeEasing(e.target.value as EasingType)}
                  className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2 py-1 text-[11px] text-[#101820] dark:text-[#F8FAFC]"
                >
                  {EASING_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedLayer}
                  onClick={handleAddOrUpdateKeyframe}
                  className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1 text-[11px] font-semibold text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                >
                  + ปักคีย์เฟรม ณ {playheadSec.toFixed(1)}s
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {MOTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyMotionPreset(preset.id)}
                  className="min-h-[36px] rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-1.5 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

    </div>
  );
}
