export const ADMIN_EMAILS = ['zbcd1053@gmail.com', 'zeetosit@gmail.com'] as const;
export const SUPER_ADMIN_EMAIL = 'zbcd1053@gmail.com';

export const RECRAFT_MODEL = 'recraft/recraft-v4.1-flash-v2:free';
export const VISION_PROMPT_MODEL = 'nvidia/nemotron-3.5-super-vl:free';
export const DEFAULT_DAILY_GENERATION_LIMIT = 20;

export interface WiredModelMeta {
  id: string;
  label: string;
  provider: 'openrouter' | 'gemini';
  modality: 'image' | 'vision-text';
  supportsSeed: boolean;
  supportsNegativePrompt: boolean;
  supportsCustomAspect: boolean;
  note: string;
}

export const WIRED_IMAGE_MODELS: WiredModelMeta[] = [
  {
    id: 'recraft/recraft-v4.1-flash-v2:free',
    label: 'Recraft v4.1 Flash (OpenRouter Free)',
    provider: 'openrouter',
    modality: 'image',
    supportsSeed: true,
    supportsNegativePrompt: true,
    supportsCustomAspect: true,
    note: 'โมเดลสร้างภาพหลัก รองรับอัตราส่วน สไตล์ พาเลตสี และ Seed',
  },
];

export const WIRED_VISION_MODELS: WiredModelMeta[] = [
  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    label: 'Nemotron 3.5 Super VL (OpenRouter Free)',
    provider: 'openrouter',
    modality: 'vision-text',
    supportsSeed: false,
    supportsNegativePrompt: false,
    supportsCustomAspect: false,
    note: 'โมเดลวิเคราะห์ภาพ OCR ตรวจจับองค์ประกอบ และเรียบเรียงพรอมต์',
  },
  {
    id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    label: 'Nemotron Nano 12B VL (OpenRouter Fallback)',
    provider: 'openrouter',
    modality: 'vision-text',
    supportsSeed: false,
    supportsNegativePrompt: false,
    supportsCustomAspect: false,
    note: 'โมเดลสำรองสำหรับการวิเคราะห์ภาพและสร้างพรอมต์',
  },
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen (Server SDK Fallback)',
    provider: 'gemini',
    modality: 'vision-text',
    supportsSeed: true,
    supportsNegativePrompt: false,
    supportsCustomAspect: false,
    note: 'โมเดลข้อความ/วิชั่นสำรองฝั่งเซิร์ฟเวอร์เมื่อเปิดใช้ GEMINI_API_KEY',
  },
];

export type StylePresetId =
  | 'auto'
  | 'photorealistic'
  | 'fine-art'
  | '3d-render'
  | 'flat-vector'
  | 'watercolor'
  | 'anime'
  | 'logo';

export type PhotorealismPresetId =
  | 'none'
  | 'beauty-editorial'
  | 'korean-studio'
  | 'japanese-fashion'
  | 'luxury-campaign'
  | 'natural-window-light'
  | 'film-flash'
  | 'cinematic-portrait'
  | 'commercial-photography';

export interface PhotorealismPresetOption {
  id: PhotorealismPresetId;
  label: string;
  labelTh: string;
  promptSnippet: string;
  cameraHint: string;
  lightingHint: string;
}

export const PHOTOREALISM_PRESETS: PhotorealismPresetOption[] = [
  {
    id: 'none',
    label: 'None',
    labelTh: 'ไม่ระบุ (ทั่วไป)',
    promptSnippet: '',
    cameraHint: '',
    lightingHint: '',
  },
  {
    id: 'beauty-editorial',
    label: 'Beauty Editorial',
    labelTh: 'บิวตี้เอดิทอเรียล',
    promptSnippet: 'high-fashion beauty editorial closeup, authentic skin pores and fine natural texture, subtle luminous highlights, unretouched natural realism',
    cameraHint: '105mm macro portrait lens, f/4, tack-sharp focus on eyes and skin detail',
    lightingHint: 'large diffused overhead beauty dish with soft silver bounce fill',
  },
  {
    id: 'korean-studio',
    label: 'Korean Studio',
    labelTh: 'สตูดิโอเกาหลีใสสะอาด',
    promptSnippet: 'modern Seoul portrait studio aesthetic, clean muted neutral backdrop, soft pastel tonal balance, natural radiant complexion, effortless modern styling',
    cameraHint: '85mm f/1.8 prime lens, clean eye-level framing, gentle background falloff',
    lightingHint: 'soft wrap-around octabox daylight with gentle rim highlight',
  },
  {
    id: 'japanese-fashion',
    label: 'Japanese Fashion',
    labelTh: 'แฟชั่นญี่ปุ่นออร์แกนิก',
    promptSnippet: 'Tokyo architectural lookbook photography, relaxed layered silhouette, candid editorial poise, subtle analog film color rendition',
    cameraHint: '50mm f/2.0 lens, medium full-body editorial composition with natural negative space',
    lightingHint: 'overcast ambient daylight with subtle cool shadow cast',
  },
  {
    id: 'luxury-campaign',
    label: 'Luxury Campaign',
    labelTh: 'แคมเปญลักชัวรี',
    promptSnippet: 'global luxury fashion house campaign photograph, sculpted architectural background, rich fabric weave detail, dignified editorial authority',
    cameraHint: 'medium format digital 80mm f/2.8, ultra-crisp micro-contrast',
    lightingHint: 'directional sculpted key light with deep controlled falloff shadows',
  },
  {
    id: 'natural-window-light',
    label: 'Natural Window Light',
    labelTh: 'แสงหน้าต่างธรรมชาติ',
    promptSnippet: 'intimate documentary portrait illuminated solely by side window daylight, soft shadow transitions, organic linen and wood textures',
    cameraHint: '35mm or 50mm f/1.4 prime, candid environmental composition',
    lightingHint: 'soft directional north-facing window daylight, subtle warm interior shadow bounce',
  },
  {
    id: 'film-flash',
    label: 'Film Flash',
    labelTh: 'แฟลชฟิล์ม 35mm',
    promptSnippet: 'authentic 35mm analog snapshot with crisp direct on-camera flash, subtle grain structure, rich nocturnal contrast, candid backstage energy',
    cameraHint: '28mm compact film camera aesthetic, slight wide-angle perspective',
    lightingHint: 'direct crisp flash front-fill fading rapidly into warm ambient background',
  },
  {
    id: 'cinematic-portrait',
    label: 'Cinematic Portrait',
    labelTh: 'พอร์ตเทรตภาพยนตร์',
    promptSnippet: 'anamorphic motion picture still frame, expressive atmospheric depth, subtle halation on practical lights, narrative color grading',
    cameraHint: '50mm anamorphic T2.0 lens, wide 2.39:1 depth feel, shallow focal plane',
    lightingHint: 'motivated practical warm key light against cool slate-blue twilight ambient',
  },
  {
    id: 'commercial-photography',
    label: 'Commercial Photography',
    labelTh: 'ภาพโฆษณาเชิงพาณิชย์',
    promptSnippet: 'high-precision commercial advertising photography, razor-sharp material fidelity, clean surface reflections, polished brand campaign aesthetic',
    cameraHint: '90mm tilt-shift commercial studio lens, deep corner-to-corner clarity',
    lightingHint: 'precision multi-point studio strip lights with crisp specular control',
  },
];

export type PromptEditorMode = 'simple' | 'advanced' | 'professional' | 'unlimited';

export interface StructuredPromptFields {
  mode: PromptEditorMode;
  mainPrompt: string;
  negativePrompt: string;
  styleInstructions: string;
  cameraAndLens: string;
  lighting: string;
  composition: string;
  environment: string;
  subjectDetails: string;
  qualityEnhancements: string;
  photorealismPreset: PhotorealismPresetId;
}

export type AspectRatioId = '1:1' | '16:9' | '4:3' | '3:4' | '9:16' | 'custom';
export type ImageVisibility = 'private' | 'featured' | 'hidden';
export type VaultItemType = 'generated' | 'edited' | 'animation';
export type RequestStatus = 'submitted' | 'reviewed' | 'in-progress' | 'completed';

export interface StylePresetOption {
  id: StylePresetId;
  labelTh: string;
  labelEn: string;
  promptHint: string;
}

export const STYLE_PRESETS: StylePresetOption[] = [
  { id: 'auto', labelTh: 'อัตโนมัติ', labelEn: 'Auto', promptHint: 'clean, authentic medium faithful to the user description' },
  { id: 'photorealistic', labelTh: 'สมจริง', labelEn: 'Photo', promptHint: 'realistic DSLR editorial photograph, natural optics and textures' },
  { id: 'fine-art', labelTh: 'ภาพวาดวิจิตร', labelEn: 'Fine Art', promptHint: 'traditional Thai fine art painting, delicate gold leaf brushwork and intricate classic detailing' },
  { id: '3d-render', labelTh: '3D', labelEn: '3D Render', promptHint: 'high-craft 3D render, realistic PBR surface materials and soft studio illumination' },
  { id: 'flat-vector', labelTh: 'เวกเตอร์', labelEn: 'Vector', promptHint: 'clean flat vector graphic illustration, crisp geometric contours' },
  { id: 'watercolor', labelTh: 'สีน้ำ', labelEn: 'Watercolor', promptHint: 'hand-painted watercolor wash on textured cotton paper' },
  { id: 'anime', labelTh: 'อนิเมะ', labelEn: 'Anime', promptHint: 'hand-drawn anime illustration, expressive cel shading and clean linework' },
  { id: 'logo', labelTh: 'โลโก้', labelEn: 'Logo', promptHint: 'minimalist graphic emblem design, bold clear silhouette on clean backdrop' },
];

export interface AspectRatioOption {
  id: Exclude<AspectRatioId, 'custom'>;
  label: string;
  cssRatio: string;
  numericRatio: number;
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: '1:1', label: '1:1 จัตุรัส', cssRatio: '1 / 1', numericRatio: 1 },
  { id: '16:9', label: '16:9 แนวนอนกว้าง', cssRatio: '16 / 9', numericRatio: 16 / 9 },
  { id: '4:3', label: '4:3 มาตรฐาน', cssRatio: '4 / 3', numericRatio: 4 / 3 },
  { id: '3:4', label: '3:4 แนวตั้ง', cssRatio: '3 / 4', numericRatio: 3 / 4 },
  { id: '9:16', label: '9:16 สตอรี่', cssRatio: '9 / 16', numericRatio: 9 / 16 },
];

export const BLUEPRINT_LIMITS = {
  originalPromptMax: 20000,
  enhancedPromptMax: 25000,
  imageDataUrlMax: 750000,
  dimensionsLabelMax: 32,
  displayNameMax: 100,
  maxPromptWords: 120,
  requestSubjectMax: 140,
  requestMessageMax: 2000,
  requestAdminNoteMax: 1000,
  albumNameMax: 60,
  projectJsonMax: 250000,
} as const;

export const PROMPT_EXPERT_SYSTEM_INSTRUCTION = `You are a FIDELITY FIRST AI image prompt director and visual architect.
Your highest priority is 100% faithfulness to every single detail the user describes (Thai, English, or any language) and any attached reference images.

CRITICAL RULES — FIDELITY FIRST & UNLIMITED DETAIL PRESERVATION:
1. PRESERVE EVERY EXPLICIT DETAIL: Retain every subject, count, material, garment, texture, lighting instruction, camera lens, environment, composition rule, and quoted text stated by the user. Do NOT truncate or drop details when the user writes a long, detailed prompt.
2. DO NOT OVERRIDE OR INVENT: Never replace the user's subject, colors, or mood with unrelated clichés.
3. ADDITIVE STYLE & PHOTOREALISM ONLY: Apply selected style medium or photorealism photography specs without altering the user's subject identity or scene.
4. STRUCTURED OUTPUT (well-organized English prompt, preserving full richness and complexity):
   - Subject & Specific Details
   - Environment & Atmosphere
   - Style Medium & Craft
   - Composition & Framing
   - Camera & Lens Optics
   - Lighting & Color Palette
   - Quality & Fidelity
5. TEXT IN IMAGE: If text is requested, quote it verbatim ("...") with clear placement.
6. Return ONLY the final English prompt with no markdown fences or preambles.
7. If the request depicts harmful, explicit, or policy-violating content, reply with "REFUSE" only.`;

const THAI_FIDELITY_LEXICON: Array<[RegExp, string]> = [
  [/หนึ่ง|1\s*(ตัว|ใบ|ดอก|คน|ชิ้น|อัน)/g, 'one'],
  [/สอง|2\s*(ตัว|ใบ|ดอก|คน|ชิ้น|อัน)?/g, 'two'],
  [/สาม|3\s*(ตัว|ใบ|ดอก|คน|ชิ้น|อัน)?/g, 'three'],
  [/สี่|4\s*(ตัว|ใบ|ดอก|คน|ชิ้น|อัน)?/g, 'four'],
  [/ห้า|5\s*(ตัว|ใบ|ดอก|คน|ชิ้น|อัน)?/g, 'five'],
  [/หก|6\s*(ตัว|ใบ|ดอก|คน|ชิ้น|อัน)?/g, 'six'],
  [/สีแดง|แดง/g, 'red'],
  [/สีส้ม|ส้ม/g, 'orange'],
  [/สีทอง|ทองคำ|ทอง/g, 'gold'],
  [/สีเหลือง|เหลือง/g, 'yellow'],
  [/สีเขียว|เขียว/g, 'green'],
  [/สีฟ้า|ฟ้า/g, 'sky blue'],
  [/สีน้ำเงิน|น้ำเงิน|คราม/g, 'royal navy blue'],
  [/สีม่วง|ม่วง/g, 'purple'],
  [/สีชมพู|ชมพู/g, 'pink'],
  [/สีขาว|ขาว/g, 'white'],
  [/สีดำ|ดำ/g, 'black'],
  [/สีครีม|ครีม/g, 'cream'],
  [/สีเงิน|เงิน/g, 'silver'],
  [/หนุมาน/g, 'Hanuman in classical Thai Ramayana armor'],
  [/พญานาค/g, 'mythical Thai Naga serpent'],
  [/แมว/g, 'cat'],
  [/สุนัข|หมา/g, 'dog'],
  [/นก/g, 'bird'],
  [/ปลาคาร์ฟ|ปลาคราฟ/g, 'koi fish'],
  [/ช้าง/g, 'elephant'],
  [/มังกร/g, 'dragon'],
  [/ผู้หญิง|หญิงสาว/g, 'woman'],
  [/ผู้ชาย|ชายหนุ่ม/g, 'man'],
  [/เด็ก/g, 'child'],
  [/วัดไทย|วัด/g, 'Thai temple'],
  [/ศาลาน้ำ|ศาลา/g, 'pavilion'],
  [/ดอกบัว/g, 'lotus flowers'],
  [/ลายกนก|กนก/g, 'traditional Thai Kanok floral flame motifs'],
  [/ตรีศูล/g, 'ornate trident'],
  [/มงกุฎ|ชฎา/g, 'ornate Thai spire crown'],
  [/โคมไฟ/g, 'lantern'],
  [/ถ้วยกาแฟ|กาแฟ/g, 'coffee cup'],
  [/รถยนต์|รถ/g, 'car'],
  [/บ้าน/g, 'house'],
  [/ชายหาด|ทะเล/g, 'beach and ocean'],
  [/ป่าไผ่/g, 'bamboo forest'],
  [/ป่า/g, 'forest'],
  [/ภูเขา/g, 'mountains'],
  [/น้ำตก/g, 'waterfall'],
  [/แม่น้ำ/g, 'river'],
  [/สระน้ำ|บึง/g, 'reflective pond'],
  [/เมือง/g, 'cityscape'],
  [/สตูดิโอ/g, 'studio'],
  [/ตอนเช้า|รุ่งเช้า/g, 'dawn morning'],
  [/พระอาทิตย์ตก|พลบค่ำ|ยามเย็น/g, 'golden sunset dusk'],
  [/กลางคืน|ยามค่ำคืน/g, 'nighttime'],
  [/ฝนตก|หลังฝนตก/g, 'after rain with glistening surfaces'],
  [/หมอก/g, 'soft mist'],
];

export function extractEnglishFidelityTokens(description: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const addToken = (t: string) => {
    const clean = t.trim();
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      tokens.push(clean);
    }
  };

  for (const [pattern, english] of THAI_FIDELITY_LEXICON) {
    if (pattern.test(description)) {
      addToken(english);
    }
    pattern.lastIndex = 0;
  }

  const asciiMatches = description.match(/[A-Za-z0-9][A-Za-z0-9\-']*/g) || [];
  for (const tok of asciiMatches) {
    if (tok.length >= 1) addToken(tok);
  }

  return tokens;
}

export function isAdminUser(email: string | null | undefined, emailVerified: boolean | null | undefined): boolean {
  if (!email || emailVerified !== true) {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  return (ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).length;
}

export function measurePromptStats(text: string): {
  chars: number;
  words: number;
  approxTokens: number;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { chars: 0, words: 0, approxTokens: 0 };
  }
  const words = countWords(trimmed);
  const thaiCharCount = (trimmed.match(/[\u0E00-\u0E7F]/g) || []).length;
  const nonThaiChars = Math.max(0, trimmed.length - thaiCharCount);
  const approxTokens = Math.max(words, Math.ceil(nonThaiChars / 4 + thaiCharCount * 0.75));
  return {
    chars: trimmed.length,
    words,
    approxTokens,
  };
}

/**
 * Clean markdown/quotes without truncating long prompts unless an explicit small cap is passed.
 */
export function cleanPromptText(text: string): string {
  return text
    .replace(/^```[\w]*\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

export function enforceWordLimit(text: string, maxWords: number = BLUEPRINT_LIMITS.maxPromptWords): string {
  const cleaned = cleanPromptText(text);
  if (!cleaned) return '';
  if (!Number.isFinite(maxWords) || maxWords <= 0) return cleaned;
  const words = cleaned.split(/\s+/);
  if (words.length <= maxWords) {
    return cleaned;
  }
  return words.slice(0, maxWords).join(' ').replace(/[,;:\-]+$/, '') + '.';
}

export function isRefusalResponse(text: string): boolean {
  const trimmed = text.trim().toUpperCase();
  return trimmed === 'REFUSE' || /^REFUSE[\s.!:\-]/i.test(trimmed);
}

export function clampCustomPixelDimensions(widthPx: number, heightPx: number): {
  width: number;
  height: number;
  valid: boolean;
} {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx)) {
    return { width: 1024, height: 1024, valid: false };
  }
  const w = Math.round(widthPx);
  const h = Math.round(heightPx);
  if (w < 64 || w > 4096 || h < 64 || h > 4096) {
    return {
      width: Math.max(64, Math.min(4096, w)),
      height: Math.max(64, Math.min(4096, h)),
      valid: false,
    };
  }
  return { width: w, height: h, valid: true };
}

export function mapCustomDimensionsToAspectRatio(
  widthPx: number,
  heightPx: number
): Exclude<AspectRatioId, 'custom'> {
  const clamped = clampCustomPixelDimensions(widthPx, heightPx);
  const targetRatio = clamped.width / clamped.height;
  let best = ASPECT_RATIOS[0].id;
  let bestDiff = Infinity;
  for (const option of ASPECT_RATIOS) {
    const diff = Math.abs(Math.log(targetRatio / option.numericRatio));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = option.id;
    }
  }
  return best;
}

export function appendStyleToPrompt(prompt: string, stylePreset: StylePresetId): string {
  const base = prompt.trim();
  if (!base || stylePreset === 'auto') return base;
  const styleObj = STYLE_PRESETS.find((s) => s.id === stylePreset);
  if (!styleObj) return base;
  const lower = base.toLowerCase();
  if (lower.includes(styleObj.labelEn.toLowerCase())) return base;
  return `${base} Style medium: ${styleObj.promptHint}.`;
}

export function buildUnlimitedStructuredPrompt(fields: Partial<StructuredPromptFields>): {
  combinedPrompt: string;
  negativePrompt: string;
  sectionsApplied: string[];
} {
  const sections: string[] = [];
  const sectionsApplied: string[] = [];

  const main = (fields.mainPrompt || '').trim();
  if (main) {
    sections.push(main);
    sectionsApplied.push('Main Prompt');
  }

  const subjectDetails = (fields.subjectDetails || '').trim();
  if (subjectDetails) {
    sections.push(`Subject Details: ${subjectDetails}`);
    sectionsApplied.push('Subject Details');
  }

  const environment = (fields.environment || '').trim();
  if (environment) {
    sections.push(`Environment & Atmosphere: ${environment}`);
    sectionsApplied.push('Environment');
  }

  const composition = (fields.composition || '').trim();
  if (composition) {
    sections.push(`Composition & Framing: ${composition}`);
    sectionsApplied.push('Composition');
  }

  const photoPreset = PHOTOREALISM_PRESETS.find((p) => p.id === fields.photorealismPreset);
  if (photoPreset && photoPreset.id !== 'none') {
    sections.push(
      `Photorealism Direction (${photoPreset.label}): ${photoPreset.promptSnippet}`
    );
    sectionsApplied.push(photoPreset.label);
  }

  const camera = (fields.cameraAndLens || '').trim() || (photoPreset?.cameraHint || '');
  if (camera) {
    sections.push(`Camera & Lens: ${camera}`);
    sectionsApplied.push('Camera & Lens');
  }

  const lighting = (fields.lighting || '').trim() || (photoPreset?.lightingHint || '');
  if (lighting) {
    sections.push(`Lighting: ${lighting}`);
    sectionsApplied.push('Lighting');
  }

  const styleInstructions = (fields.styleInstructions || '').trim();
  if (styleInstructions) {
    sections.push(`Style Instructions: ${styleInstructions}`);
    sectionsApplied.push('Style Instructions');
  }

  const quality = (fields.qualityEnhancements || '').trim();
  if (quality) {
    sections.push(`Quality Enhancements: ${quality}`);
    sectionsApplied.push('Quality Enhancements');
  }

  return {
    combinedPrompt: sections.join('\n'),
    negativePrompt: (fields.negativePrompt || '').trim(),
    sectionsApplied,
  };
}

export function buildStructuredFallbackPrompt(
  description: string,
  stylePreset: StylePresetId = 'auto',
  textInImage?: string,
  preserveUnlimitedLength: boolean = true
): string {
  const cleanSubject = preserveUnlimitedLength ? description.trim() : description.trim().slice(0, 240);
  const fidelityTokens = extractEnglishFidelityTokens(cleanSubject);
  const tokenSummary = fidelityTokens.length > 0 ? ` (${fidelityTokens.join(', ')})` : '';
  const styleObj = STYLE_PRESETS.find((s) => s.id === stylePreset) ?? STYLE_PRESETS[0];
  const textClause =
    textInImage && textInImage.trim().length > 0
      ? ` featuring crisp integrated typography reading "${textInImage.trim()}" placed clearly in the focal zone,`
      : '';

  const prompt = [
    `Subject: ${cleanSubject}${tokenSummary} depicted faithfully with every explicit user-specified detail${textClause}.`,
    `Setting: Authentic environment matching the description with clear depth and natural atmosphere.`,
    `Style: ${styleObj.promptHint}.`,
    `Composition: Balanced framing with clear focal hierarchy.`,
    `Lighting: Natural directional illumination with balanced highlights and shadows.`,
    `Color palette: Faithful to all requested colors with refined tonal harmony.`,
    `Quality: High detail, sharp focus, crisp texture fidelity.`,
  ].join(' ');

  return preserveUnlimitedLength ? cleanPromptText(prompt) : enforceWordLimit(prompt, BLUEPRINT_LIMITS.maxPromptWords);
}

export interface BlueprintImageCheckInput {
  originalPrompt: string;
  enhancedPrompt: string;
  stylePreset: string;
  aspectRatio: string;
  imageDataUrl: string;
  dimensionsLabel?: string;
  itemType?: VaultItemType;
  sourceImageId?: string;
  albumId?: string;
  projectJson?: string;
}

export function validateBlueprintImagePayload(input: BlueprintImageCheckInput): { valid: boolean; reason?: string } {
  const orig = input.originalPrompt.trim();
  const enh = input.enhancedPrompt.trim();
  if (orig.length < 1 || orig.length > BLUEPRINT_LIMITS.originalPromptMax) {
    return { valid: false, reason: 'ความยาวคำอธิบายต้นฉบับต้องอยู่ระหว่าง 1–20,000 ตัวอักษร' };
  }
  if (enh.length < 1 || enh.length > BLUEPRINT_LIMITS.enhancedPromptMax) {
    return { valid: false, reason: 'ความยาวพรอมต์ภาษาอังกฤษต้องอยู่ระหว่าง 1–25,000 ตัวอักษร' };
  }
  if (!STYLE_PRESETS.some((s) => s.id === input.stylePreset)) {
    return { valid: false, reason: 'รูปแบบงานภาพไม่ถูกต้อง' };
  }
  if (input.aspectRatio !== 'custom' && !ASPECT_RATIOS.some((a) => a.id === input.aspectRatio)) {
    return { valid: false, reason: 'อัตราส่วนภาพไม่ถูกต้อง' };
  }
  if (input.dimensionsLabel && input.dimensionsLabel.length > BLUEPRINT_LIMITS.dimensionsLabelMax) {
    return { valid: false, reason: 'ความยาวป้ายขนาดภาพเกินกำหนด' };
  }
  if (
    input.itemType &&
    input.itemType !== 'generated' &&
    input.itemType !== 'edited' &&
    input.itemType !== 'animation'
  ) {
    return { valid: false, reason: 'ประเภทผลงานไม่ถูกต้อง' };
  }
  if (input.sourceImageId && input.sourceImageId.length > 128) {
    return { valid: false, reason: 'รหัสภาพต้นฉบับเกินกำหนด' };
  }
  if (input.albumId && input.albumId.length > 128) {
    return { valid: false, reason: 'รหัสอัลบั้มเกินกำหนด' };
  }
  if (input.projectJson && input.projectJson.length > BLUEPRINT_LIMITS.projectJsonMax) {
    return { valid: false, reason: 'ขนาดโปรเจกต์สตูดิโอเกินขีดจำกัดฐานข้อมูล' };
  }
  if (input.imageDataUrl.length < 10 || input.imageDataUrl.length > BLUEPRINT_LIMITS.imageDataUrlMax) {
    return { valid: false, reason: 'ขนาดไฟล์ภาพเกินขีดจำกัดที่อนุญาตในฐานข้อมูล' };
  }
  return { valid: true };
}

export function validateBlueprintAlbumName(name: string): { valid: boolean; reason?: string } {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > BLUEPRINT_LIMITS.albumNameMax) {
    return { valid: false, reason: 'ชื่ออัลบั้มต้องมี 1–60 ตัวอักษร' };
  }
  return { valid: true };
}

export function validateBlueprintRequestPayload(input: {
  subject: string;
  message: string;
  rating: number;
  dateKey: string;
}): { valid: boolean; reason?: string } {
  const subject = input.subject.trim();
  const message = input.message.trim();
  if (subject.length < 1 || subject.length > BLUEPRINT_LIMITS.requestSubjectMax) {
    return { valid: false, reason: 'กรุณาระบุหัวข้อคำขอ (1–140 ตัวอักษร)' };
  }
  if (message.length < 1 || message.length > BLUEPRINT_LIMITS.requestMessageMax) {
    return { valid: false, reason: 'กรุณาระบุรายละเอียดคำขอ (1–2,000 ตัวอักษร)' };
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { valid: false, reason: 'กรุณาให้คะแนน 1 ถึง 5 ดาว' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) {
    return { valid: false, reason: 'รูปแบบวันที่ไม่ถูกต้อง' };
  }
  return { valid: true };
}
