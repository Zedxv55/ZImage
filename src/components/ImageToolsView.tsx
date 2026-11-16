import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  ArrowRight,
  Check,
  Copy,
  Crop,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Grid,
  Image as ImageIcon,
  Layers,
  Minimize2,
  Palette,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanText,
  Scissors,
  ShieldCheck,
  Sliders,
  Sparkles,
  Upload,
  UserSquare2,
  Wand2,
} from 'lucide-react';
import {
  DEFAULT_ADJUSTMENTS,
  EXPORT_FORMATS,
  applyAdjustmentsToRgba,
  autoEnhanceRgba,
  blurRegionRgba,
  computeSharpnessScore,
  createZipArchive,
  denoiseRgba,
  extractDominantPalette,
  pixelateRegionRgba,
  removeBackgroundFromRgba,
  sharpenRgba,
} from '../utils/imageProcessing';
import type { DominantColorSwatch, ExportFormatId } from '../utils/imageProcessing';
import {
  canvasToBlob,
  compressCanvasToTargetBytes,
  exportCanvasInFormat,
  generateA4PrintSheetCanvas,
  loadHtmlImage,
  renderStyledCanvas,
  sourceUrlToCanvas,
  triggerBlobDownload,
} from '../utils/canvasImageHelper';
import { CURATED_SHOWCASE_ITEMS } from '../data/showcasePresets';
import { VISION_PROMPT_MODEL } from '../utils/promptLogic';
import type { EditorSourceItem } from './EditorView';

export type ImageToolCategoryId =
  | 'basic'
  | 'enhance'
  | 'background'
  | 'resize'
  | 'convert'
  | 'idphoto'
  | 'intelligence'
  | 'design'
  | 'privacy';

interface CategoryDef {
  id: ImageToolCategoryId;
  num: string;
  title: string;
  subtitle: string;
  icon: typeof Crop;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'basic', num: '1', title: 'จัดการและแก้ไขภาพ', subtitle: 'หมุน ปรับเอียง มุมโค้ง กรอบ คอลลาจ', icon: Crop },
  { id: 'enhance', num: '2', title: 'ปรับปรุงคุณภาพ AI', subtitle: 'ขยาย 2x/4x คมชัด ลด Noise ปรับแสง', icon: Sparkles },
  { id: 'background', num: '3', title: 'พื้นหลังและวัตถุ', subtitle: 'ลบพื้นหลัง เปลี่ยนสี เงา ลายน้ำ', icon: Scissors },
  { id: 'resize', num: '4', title: 'ย่อขนาด & บีบอัด KB', subtitle: 'คุมขนาด KB แปลงยกชุด ZIP', icon: Minimize2 },
  { id: 'convert', num: '5', title: 'แปลงไฟล์ & Vector', subtitle: 'PNG JPG WebP AVIF TIFF SVG PDF', icon: RefreshCw },
  { id: 'idphoto', num: '6', title: 'รูปติดบัตร & โปรไฟล์', subtitle: 'สมัครงาน 1-2 นิ้ว พาสปอร์ต ใบพิมพ์ A4', icon: UserSquare2 },
  { id: 'intelligence', num: '7', title: 'อ่านข้อมูล & วิเคราะห์', subtitle: 'OCR ตาราง ลายมือ QR โทนสี ความคมชัด', icon: ScanText },
  { id: 'design', num: '8', title: 'ออกแบบ & สร้างสรรค์', subtitle: 'Meme Before/After ตัดแบ่ง Grid QR Kit', icon: Grid },
  { id: 'privacy', num: '9', title: 'ความปลอดภัย & EXIF', subtitle: 'ลบ EXIF GPS เบลอ/โมเสกปิดข้อมูล', icon: ShieldCheck },
];

const ID_PHOTO_PRESETS = [
  { id: 'job-1in', label: '1 นิ้ว (สมัครงาน)', w: 300, h: 390, desc: '2.5 × 3.25 cm (300 DPI)' },
  { id: 'job-1.5in', label: '1.5 นิ้ว (มาตรฐาน)', w: 354, h: 472, desc: '3.0 × 4.0 cm (300 DPI)' },
  { id: 'job-2in', label: '2 นิ้ว (ราชการ/ทั่วไป)', w: 472, h: 614, desc: '4.0 × 5.2 cm (300 DPI)' },
  { id: 'passport-th', label: 'Passport (35×45mm)', w: 413, h: 531, desc: '3.5 × 4.5 cm (300 DPI)' },
  { id: 'us-visa', label: 'US Visa (2×2 นิ้ว)', w: 600, h: 600, desc: '5.1 × 5.1 cm (300 DPI)' },
];

const SOCIAL_RESIZE_PRESETS = [
  { label: 'IG Square 1080×1080', w: 1080, h: 1080 },
  { label: 'IG Story 1080×1920', w: 1080, h: 1920 },
  { label: 'TikTok/Reels Cover 1080×1920', w: 1080, h: 1920 },
  { label: 'Facebook Post 1200×630', w: 1200, h: 630 },
  { label: 'FB Cover 820×312', w: 820, h: 312 },
  { label: 'YouTube 1280×720', w: 1280, h: 720 },
  { label: 'LINE OA 1040×1040', w: 1040, h: 1040 },
  { label: 'Shopee/Lazada 1000×1000', w: 1000, h: 1000 },
  { label: 'A4 Poster 1240×1754', w: 1240, h: 1754 },
];

interface ImageToolsViewProps {
  onOpenInProEditor: (item: EditorSourceItem) => void;
}

export function ImageToolsView({ onOpenInProEditor }: ImageToolsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bgCustomInputRef = useRef<HTMLInputElement | null>(null);
  const collageInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const compareBeforeInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [category, setCategory] = useState<ImageToolCategoryId>('basic');
  const [sourceName, setSourceName] = useState<string>(CURATED_SHOWCASE_ITEMS[0].title);
  const [sourceMeta, setSourceMeta] = useState<{ bytes: number; type: string }>({
    bytes: 0,
    type: 'image/png',
  });
  const [workingCanvas, setWorkingCanvas] = useState<HTMLCanvasElement | null>(null);
  const [originalCanvas, setOriginalCanvas] = useState<HTMLCanvasElement | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Category 1: Basic Editing + Collage
  const [straightenDeg, setStraightenDeg] = useState(0);
  const [skewX, setSkewX] = useState(0);
  const [skewY, setSkewY] = useState(0);
  const [cornerRadius, setCornerRadius] = useState(0);
  const [borderPx, setBorderPx] = useState(0);
  const [borderColor, setBorderColor] = useState('#111827');
  const [paddingPx, setPaddingPx] = useState(0);
  const [paddingColor, setPaddingColor] = useState('#ffffff');
  const [collageUrls, setCollageUrls] = useState<string[]>([]);
  const [collageLayout, setCollageLayout] = useState<'2x1' | '1x2' | '2x2' | '3x1'>('2x2');

  // Category 2: Enhancement
  const [enhBright, setEnhBright] = useState(0);
  const [enhContrast, setEnhContrast] = useState(0);
  const [enhSat, setEnhSat] = useState(0);
  const [enhWarmth, setEnhWarmth] = useState(0);

  // Category 3: Background & Objects
  const [bgTol, setBgTol] = useState(26);
  const [bgColorSwap, setBgColorSwap] = useState('#ffffff');
  const [watermarkText, setWatermarkText] = useState('ZImage Protected');

  // Category 4: Resize & Compress + Batch
  const [resizeW, setResizeW] = useState(1024);
  const [resizeH, setResizeH] = useState(1024);
  const [keepAspect, setKeepAspect] = useState(true);
  const [targetKb, setTargetKb] = useState(200);
  const [compressFormat, setCompressFormat] = useState<'jpg' | 'webp' | 'png'>('jpg');
  const [compressReport, setCompressReport] = useState<{
    beforeBytes: number;
    afterBytes: number;
    dims: string;
    quality: number;
    blob: Blob;
    ext: string;
  } | null>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchMaxW, setBatchMaxW] = useState(1280);
  const [batchFormat, setBatchFormat] = useState<'jpg' | 'webp' | 'png'>('webp');

  // Category 5: Converter + Base64
  const [convertFmt, setConvertFmt] = useState<ExportFormatId>('webp');
  const [convertQuality, setConvertQuality] = useState(92);
  const [convertOpaqueBg, setConvertOpaqueBg] = useState('#ffffff');
  const [base64Text, setBase64Text] = useState('');

  // Category 6: Profile & ID Photo
  const [idPresetId, setIdPresetId] = useState('job-1.5in');
  const [idBgColor, setIdBgColor] = useState('#ffffff');
  const [idZoom, setIdZoom] = useState(100);
  const [idOffsetY, setIdOffsetY] = useState(0);

  // Category 7: Image Intelligence
  const [aiVisionOutput, setAiVisionOutput] = useState('');
  const [aiVisionMode, setAiVisionMode] = useState<
    'ocr-text' | 'ocr-table' | 'handwriting' | 'describe' | 'alt-text'
  >('ocr-text');
  const [qrDecoded, setQrDecoded] = useState<string | null>(null);
  const [palette, setPalette] = useState<DominantColorSwatch[]>([]);
  const [sharpnessInfo, setSharpnessInfo] = useState<{ score: number; verdict: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Category 8: Design & Creation
  const [designTool, setDesignTool] = useState<'meme' | 'compare' | 'split' | 'qr' | 'favicon'>('meme');
  const [memeTop, setMemeTop] = useState('WHEN THE DEADLINE IS TODAY');
  const [memeBottom, setMemeBottom] = useState('ZIMAGE SOLVES IT IN 1 CLICK');
  const [compareBeforeUrl, setCompareBeforeUrl] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<'3x1' | '3x3'>('3x3');
  const [qrInputText, setQrInputText] = useState('https://zimage.app');
  const [qrFgColor, setQrFgColor] = useState('#111827');
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string>('');

  // Category 9: Privacy & Redact
  const [redactMode, setRedactMode] = useState<'pixelate' | 'blur' | 'black'>('pixelate');
  const [redactRectPct, setRedactRectPct] = useState({ x: 25, y: 25, w: 50, h: 25 });
  const dragStartRef = useRef<{ xPct: number; yPct: number } | null>(null);

  const loadFromUrl = useCallback(async (url: string, label: string, bytes = 0, type = 'image/png') => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const c = await sourceUrlToCanvas(url);
      setWorkingCanvas(c);
      const clone = document.createElement('canvas');
      clone.width = c.width;
      clone.height = c.height;
      clone.getContext('2d')?.drawImage(c, 0, 0);
      setOriginalCanvas(clone);
      setSourceName(label);
      setSourceMeta({ bytes, type });
      setResizeW(c.width);
      setResizeH(c.height);
      setCompressReport(null);
      setAiVisionOutput('');
      setQrDecoded(null);
      const ctx = c.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        setPalette(extractDominantPalette(imgData.data, c.width, c.height, 6));
        setSharpnessInfo(computeSharpnessScore(imgData.data, c.width, c.height));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดรูปภาพได้');
    }
  }, []);

  useEffect(() => {
    loadFromUrl(CURATED_SHOWCASE_ITEMS[0].imageUrl, CURATED_SHOWCASE_ITEMS[0].title);
  }, [loadFromUrl]);

  // Keep preview canvas synced with workingCanvas (plus optional guides in idphoto / privacy)
  useEffect(() => {
    const view = previewCanvasRef.current;
    if (!view || !workingCanvas) return;
    view.width = workingCanvas.width;
    view.height = workingCanvas.height;
    const ctx = view.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(workingCanvas, 0, 0);

    if (category === 'privacy') {
      const rx = (redactRectPct.x / 100) * view.width;
      const ry = (redactRectPct.y / 100) * view.height;
      const rw = (redactRectPct.w / 100) * view.width;
      const rh = (redactRectPct.h / 100) * view.height;
      ctx.save();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = Math.max(2, Math.round(view.width / 220));
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = 'rgba(220, 38, 38, 0.14)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
    }
  }, [workingCanvas, category, redactRectPct]);

  const commitCanvas = (next: HTMLCanvasElement, msg: string) => {
    setWorkingCanvas(next);
    setResizeW(next.width);
    setResizeH(next.height);
    setStatusMsg(msg);
    setErrorMsg(null);
    const ctx = next.getContext('2d');
    if (ctx) {
      const d = ctx.getImageData(0, 0, next.width, next.height);
      setPalette(extractDominantPalette(d.data, next.width, next.height, 6));
      setSharpnessInfo(computeSharpnessScore(d.data, next.width, next.height));
    }
  };

  const handleResetToOriginal = () => {
    if (!originalCanvas) return;
    const clone = document.createElement('canvas');
    clone.width = originalCanvas.width;
    clone.height = originalCanvas.height;
    clone.getContext('2d')?.drawImage(originalCanvas, 0, 0);
    setStraightenDeg(0);
    setSkewX(0);
    setSkewY(0);
    setCornerRadius(0);
    setBorderPx(0);
    setPaddingPx(0);
    setEnhBright(0);
    setEnhContrast(0);
    setEnhSat(0);
    setEnhWarmth(0);
    commitCanvas(clone, 'คืนค่ารูปภาพต้นฉบับแล้ว');
  };

  const handleMainFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadFromUrl(reader.result, file.name, file.size, file.type || 'image/png');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDownloadCurrentPng = async () => {
    if (!workingCanvas) return;
    const blob = await canvasToBlob(workingCanvas, 'image/png');
    triggerBlobDownload(blob, `zimage-tool-${Date.now()}.png`);
    setStatusMsg('ดาวน์โหลดไฟล์ PNG สำเร็จ');
  };

  // --- Category 1 Handlers ---
  const handleApplyBasicStyle = () => {
    if (!workingCanvas) return;
    const styled = renderStyledCanvas(workingCanvas, {
      straightenDeg,
      skewX,
      skewY,
      cornerRadius,
      borderPx,
      borderColor,
      paddingPx,
      paddingColor,
    });
    commitCanvas(styled, 'ประยุกต์มุมเอียง/Perspective/มุมโค้ง/กรอบเรียบร้อย');
  };

  const handleFlipRotate = (action: 'cw' | 'ccw' | 'fh' | 'fv') => {
    if (!workingCanvas) return;
    const w = workingCanvas.width;
    const h = workingCanvas.height;
    const out = document.createElement('canvas');
    out.width = action === 'cw' || action === 'ccw' ? h : w;
    out.height = action === 'cw' || action === 'ccw' ? w : h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.translate(out.width / 2, out.height / 2);
    if (action === 'cw') ctx.rotate(Math.PI / 2);
    if (action === 'ccw') ctx.rotate(-Math.PI / 2);
    if (action === 'fh') ctx.scale(-1, 1);
    if (action === 'fv') ctx.scale(1, -1);
    ctx.drawImage(workingCanvas, -w / 2, -h / 2);
    ctx.restore();
    commitCanvas(out, 'หมุน / พลิกภาพสำเร็จ');
  };

  const handleCropRatio = (rw: number, rh: number) => {
    if (!workingCanvas) return;
    const w = workingCanvas.width;
    const h = workingCanvas.height;
    const targetRatio = rw / rh;
    let cw = w;
    let ch = h;
    if (w / h > targetRatio) cw = Math.round(h * targetRatio);
    else ch = Math.round(w / targetRatio);
    const sx = Math.floor((w - cw) / 2);
    const sy = Math.floor((h - ch) / 2);
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    out.getContext('2d')?.drawImage(workingCanvas, sx, sy, cw, ch, 0, 0, cw, ch);
    commitCanvas(out, `ครอปสัดส่วน ${rw}:${rh} สำเร็จ (${cw}×${ch}px)`);
  };

  const handleBuildCollage = async () => {
    if (collageUrls.length < 2) {
      setErrorMsg('กรุณาอัปโหลดอย่างน้อย 2 ภาพเพื่อสร้างคอลลาจ');
      return;
    }
    setBusy(true);
    try {
      const imgs = await Promise.all(collageUrls.map(loadHtmlImage));
      const cols = collageLayout === '1x2' ? 1 : collageLayout === '3x1' ? 3 : 2;
      const rows = collageLayout === '2x1' || collageLayout === '3x1' ? 1 : 2;
      const cellW = 600;
      const cellH = 600;
      const gap = 18;
      const canvas = document.createElement('canvas');
      canvas.width = cols * cellW + (cols + 1) * gap;
      canvas.height = rows * cellH + (rows + 1) * gap;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < Math.min(imgs.length, cols * rows); i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = gap + c * (cellW + gap);
        const y = gap + r * (cellH + gap);
        const im = imgs[i];
        const scale = Math.max(cellW / im.naturalWidth, cellH / im.naturalHeight);
        const dw = im.naturalWidth * scale;
        const dh = im.naturalHeight * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cellW, cellH);
        ctx.clip();
        ctx.drawImage(im, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
        ctx.restore();
      }
      commitCanvas(canvas, `รวมภาพคอลลาจ ${collageLayout} สำเร็จ`);
    } finally {
      setBusy(false);
    }
  };

  // --- Category 2 Handlers (AI Enhance / Upscale / Sharpen / Denoise) ---
  const handleUpscale = (factor: 2 | 4) => {
    if (!workingCanvas) return;
    const maxAllowed = 3840;
    const nw = Math.min(maxAllowed, workingCanvas.width * factor);
    const nh = Math.min(maxAllowed, workingCanvas.height * factor);
    const out = document.createElement('canvas');
    out.width = nw;
    out.height = nh;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(workingCanvas, 0, 0, nw, nh);
    const d = ctx.getImageData(0, 0, nw, nh);
    const crisp = sharpenRgba(d.data, nw, nh, 0.55);
    d.data.set(crisp);
    ctx.putImageData(d, 0, 0);
    commitCanvas(out, `ขยายความละเอียดภาพ ${factor}x + เพิ่มความคมชัด (${nw}×${nh} px)`);
  };

  const handlePixelOp = (op: 'sharpen' | 'denoise' | 'auto-enhance' | 'manual-light') => {
    if (!workingCanvas) return;
    const out = document.createElement('canvas');
    out.width = workingCanvas.width;
    out.height = workingCanvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(workingCanvas, 0, 0);
    const d = ctx.getImageData(0, 0, out.width, out.height);
    let nextData: Uint8ClampedArray = d.data;
    let msg = '';
    if (op === 'sharpen') {
      nextData = sharpenRgba(d.data, out.width, out.height, 0.9);
      msg = 'เพิ่มความคมชัด (Sharpen / Deblur) สำเร็จ';
    } else if (op === 'denoise') {
      nextData = denoiseRgba(d.data, out.width, out.height, 30);
      msg = 'ลดสัญญาณรบกวน (Denoise) สำเร็จ';
    } else if (op === 'auto-enhance') {
      nextData = autoEnhanceRgba(d.data, out.width, out.height);
      msg = 'ปรับแสง คอนทราสต์ และแก้ภาพมัวหมอกอัตโนมัติสำเร็จ';
    } else {
      nextData = applyAdjustmentsToRgba(d.data, out.width, out.height, {
        ...DEFAULT_ADJUSTMENTS,
        brightness: enhBright,
        contrast: enhContrast,
        saturation: enhSat,
        warmth: enhWarmth,
      });
      msg = 'ปรับแสงและสมดุลสี (White Balance) สำเร็จ';
    }
    d.data.set(nextData);
    ctx.putImageData(d, 0, 0);
    commitCanvas(out, msg);
  };

  // --- Category 3 Handlers (BG & Objects) ---
  const handleSmartCutout = () => {
    if (!workingCanvas) return;
    const out = document.createElement('canvas');
    out.width = workingCanvas.width;
    out.height = workingCanvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(workingCanvas, 0, 0);
    const d = ctx.getImageData(0, 0, out.width, out.height);
    const cut = removeBackgroundFromRgba(d.data, out.width, out.height, {
      tolerance: bgTol,
      feather: 1,
      globalColorKey: false,
    });
    d.data.set(cut);
    ctx.putImageData(d, 0, 0);
    commitCanvas(out, 'ลบพื้นหลังอัตโนมัติ (โปร่งใส PNG) สำเร็จ');
  };

  const handleSwapSolidBg = (hex: string) => {
    if (!workingCanvas) return;
    const out = document.createElement('canvas');
    out.width = workingCanvas.width;
    out.height = workingCanvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(workingCanvas, 0, 0);
    commitCanvas(out, `เปลี่ยนสีพื้นหลังเป็น ${hex} สำเร็จ`);
  };

  const handleSwapCustomBgImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workingCanvas) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      const bgImg = await loadHtmlImage(reader.result);
      const out = document.createElement('canvas');
      out.width = workingCanvas.width;
      out.height = workingCanvas.height;
      const ctx = out.getContext('2d');
      if (!ctx) return;
      const scale = Math.max(out.width / bgImg.naturalWidth, out.height / bgImg.naturalHeight);
      const dw = bgImg.naturalWidth * scale;
      const dh = bgImg.naturalHeight * scale;
      ctx.drawImage(bgImg, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
      ctx.drawImage(workingCanvas, 0, 0);
      commitCanvas(out, 'ซ้อนทับบนภาพพื้นหลังใหม่สำเร็จ');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddShadowOrWatermark = (mode: 'shadow' | 'watermark') => {
    if (!workingCanvas) return;
    const out = document.createElement('canvas');
    out.width = workingCanvas.width;
    out.height = workingCanvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    if (mode === 'shadow') {
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.42)';
      ctx.shadowBlur = Math.max(12, Math.round(out.width * 0.03));
      ctx.shadowOffsetY = Math.max(8, Math.round(out.height * 0.02));
      ctx.drawImage(workingCanvas, 0, 0);
      ctx.restore();
      commitCanvas(out, 'เพิ่มเงา Drop Shadow ระดับสตูดิโอสำเร็จ');
    } else {
      ctx.drawImage(workingCanvas, 0, 0);
      ctx.save();
      const fontSize = Math.max(20, Math.round(out.width * 0.05));
      ctx.font = `700 ${fontSize}px "Outfit", "Noto Sans Thai", sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.lineWidth = 2;
      ctx.translate(out.width / 2, out.height / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.textAlign = 'center';
      ctx.strokeText(watermarkText || 'ZImage', 0, 0);
      ctx.fillText(watermarkText || 'ZImage', 0, 0);
      ctx.restore();
      commitCanvas(out, 'ใส่ลายน้ำ (Watermark) ป้องกันภาพสำเร็จ');
    }
  };

  // --- Category 4 Handlers (Resize, Exact KB Compression, Batch ZIP) ---
  const handleResizePixels = (tw: number, th: number) => {
    if (!workingCanvas) return;
    const w = Math.max(16, Math.min(4096, Math.round(tw)));
    const h = Math.max(16, Math.min(4096, Math.round(th)));
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(workingCanvas, 0, 0, w, h);
    commitCanvas(out, `ปรับขนาดภาพเป็น ${w} × ${h} px สำเร็จ`);
  };

  const handleCompressToTargetKb = async () => {
    if (!workingCanvas) return;
    setBusy(true);
    try {
      const beforeBlob = await canvasToBlob(workingCanvas, 'image/png');
      const res = await compressCanvasToTargetBytes(
        workingCanvas,
        compressFormat,
        Math.max(10, targetKb) * 1024,
        '#ffffff'
      );
      setCompressReport({
        beforeBytes: beforeBlob.size,
        afterBytes: res.blob.size,
        dims: `${res.finalWidth}×${res.finalHeight} px`,
        quality: res.qualityUsed,
        blob: res.blob,
        ext: compressFormat,
      });
      setStatusMsg(
        `บีบอัดไฟล์สำเร็จ เหลือ ${(res.blob.size / 1024).toFixed(1)} KB (${res.finalWidth}×${res.finalHeight} px)`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleBatchDownloadZip = async () => {
    if (batchFiles.length === 0) return;
    setBusy(true);
    try {
      const entries: Array<{ name: string; bytes: Uint8Array }> = [];
      for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        const dataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.readAsDataURL(file);
        });
        const c = await sourceUrlToCanvas(dataUrl);
        let tw = c.width;
        let th = c.height;
        if (batchMaxW > 0 && tw > batchMaxW) {
          const s = batchMaxW / tw;
          tw = batchMaxW;
          th = Math.max(1, Math.round(th * s));
        }
        const scaled = document.createElement('canvas');
        scaled.width = tw;
        scaled.height = th;
        scaled.getContext('2d')?.drawImage(c, 0, 0, tw, th);
        const { blob, extension } = await exportCanvasInFormat(scaled, batchFormat, 86, '#ffffff');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        entries.push({ name: `${String(i + 1).padStart(2, '0')}_${base}.${extension}`, bytes });
      }
      const zipBytes = createZipArchive(entries);
      triggerBlobDownload(
        new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' }),
        `zimage-batch-${Date.now()}.zip`
      );
      setStatusMsg(`ประมวลผลและรวมไฟล์ ZIP จำนวน ${entries.length} ไฟล์สำเร็จ`);
    } finally {
      setBusy(false);
    }
  };

  // --- Category 5 Handlers (Convert + Base64) ---
  const handleConvertAndDownload = async () => {
    if (!workingCanvas) return;
    setBusy(true);
    try {
      const { blob, extension } = await exportCanvasInFormat(
        workingCanvas,
        convertFmt,
        convertQuality,
        convertOpaqueBg
      );
      triggerBlobDownload(blob, `zimage-converted.${extension}`);
      setStatusMsg(`แปลงและดาวน์โหลดไฟล์ .${extension.toUpperCase()} สำเร็จ`);
    } finally {
      setBusy(false);
    }
  };

  // --- Category 6 Handlers (ID Photo + A4 Sheet) ---
  const buildIdPhotoCanvas = (): HTMLCanvasElement | null => {
    if (!workingCanvas) return null;
    const preset = ID_PHOTO_PRESETS.find((p) => p.id === idPresetId) || ID_PHOTO_PRESETS[1];
    const out = document.createElement('canvas');
    out.width = preset.w;
    out.height = preset.h;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = idBgColor;
    ctx.fillRect(0, 0, preset.w, preset.h);
    const scale =
      Math.max(preset.w / workingCanvas.width, preset.h / workingCanvas.height) * (idZoom / 100);
    const dw = workingCanvas.width * scale;
    const dh = workingCanvas.height * scale;
    const dx = (preset.w - dw) / 2;
    const dy = (preset.h - dh) / 2 + (idOffsetY / 100) * preset.h;
    ctx.drawImage(workingCanvas, dx, dy, dw, dh);
    return out;
  };

  const handleDownloadIdPhoto = async (asA4Sheet: boolean) => {
    const single = buildIdPhotoCanvas();
    if (!single) return;
    setBusy(true);
    try {
      const target = asA4Sheet ? generateA4PrintSheetCanvas(single, 4, 4) : single;
      const blob = await canvasToBlob(target, 'image/png');
      triggerBlobDownload(
        blob,
        asA4Sheet ? `zimage-id-a4-sheet-${idPresetId}.png` : `zimage-id-${idPresetId}.png`
      );
      setStatusMsg(
        asA4Sheet
          ? 'สร้างใบพิมพ์ A4 (300 DPI · 16 รูปพร้อมเส้นตัด) สำเร็จ'
          : 'ดาวน์โหลดรูปติดบัตรความละเอียด 300 DPI สำเร็จ'
      );
    } finally {
      setBusy(false);
    }
  };

  // --- Category 7 Handlers (Image Intelligence: AI Vision + QR Scan) ---
  const handleRunVisionIntelligence = async (
    mode: 'ocr-text' | 'ocr-table' | 'handwriting' | 'describe' | 'alt-text'
  ) => {
    if (!workingCanvas) return;
    setBusy(true);
    setAiVisionMode(mode);
    setErrorMsg(null);
    try {
      const dataUrl = workingCanvas.toDataURL('image/jpeg', 0.88);
      const res = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl, mode }),
      });
      const data = (await res.json()) as { text?: string; engine?: string; error?: string };
      if (!res.ok || !data.text) {
        setErrorMsg(data.error || 'ไม่สามารถวิเคราะห์ภาพได้');
        return;
      }
      setAiVisionOutput(data.text);
      setStatusMsg(`วิเคราะห์ภาพด้วย ${data.engine || VISION_PROMPT_MODEL} สำเร็จ`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'การเชื่อมต่อล้มเหลว');
    } finally {
      setBusy(false);
    }
  };

  const handleScanQrFromCanvas = () => {
    if (!workingCanvas) return;
    const ctx = workingCanvas.getContext('2d');
    if (!ctx) return;
    const d = ctx.getImageData(0, 0, workingCanvas.width, workingCanvas.height);
    const decoded = jsQR(d.data, workingCanvas.width, workingCanvas.height);
    if (decoded?.data) {
      setQrDecoded(decoded.data);
      setStatusMsg('สแกนพบข้อมูล QR Code ในภาพแล้ว');
    } else {
      setQrDecoded('ไม่พบ QR Code ที่อ่านได้ในภาพนี้');
    }
  };

  // --- Category 8 Handlers (Design & Creation) ---
  const handleGenerateMeme = () => {
    if (!workingCanvas) return;
    const out = document.createElement('canvas');
    out.width = workingCanvas.width;
    out.height = workingCanvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(workingCanvas, 0, 0);
    const fs = Math.max(24, Math.round(out.width * 0.065));
    ctx.font = `800 ${fs}px Impact, "Noto Sans Thai", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(3, Math.round(fs * 0.14));
    if (memeTop.trim()) {
      ctx.strokeText(memeTop.trim(), out.width / 2, fs * 1.25, out.width - 32);
      ctx.fillText(memeTop.trim(), out.width / 2, fs * 1.25, out.width - 32);
    }
    if (memeBottom.trim()) {
      ctx.strokeText(memeBottom.trim(), out.width / 2, out.height - fs * 0.45, out.width - 32);
      ctx.fillText(memeBottom.trim(), out.width / 2, out.height - fs * 0.45, out.width - 32);
    }
    commitCanvas(out, 'สร้างภาพ Meme สำเร็จ');
  };

  const handleBuildBeforeAfter = async () => {
    if (!workingCanvas) return;
    const leftCanvas = compareBeforeUrl
      ? await sourceUrlToCanvas(compareBeforeUrl)
      : originalCanvas || workingCanvas;
    const h = Math.max(480, Math.min(1000, workingCanvas.height));
    const lw = Math.round((leftCanvas.width / leftCanvas.height) * h);
    const rw = Math.round((workingCanvas.width / workingCanvas.height) * h);
    const gap = 12;
    const out = document.createElement('canvas');
    out.width = lw + rw + gap;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(leftCanvas, 0, 0, lw, h);
    ctx.drawImage(workingCanvas, lw + gap, 0, rw, h);

    const drawBadge = (label: string, x: number) => {
      ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
      ctx.fillRect(x + 18, 18, 130, 38);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px "Outfit", "Noto Sans Thai", sans-serif';
      ctx.fillText(label, x + 34, 43);
    };
    drawBadge('BEFORE', 0);
    drawBadge('AFTER', lw + gap);
    commitCanvas(out, 'สร้างภาพเปรียบเทียบ Before / After สำเร็จ');
  };

  const handleGridSplitZip = async () => {
    if (!workingCanvas) return;
    setBusy(true);
    try {
      const cols = 3;
      const rows = splitMode === '3x3' ? 3 : 1;
      const tileW = Math.floor(workingCanvas.width / cols);
      const tileH = Math.floor(workingCanvas.height / rows);
      const entries: Array<{ name: string; bytes: Uint8Array }> = [];
      let idx = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = document.createElement('canvas');
          tile.width = tileW;
          tile.height = tileH;
          tile.getContext('2d')?.drawImage(workingCanvas, c * tileW, r * tileH, tileW, tileH, 0, 0, tileW, tileH);
          const blob = await canvasToBlob(tile, 'image/png');
          entries.push({
            name: `grid_${splitMode}_tile_${idx++}.png`,
            bytes: new Uint8Array(await blob.arrayBuffer()),
          });
        }
      }
      const zip = createZipArchive(entries);
      triggerBlobDownload(
        new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }),
        `zimage-grid-${splitMode}.zip`
      );
      setStatusMsg(`ตัดแบ่งภาพ Grid ${splitMode} และดาวน์โหลด ZIP (${entries.length} ชิ้น) สำเร็จ`);
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateQrCode = async (downloadSvg: boolean = false) => {
    if (!qrInputText.trim()) return;
    if (downloadSvg) {
      const svg = await QRCode.toString(qrInputText.trim(), {
        type: 'svg',
        width: 512,
        color: { dark: qrFgColor, light: '#ffffff' },
      });
      triggerBlobDownload(
        new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
        'zimage-qrcode.svg'
      );
      setStatusMsg('ดาวน์โหลด QR Code แบบ SVG สำเร็จ');
      return;
    }
    const url = await QRCode.toDataURL(qrInputText.trim(), {
      width: 640,
      margin: 2,
      color: { dark: qrFgColor, light: '#ffffff' },
    });
    setQrPreviewUrl(url);
    setStatusMsg('สร้าง QR Code ความละเอียดสูงสำเร็จ');
  };

  const handleDownloadFaviconKit = async () => {
    if (!workingCanvas) return;
    setBusy(true);
    try {
      const sizes = [16, 32, 180];
      const entries: Array<{ name: string; bytes: Uint8Array }> = [];
      for (const sz of sizes) {
        const c = document.createElement('canvas');
        c.width = sz;
        c.height = sz;
        c.getContext('2d')?.drawImage(workingCanvas, 0, 0, sz, sz);
        const blob = await canvasToBlob(c, 'image/png');
        const fname = sz === 180 ? 'apple-touch-icon.png' : `favicon-${sz}x${sz}.png`;
        entries.push({ name: fname, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      const icoCanvas = document.createElement('canvas');
      icoCanvas.width = 32;
      icoCanvas.height = 32;
      icoCanvas.getContext('2d')?.drawImage(workingCanvas, 0, 0, 32, 32);
      const icoRes = await exportCanvasInFormat(icoCanvas, 'ico');
      entries.push({ name: 'favicon.ico', bytes: new Uint8Array(await icoRes.blob.arrayBuffer()) });

      const manifest = JSON.stringify(
        {
          name: 'ZImage Web App',
          icons: [
            { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
            { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
          ],
        },
        null,
        2
      );
      entries.push({ name: 'site.webmanifest', bytes: new TextEncoder().encode(manifest) });
      const zip = createZipArchive(entries);
      triggerBlobDownload(
        new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }),
        'zimage-favicon-kit.zip'
      );
      setStatusMsg('สร้าง Favicon Kit (16px, 32px, 180px, .ICO, manifest.json) สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  // --- Category 9 Handlers (Privacy & Security) ---
  const handleApplyPrivacyRedact = () => {
    if (!workingCanvas) return;
    const w = workingCanvas.width;
    const h = workingCanvas.height;
    const rect = {
      x: (redactRectPct.x / 100) * w,
      y: (redactRectPct.y / 100) * h,
      width: (redactRectPct.w / 100) * w,
      height: (redactRectPct.h / 100) * h,
    };
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(workingCanvas, 0, 0);
    if (redactMode === 'black') {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else {
      const d = ctx.getImageData(0, 0, w, h);
      const next =
        redactMode === 'pixelate'
          ? pixelateRegionRgba(d.data, w, h, rect, Math.max(10, Math.round(w * 0.025)))
          : blurRegionRgba(d.data, w, h, rect, 12);
      d.data.set(next);
      ctx.putImageData(d, 0, 0);
    }
    commitCanvas(out, `ปิดทับข้อมูลส่วนตัว (${redactMode}) เรียบร้อยแล้ว`);
  };

  const handleStripExifDownload = async () => {
    if (!workingCanvas) return;
    // Canvas re-encode strips all EXIF/GPS/Camera metadata completely
    const cleanBlob = await canvasToBlob(workingCanvas, 'image/png');
    triggerBlobDownload(cleanBlob, `zimage-clean-no-exif-${Date.now()}.png`);
    setStatusMsg('ล้าง EXIF / GPS / ข้อมูลกล้องออกทั้งหมดและดาวน์โหลดภาพสะอาดเรียบร้อย');
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (category !== 'privacy') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    dragStartRef.current = { xPct, yPct };
    setRedactRectPct({ x: xPct, y: yPct, w: 4, h: 4 });
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (category !== 'privacy' || !dragStartRef.current) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const cx = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const cy = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    const x = Math.min(dragStartRef.current.xPct, cx);
    const y = Math.min(dragStartRef.current.yPct, cy);
    const w = Math.max(3, Math.abs(cx - dragStartRef.current.xPct));
    const h = Math.max(3, Math.abs(cy - dragStartRef.current.yPct));
    setRedactRectPct({ x, y, w, h });
  };

  const handleCanvasPointerUp = () => {
    dragStartRef.current = null;
  };

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] dark:border-slate-800 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
            ZImage Problem Solver — ศูนย์แก้ปัญหาเกี่ยวกับรูปภาพ 9 หมวดครบวงจร
          </h1>
          <p className="mt-1 text-sm text-[#475569] dark:text-slate-300">
            เปิดไม่ได้ ไฟล์ใหญ่ ภาพแตก พื้นหลังไม่สวย รูปติดบัตร อ่านข้อความ OCR หรือลบพิกัด EXIF จบในเว็บเดียว
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.svg"
            onChange={handleMainFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>อัปโหลดรูปภาพใหม่</span>
          </button>
          <button
            type="button"
            onClick={handleResetToOriginal}
            disabled={!originalCanvas}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#0B1F3A] px-3.5 py-2 text-xs font-medium text-[#101820] dark:text-[#F8FAFC] hover:bg-[#F7F9FC] dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>คืนต้นฉบับ</span>
          </button>
          <button
            type="button"
            disabled={!workingCanvas}
            onClick={() => {
              if (!workingCanvas) return;
              onOpenInProEditor({
                id: `tools-${Date.now()}`,
                title: sourceName,
                imageUrl: workingCanvas.toDataURL('image/png'),
                originalPrompt: sourceName,
                enhancedPrompt: `Image edited in ZImage Problem Solver (${sourceName})`,
                stylePreset: 'auto',
                aspectRatio: '1:1',
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#2563EB] dark:border-[#60A5FA] bg-[#2563EB]/10 dark:bg-[#60A5FA]/15 px-3.5 py-2 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#2563EB]/20 cursor-pointer disabled:opacity-50"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>ส่งต่อไปแต่งภาพ Pro</span>
          </button>
        </div>
      </div>

      {/* 9-Category Selector Grid */}
      <nav aria-label="หมวดหมู่เครื่องมือแก้ปัญหาภาพ 9 หมวด" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-9">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                active
                  ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#2563EB]/10 dark:bg-[#60A5FA]/15 text-[#101820] dark:text-[#F8FAFC] ring-1 ring-[#2563EB] dark:ring-[#60A5FA]'
                  : 'border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0B1F3A] text-[#475569] dark:text-slate-300 hover:border-[#2563EB]/50 dark:hover:border-[#60A5FA]/50 hover:bg-[#F7F9FC] dark:hover:bg-[#101820]'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <Icon className={`h-4 w-4 ${active ? 'text-[#2563EB] dark:text-[#60A5FA]' : 'text-[#64748B] dark:text-slate-400'}`} />
                <span className="text-[10px] font-mono-tabular font-bold text-[#64748B] dark:text-slate-400">
                  0{cat.num}
                </span>
              </div>
              <p className="text-xs font-semibold leading-tight text-[#101820] dark:text-[#F8FAFC]">{cat.title}</p>
              <p className="text-[10px] leading-snug text-[#64748B] dark:text-slate-400 line-clamp-2">{cat.subtitle}</p>
            </button>
          );
        })}
      </nav>

      {/* Main Split: Preview Canvas (Left) + Active Category Tool Workbench (Right) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_440px] lg:items-start">
        {/* Left: Live Image Preview Stage */}
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0B1F3A] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-slate-800 pb-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#101820] dark:text-[#F8FAFC]">{sourceName}</p>
              {workingCanvas && (
                <p className="text-xs text-[#64748B] dark:text-slate-400 font-mono-tabular">
                  {workingCanvas.width} × {workingCanvas.height} px
                  {sharpnessInfo ? ` · ความคมชัด ${sharpnessInfo.score}/100 (${sharpnessInfo.verdict})` : ''}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={!workingCanvas}
              onClick={handleDownloadCurrentPng}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>ดาวน์โหลด PNG</span>
            </button>
          </div>

          <div className="checkerboard-stage relative flex min-h-[380px] max-h-[580px] items-center justify-center overflow-auto rounded-xl border border-[#E2E8F0] dark:border-slate-700 p-4">
            <canvas
              ref={previewCanvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className={`max-h-[540px] max-w-full rounded object-contain shadow-sm ${
                category === 'privacy' ? 'cursor-crosshair' : 'cursor-default'
              }`}
            />
          </div>

          {statusMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
              <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
              <span>{statusMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div role="alert" className="rounded-xl border border-red-300 dark:border-red-500/45 bg-red-50 dark:bg-red-950/50 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-200">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Right: Category-Specific Problem Solving Panel */}
        <aside className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#0B1F3A] p-5 space-y-5 text-[#101820] dark:text-[#F8FAFC]">
          {/* 1. Basic Editing */}
          {category === 'basic' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  1. จัดการและแก้ไขรูปภาพ (Basic Editing)
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  หมุน พลิก ปรับองศาเอียง แก้ภาพบิด Perspective มุมโค้ง กรอบ และคอลลาจ
                </p>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <button type="button" onClick={() => handleFlipRotate('ccw')} className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer">
                  หมุนซ้าย
                </button>
                <button type="button" onClick={() => handleFlipRotate('cw')} className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer">
                  หมุนขวา
                </button>
                <button type="button" onClick={() => handleFlipRotate('fh')} className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer">
                  พลิกซ้ายขวา
                </button>
                <button type="button" onClick={() => handleFlipRotate('fv')} className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer">
                  พลิกบนล่าง
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'ครอป 1:1', w: 1, h: 1 },
                  { label: '16:9', w: 16, h: 9 },
                  { label: '4:3', w: 4, h: 3 },
                  { label: '3:4', w: 3, h: 4 },
                ].map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => handleCropRatio(c.w, c.h)}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-1.5 text-xs font-mono-tabular font-medium hover:bg-[#2563EB] hover:text-white dark:hover:bg-[#60A5FA] dark:hover:text-[#0B1F3A] cursor-pointer"
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2.5 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <div>
                  <div className="flex justify-between text-xs">
                    <span>ปรับเอียงอิสระ (Straighten)</span>
                    <span className="font-mono-tabular">{straightenDeg}°</span>
                  </div>
                  <input type="range" min={-45} max={45} value={straightenDeg} onChange={(e) => setStraightenDeg(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Perspective X</span>
                      <span className="font-mono-tabular">{skewX}</span>
                    </div>
                    <input type="range" min={-25} max={25} value={skewX} onChange={(e) => setSkewX(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px]">
                      <span>Perspective Y</span>
                      <span className="font-mono-tabular">{skewY}</span>
                    </div>
                    <input type="range" min={-25} max={25} value={skewY} onChange={(e) => setSkewY(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs">
                    <span>ความโค้งมุม (Rounded Corners PNG)</span>
                    <span className="font-mono-tabular">{cornerRadius}px</span>
                  </div>
                  <input type="range" min={0} max={140} value={cornerRadius} onChange={(e) => setCornerRadius(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[11px] text-[#64748B] dark:text-slate-400">ขอบกรอบ ({borderPx}px)</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input type="range" min={0} max={40} value={borderPx} onChange={(e) => setBorderPx(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                      <input type="color" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} className="h-6 w-8 rounded border border-[#E2E8F0] dark:border-slate-700" />
                    </div>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#64748B] dark:text-slate-400">ขยายพื้นขอบ ({paddingPx}px)</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input type="range" min={0} max={80} value={paddingPx} onChange={(e) => setPaddingPx(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                      <input type="color" value={paddingColor} onChange={(e) => setPaddingColor(e.target.value)} className="h-6 w-8 rounded border border-[#E2E8F0] dark:border-slate-700" />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleApplyBasicStyle}
                  className="w-full rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  นำค่าเอียง / Perspective / กรอบ ลงในภาพ
                </button>
              </div>

              {/* Collage Maker */}
              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <p className="text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">สร้างภาพคอลลาจ (Collage Maker)</p>
                <input
                  ref={collageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []).slice(0, 4);
                    Promise.all(
                      files.map(
                        (f) =>
                          new Promise<string>((res) => {
                            const r = new FileReader();
                            r.onload = () => res(String(r.result || ''));
                            r.readAsDataURL(f);
                          })
                      )
                    ).then(setCollageUrls);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => collageInputRef.current?.click()}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] px-3 py-1.5 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer"
                  >
                    เลือก 2–4 ภาพ ({collageUrls.length})
                  </button>
                  {(['2x1', '1x2', '2x2', '3x1'] as const).map((lay) => (
                    <button
                      key={lay}
                      type="button"
                      onClick={() => setCollageLayout(lay)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-mono-tabular cursor-pointer ${
                        collageLayout === lay
                          ? 'bg-[#2563EB] text-white dark:bg-[#60A5FA] dark:text-[#0B1F3A]'
                          : 'border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820]'
                      }`}
                    >
                      {lay}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={busy || collageUrls.length < 2}
                  onClick={handleBuildCollage}
                  className="w-full rounded-xl bg-[#2563EB] py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer disabled:opacity-40"
                >
                  รวมภาพเป็นคอลลาจทันที
                </button>
              </div>
            </div>
          )}

          {/* 2. AI Enhancement */}
          {category === 'enhance' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  2. ปรับปรุงคุณภาพภาพด้วย AI (AI Enhancement)
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  แก้ภาพแตก เบลอ มืด มี Noise และปรับแสง-สมดุลสีอัตโนมัติ
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => handleUpscale(2)} className="rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer">
                  ขยายภาพคมชัด 2x
                </button>
                <button type="button" onClick={() => handleUpscale(4)} className="rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer">
                  ขยายภาพคมชัด 4x
                </button>
                <button type="button" onClick={() => handlePixelOp('sharpen')} className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2.5 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer">
                  แก้ภาพเบลอ (Sharpen)
                </button>
                <button type="button" onClick={() => handlePixelOp('denoise')} className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2.5 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer">
                  ลดจุดรบกวน (Denoise)
                </button>
              </div>

              <button
                type="button"
                onClick={() => handlePixelOp('auto-enhance')}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#2563EB]/40 dark:border-[#60A5FA]/40 bg-[#2563EB]/10 dark:bg-[#60A5FA]/15 py-2.5 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#2563EB]/20 cursor-pointer"
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span>Auto Enhance (แก้หมอกควัน &amp; เร่งความสดชัดอัตโนมัติ)</span>
              </button>

              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                {[
                  { label: 'Exposure / สว่าง', val: enhBright, set: setEnhBright, min: -60, max: 60 },
                  { label: 'Contrast / มิติ', val: enhContrast, set: setEnhContrast, min: -60, max: 60 },
                  { label: 'Saturation / สีสด', val: enhSat, set: setEnhSat, min: -100, max: 100 },
                  { label: 'White Balance / โทนอุ่น-เย็น', val: enhWarmth, set: setEnhWarmth, min: -50, max: 50 },
                ].map((c) => (
                  <div key={c.label}>
                    <div className="flex justify-between text-xs">
                      <span>{c.label}</span>
                      <span className="font-mono-tabular">{c.val}</span>
                    </div>
                    <input
                      type="range"
                      min={c.min}
                      max={c.max}
                      value={c.val}
                      onChange={(e) => c.set(Number(e.target.value))}
                      className="w-full accent-[#2563EB] dark:accent-[#60A5FA]"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => handlePixelOp('manual-light')}
                  className="w-full rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  บันทึกค่าแสงและสีลงในภาพ
                </button>
              </div>
            </div>
          )}

          {/* 3. Background & Objects */}
          {category === 'background' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  3. จัดการพื้นหลังและวัตถุ (Background &amp; Objects)
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  ลบพื้นหลัง 1 คลิก เปลี่ยนสี/ภาพฉากหลัง เพิ่มเงาสินค้า และใส่ลายน้ำ
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>ความไวตัดขอบพื้นหลัง</span>
                  <span className="font-mono-tabular">{bgTol}</span>
                </div>
                <input type="range" min={8} max={75} value={bgTol} onChange={(e) => setBgTol(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                <button
                  type="button"
                  onClick={handleSmartCutout}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  <span>ลบพื้นหลังอัตโนมัติ (โปร่งใส PNG)</span>
                </button>
              </div>

              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">เปลี่ยนสีพื้นหลัง / ภาพฉากหลัง</span>
                <div className="flex flex-wrap items-center gap-2">
                  {['#ffffff', '#1d4ed8', '#111827', '#f5f5f4', '#ef4444'].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => handleSwapSolidBg(hex)}
                      aria-label={`เปลี่ยนพื้นหลังเป็นสี ${hex}`}
                      className="h-8 w-8 rounded-lg border border-[#E2E8F0] dark:border-slate-700 cursor-pointer"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  <input type="color" value={bgColorSwap} onChange={(e) => setBgColorSwap(e.target.value)} className="h-8 w-10 rounded border border-[#E2E8F0] dark:border-slate-700" />
                  <button
                    type="button"
                    onClick={() => handleSwapSolidBg(bgColorSwap)}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] px-3 py-1.5 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer"
                  >
                    ใส่สีนี้
                  </button>
                </div>
                <input ref={bgCustomInputRef} type="file" accept="image/*" onChange={handleSwapCustomBgImage} className="hidden" />
                <button
                  type="button"
                  onClick={() => bgCustomInputRef.current?.click()}
                  className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium text-[#101820] dark:text-[#F8FAFC] hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer"
                >
                  อัปโหลดภาพพื้นหลังใหม่มาซ้อนด้านหลัง
                </button>
              </div>

              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => handleAddShadowOrWatermark('shadow')}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>เพิ่มเงาสินค้า (Drop Shadow)</span>
                </button>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="ข้อความลายน้ำ..."
                    className="flex-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddShadowOrWatermark('watermark')}
                    className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                  >
                    ใส่ลายน้ำ
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. Resize & Compress */}
          {category === 'resize' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  4. ย่อ-ขยาย &amp; บีบอัดตามขนาด KB (Resize &amp; Compress)
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  ย่อภาพให้ไม่เกิน 200KB ส่งสมัครงาน/ราชการ หรือประมวลผลหลายภาพเป็น ZIP
                </p>
              </div>

              {/* Compress to Exact KB */}
              <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] p-3.5 space-y-2.5">
                <span className="block text-xs font-bold text-[#101820] dark:text-[#F8FAFC]">
                  บีบอัดให้ไม่เกินขนาด KB ที่ต้องการ
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[100, 200, 500, 1024].map((kb) => (
                    <button
                      key={kb}
                      type="button"
                      onClick={() => setTargetKb(kb)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-mono-tabular font-semibold cursor-pointer ${
                        targetKb === kb
                          ? 'bg-[#2563EB] text-white dark:bg-[#60A5FA] dark:text-[#0B1F3A]'
                          : 'border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#0B1F3A]'
                      }`}
                    >
                      {kb >= 1024 ? '1 MB' : `${kb} KB`}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={15}
                    max={5000}
                    value={targetKb}
                    onChange={(e) => setTargetKb(Number(e.target.value) || 200)}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs font-mono-tabular"
                    aria-label="เป้าหมาย KB"
                  />
                  <select
                    value={compressFormat}
                    onChange={(e) => setCompressFormat(e.target.value as 'jpg' | 'webp' | 'png')}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs font-medium"
                  >
                    <option value="jpg">JPG (แนะนำ)</option>
                    <option value="webp">WebP</option>
                    <option value="png">PNG</option>
                  </select>
                </div>
                <button
                  type="button"
                  disabled={busy || !workingCanvas}
                  onClick={handleCompressToTargetKb}
                  className="w-full rounded-xl bg-[#2563EB] py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  บีบอัดให้ไม่เกิน {targetKb} KB ทันที
                </button>
                {compressReport && (
                  <div className="rounded-lg border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 space-y-2 text-xs">
                    <div className="flex justify-between font-mono-tabular text-[#101820] dark:text-[#F8FAFC]">
                      <span>ก่อน: {(compressReport.beforeBytes / 1024).toFixed(1)} KB</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">
                        หลัง: {(compressReport.afterBytes / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        triggerBlobDownload(
                          compressReport.blob,
                          `zimage-compressed-${targetKb}kb.${compressReport.ext}`
                        )
                      }
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>ดาวน์โหลดไฟล์ที่บีบอัดแล้ว (.{compressReport.ext.toUpperCase()})</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Exact Pixel Resize + Social Presets */}
              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">ปรับขนาดพิกเซล (Resize) &amp; พรีเซ็ตโซเชียล/โปสเตอร์/โฆษณา</span>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={keepAspect} onChange={(e) => setKeepAspect(e.target.checked)} className="accent-[#2563EB] dark:accent-[#60A5FA]" />
                    <span>ล็อกสัดส่วน</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={resizeW}
                    onChange={(e) => {
                      const nw = Number(e.target.value) || 64;
                      setResizeW(nw);
                      if (keepAspect && workingCanvas) {
                        setResizeH(Math.max(16, Math.round((nw * workingCanvas.height) / workingCanvas.width)));
                      }
                    }}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs font-mono-tabular"
                    aria-label="Width px"
                  />
                  <input
                    type="number"
                    value={resizeH}
                    onChange={(e) => {
                      const nh = Number(e.target.value) || 64;
                      setResizeH(nh);
                      if (keepAspect && workingCanvas) {
                        setResizeW(Math.max(16, Math.round((nh * workingCanvas.width) / workingCanvas.height)));
                      }
                    }}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-1.5 text-xs font-mono-tabular"
                    aria-label="Height px"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SOCIAL_RESIZE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleResizePixels(p.w, p.h)}
                      className="rounded border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] px-2 py-1 text-[11px] hover:bg-[#2563EB] hover:text-white dark:hover:bg-[#60A5FA] dark:hover:text-[#0B1F3A] cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleResizePixels(resizeW, resizeH)}
                  className="w-full rounded-xl bg-[#2563EB] py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  ย่อ/ขยายเป็น {resizeW} × {resizeH} px
                </button>
                {workingCanvas && (
                  <p className="text-[11px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                    ขนาดพิมพ์คมชัด 300 DPI: {((workingCanvas.width / 300) * 2.54).toFixed(1)} ×{' '}
                    {((workingCanvas.height / 300) * 2.54).toFixed(1)} cm
                  </p>
                )}
              </div>

              {/* Batch ZIP */}
              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  Batch ย่อ/แปลงไฟล์หลายภาพพร้อมกัน -&gt; ZIP
                </span>
                <input
                  ref={batchInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    setBatchFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => batchInputRef.current?.click()}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-1.5 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer"
                  >
                    เลือกไฟล์ ({batchFiles.length})
                  </button>
                  <input
                    type="number"
                    value={batchMaxW}
                    onChange={(e) => setBatchMaxW(Number(e.target.value) || 1280)}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2 py-1.5 text-xs font-mono-tabular"
                    title="Max Width px"
                  />
                  <select
                    value={batchFormat}
                    onChange={(e) => setBatchFormat(e.target.value as 'jpg' | 'webp' | 'png')}
                    className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2 py-1.5 text-xs"
                  >
                    <option value="webp">WebP</option>
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                  </select>
                </div>
                <button
                  type="button"
                  disabled={busy || batchFiles.length === 0}
                  onClick={handleBatchDownloadZip}
                  className="w-full rounded-xl bg-[#2563EB] py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer disabled:opacity-40"
                >
                  แปลงและดาวน์โหลดทั้งหมดเป็น .ZIP
                </button>
              </div>
            </div>
          )}

          {/* 5. Image Converter */}
          {category === 'convert' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  5. แปลงไฟล์รูปภาพ &amp; Vector (Image Converter)
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  แปลงเป็น PNG, JPG, WebP, AVIF, TIFF, BMP, ICO, True SVG Vector, PDF และ Base64
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="tool-convert-fmt" className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  เลือกรูปแบบไฟล์ปลายทาง
                </label>
                <select
                  id="tool-convert-fmt"
                  value={convertFmt}
                  onChange={(e) => setConvertFmt(e.target.value as ExportFormatId)}
                  className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 py-2 text-xs font-medium"
                >
                  {EXPORT_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[11px] text-[#64748B] dark:text-slate-400">คุณภาพ ({convertQuality}%)</span>
                    <input type="range" min={30} max={100} value={convertQuality} onChange={(e) => setConvertQuality(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>สีพื้นหลัง (JPG/TIFF/PDF)</span>
                    <input type="color" value={convertOpaqueBg} onChange={(e) => setConvertOpaqueBg(e.target.value)} className="h-7 w-9 rounded border border-[#E2E8F0] dark:border-slate-700" />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || !workingCanvas}
                  onClick={handleConvertAndDownload}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>แปลงไฟล์และดาวน์โหลดทันที</span>
                </button>
              </div>

              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  Image &lt;-&gt; Base64 (สำหรับนักพัฒนาเว็บ)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!workingCanvas) return;
                      setBase64Text(workingCanvas.toDataURL('image/png'));
                    }}
                    className="flex-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-1.5 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Image -&gt; Base64
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (base64Text.startsWith('data:image/')) {
                        loadFromUrl(base64Text, 'base64-decoded.png');
                      }
                    }}
                    className="flex-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-1.5 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Base64 -&gt; Image
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={base64Text}
                  onChange={(e) => setBase64Text(e.target.value)}
                  placeholder="วางโค้ด data:image/...;base64,... ที่นี่"
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] p-2 text-[11px] font-mono-tabular"
                />
              </div>
            </div>
          )}

          {/* 6. Profile & ID Photo */}
          {category === 'idphoto' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  6. รูปติดบัตร &amp; โปรไฟล์ (ID &amp; Job Application Photo)
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  จัดขนาดสมัครงาน 1–2 นิ้ว พาสปอร์ต เปลี่ยนพื้นหลังสีสุภาพ และสร้างใบพิมพ์ A4 300 DPI
                </p>
              </div>

              <div className="space-y-1.5">
                {ID_PHOTO_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setIdPresetId(p.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs cursor-pointer ${
                      idPresetId === p.id
                        ? 'border-[#2563EB] dark:border-[#60A5FA] bg-[#2563EB]/10 dark:bg-[#60A5FA]/15 text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                        : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] text-[#475569] dark:text-slate-300 hover:bg-[#EEF3FA] dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{p.label}</span>
                    <span className="font-mono-tabular text-[11px] opacity-80">{p.desc}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">1. ลบพื้นหลังเดิม (ถ้าต้องการ)</span>
                <button
                  type="button"
                  onClick={handleSmartCutout}
                  className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium text-[#101820] dark:text-[#F8FAFC] hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer"
                >
                  ตัดพื้นหลังเดิมออกอัตโนมัติ
                </button>
                <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] pt-1">2. เลือกสีพื้นหลังติดบัตร</span>
                <div className="flex gap-2">
                  {[
                    { hex: '#ffffff', name: 'ขาว' },
                    { hex: '#1d4ed8', name: 'ฟ้า/น้ำเงิน' },
                    { hex: '#1e3a8a', name: 'กรมท่า' },
                    { hex: '#dc2626', name: 'แดง' },
                  ].map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setIdBgColor(c.hex)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium cursor-pointer ${
                        idBgColor === c.hex
                          ? 'ring-2 ring-[#2563EB] dark:ring-[#60A5FA] border-[#2563EB] dark:border-[#60A5FA]'
                          : 'border-[#E2E8F0] dark:border-slate-700'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[11px]">ซูมใบหน้า ({idZoom}%)</span>
                    <input type="range" min={80} max={200} value={idZoom} onChange={(e) => setIdZoom(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                  </div>
                  <div>
                    <span className="text-[11px]">เลื่อนขึ้น-ลง ({idOffsetY}%)</span>
                    <input type="range" min={-30} max={30} value={idOffsetY} onChange={(e) => setIdOffsetY(Number(e.target.value))} className="w-full accent-[#2563EB] dark:accent-[#60A5FA]" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDownloadIdPhoto(false)}
                  className="rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  ดาวน์โหลดรูปเดี่ยว
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDownloadIdPhoto(true)}
                  className="rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  สร้างใบพิมพ์ A4 (16 รูป)
                </button>
              </div>
              <p className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] p-2.5 text-[11px] leading-relaxed text-[#475569] dark:text-slate-300">
                คำแนะนำ: กรุณาตรวจสอบข้อกำหนดขนาด สีพื้นหลัง และระเบียบแต่งกายของหน่วยงานปลายทางอีกครั้งก่อนนำไปยื่นเอกสารจริง
              </p>
            </div>
          )}

          {/* 7. Image Intelligence */}
          {category === 'intelligence' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  7. อ่านข้อมูลและวิเคราะห์ภาพ (Image Intelligence)
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  OCR อ่านข้อความ ตาราง CSV ลายมือ สแกน QR Code และดูดโทนสี Hex ด้วย {VISION_PROMPT_MODEL}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => handleRunVisionIntelligence('ocr-text')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer disabled:opacity-50">
                  <ScanText className="h-3.5 w-3.5" />
                  <span>OCR อ่านข้อความ</span>
                </button>
                <button type="button" disabled={busy} onClick={() => handleRunVisionIntelligence('ocr-table')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer disabled:opacity-50">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>OCR ตาราง -&gt; CSV</span>
                </button>
                <button type="button" disabled={busy} onClick={() => handleRunVisionIntelligence('handwriting')} className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50">
                  อ่านลายมือ (Handwriting)
                </button>
                <button type="button" disabled={busy} onClick={() => handleRunVisionIntelligence('alt-text')} className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50">
                  สร้าง Alt Text SEO
                </button>
                <button type="button" disabled={busy} onClick={() => handleRunVisionIntelligence('describe')} className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50">
                  AI อธิบายภาพ
                </button>
                <button type="button" onClick={handleScanQrFromCanvas} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer">
                  <QrCode className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                  <span>สแกน QR Code</span>
                </button>
              </div>

              {qrDecoded && (
                <div className="rounded-xl border border-[#2563EB]/35 dark:border-[#60A5FA]/35 bg-[#2563EB]/10 dark:bg-[#60A5FA]/15 p-3 text-xs space-y-1">
                  <p className="font-semibold text-[#101820] dark:text-[#F8FAFC]">ผลสแกน QR Code:</p>
                  <p className="break-all font-mono-tabular text-[#101820] dark:text-[#F8FAFC]">{qrDecoded}</p>
                </div>
              )}

              {aiVisionOutput && (
                <div className="space-y-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">ผลวิเคราะห์จาก AI Vision</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopyText(aiVisionOutput, 'vision')}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] cursor-pointer"
                      >
                        {copiedKey === 'vision' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>คัดลอก</span>
                      </button>
                      {aiVisionMode === 'ocr-table' && (
                        <button
                          type="button"
                          onClick={() =>
                            triggerBlobDownload(
                              new Blob(['\ufeff' + aiVisionOutput], { type: 'text/csv;charset=utf-8' }),
                              'zimage-table.csv'
                            )
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 cursor-pointer"
                        >
                          <FileText className="h-3 w-3" />
                          <span>โหลด .CSV</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[#101820] dark:text-[#F8FAFC]">
                    {aiVisionOutput}
                  </pre>
                </div>
              )}

              {/* Palette & Sharpness */}
              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  <Palette className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                  <span>โทนสีหลักในภาพ (คลิกเพื่อคัดลอก Hex)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {palette.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      onClick={() => handleCopyText(sw.hex, sw.hex)}
                      className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] p-1.5 text-left hover:border-[#2563EB] dark:hover:border-[#60A5FA] cursor-pointer"
                    >
                      <span className="h-5 w-5 rounded border border-black/15 shrink-0" style={{ backgroundColor: sw.hex }} />
                      <span className="text-[11px] font-mono-tabular truncate">
                        {copiedKey === sw.hex ? 'Copied!' : sw.hex}
                      </span>
                    </button>
                  ))}
                </div>
                {sourceMeta.bytes > 0 && (
                  <p className="text-[11px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
                    ไฟล์นำเข้า: {(sourceMeta.bytes / 1024).toFixed(1)} KB · {sourceMeta.type}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 8. Design & Creation */}
          {category === 'design' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  8. สร้างสรรค์และออกแบบ (Design &amp; Creation)
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  สร้าง Meme, Before/After, ตัดภาพลง Grid IG, QR Code Designer และ Favicon Kit
                </p>
              </div>

              <div className="grid grid-cols-5 gap-1 rounded-xl bg-[#F7F9FC] dark:bg-[#101820] border border-[#E2E8F0] dark:border-slate-800 p-1 text-[11px] font-medium">
                {[
                  { id: 'meme' as const, label: 'Meme' },
                  { id: 'compare' as const, label: 'เทียบภาพ' },
                  { id: 'split' as const, label: 'Grid ZIP' },
                  { id: 'qr' as const, label: 'สร้าง QR' },
                  { id: 'favicon' as const, label: 'Favicon' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDesignTool(t.id)}
                    className={`rounded-lg py-1.5 cursor-pointer ${
                      designTool === t.id
                        ? 'bg-[#2563EB] text-white dark:bg-[#60A5FA] dark:text-[#0B1F3A] shadow-xs'
                        : 'text-[#64748B] dark:text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {designTool === 'meme' && (
                <div className="space-y-2.5">
                  <input type="text" value={memeTop} onChange={(e) => setMemeTop(e.target.value)} placeholder="ข้อความด้านบน..." className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 py-2 text-xs" />
                  <input type="text" value={memeBottom} onChange={(e) => setMemeBottom(e.target.value)} placeholder="ข้อความด้านล่าง..." className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 py-2 text-xs" />
                  <button type="button" onClick={handleGenerateMeme} className="w-full rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer">
                    สร้างภาพ Meme
                  </button>
                </div>
              )}

              {designTool === 'compare' && (
                <div className="space-y-2.5">
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    เปรียบเทียบภาพต้นฉบับ (Before) กับภาพที่แก้ไขปัจจุบัน (After) หรืออัปโหลดภาพ Before แยก
                  </p>
                  <input
                    ref={compareBeforeInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = () => setCompareBeforeUrl(String(r.result || ''));
                      r.readAsDataURL(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <button type="button" onClick={() => compareBeforeInputRef.current?.click()} className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] py-2 text-xs font-medium hover:bg-[#EEF3FA] dark:hover:bg-slate-800 cursor-pointer">
                    อัปโหลดภาพ Before อื่น (ถ้าต้องการ)
                  </button>
                  <button type="button" onClick={handleBuildBeforeAfter} className="w-full rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer">
                    รวมเป็นภาพเปรียบเทียบ Before / After
                  </button>
                </div>
              )}

              {designTool === 'split' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSplitMode('3x1')} className={`rounded-lg border py-2 text-xs font-semibold cursor-pointer ${splitMode === '3x1' ? 'bg-[#2563EB] text-white border-[#2563EB] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:border-[#60A5FA]' : 'border-[#E2E8F0] dark:border-slate-700'}`}>
                      แบ่ง 3×1 (3 ภาพ)
                    </button>
                    <button type="button" onClick={() => setSplitMode('3x3')} className={`rounded-lg border py-2 text-xs font-semibold cursor-pointer ${splitMode === '3x3' ? 'bg-[#2563EB] text-white border-[#2563EB] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:border-[#60A5FA]' : 'border-[#E2E8F0] dark:border-slate-700'}`}>
                      แบ่ง 3×3 (9 ภาพ IG)
                    </button>
                  </div>
                  <button type="button" disabled={busy} onClick={handleGridSplitZip} className="w-full rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer">
                    ตัดแบ่งและดาวน์โหลด .ZIP
                  </button>
                </div>
              )}

              {designTool === 'qr' && (
                <div className="space-y-2.5">
                  <input type="text" value={qrInputText} onChange={(e) => setQrInputText(e.target.value)} placeholder="ใส่ลิงก์ URL หรือข้อความ..." className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 py-2 text-xs" />
                  <div className="flex items-center justify-between text-xs">
                    <span>สีของ QR Code</span>
                    <input type="color" value={qrFgColor} onChange={(e) => setQrFgColor(e.target.value)} className="h-7 w-10 rounded border border-[#E2E8F0] dark:border-slate-700" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => handleGenerateQrCode(false)} className="rounded-xl bg-[#2563EB] py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer">
                      สร้างตัวอย่าง PNG
                    </button>
                    <button type="button" onClick={() => handleGenerateQrCode(true)} className="rounded-xl border border-[#2563EB] dark:border-[#60A5FA] bg-[#2563EB]/10 dark:bg-[#60A5FA]/15 py-2 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#2563EB]/20 cursor-pointer">
                      โหลด SVG
                    </button>
                  </div>
                  {qrPreviewUrl && (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] p-3">
                      <img src={qrPreviewUrl} alt="Generated QR Code" className="h-36 w-36" />
                      <a href={qrPreviewUrl} download="zimage-qrcode.png" className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline">
                        ดาวน์โหลด QR Code (.PNG)
                      </a>
                    </div>
                  )}
                </div>
              )}

              {designTool === 'favicon' && (
                <div className="space-y-2.5">
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    สร้างชุดไอคอนเว็บไซต์ครบชุด (16×16, 32×32, Apple 180×180, favicon.ico, site.webmanifest) จากภาพปัจจุบัน
                  </p>
                  <button type="button" disabled={busy} onClick={handleDownloadFaviconKit} className="w-full rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer">
                    สร้างและดาวน์โหลด Favicon Kit (.ZIP)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 9. Privacy & Security */}
          {category === 'privacy' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  9. ความปลอดภัย &amp; ข้อมูลส่วนตัว (Privacy &amp; Security)
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  ลบพิกัด GPS / รุ่นกล้อง (EXIF) และลากเมาส์บนภาพเพื่อเบลอ/โมเสกใบหน้าหรือป้ายทะเบียน
                </p>
              </div>

              <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                <p className="font-semibold inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  <span>100% Local Privacy Processing</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  การเบลอ เซ็นเซอร์ และลบ EXIF ทำงานในเบราว์เซอร์ของคุณโดยตรง ไม่ส่งภาพขึ้นเซิร์ฟเวอร์
                </p>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  1. ลากกรอบสีแดงบนภาพทางซ้าย แล้วเลือกรูปแบบปิดข้อมูล
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'pixelate' as const, label: 'โมเสก (Pixelate)' },
                    { id: 'blur' as const, label: 'เบลอ (Blur)' },
                    { id: 'black' as const, label: 'แถบดำทึบ' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setRedactMode(m.id)}
                      className={`rounded-lg border py-2 text-xs font-medium cursor-pointer ${
                        redactMode === m.id
                          ? 'bg-[#2563EB] text-white border-[#2563EB] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:border-[#60A5FA]'
                          : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] text-[#475569] dark:text-slate-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleApplyPrivacyRedact}
                  className="w-full rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  เบลอ / โมเสกจุดที่เลือกทันที
                </button>
              </div>

              <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  2. ลบข้อมูล EXIF / GPS / รุ่นกล้องทั้งหมด (1-Click Strip)
                </span>
                <button
                  type="button"
                  onClick={handleStripExifDownload}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] dark:bg-[#60A5FA] dark:text-[#0B1F3A] dark:hover:bg-[#93C5FD] cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>ล้างข้อมูล EXIF และดาวน์โหลดภาพสะอาด</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Hand-off Footer */}
          <div className="border-t border-[#E2E8F0] dark:border-slate-800 pt-3 flex items-center justify-between text-[11px] text-[#64748B] dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="h-3.5 w-3.5" />
              <span>ZImage Image Problem Solver</span>
            </span>
            <button
              type="button"
              onClick={() => {
                if (!workingCanvas) return;
                onOpenInProEditor({
                  id: `tools-${Date.now()}`,
                  title: sourceName,
                  imageUrl: workingCanvas.toDataURL('image/png'),
                  originalPrompt: sourceName,
                  enhancedPrompt: `Image processed in ZImage Tools (${sourceName})`,
                  stylePreset: 'auto',
                  aspectRatio: '1:1',
                });
              }}
              className="inline-flex items-center gap-1 font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
            >
              <span>เปิดต่อใน Pro Editor</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
