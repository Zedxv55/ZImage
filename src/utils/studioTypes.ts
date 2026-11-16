import type { ImageAdjustments } from './imageProcessing';

export type StudioMode = 'still' | 'motion';

export type CanvasAspectId = '1:1' | '4:5' | '9:16' | '16:9' | '3:2' | 'A4' | 'custom';

export interface CanvasAspectPreset {
  id: CanvasAspectId;
  label: string;
  width: number;
  height: number;
}

export const CANVAS_ASPECT_PRESETS: CanvasAspectPreset[] = [
  { id: '1:1', label: '1:1 จัตุรัส', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5 โพสต์', width: 1080, height: 1350 },
  { id: '9:16', label: '9:16 สตอรี่/Reels', width: 1080, height: 1920 },
  { id: '16:9', label: '16:9 จอกว้าง', width: 1920, height: 1080 },
  { id: '3:2', label: '3:2 ภาพถ่าย', width: 1500, height: 1000 },
  { id: 'A4', label: 'A4 พิมพ์คมชัด', width: 1240, height: 1754 },
];

export type ThaiStudioFontId =
  | 'Noto Sans Thai'
  | 'Prompt'
  | 'Sarabun'
  | 'Mitr'
  | 'Kanit'
  | 'Chonburi';

export const THAI_STUDIO_FONTS: Array<{ id: ThaiStudioFontId; label: string; sample: string }> = [
  { id: 'Noto Sans Thai', label: 'Noto Sans Thai (มาตรฐานอ่านง่าย)', sample: 'กขค' },
  { id: 'Prompt', label: 'Prompt (โมเดิร์นสะอาดตา)', sample: 'กขค' },
  { id: 'Sarabun', label: 'Sarabun (สารบรรณทางการ)', sample: 'กขค' },
  { id: 'Mitr', label: 'Mitr (มิตรกลมมน)', sample: 'กขค' },
  { id: 'Kanit', label: 'Kanit (คณิตหนักแน่น)', sample: 'กขค' },
  { id: 'Chonburi', label: 'Chonburi (ชลบุรีพาดหัววิจิตร)', sample: 'กขค' },
];

export type LayerBlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay';

export const LAYER_BLEND_MODES: Array<{ id: LayerBlendMode; label: string }> = [
  { id: 'source-over', label: 'ปกติ (Normal)' },
  { id: 'multiply', label: 'ซ้อนเข้ม (Multiply)' },
  { id: 'screen', label: 'สว่างซ้อน (Screen)' },
  { id: 'overlay', label: 'ทับแสงสี (Overlay)' },
];

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'bounce';

export const EASING_OPTIONS: Array<{ id: EasingType; label: string }> = [
  { id: 'linear', label: 'เรียบ (Linear)' },
  { id: 'ease-in', label: 'เร่ง (Ease-in)' },
  { id: 'ease-out', label: 'ช้าลง (Ease-out)' },
  { id: 'bounce', label: 'เด้ง (Bounce)' },
];

export type MotionPresetId =
  | 'zoom-in-slow'
  | 'zoom-out'
  | 'pan-left-right'
  | 'pan-up'
  | 'float-gentle'
  | 'shake-gentle'
  | 'fade-in'
  | 'spin-slow';

export interface MotionPresetDef {
  id: MotionPresetId;
  label: string;
}

export const MOTION_PRESETS: MotionPresetDef[] = [
  { id: 'zoom-in-slow', label: 'ซูมเข้าช้าๆ' },
  { id: 'zoom-out', label: 'ซูมออก' },
  { id: 'pan-left-right', label: 'แพนซ้าย→ขวา' },
  { id: 'pan-up', label: 'แพนขึ้น' },
  { id: 'float-gentle', label: 'ลอยเบาๆ' },
  { id: 'shake-gentle', label: 'สั่นเบาๆ' },
  { id: 'fade-in', label: 'ค่อยๆ ปรากฏ' },
  { id: 'spin-slow', label: 'หมุนช้า' },
];

export interface LayerKeyframe {
  id: string;
  timeSec: number;
  x: number;
  y: number;
  scale: number;
  rotation: number; // degrees
  opacity: number; // 0..100
  easing: EasingType;
}

export type LayerProvenance = 'text' | 'vector' | 'raster' | 'ai-reconstructed';

export type ShapeKind = 'rect' | 'circle' | 'triangle' | 'star' | 'polygon' | 'line' | 'path';

export interface StudioLayerBase {
  id: string;
  name: string;
  type: 'image' | 'text' | 'svg' | 'shape';
  visible: boolean;
  locked: boolean;
  groupId?: string;
  provenance?: LayerProvenance;
  x: number; // center X in canvas px
  y: number; // center Y in canvas px
  width: number; // base width in canvas px
  height: number; // base height in canvas px
  scale: number;
  rotation: number; // degrees
  flipX: boolean;
  flipY: boolean;
  opacity: number; // 0..100
  blendMode: LayerBlendMode;
  parallaxDepth: number; // 0 = static/normal, >0 moves more as foreground
  keyframes: LayerKeyframe[];
}

export interface ImageStudioLayer extends StudioLayerBase {
  type: 'image';
  imageUrl: string;
  originalImageUrl: string;
  isCutoutForeground?: boolean;
  adjustments: ImageAdjustments;
}

export interface TextStudioLayer extends StudioLayerBase {
  type: 'text';
  text: string;
  fontFamily: ThaiStudioFontId;
  fontSize: number;
  color: string;
  bold: boolean;
  align: 'left' | 'center' | 'right';
  shadow: boolean;
  strokeWidth: number;
  strokeColor: string;
}

export interface SvgStudioLayer extends StudioLayerBase {
  type: 'svg';
  assetId: string;
  assetKind: 'frame' | 'sticker';
  color: string;
}

export interface ShapeStudioLayer extends StudioLayerBase {
  type: 'shape';
  shapeKind: ShapeKind;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
  points?: Array<{ x: number; y: number }>; // normalized -0.5..0.5 for pen path
}

export type StudioLayer = ImageStudioLayer | TextStudioLayer | SvgStudioLayer | ShapeStudioLayer;

export interface CanvasProjectState {
  version: 2;
  sourceImageId?: string;
  title: string;
  aspectId: CanvasAspectId;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string; // hex or 'transparent'
  layers: StudioLayer[];
  activeFrameId: string | null;
  activeFrameColor: string;
  mode: StudioMode;
  durationSec: number; // 2..15
  fps: 24 | 30;
  parallaxEnabled: boolean;
  loopPlayback: boolean;
  updatedAtIso: string;
}
