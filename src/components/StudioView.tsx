import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Dices,
  Download,
  Eye,
  EyeOff,
  History,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Lock,
  Maximize2,
  PenLine,
  RefreshCw,
  Scissors,
  Sliders,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import {
  ASPECT_RATIOS,
  BLUEPRINT_LIMITS,
  DEFAULT_DAILY_GENERATION_LIMIT,
  PHOTOREALISM_PRESETS,
  RECRAFT_MODEL,
  STYLE_PRESETS,
  VISION_PROMPT_MODEL,
  WIRED_IMAGE_MODELS,
  WIRED_VISION_MODELS,
  appendStyleToPrompt,
  buildUnlimitedStructuredPrompt,
  clampCustomPixelDimensions,
  mapCustomDimensionsToAspectRatio,
  measurePromptStats,
} from '../utils/promptLogic';
import type {
  AspectRatioId,
  PhotorealismPresetId,
  PromptEditorMode,
  StylePresetId,
} from '../utils/promptLogic';
import {
  convertUrlToPngDataUrl,
  downloadUrlAsPng,
  loadHtmlImage,
  removeBackgroundFromUrl,
  resizeUrlToExactPixels,
} from '../utils/canvasImageHelper';
import { CURATED_SHOWCASE_ITEMS } from '../data/showcasePresets';
import type { ShowcaseItem } from '../data/showcasePresets';
import type { LightboxImageData } from './LightboxModal';

export interface SessionCreation {
  id: string;
  originalPrompt: string;
  enhancedPrompt: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
  stylePreset: StylePresetId;
  photorealismPreset?: PhotorealismPresetId;
  aspectRatio: AspectRatioId;
  dimensionsLabel?: string;
  imageUrl: string;
  originalImageUrl?: string;
  bgRemoved?: boolean;
  durationMs: number;
  savedDocId?: string;
  createdAtIso: string;
}

export interface QuotaSnapshot {
  limit: number;
  used: number;
  remaining: number;
  dateKey?: string;
}

export interface PromptHistoryEntry {
  id: string;
  mode: PromptEditorMode;
  originalPrompt: string;
  enhancedPrompt: string;
  negativePrompt: string;
  stylePreset: StylePresetId;
  photorealismPreset: PhotorealismPresetId;
  aspectRatio: AspectRatioId;
  seed: string;
  createdAtIso: string;
}

interface PaletteOption {
  id: string;
  label: string;
  colors: number[][];
  swatches: string[];
}

const PALETTE_OPTIONS: PaletteOption[] = [
  { id: 'none', label: 'อิสระตามพรอมต์', colors: [], swatches: [] },
  {
    id: 'cobalt-slate',
    label: 'Cobalt & Crisp Slate',
    colors: [[11, 31, 58], [37, 99, 235], [247, 249, 252]],
    swatches: ['#0B1F3A', '#2563EB', '#F7F9FC'],
  },
  {
    id: 'editorial',
    label: 'Warm Editorial',
    colors: [[212, 163, 115], [250, 237, 205], [40, 54, 24]],
    swatches: ['#D4A373', '#FAEDCD', '#283618'],
  },
  {
    id: 'botanical',
    label: 'Sage & Coral',
    colors: [[16, 185, 129], [249, 115, 22], [236, 253, 245]],
    swatches: ['#10B981', '#F97316', '#ECFDF5'],
  },
];

const BATCH_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

const PROMPT_MODE_OPTIONS: Array<{ id: PromptEditorMode; label: string; hint: string }> = [
  { id: 'simple', label: 'Simple', hint: 'คำอธิบายสั้นและภาพอ้างอิง' },
  { id: 'advanced', label: 'Advanced', hint: 'เพิ่ม Negative Prompt, Seed และ Photorealism' },
  { id: 'professional', label: 'Professional', hint: 'กำหนดกล้อง แสง องค์ประกอบ และโมเดล' },
  { id: 'unlimited', label: 'Unlimited', hint: 'โครงสร้างละเอียด 9 ช่อง ไม่จำกัดความยาว' },
];

const CUSTOM_PIXEL_PRESETS = [
  { label: '1080×1080', w: 1080, h: 1080 },
  { label: '1920×1080', w: 1920, h: 1080 },
  { label: '1080×1920', w: 1080, h: 1920 },
  { label: '1200×630', w: 1200, h: 630 },
];

async function compressReferenceFileToDataUrl(file: File): Promise<string> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('ไม่สามารถอ่านไฟล์ภาพได้'));
    };
    reader.onerror = () => reject(new Error('เกิดข้อผิดพลาดในการอ่านไฟล์'));
    reader.readAsDataURL(file);
  });

  const img = await loadHtmlImage(rawUrl);
  const maxDim = 960;
  let w = img.naturalWidth || 800;
  let h = img.naturalHeight || 800;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.86);
}

interface StudioViewProps {
  user: User | null;
  ideaInput: string;
  onIdeaInputChange: (val: string) => void;
  enhancedPrompt: string;
  onEnhancedPromptChange: (val: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (val: string) => void;
  stylePreset: StylePresetId;
  onStylePresetChange: (val: StylePresetId) => void;
  photorealismPreset: PhotorealismPresetId;
  onPhotorealismPresetChange: (val: PhotorealismPresetId) => void;
  aspectRatio: AspectRatioId;
  onAspectRatioChange: (val: AspectRatioId) => void;
  seedValue: string;
  onSeedValueChange: (val: string) => void;
  promptMode: PromptEditorMode;
  onPromptModeChange: (val: PromptEditorMode) => void;
  textInImage: string;
  onTextInImageChange: (val: string) => void;
  sessionCreations: SessionCreation[];
  activeCreation: SessionCreation | null;
  onSelectActiveCreation: (creation: SessionCreation) => void;
  onCreationAdded: (creation: SessionCreation) => void;
  onBatchCreated?: (creations: SessionCreation[]) => void;
  onUpdateSessionCreation: (id: string, patch: Partial<SessionCreation>) => void;
  onRemoveSessionCreation: (id: string) => void;
  onSaveCreation: (creation: SessionCreation) => Promise<void>;
  onSavePromptToCloud?: (payload: {
    title: string;
    originalPrompt: string;
    enhancedPrompt: string;
    negativePrompt: string;
    stylePreset: StylePresetId;
    photorealismPreset: PhotorealismPresetId;
    aspectRatio: AspectRatioId;
    model: string;
  }) => Promise<void>;
  onRequireSignIn: () => void;
  onOpenLightbox: (item: LightboxImageData) => void;
  onOpenInEditor: (item: LightboxImageData) => void;
  onOpenInDecompose?: (item: LightboxImageData) => void;
  onContinuePrompt: (item: LightboxImageData) => void;
  autoSaveEnabled: boolean;
  onToggleAutoSave: (val: boolean) => void;
  quota: QuotaSnapshot;
  onQuotaChange: (q: QuotaSnapshot) => void;
}

export function StudioView({
  user,
  ideaInput,
  onIdeaInputChange,
  enhancedPrompt,
  onEnhancedPromptChange,
  negativePrompt,
  onNegativePromptChange,
  stylePreset,
  onStylePresetChange,
  photorealismPreset,
  onPhotorealismPresetChange,
  aspectRatio,
  onAspectRatioChange,
  seedValue,
  onSeedValueChange,
  promptMode,
  onPromptModeChange,
  textInImage,
  onTextInImageChange,
  sessionCreations,
  activeCreation,
  onSelectActiveCreation,
  onCreationAdded,
  onBatchCreated,
  onUpdateSessionCreation,
  onRemoveSessionCreation,
  onSaveCreation,
  onSavePromptToCloud,
  onRequireSignIn,
  onOpenLightbox,
  onOpenInEditor,
  onOpenInDecompose,
  onContinuePrompt,
  autoSaveEnabled,
  onToggleAutoSave,
  quota,
  onQuotaChange,
}: StudioViewProps) {
  const refInputRef = useRef<HTMLInputElement | null>(null);
  const ideaTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [batchCount, setBatchCount] = useState<number>(1);
  const [customWidthPx, setCustomWidthPx] = useState<number>(1200);
  const [customHeightPx, setCustomHeightPx] = useState<number>(800);
  const [selectedImageModel, setSelectedImageModel] = useState<string>(RECRAFT_MODEL);
  const [selectedVisionModel, setSelectedVisionModel] = useState<string>(VISION_PROMPT_MODEL);

  // Structured 9-field controls
  const [subjectDetails, setSubjectDetails] = useState('');
  const [environment, setEnvironment] = useState('');
  const [composition, setComposition] = useState('');
  const [cameraAndLens, setCameraAndLens] = useState('');
  const [lighting, setLighting] = useState('');
  const [styleInstructions, setStyleInstructions] = useState('');
  const [qualityEnhancements, setQualityEnhancements] = useState('');

  const [showPromptExpert, setShowPromptExpert] = useState(false);
  const [showStagePrompt, setShowStagePrompt] = useState(false);
  const [showAdvancedPalette, setShowAdvancedPalette] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [selectedPaletteId, setSelectedPaletteId] = useState<string>('none');
  const [enhancing, setEnhancing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [varyingId, setVaryingId] = useState<string | null>(null);
  const [removingBg, setRemovingBg] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState<0 | 1 | 2 | 3>(0);
  const [stageMessage, setStageMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCanRetry, setErrorCanRetry] = useState(false);
  const [refusedNotice, setRefusedNotice] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savedPromptOk, setSavedPromptOk] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [promptEngineLabel, setPromptEngineLabel] = useState<string | null>(null);
  const [lastBatchIds, setLastBatchIds] = useState<string[]>([]);
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);

  const structuredBundle = useMemo(
    () =>
      buildUnlimitedStructuredPrompt({
        mode: promptMode,
        mainPrompt: ideaInput,
        negativePrompt,
        subjectDetails,
        environment,
        composition,
        cameraAndLens,
        lighting,
        styleInstructions,
        qualityEnhancements,
        photorealismPreset,
      }),
    [
      promptMode,
      ideaInput,
      negativePrompt,
      subjectDetails,
      environment,
      composition,
      cameraAndLens,
      lighting,
      styleInstructions,
      qualityEnhancements,
      photorealismPreset,
    ]
  );

  const inputStats = useMemo(
    () => measurePromptStats(structuredBundle.combinedPrompt || ideaInput),
    [structuredBundle.combinedPrompt, ideaInput]
  );
  const enhancedStats = useMemo(() => measurePromptStats(enhancedPrompt), [enhancedPrompt]);
  const clampedCustom = clampCustomPixelDimensions(customWidthPx, customHeightPx);

  const fetchQuota = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (user) {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      }
      const res = await fetch('/api/quota', { headers });
      if (res.ok) {
        const data = (await res.json()) as QuotaSnapshot;
        onQuotaChange(data);
      }
    } catch {
      // Non-fatal
    }
  }, [user, onQuotaChange]);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  const activeRatioCss = (() => {
    const ratioId = activeCreation?.aspectRatio || aspectRatio;
    if (ratioId === 'custom') {
      return `${clampedCustom.width} / ${clampedCustom.height}`;
    }
    return ASPECT_RATIOS.find((a) => a.id === ratioId)?.cssRatio || '16 / 9';
  })();

  const handleIdeaChange = (nextText: string) => {
    onIdeaInputChange(nextText);
    if (enhancedPrompt) {
      onEnhancedPromptChange('');
    }
  };

  const handleStyleClick = (nextStyle: StylePresetId) => {
    onStylePresetChange(nextStyle);
    if (enhancedPrompt.trim() && nextStyle !== 'auto') {
      onEnhancedPromptChange(appendStyleToPrompt(enhancedPrompt, nextStyle));
    }
  };

  const handleAttachFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setErrorMessage(null);
    setErrorCanRetry(false);
    const remaining = Math.max(0, 3 - referenceImages.length);
    const toProcess = list.slice(0, remaining);
    if (toProcess.length === 0) {
      setErrorMessage('แนบภาพอ้างอิงได้สูงสุด 3 ภาพต่อพรอมต์');
      return;
    }
    try {
      const encoded = await Promise.all(toProcess.map(compressReferenceFileToDataUrl));
      setReferenceImages((prev) => [...prev, ...encoded].slice(0, 3));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ไม่สามารถแนบภาพอ้างอิงได้');
    }
  };

  const handleIdeaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imgFiles.push(file);
      }
    }
    if (imgFiles.length > 0) {
      e.preventDefault();
      handleAttachFiles(imgFiles);
    }
  };

  const buildAuthHeaders = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user) {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    }
    return headers;
  };

  const requestPromptEnhancement = async (
    combinedDescription: string,
    style: StylePresetId,
    overlayText: string,
    refs: string[]
  ): Promise<
    { ok: true; prompt: string; engine: string } | { ok: false; refused: boolean; error: string }
  > => {
    const headers = await buildAuthHeaders();
    const res = await fetch('/api/enhance-prompt', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        description: combinedDescription,
        stylePreset: style,
        photorealismPreset,
        negativePrompt,
        visionModel: selectedVisionModel,
        preserveUnlimitedLength: true,
        textInImage: overlayText,
        referenceImages: refs,
      }),
    });
    const data = (await res.json()) as {
      status?: string;
      enhancedPrompt?: string;
      engine?: string;
      error?: string;
    };
    if (data.status === 'refused') {
      return {
        ok: false,
        refused: true,
        error: 'REFUSE — คำขอนี้ไม่สอดคล้องกับนโยบายความปลอดภัย กรุณาปรับเปลี่ยนคำอธิบาย',
      };
    }
    if (!res.ok || !data.enhancedPrompt) {
      return {
        ok: false,
        refused: false,
        error: data.error || 'ไม่สามารถเรียบเรียงพรอมต์ได้ในขณะนี้',
      };
    }
    return {
      ok: true,
      prompt: data.enhancedPrompt,
      engine: data.engine || selectedVisionModel,
    };
  };

  const handleEnhanceOnly = async () => {
    const combined = structuredBundle.combinedPrompt.trim();
    if (!combined && referenceImages.length === 0) {
      setErrorMessage('กรุณากรอกคำอธิบายภาพหรือแนบภาพอ้างอิงก่อนกดเรียบเรียงพรอมต์');
      setErrorCanRetry(false);
      setRefusedNotice(false);
      return;
    }

    setErrorMessage(null);
    setErrorCanRetry(false);
    setRefusedNotice(false);
    setEnhancing(true);
    setPipelineStep(1);

    try {
      const result = await requestPromptEnhancement(
        combined,
        stylePreset,
        textInImage,
        referenceImages
      );
      if (!result.ok) {
        setRefusedNotice(result.refused);
        setErrorMessage(result.error);
        setErrorCanRetry(!result.refused);
        if (result.refused) {
          onEnhancedPromptChange('');
        }
        return;
      }
      setPipelineStep(2);
      onEnhancedPromptChange(result.prompt);
      setPromptEngineLabel(result.engine);
      setShowPromptExpert(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? `เชื่อมต่อไม่สำเร็จ: ${err.message}` : 'เกิดข้อผิดพลาดในการเชื่อมต่อ'
      );
      setErrorCanRetry(true);
    } finally {
      setEnhancing(false);
    }
  };

  const executeGeneration = async () => {
    const combinedInput = structuredBundle.combinedPrompt.trim();
    let promptToUse = enhancedPrompt.trim();

    if (!combinedInput && !promptToUse && referenceImages.length === 0) {
      setErrorMessage('กรุณากรอกคำอธิบายภาพ แนบภาพอ้างอิง หรือกรอกพรอมต์ก่อนสร้างภาพ');
      setErrorCanRetry(false);
      setRefusedNotice(false);
      return;
    }

    if (aspectRatio === 'custom' && !clampedCustom.valid) {
      setErrorMessage('กรุณาระบุขนาดความกว้างและความสูงเป็น px ระหว่าง 64 ถึง 4,096 px');
      setErrorCanRetry(false);
      return;
    }

    if (quota.remaining <= 0) {
      setErrorMessage(
        `ใช้โควตาสร้างภาพ AI ครบ ${quota.limit} ภาพต่อวันแล้ว กรุณาลองใหม่พรุ่งนี้ (สตูดิโอแต่งภาพ แยกเลเยอร์ และตัดต่อวิดีโอยังใช้งานได้ฟรีไม่จำกัด)`
      );
      setErrorCanRetry(false);
      return;
    }

    setErrorMessage(null);
    setErrorCanRetry(false);
    setRefusedNotice(false);
    setGenerating(true);

    try {
      let usedEngine = promptEngineLabel || selectedVisionModel;
      if (combinedInput || referenceImages.length > 0) {
        if (!promptToUse || referenceImages.length > 0) {
          setPipelineStep(1);
          setStageMessage(`1/3 ${selectedVisionModel} กำลังวิเคราะห์ภาพและโครงสร้างพรอมต์...`);
          const enhanced = await requestPromptEnhancement(
            combinedInput,
            stylePreset,
            textInImage,
            referenceImages
          );
          if (!enhanced.ok) {
            setRefusedNotice(enhanced.refused);
            setErrorMessage(enhanced.error);
            setErrorCanRetry(!enhanced.refused);
            setGenerating(false);
            setPipelineStep(0);
            setStageMessage('');
            return;
          }
          promptToUse = enhanced.prompt;
          usedEngine = enhanced.engine;
          onEnhancedPromptChange(enhanced.prompt);
          setPromptEngineLabel(enhanced.engine);
        }
      }

      setPipelineStep(2);
      const parsedSeed = Number(seedValue.trim());
      const baseSeed = Number.isInteger(parsedSeed) && parsedSeed > 0 ? parsedSeed : undefined;

      const generationAspectRatio =
        aspectRatio === 'custom'
          ? mapCustomDimensionsToAspectRatio(clampedCustom.width, clampedCustom.height)
          : aspectRatio;
      const dimensionsLabel =
        aspectRatio === 'custom' ? `${clampedCustom.width}×${clampedCustom.height} px` : undefined;

      setPipelineStep(3);
      setStageMessage(`3/3 กำลังสร้าง ${batchCount} ภาพด้วย ${selectedImageModel}...`);
      const palette = PALETTE_OPTIONS.find((p) => p.id === selectedPaletteId)?.colors || [];
      const headers = await buildAuthHeaders();

      const requests = Array.from({ length: batchCount }, (_, idx) =>
        fetch('/api/generate-image', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt: promptToUse,
            originalPrompt:
              ideaInput.trim() ||
              combinedInput ||
              (referenceImages.length > 0 ? 'สร้างภาพจากรูปภาพที่แนบ' : promptToUse),
            negativePrompt: negativePrompt.trim() || undefined,
            model: selectedImageModel,
            stylePreset,
            photorealismPreset,
            aspectRatio,
            generationAspectRatio,
            dimensionsLabel,
            hasReferenceImage: referenceImages.length > 0,
            promptEngine: usedEngine,
            ownerUid: user?.uid,
            ownerName: user?.displayName || user?.email?.split('@')[0] || 'ผู้เยี่ยมชม (Guest)',
            ownerEmail: user?.email || undefined,
            paletteColors: palette,
            seed: baseSeed ? baseSeed + idx : undefined,
            variationIndex: idx,
          }),
        }).then(async (r) => ({
          ok: r.ok,
          data: (await r.json()) as {
            imageUrl?: string;
            durationMs?: number;
            status?: string;
            error?: string;
            quota?: QuotaSnapshot;
            seed?: number;
          },
        }))
      );

      const responses = await Promise.all(requests);
      const latestQuota = [...responses].reverse().find((r) => r.data.quota)?.data.quota;
      if (latestQuota) onQuotaChange(latestQuota);

      const refusedRes = responses.find((r) => r.data.status === 'refused');
      if (refusedRes) {
        setRefusedNotice(true);
        setErrorMessage(
          refusedRes.data.error || 'REFUSE — คำขอนี้ไม่สอดคล้องกับนโยบายความปลอดภัย'
        );
        setErrorCanRetry(false);
        return;
      }

      const succeeded = responses.filter((r) => r.ok && r.data.imageUrl);
      if (succeeded.length === 0) {
        const firstErr = responses[0]?.data?.error;
        setErrorMessage(firstErr || 'การสร้างภาพล้มเหลว กรุณากดลองใหม่อีกครั้ง');
        setErrorCanRetry(true);
        return;
      }

      const createdList: SessionCreation[] = await Promise.all(
        succeeded.map(async (item, idx) => {
          const rawUrl = item.data.imageUrl as string;
          const pngUrl =
            aspectRatio === 'custom'
              ? await resizeUrlToExactPixels(rawUrl, clampedCustom.width, clampedCustom.height)
              : await convertUrlToPngDataUrl(rawUrl);
          return {
            id: `gen-${Date.now()}-${idx}`,
            originalPrompt:
              ideaInput.trim() ||
              combinedInput ||
              (referenceImages.length > 0 ? 'สร้างภาพจากภาพอ้างอิง' : promptToUse),
            enhancedPrompt: promptToUse,
            negativePrompt: negativePrompt.trim() || undefined,
            model: selectedImageModel,
            seed: item.data.seed || (baseSeed ? baseSeed + idx : undefined),
            stylePreset,
            photorealismPreset,
            aspectRatio,
            dimensionsLabel,
            imageUrl: pngUrl,
            originalImageUrl: pngUrl,
            bgRemoved: false,
            durationMs: item.data.durationMs || 0,
            createdAtIso: new Date().toISOString(),
          };
        })
      );

      setPromptHistory((prev) => [
        {
          id: `hist-${Date.now()}`,
          mode: promptMode,
          originalPrompt: ideaInput.trim() || combinedInput,
          enhancedPrompt: promptToUse,
          negativePrompt: negativePrompt.trim(),
          stylePreset,
          photorealismPreset,
          aspectRatio,
          seed: seedValue,
          createdAtIso: new Date().toISOString(),
        },
        ...prev.slice(0, 19),
      ]);

      setLastBatchIds(createdList.map((c) => c.id));
      if (onBatchCreated) {
        onBatchCreated(createdList);
      } else {
        for (const c of [...createdList].reverse()) {
          onCreationAdded(c);
        }
      }

      if (user && autoSaveEnabled) {
        for (const c of createdList) {
          setSavingId(c.id);
          try {
            await onSaveCreation(c);
          } catch (saveErr) {
            setErrorMessage(
              saveErr instanceof Error
                ? `สร้างภาพสำเร็จ แต่บันทึกบางภาพเข้าคลังไม่สำเร็จ: ${saveErr.message}`
                : 'สร้างภาพสำเร็จ แต่บันทึกเข้าคลังไม่สำเร็จ'
            );
          } finally {
            setSavingId(null);
          }
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `เชื่อมต่อระบบสร้างภาพไม่สำเร็จ: ${err.message}`
          : 'เกิดข้อผิดพลาดในการสร้างภาพ'
      );
      setErrorCanRetry(true);
    } finally {
      setGenerating(false);
      setPipelineStep(0);
      setStageMessage('');
    }
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeGeneration();
  };

  // "เจนอีกแบบ": keep exact prompt & style, randomize seed
  const handleGenerateVariation = async (creation: SessionCreation) => {
    if (quota.remaining <= 0) {
      setErrorMessage(
        `ใช้โควตาสร้างภาพ AI ครบ ${quota.limit} ภาพต่อวันแล้ว กรุณาลองใหม่พรุ่งนี้`
      );
      setErrorCanRetry(false);
      return;
    }

    setVaryingId(creation.id);
    setErrorMessage(null);
    setErrorCanRetry(false);

    try {
      const randomSeed = Math.floor(Math.random() * 2147483646) + 1;
      const generationAspectRatio =
        creation.aspectRatio === 'custom' ? '1:1' : creation.aspectRatio;
      const headers = await buildAuthHeaders();
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: creation.enhancedPrompt,
          originalPrompt: creation.originalPrompt,
          negativePrompt: creation.negativePrompt,
          model: creation.model || selectedImageModel,
          stylePreset: creation.stylePreset,
          photorealismPreset: creation.photorealismPreset || photorealismPreset,
          aspectRatio: creation.aspectRatio,
          generationAspectRatio,
          dimensionsLabel: creation.dimensionsLabel,
          hasReferenceImage: false,
          promptEngine: selectedVisionModel,
          ownerUid: user?.uid,
          ownerName: user?.displayName || user?.email?.split('@')[0] || 'ผู้เยี่ยมชม (Guest)',
          ownerEmail: user?.email || undefined,
          seed: randomSeed,
        }),
      });
      const data = (await res.json()) as {
        imageUrl?: string;
        durationMs?: number;
        error?: string;
        quota?: QuotaSnapshot;
      };
      if (data.quota) onQuotaChange(data.quota);
      if (!res.ok || !data.imageUrl) {
        setErrorMessage(data.error || 'ไม่สามารถเจนอีกแบบได้ในขณะนี้');
        setErrorCanRetry(true);
        return;
      }

      const pngUrl = await convertUrlToPngDataUrl(data.imageUrl);
      const nextCreation: SessionCreation = {
        id: `var-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        originalPrompt: creation.originalPrompt,
        enhancedPrompt: creation.enhancedPrompt,
        negativePrompt: creation.negativePrompt,
        model: creation.model || selectedImageModel,
        seed: randomSeed,
        stylePreset: creation.stylePreset,
        photorealismPreset: creation.photorealismPreset,
        aspectRatio: creation.aspectRatio,
        dimensionsLabel: creation.dimensionsLabel,
        imageUrl: pngUrl,
        originalImageUrl: pngUrl,
        bgRemoved: false,
        durationMs: data.durationMs || 0,
        createdAtIso: new Date().toISOString(),
      };
      onCreationAdded(nextCreation);
      if (user && autoSaveEnabled) {
        await onSaveCreation(nextCreation);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? `เชื่อมต่อไม่สำเร็จ: ${err.message}` : 'ไม่สามารถเจนอีกแบบได้'
      );
      setErrorCanRetry(true);
    } finally {
      setVaryingId(null);
    }
  };

  const handleToggleBackgroundRemoval = async () => {
    if (!activeCreation) return;
    if (activeCreation.bgRemoved && activeCreation.originalImageUrl) {
      onUpdateSessionCreation(activeCreation.id, {
        imageUrl: activeCreation.originalImageUrl,
        bgRemoved: false,
        savedDocId: undefined,
      });
      return;
    }
    setRemovingBg(true);
    setErrorMessage(null);
    try {
      const transparentPng = await removeBackgroundFromUrl(
        activeCreation.originalImageUrl || activeCreation.imageUrl,
        { tolerance: 26, feather: 1, globalColorKey: false }
      );
      onUpdateSessionCreation(activeCreation.id, {
        imageUrl: transparentPng,
        originalImageUrl: activeCreation.originalImageUrl || activeCreation.imageUrl,
        bgRemoved: true,
        savedDocId: undefined,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ไม่สามารถลบพื้นหลังได้');
    } finally {
      setRemovingBg(false);
    }
  };

  const handleLoadShowcaseStarter = (starter: ShowcaseItem) => {
    onIdeaInputChange(starter.originalPrompt);
    onEnhancedPromptChange(starter.enhancedPrompt);
    onNegativePromptChange(starter.negativePrompt);
    onStylePresetChange(starter.stylePreset);
    onPhotorealismPresetChange(starter.photorealismPreset);
    onAspectRatioChange(starter.aspectRatio);
    onSeedValueChange(String(starter.seed));
    setErrorMessage(null);
    setRefusedNotice(false);
    ideaTextareaRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveCurrentPrompt = async () => {
    if (!user) {
      onRequireSignIn();
      return;
    }
    if (!onSavePromptToCloud) return;
    const orig = (ideaInput || structuredBundle.combinedPrompt).trim();
    const enh = (enhancedPrompt || structuredBundle.combinedPrompt).trim();
    if (!orig && !enh) {
      setErrorMessage('กรุณากรอกพรอมต์ก่อนบันทึก');
      return;
    }
    setSavingPrompt(true);
    try {
      await onSavePromptToCloud({
        title: orig.slice(0, 60) || 'Saved Prompt',
        originalPrompt: orig || enh,
        enhancedPrompt: enh || orig,
        negativePrompt: negativePrompt.trim(),
        stylePreset,
        photorealismPreset,
        aspectRatio,
        model: selectedImageModel,
      });
      setSavedPromptOk(true);
      setTimeout(() => setSavedPromptOk(false), 2200);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ไม่สามารถบันทึกพรอมต์ได้');
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleDownloadCreationPng = async (creation: SessionCreation) => {
    setDownloadingId(creation.id);
    try {
      await downloadUrlAsPng(creation.imageUrl, `zimage-${creation.id}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyEnhanced = async () => {
    const text = activeCreation?.enhancedPrompt || enhancedPrompt;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const toLightbox = (c: SessionCreation): LightboxImageData => ({
    id: c.id,
    imageUrl: c.imageUrl,
    originalPrompt: c.originalPrompt,
    enhancedPrompt: c.enhancedPrompt,
    stylePreset: c.stylePreset,
    aspectRatio: c.aspectRatio,
    itemType: 'generated',
  });

  const featuredStarter = CURATED_SHOWCASE_ITEMS[0];
  const isBusy = enhancing || generating || Boolean(varyingId);
  const currentBatchItems =
    lastBatchIds.length > 1
      ? sessionCreations.filter((item) => lastBatchIds.includes(item.id))
      : [];

  const renderCreation6Buttons = (creation: SessionCreation, compact: boolean = false) => {
    const lb = toLightbox(creation);
    const btnPad = compact ? 'min-h-[34px] px-2 text-[11px]' : 'min-h-[38px] px-3 text-xs';
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onOpenInEditor(lb)}
          className={`inline-flex items-center gap-1 rounded-lg bg-[#2563EB] font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer whitespace-nowrap ${btnPad}`}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>แต่งภาพนี้</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onContinuePrompt(lb);
            ideaTextareaRef.current?.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap ${btnPad}`}
        >
          <PenLine className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
          <span>สร้างต่อ</span>
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleGenerateVariation(creation)}
          className={`inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap disabled:opacity-50 ${btnPad}`}
        >
          <Dices className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
          <span>{varyingId === creation.id ? 'กำลังสุ่ม...' : 'เจนอีกแบบ'}</span>
        </button>

        <button
          type="button"
          disabled={downloadingId === creation.id}
          onClick={() => handleDownloadCreationPng(creation)}
          className={`inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap disabled:opacity-50 ${btnPad}`}
        >
          <Download className="h-3.5 w-3.5" />
          <span>{downloadingId === creation.id ? 'กำลังโหลด...' : 'ดาวน์โหลด'}</span>
        </button>

        {user ? (
          <button
            type="button"
            disabled={Boolean(creation.savedDocId) || savingId === creation.id}
            onClick={async () => {
              setSavingId(creation.id);
              try {
                await onSaveCreation(creation);
              } finally {
                setSavingId(null);
              }
            }}
            className={`inline-flex items-center gap-1 rounded-lg font-medium whitespace-nowrap transition-colors ${btnPad} ${
              creation.savedDocId
                ? 'border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 cursor-default'
                : 'border border-[#2563EB]/40 bg-[#EEF3FA] dark:bg-[#162947] text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#2563EB] hover:text-white cursor-pointer'
            }`}
          >
            {creation.savedDocId ? (
              <>
                <BookmarkCheck className="h-3.5 w-3.5" />
                <span>บันทึกแล้ว</span>
              </>
            ) : (
              <>
                <BookmarkPlus className="h-3.5 w-3.5" />
                <span>{savingId === creation.id ? 'กำลังบันทึก...' : 'บันทึกคลัง'}</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRequireSignIn}
            className={`inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] font-medium text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] cursor-pointer whitespace-nowrap ${btnPad}`}
          >
            <Lock className="h-3.5 w-3.5" />
            <span>บันทึกคลัง</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onRemoveSessionCreation(creation.id)}
          aria-label="ลบภาพนี้ออกจากรายการ"
          className={`inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 font-medium text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 cursor-pointer whitespace-nowrap ${btnPad}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>ลบ</span>
        </button>

        {onOpenInDecompose && (
          <button
            type="button"
            onClick={() => onOpenInDecompose(lb)}
            className={`inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] font-medium text-[#475569] dark:text-slate-300 hover:border-[#2563EB] cursor-pointer whitespace-nowrap ${btnPad}`}
          >
            <Layers className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
            <span>แยกเลเยอร์ AI</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8 space-y-10">
      <div className="grid gap-6 lg:grid-cols-[500px_1fr] lg:items-start">
        {/* Left: Unlimited AI Studio Console */}
        <form
          onSubmit={handleGenerateImage}
          className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
                AI Image Studio
              </h1>
              <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                รองรับพรอมต์ไม่จำกัดความยาว · {selectedImageModel}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono-tabular font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                เหลือ {quota.remaining}/{quota.limit || DEFAULT_DAILY_GENERATION_LIMIT} วันนี้
              </p>
              <button
                type="button"
                onClick={() => setShowHistoryDrawer((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-[#64748B] dark:text-slate-400 hover:text-[#2563EB] cursor-pointer mt-0.5"
              >
                <History className="h-3 w-3" />
                <span>ประวัติพรอมต์ ({promptHistory.length})</span>
              </button>
            </div>
          </div>

          {/* 4 Mode Selector: Simple / Advanced / Professional / Unlimited */}
          <div
            role="tablist"
            aria-label="โหมดความละเอียดพรอมต์"
            className="grid grid-cols-4 gap-1 rounded-xl bg-[#F7F9FC] dark:bg-[#0B1F3A] p-1 border border-[#E2E8F0] dark:border-slate-800"
          >
            {PROMPT_MODE_OPTIONS.map((m) => {
              const active = promptMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onPromptModeChange(m.id)}
                  title={m.hint}
                  className={`min-h-[34px] rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#2563EB] text-white font-semibold'
                      : 'text-[#64748B] dark:text-slate-400 hover:text-[#101820] dark:hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Prompt History Drawer */}
          {showHistoryDrawer && (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3 space-y-2 max-h-52 overflow-y-auto">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>ประวัติพรอมต์ในเซสชันนี้</span>
                <button
                  type="button"
                  onClick={() => setShowHistoryDrawer(false)}
                  className="text-[#64748B] hover:text-[#101820] dark:hover:text-white cursor-pointer"
                >
                  ปิด
                </button>
              </div>
              {promptHistory.length === 0 ? (
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  ยังไม่มีประวัติการสร้างภาพในเซสชันนี้
                </p>
              ) : (
                promptHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-2"
                  >
                    <p className="text-xs truncate flex-1">{h.originalPrompt || h.enhancedPrompt}</p>
                    <button
                      type="button"
                      onClick={() => {
                        onIdeaInputChange(h.originalPrompt);
                        onEnhancedPromptChange(h.enhancedPrompt);
                        onNegativePromptChange(h.negativePrompt);
                        onStylePresetChange(h.stylePreset);
                        onPhotorealismPresetChange(h.photorealismPreset);
                        onAspectRatioChange(h.aspectRatio);
                        onSeedValueChange(h.seed);
                        setShowHistoryDrawer(false);
                      }}
                      className="rounded-md bg-[#2563EB] px-2 py-1 text-[11px] font-medium text-white cursor-pointer whitespace-nowrap"
                    >
                      ใช้ซ้ำ
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 1. Unlimited Main Prompt + Embedded Reference Images */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="idea-input" className="text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                คำอธิบายภาพหลัก (ไทย / อังกฤษ · ไม่จำกัดความยาว)
              </label>
              <span className="font-mono-tabular text-[11px] text-[#64748B] dark:text-slate-400">
                {inputStats.chars.toLocaleString()} chars · {inputStats.words} words · ~{inputStats.approxTokens} tokens
              </span>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-2.5 focus-within:border-[#2563EB] transition-colors">
              {referenceImages.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {referenceImages.map((src, idx) => (
                    <div
                      key={`ref-${idx}`}
                      className="relative h-14 w-14 overflow-hidden rounded-lg border border-[#E2E8F0] dark:border-slate-700"
                    >
                      <img
                        src={src}
                        alt={`ภาพอ้างอิง ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setReferenceImages((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label={`ลบภาพอ้างอิง ${idx + 1}`}
                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/75 text-white hover:bg-red-600 cursor-pointer"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={ideaTextareaRef}
                id="idea-input"
                rows={promptMode === 'unlimited' ? 4 : 3}
                maxLength={BLUEPRINT_LIMITS.originalPromptMax}
                value={ideaInput}
                onChange={(e) => handleIdeaChange(e.target.value)}
                onPaste={handleIdeaPaste}
                placeholder="พิมพ์ไอเดียละเอียดเท่าที่ต้องการได้เต็มที่ เช่น พอร์ตเทรตแสงหน้าต่างธรรมชาติ หรือวางภาพอ้างอิง (Ctrl+V)..."
                className="w-full resize-y bg-transparent text-sm text-[#101820] dark:text-[#F8FAFC] placeholder:text-[#64748B]/70 dark:placeholder:text-slate-400/60 focus:outline-none"
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-2">
                <input
                  ref={refInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    handleAttachFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => refInputRef.current?.click()}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                  <span>แนบรูปอ้างอิง ({referenceImages.length}/3)</span>
                </button>
                <span className="text-[11px] text-[#64748B] dark:text-slate-400">
                  รองรับ Paste รูป (Ctrl+V)
                </span>
              </div>
            </div>
          </div>

          {/* Unlimited / Pro Structured Fields */}
          {promptMode !== 'simple' && (
            <div className="space-y-3 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3">
              {/* Photorealism Presets + Negative Prompt + Seed */}
              <div className="space-y-1.5">
                <label
                  htmlFor="photorealism-select"
                  className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]"
                >
                  Photorealism Preset (พรีเซ็ตบุคคลและภาพถ่ายสมจริง 8 แบบ)
                </label>
                <select
                  id="photorealism-select"
                  value={photorealismPreset}
                  onChange={(e) =>
                    onPhotorealismPresetChange(e.target.value as PhotorealismPresetId)
                  }
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 py-2 text-xs text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
                >
                  {PHOTOREALISM_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {p.labelTh}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="negative-prompt-input"
                  className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]"
                >
                  Negative Prompt (สิ่งที่ไม่ต้องการให้ปรากฏ)
                </label>
                <input
                  id="negative-prompt-input"
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => onNegativePromptChange(e.target.value)}
                  placeholder="เช่น plastic skin, watermark, distorted hands, extra fingers, blurry"
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 py-2 text-xs text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="seed-input"
                    className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                  >
                    Seed (เว้นว่างเพื่อสุ่ม)
                  </label>
                  <div className="mt-1 flex gap-1">
                    <input
                      id="seed-input"
                      type="number"
                      min={1}
                      max={2147483647}
                      value={seedValue}
                      onChange={(e) => onSeedValueChange(e.target.value)}
                      placeholder="Auto"
                      className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 font-mono-tabular text-xs text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onSeedValueChange(String(Math.floor(Math.random() * 2147483646) + 1))
                      }
                      title="สุ่ม Seed"
                      aria-label="สุ่ม Seed"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] text-[#475569] dark:text-slate-300 hover:border-[#2563EB] cursor-pointer"
                    >
                      <Dices className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="image-model-select"
                    className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                  >
                    Image Model (Wired)
                  </label>
                  <select
                    id="image-model-select"
                    value={selectedImageModel}
                    onChange={(e) => setSelectedImageModel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
                  >
                    {WIRED_IMAGE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(promptMode === 'professional' || promptMode === 'unlimited') && (
                <div className="grid gap-2 sm:grid-cols-2 pt-1">
                  <div>
                    <label
                      htmlFor="vision-model-select"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      Prompt &amp; Vision Model
                    </label>
                    <select
                      id="vision-model-select"
                      value={selectedVisionModel}
                      onChange={(e) => setSelectedVisionModel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
                    >
                      {WIRED_VISION_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="camera-lens-input"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      Camera &amp; Lens
                    </label>
                    <input
                      id="camera-lens-input"
                      type="text"
                      value={cameraAndLens}
                      onChange={(e) => setCameraAndLens(e.target.value)}
                      placeholder="85mm f/1.8 prime, crisp focus"
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="lighting-input"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      Lighting Direction
                    </label>
                    <input
                      id="lighting-input"
                      type="text"
                      value={lighting}
                      onChange={(e) => setLighting(e.target.value)}
                      placeholder="soft window daylight, rim highlight"
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="composition-input"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      Composition &amp; Framing
                    </label>
                    <input
                      id="composition-input"
                      type="text"
                      value={composition}
                      onChange={(e) => setComposition(e.target.value)}
                      placeholder="rule of thirds, clean negative space"
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
                    />
                  </div>
                </div>
              )}

              {promptMode === 'unlimited' && (
                <div className="grid gap-2 sm:grid-cols-2 pt-1 border-t border-[#E2E8F0] dark:border-slate-800">
                  <div>
                    <label
                      htmlFor="subject-details-input"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      Subject Specifics (เสื้อผ้า ผิว ท่าทาง)
                    </label>
                    <input
                      id="subject-details-input"
                      type="text"
                      value={subjectDetails}
                      onChange={(e) => setSubjectDetails(e.target.value)}
                      placeholder="natural skin pores, tailored indigo blazer"
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="environment-input"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      Environment &amp; Atmosphere
                    </label>
                    <input
                      id="environment-input"
                      type="text"
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value)}
                      placeholder="modern travertine studio at morning golden hour"
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="style-instructions-input"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      Style Instructions
                    </label>
                    <input
                      id="style-instructions-input"
                      type="text"
                      value={styleInstructions}
                      onChange={(e) => setStyleInstructions(e.target.value)}
                      placeholder="minimalist editorial color grading"
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="quality-enhancements-input"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      Quality &amp; Fidelity
                    </label>
                    <input
                      id="quality-enhancements-input"
                      type="text"
                      value={qualityEnhancements}
                      onChange={(e) => setQualityEnhancements(e.target.value)}
                      placeholder="tack-sharp texture, zero compression artifacts"
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Batch Count Selector (1 - 6 images) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                จำนวนภาพที่สร้างพร้อมกัน
              </span>
              <span className="text-xs font-mono-tabular text-[#2563EB] dark:text-[#60A5FA] font-semibold">
                {batchCount} ภาพ
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="จำนวนรูปที่สร้างพร้อมกัน">
              {BATCH_COUNT_OPTIONS.map((num) => {
                const selected = batchCount === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setBatchCount(num)}
                    className={`min-h-[36px] rounded-lg text-xs font-mono-tabular font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#2563EB] text-white'
                        : 'border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200 hover:border-[#2563EB]'
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Style Preset */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
              สไตล์งานภาพ
            </span>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((preset) => {
                const selected = stylePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleStyleClick(preset.id)}
                    className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selected
                        ? 'bg-[#2563EB] text-white font-semibold'
                        : 'border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#475569] dark:text-slate-300 hover:border-[#2563EB]'
                    }`}
                  >
                    {preset.labelTh}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Aspect Ratio + Custom Pixel Dimensions (px) */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
              สัดส่วนภาพ หรือกำหนดขนาดเอง (px)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ASPECT_RATIOS.map((ratio) => {
                const selected = aspectRatio === ratio.id;
                return (
                  <button
                    key={ratio.id}
                    type="button"
                    onClick={() => onAspectRatioChange(ratio.id)}
                    className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selected
                        ? 'bg-[#2563EB] text-white font-semibold'
                        : 'border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#475569] dark:text-slate-300 hover:border-[#2563EB]'
                    }`}
                  >
                    {ratio.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onAspectRatioChange('custom')}
                className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  aspectRatio === 'custom'
                    ? 'bg-[#2563EB] text-white font-semibold'
                    : 'border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#475569] dark:text-slate-300 hover:border-[#2563EB]'
                }`}
              >
                กำหนดขนาดเอง (px)
              </button>
            </div>

            {aspectRatio === 'custom' && (
              <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="custom-width-px"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      ความกว้าง (Width px)
                    </label>
                    <input
                      id="custom-width-px"
                      type="number"
                      min={64}
                      max={4096}
                      value={customWidthPx}
                      onChange={(e) => setCustomWidthPx(Number(e.target.value) || 64)}
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="custom-height-px"
                      className="block text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                    >
                      ความสูง (Height px)
                    </label>
                    <input
                      id="custom-height-px"
                      type="number"
                      min={64}
                      max={4096}
                      value={customHeightPx}
                      onChange={(e) => setCustomHeightPx(Number(e.target.value) || 64)}
                      className="mt-1 w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs font-mono-tabular"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOM_PIXEL_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setCustomWidthPx(p.w);
                        setCustomHeightPx(p.h);
                      }}
                      className="rounded border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2 py-0.5 text-[11px] font-mono-tabular text-[#475569] dark:text-slate-300 hover:border-[#2563EB] cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 5. Optional Text-in-Image & Palette */}
          <div className="border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
            <button
              type="button"
              aria-expanded={showAdvancedPalette}
              onClick={() => setShowAdvancedPalette((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold text-[#475569] dark:text-slate-300 hover:text-[#101820] dark:hover:text-white cursor-pointer py-0.5"
            >
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                <span>ข้อความในภาพ และพาเลตสี</span>
              </span>
              {showAdvancedPalette ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showAdvancedPalette && (
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <label htmlFor="text-in-image" className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                    ข้อความที่ต้องการให้ปรากฏในภาพ
                  </label>
                  <input
                    id="text-in-image"
                    type="text"
                    maxLength={120}
                    value={textInImage}
                    onChange={(e) => onTextInImageChange(e.target.value)}
                    placeholder='เช่น "ZIMAGE STUDIO" ด้านบนกึ่งกลางภาพ'
                    className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {PALETTE_OPTIONS.map((pal) => {
                    const active = selectedPaletteId === pal.id;
                    return (
                      <button
                        key={pal.id}
                        type="button"
                        onClick={() => setSelectedPaletteId(pal.id)}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors ${
                          active
                            ? 'border-[#2563EB] bg-[#2563EB] text-white font-semibold'
                            : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-slate-200 hover:border-[#2563EB]'
                        }`}
                      >
                        <span className="truncate">{pal.label}</span>
                        {pal.swatches.length > 0 && (
                          <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
                            {pal.swatches.map((hex) => (
                              <span
                                key={hex}
                                className="h-3 w-3 rounded-xs border border-black/20"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 6. Prompt Expert & Save Prompt */}
          <div className="border-t border-[#E2E8F0] dark:border-slate-800 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={showPromptExpert}
                onClick={() => setShowPromptExpert((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#475569] dark:text-slate-300 hover:text-[#101820] dark:hover:text-white cursor-pointer"
              >
                {showPromptExpert ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />}
                <span>ดู/แก้พรอมต์อังกฤษ (Prompt Expert)</span>
              </button>

              {onSavePromptToCloud && (
                <button
                  type="button"
                  disabled={savingPrompt}
                  onClick={handleSaveCurrentPrompt}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 px-2.5 py-1 text-[11px] font-medium text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                >
                  {savedPromptOk ? <Check className="h-3 w-3" /> : <BookmarkPlus className="h-3 w-3" />}
                  <span>{savedPromptOk ? 'บันทึก Prompt แล้ว' : 'บันทึก Prompt'}</span>
                </button>
              )}
            </div>

            {showPromptExpert && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="enhanced-prompt-input" className="text-xs font-semibold">
                    พรอมต์ภาษาอังกฤษฉบับเต็ม (ไม่จำกัดความยาว)
                  </label>
                  <button
                    type="button"
                    onClick={handleEnhanceOnly}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#2563EB]/40 bg-[#EEF3FA] dark:bg-[#162947] px-2.5 py-1 text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span>{enhancing ? 'กำลังเรียบเรียง...' : 'เรียบเรียงด้วย AI ก่อน'}</span>
                  </button>
                </div>
                <textarea
                  id="enhanced-prompt-input"
                  rows={4}
                  maxLength={BLUEPRINT_LIMITS.enhancedPromptMax}
                  value={enhancedPrompt}
                  onChange={(e) => onEnhancedPromptChange(e.target.value)}
                  placeholder="ระบบจะเรียบเรียงพรอมต์ภาษาอังกฤษอย่างครบถ้วนโดยไม่ตัดทอนรายละเอียดสำคัญ"
                  className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 text-xs leading-relaxed focus:border-[#2563EB] focus:outline-none"
                />
                <div className="flex items-center justify-between text-[11px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                  <span>{promptEngineLabel ? `Engine: ${promptEngineLabel}` : selectedVisionModel}</span>
                  <span>
                    {enhancedStats.chars.toLocaleString()} chars · {enhancedStats.words} words
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Error / Refusal Feedback */}
          {errorMessage && (
            <div
              role="alert"
              className={`rounded-xl border p-3 text-xs leading-relaxed space-y-2 ${
                refusedNotice
                  ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200'
                  : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              {errorCanRetry && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => executeGeneration()}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>ลองใหม่</span>
                </button>
              )}
            </div>
          )}

          {user ? (
            <label className="flex items-center justify-between gap-3 text-xs text-[#475569] dark:text-slate-300 cursor-pointer select-none">
              <span>บันทึกเป็นไฟล์ PNG เข้าคลังอัตโนมัติ</span>
              <input
                type="checkbox"
                checked={autoSaveEnabled}
                onChange={(e) => onToggleAutoSave(e.target.checked)}
                className="h-4 w-4 rounded accent-[#2563EB] cursor-pointer"
              />
            </label>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2.5 text-[11px] leading-relaxed text-[#475569] dark:text-slate-300">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>
                ทดลองสร้างภาพและแต่งภาพได้ทันที · เข้าสู่ระบบ Google เพื่อบันทึกภาพและพรอมต์ลงคลังถาวร
              </span>
            </div>
          )}

          {/* Primary CTA */}
          <button
            type="submit"
            disabled={isBusy}
            className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <ImageIcon className="h-4 w-4" />
            <span>
              {generating
                ? `กำลังสร้าง ${batchCount} ภาพ...`
                : batchCount > 1
                  ? `สร้างภาพพร้อมกัน ${batchCount} ภาพ`
                  : 'สร้างภาพทันที'}
            </span>
          </button>
        </form>

        {/* Right: Live Stage + Pipeline Feedback */}
        <section aria-label="พื้นที่แสดงผลภาพ" className="space-y-6">
          <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 sm:p-6">
            {generating ? (
              <div
                style={{ aspectRatio: activeRatioCss }}
                className="flex w-full max-h-[600px] flex-col items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-8 text-center space-y-4"
              >
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#2563EB]/25 border-t-[#2563EB]" />
                <div className="space-y-1">
                  <p className="font-display text-base font-semibold text-[#101820] dark:text-[#F8FAFC]">
                    {stageMessage || 'กำลังประมวลผล...'}
                  </p>
                  <p className="text-xs font-mono-tabular text-[#64748B] dark:text-slate-400">
                    Step {pipelineStep}/3 · {selectedVisionModel} → {selectedImageModel}
                  </p>
                </div>
              </div>
            ) : activeCreation ? (
              <div className="space-y-5">
                {currentBatchItems.length > 1 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#64748B] dark:text-slate-400">
                      <span className="font-semibold text-[#101820] dark:text-[#F8FAFC]">
                        ชุดภาพที่สร้างพร้อมกัน ({currentBatchItems.length} ภาพ)
                      </span>
                      <span>คลิกเพื่อเลือกดูขนาดเต็ม</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {currentBatchItems.map((item, idx) => {
                        const selected = item.id === activeCreation.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectActiveCreation(item)}
                            className={`overflow-hidden rounded-lg border-2 cursor-pointer transition-all ${
                              selected
                                ? 'border-[#2563EB] ring-2 ring-[#2563EB]/25'
                                : 'border-[#E2E8F0] dark:border-slate-700 opacity-80 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={item.imageUrl}
                              alt={`ภาพที่ ${idx + 1}`}
                              className="aspect-square w-full object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  className="checkerboard-stage relative flex items-center justify-center overflow-hidden rounded-xl border border-[#E2E8F0] dark:border-slate-800"
                  style={{ aspectRatio: activeRatioCss, maxHeight: '620px' }}
                >
                  <img
                    src={activeCreation.imageUrl}
                    alt={activeCreation.originalPrompt}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => onOpenLightbox(toLightbox(activeCreation))}
                    aria-label="ขยายดูภาพเต็มจอ"
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] dark:border-slate-700 bg-white/90 dark:bg-[#0B1F3A]/90 text-[#101820] dark:text-white hover:bg-[#2563EB] hover:text-white cursor-pointer"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Metadata + Quick BG Remove + Action Buttons */}
                <div className="space-y-3 border-b border-[#E2E8F0] dark:border-slate-800 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-slate-400 font-mono-tabular">
                      <span>PNG</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeCreation.dimensionsLabel || activeCreation.aspectRatio}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {STYLE_PRESETS.find((s) => s.id === activeCreation.stylePreset)?.labelTh ||
                          activeCreation.stylePreset}
                      </span>
                      {activeCreation.seed && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Seed {activeCreation.seed}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{(activeCreation.durationMs / 1000).toFixed(1)}s</span>
                    </div>

                    <button
                      type="button"
                      disabled={removingBg}
                      onClick={handleToggleBackgroundRemoval}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-1 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                    >
                      {activeCreation.bgRemoved ? (
                        <>
                          <Undo2 className="h-3.5 w-3.5 text-[#2563EB]" />
                          <span>คืนพื้นหลังเดิม</span>
                        </>
                      ) : (
                        <>
                          <Scissors className="h-3.5 w-3.5 text-[#2563EB]" />
                          <span>{removingBg ? 'กำลังลบพื้นหลัง...' : 'ลบพื้นหลังเร็ว'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {renderCreation6Buttons(activeCreation, false)}
                </div>

                {/* Original Description & Toggleable Prompt Expert Result */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                        คำอธิบายต้นฉบับ
                      </p>
                      <p className="mt-1 text-sm text-[#101820] dark:text-[#F8FAFC]">
                        {activeCreation.originalPrompt}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowStagePrompt((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs font-medium text-[#475569] dark:text-slate-300 cursor-pointer"
                    >
                      {showStagePrompt ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      <span>{showStagePrompt ? 'ซ่อนพรอมต์อังกฤษ' : 'ดูพรอมต์ที่ใช้สร้าง'}</span>
                    </button>
                  </div>

                  {showStagePrompt && (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                          พรอมต์ที่ใช้สร้างภาพ (English Prompt)
                        </p>
                        <button
                          type="button"
                          onClick={handleCopyEnhanced}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] cursor-pointer whitespace-nowrap"
                        >
                          {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copiedPrompt ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                        </button>
                      </div>
                      <p className="mt-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3 text-xs leading-relaxed text-[#475569] dark:text-slate-300">
                        {activeCreation.enhancedPrompt}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A]">
                  <img
                    src={featuredStarter.imageUrl}
                    alt={featuredStarter.title}
                    referrerPolicy="no-referrer"
                    className="aspect-video w-full object-cover"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-slate-400 font-mono-tabular">
                      <span className="text-[#2563EB] dark:text-[#60A5FA] font-semibold">
                        {featuredStarter.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{featuredStarter.aspectRatio}</span>
                      <span aria-hidden="true">·</span>
                      <span>{featuredStarter.model}</span>
                    </div>
                    <h2 className="font-display text-lg font-semibold text-[#101820] dark:text-[#F8FAFC]">
                      {featuredStarter.title}
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-slate-300 max-w-2xl">
                      {featuredStarter.originalPrompt}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenInEditor({
                          id: featuredStarter.id,
                          title: featuredStarter.title,
                          imageUrl: featuredStarter.imageUrl,
                          originalPrompt: featuredStarter.originalPrompt,
                          enhancedPrompt: featuredStarter.enhancedPrompt,
                          stylePreset: featuredStarter.stylePreset,
                          aspectRatio: featuredStarter.aspectRatio,
                        })
                      }
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer whitespace-nowrap"
                    >
                      <Sliders className="h-3.5 w-3.5" />
                      <span>แต่งภาพนี้</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadShowcaseStarter(featuredStarter)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3.5 py-2 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                    >
                      <PenLine className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                      <span>สร้างต่อ</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Session Creations Strip */}
          {sessionCreations.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  ผลงานที่สร้างในเซสชันนี้ ({sessionCreations.length})
                </h2>
                <span className="text-xs text-[#64748B] dark:text-slate-400">
                  คลิกภาพเพื่อดูขนาดเต็ม หรือจัดการได้ทันทีใต้ภาพ
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {sessionCreations.map((item) => {
                  const isCurrent = activeCreation?.id === item.id;
                  return (
                    <article
                      key={item.id}
                      className={`flex flex-col overflow-hidden rounded-2xl border bg-white dark:bg-[#101820] transition-all ${
                        isCurrent
                          ? 'border-[#2563EB] ring-1 ring-[#2563EB]/30'
                          : 'border-[#E2E8F0] dark:border-slate-800'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectActiveCreation(item)}
                        className="checkerboard-stage aspect-[16/10] w-full overflow-hidden cursor-pointer"
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.originalPrompt}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-contain"
                        />
                      </button>
                      <div className="p-3.5 space-y-3">
                        <div>
                          <p className="truncate text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                            {item.originalPrompt}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                            PNG · {item.dimensionsLabel || item.aspectRatio} ·{' '}
                            {item.savedDocId ? 'บันทึกในคลังแล้ว' : user ? 'ยังไม่บันทึก' : 'ผู้เยี่ยมชม'}
                          </p>
                        </div>
                        {renderCreation6Buttons(item, true)}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Curated Showcase Starters */}
      <section aria-label="คลังตัวอย่างภาพ 14 หมวดหมู่" className="border-t border-[#E2E8F0] dark:border-slate-800 pt-8 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#101820] dark:text-[#F8FAFC]">
              ตัวอย่างภาพแนะนำ 14 หมวดหมู่
            </h2>
            <p className="text-sm text-[#64748B] dark:text-slate-400">
              โหลดพรอมต์พร้อม Negative Prompt และ Seed หรือส่งเข้าสตูดิโอแต่งภาพได้ทันที
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CURATED_SHOWCASE_ITEMS.slice(0, 8).map((starter) => (
            <div
              key={starter.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820]"
            >
              <button
                type="button"
                onClick={() =>
                  onOpenLightbox({
                    id: starter.id,
                    title: starter.title,
                    imageUrl: starter.imageUrl,
                    originalPrompt: starter.originalPrompt,
                    enhancedPrompt: starter.enhancedPrompt,
                    stylePreset: starter.stylePreset,
                    aspectRatio: starter.aspectRatio,
                    authorName: starter.authorName,
                    dateLabel: starter.createdLabel,
                  })
                }
                className="group relative aspect-[4/3] w-full overflow-hidden bg-[#F7F9FC] dark:bg-[#0B1F3A] cursor-pointer"
                aria-label={`ขยายภาพ ${starter.title}`}
              >
                <img
                  src={starter.imageUrl}
                  alt={starter.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
              </button>
              <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
                <div>
                  <p className="text-[11px] text-[#2563EB] dark:text-[#60A5FA] font-mono-tabular">
                    {starter.category} · {starter.aspectRatio}
                  </p>
                  <h3 className="mt-1 font-display text-sm font-semibold text-[#101820] dark:text-[#F8FAFC]">
                    {starter.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-[#64748B] dark:text-slate-400">
                    {starter.originalPrompt}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenInEditor({
                        id: starter.id,
                        title: starter.title,
                        imageUrl: starter.imageUrl,
                        originalPrompt: starter.originalPrompt,
                        enhancedPrompt: starter.enhancedPrompt,
                        stylePreset: starter.stylePreset,
                        aspectRatio: starter.aspectRatio,
                      })
                    }
                    className="flex-1 min-h-[36px] rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer whitespace-nowrap"
                  >
                    แต่งภาพนี้
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadShowcaseStarter(starter)}
                    className="flex-1 min-h-[36px] rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                  >
                    ใช้ Prompt นี้
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
