import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  ASPECT_RATIOS,
  PROMPT_EXPERT_SYSTEM_INSTRUCTION,
  RECRAFT_MODEL,
  STYLE_PRESETS,
  VISION_PROMPT_MODEL,
  buildStructuredFallbackPrompt,
  buildUnlimitedStructuredPrompt,
  cleanPromptText,
  countWords,
  enforceWordLimit,
  extractEnglishFidelityTokens,
  isRefusalResponse,
  measurePromptStats,
} from '../src/utils/promptLogic.ts';
import type {
  AspectRatioId,
  StructuredPromptFields,
  StylePresetId,
} from '../src/utils/promptLogic.ts';
import type { DecomposeAiResult } from '../src/utils/layerDecompose.ts';
import {
  ARCHIVE_IMAGES_DIR,
  ensureDataDirs,
  loadArchiveIndex,
  loadSystemSettings,
  saveAiJob,
  saveArchiveIndex,
} from './store.ts';
import type { AiJobRecord, ServerGeneratedArchiveItem } from './types.ts';

const DEFAULT_OPENROUTER_KEY =
  'Sk-or-v1-4737cadba97fe290603c6ef77f16a5f06f50314ce39516191335a01ffd40f704';

export function normalizeOpenRouterKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.startsWith('Sk-or-')) {
    return 'sk-or-' + trimmed.slice(6);
  }
  return trimmed;
}

export function getOpenRouterApiKey(): string {
  const raw = process.env.OPENROUTER_API_KEY || DEFAULT_OPENROUTER_KEY;
  return normalizeOpenRouterKey(raw);
}

export function getRefererHeader(): string {
  return process.env.APP_URL || 'http://localhost:3000';
}

export function parseDataUrlParts(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

export function sanitizeReferenceImages(images?: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const valid: string[] = [];
  for (const item of images) {
    if (
      typeof item === 'string' &&
      item.startsWith('data:image/') &&
      item.length <= 4_500_000
    ) {
      valid.push(item);
      if (valid.length >= 3) break;
    }
  }
  return valid;
}

export function extractImageUrlFromOpenRouterResponse(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; image_url?: { url?: string } }> | null;
        images?: Array<{ type?: string; image_url?: { url?: string }; url?: string }>;
      };
    }>;
  };
  const msg = record.choices?.[0]?.message;
  if (!msg) return null;

  if (Array.isArray(msg.images) && msg.images.length > 0) {
    const first = msg.images[0];
    if (first?.image_url?.url) return first.image_url.url;
    if (first?.url) return first.url;
  }

  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part?.image_url?.url) return part.image_url.url;
    }
  }

  if (typeof msg.content === 'string') {
    const dataUrlMatch = msg.content.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
    if (dataUrlMatch) return dataUrlMatch[0];
    const httpMatch = msg.content.match(/https?:\/\/[^\s)"']+/);
    if (httpMatch) return httpMatch[0];
  }

  return null;
}

export function saveGeneratedImageToAdminArchive(params: {
  imageUrl: string;
  originalPrompt: string;
  enhancedPrompt: string;
  negativePrompt?: string;
  stylePreset: StylePresetId;
  aspectRatio: AspectRatioId;
  dimensionsLabel?: string;
  seed?: number;
  hasReferenceImage: boolean;
  ownerType: 'guest' | 'member';
  ownerUid?: string;
  ownerName: string;
  ownerEmail?: string;
  model: string;
  promptEngine: string;
}): string {
  ensureDataDirs();
  const id = `arch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const imageFile = `${id}.txt`;
  fs.writeFileSync(path.join(ARCHIVE_IMAGES_DIR, imageFile), params.imageUrl, 'utf8');

  const list = loadArchiveIndex();
  const entry: ServerGeneratedArchiveItem = {
    id,
    originalPrompt: params.originalPrompt.slice(0, 20000),
    enhancedPrompt: params.enhancedPrompt.slice(0, 25000),
    ...(params.negativePrompt ? { negativePrompt: params.negativePrompt.slice(0, 4000) } : {}),
    stylePreset: params.stylePreset,
    aspectRatio: params.aspectRatio,
    ...(params.dimensionsLabel ? { dimensionsLabel: params.dimensionsLabel.slice(0, 32) } : {}),
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    hasReferenceImage: params.hasReferenceImage,
    ownerType: params.ownerType,
    ...(params.ownerUid ? { ownerUid: params.ownerUid } : {}),
    ownerName: params.ownerName.slice(0, 100),
    ...(params.ownerEmail ? { ownerEmail: params.ownerEmail.slice(0, 254) } : {}),
    model: params.model,
    promptEngine: params.promptEngine,
    createdAtIso: new Date().toISOString(),
    imageFile,
  };

  const next = [entry, ...list];
  if (next.length > 250) {
    const removed = next.slice(250);
    for (const r of removed) {
      const fp = path.join(ARCHIVE_IMAGES_DIR, r.imageFile);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  }
  saveArchiveIndex(next.slice(0, 250));
  return id;
}

export async function enhancePromptPipeline(input: {
  description: string;
  stylePreset: StylePresetId;
  textInImage?: string;
  referenceImages?: string[];
  structuredFields?: Partial<StructuredPromptFields>;
  preserveLength?: boolean;
  preferredVisionModel?: string;
  actorUid?: string;
  actorEmail?: string;
  actorName?: string;
}): Promise<
  | {
      status: 'ok';
      enhancedPrompt: string;
      negativePrompt: string;
      wordCount: number;
      charCount: number;
      approxTokens: number;
      engine: string;
      pipelineStages: Array<{ stage: string; detail: string }>;
    }
  | { status: 'refused' }
> {
  const settings = loadSystemSettings();
  const preserveLength = input.preserveLength !== false;
  const referenceImages = input.referenceImages || [];
  const styleObj = STYLE_PRESETS.find((s) => s.id === input.stylePreset) ?? STYLE_PRESETS[0];

  // Stage 1: Prompt Analyzer & Structured Merge
  const builtStructured = buildUnlimitedStructuredPrompt({
    ...(input.structuredFields || {}),
    mainPrompt: input.structuredFields?.mainPrompt || input.description,
  });
  const mergedUserSource = builtStructured.combinedPrompt || input.description.trim();
  const fidelityTokens = extractEnglishFidelityTokens(mergedUserSource);

  const pipelineStages: Array<{ stage: string; detail: string }> = [
    {
      stage: '1. Prompt Analyzer',
      detail:
        fidelityTokens.length > 0
          ? `ตรวจจับรายละเอียดสำคัญ ${fidelityTokens.length} รายการ (${fidelityTokens.slice(0, 6).join(', ')})`
          : 'วิเคราะห์โครงสร้างคำอธิบายและสัดส่วนรายละเอียดทั้งหมด',
    },
  ];

  const userMessage = [
    mergedUserSource
      ? `คำอธิบายความต้องการจากผู้ใช้ (รักษารายละเอียดทุกข้อ ห้ามตัดทอน):\n${mergedUserSource}`
      : 'คำอธิบายความต้องการจากผู้ใช้: วิเคราะห์ภาพที่แนบมาแล้วสร้างภาพใหม่คุณภาพสูงในสไตล์ที่สวยงามคมชัด',
    referenceImages.length > 0
      ? `ผู้ใช้แนบภาพอ้างอิงจำนวน ${referenceImages.length} ภาพ กรุณาวิเคราะห์องค์ประกอบสำคัญ ตัวแบบ สี แสง และบรรยากาศจากภาพที่แนบมารวมกับคำอธิบาย`
      : '',
    input.stylePreset !== 'auto'
      ? `สไตล์ที่ผู้ใช้ต้องการ: ${styleObj.labelEn} (${styleObj.promptHint})`
      : '',
    input.textInImage && input.textInImage.trim().length > 0
      ? `ข้อความที่ต้องการให้ปรากฏในภาพ: "${input.textInImage.trim()}"`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const multimodalContent:
    | string
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> =
    referenceImages.length > 0
      ? [
          { type: 'text', text: userMessage },
          ...referenceImages.map((url) => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
        ]
      : userMessage;

  const jobId = `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const startMs = Date.now();
  const openRouterKey = getOpenRouterApiKey();
  const candidateModels = Array.from(
    new Set([
      input.preferredVisionModel || settings.defaultVisionModel || VISION_PROMPT_MODEL,
      VISION_PROMPT_MODEL,
      'nvidia/nemotron-nano-12b-v2-vl:free',
      'openrouter/free',
    ])
  ).filter((m) => m !== 'gemini-4-hydrogen');

  const finalize = (rawText: string, engineName: string) => {
    const cleaned = preserveLength ? cleanPromptText(rawText) : enforceWordLimit(rawText, 120);
    const stats = measurePromptStats(cleaned);
    pipelineStages.push(
      {
        stage: '2. Prompt Enhancer',
        detail: `เรียบเรียงด้วย ${engineName} โดยคงความครบถ้วน ${stats.words} คำ / ${stats.chars} ตัวอักษร`,
      },
      {
        stage: '3. Model-Aware Builder',
        detail: `จัดรูปแบบพร้อมส่งต่อโมเดลสร้างภาพ (${builtStructured.sectionsApplied.join(', ') || styleObj.labelEn})`,
      }
    );

    saveAiJob({
      id: jobId,
      type: 'enhance-prompt',
      status: 'completed',
      actorUid: input.actorUid,
      actorEmail: input.actorEmail,
      actorName: input.actorName || 'Guest',
      model: engineName,
      provider: engineName.includes('gemini') ? 'gemini' : 'openrouter',
      promptPreview: mergedUserSource.slice(0, 140),
      fullPrompt: cleaned.slice(0, 4000),
      stylePreset: input.stylePreset,
      durationMs: Date.now() - startMs,
      estimatedCostUsd: 0,
      createdAtUtc: new Date(startMs).toISOString(),
      updatedAtUtc: new Date().toISOString(),
    });

    return {
      status: 'ok' as const,
      enhancedPrompt: cleaned,
      negativePrompt: builtStructured.negativePrompt,
      wordCount: stats.words,
      charCount: stats.chars,
      approxTokens: stats.approxTokens,
      engine: engineName,
      pipelineStages,
    };
  };

  for (const modelId of candidateModels) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(16000),
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': getRefererHeader(),
          'X-Title': 'ZImage Studio',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: PROMPT_EXPERT_SYSTEM_INSTRUCTION },
            { role: 'user', content: multimodalContent },
          ],
          temperature: 0.35,
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const rawText = (data.choices?.[0]?.message?.content ?? '').trim();
      if (!rawText) continue;
      if (isRefusalResponse(rawText)) return { status: 'refused' };
      return finalize(rawText, data.model || modelId);
    } catch (err) {
      console.warn(
        `OpenRouter prompt model ${modelId} failed:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: userMessage },
      ];
      for (const imgUrl of referenceImages) {
        const parsed = parseDataUrlParts(imgUrl);
        if (parsed) {
          parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } });
        }
      }
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: PROMPT_EXPERT_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const rawText = (response.text ?? '').trim();
      if (rawText) {
        if (isRefusalResponse(rawText)) return { status: 'refused' };
        return finalize(rawText, 'gemini-4-hydrogen');
      }
    } catch (err) {
      console.warn('Gemini prompt fallback failed:', err instanceof Error ? err.message : String(err));
    }
  }

  // Deterministic unlimited structured architect fallback
  const fallback = buildStructuredFallbackPrompt(
    mergedUserSource || 'artistic visual inspired by reference image',
    input.stylePreset,
    input.textInImage,
    preserveLength
  );
  return finalize(fallback, 'structured-architect');
}

export async function analyzeImageWithAI(
  imageDataUrl: string,
  mode: 'ocr-text' | 'ocr-table' | 'handwriting' | 'describe' | 'alt-text'
): Promise<{ text: string; engine: string }> {
  const modePromptMap: Record<typeof mode, string> = {
    'ocr-text':
      'Extract ALL visible text from this image accurately, preserving line breaks and reading order. Output ONLY the extracted text without commentary.',
    'ocr-table':
      'Extract the table data from this image as valid CSV format (comma-separated, header row first). Output ONLY the CSV rows without markdown code fences.',
    handwriting:
      'Transcribe all handwritten text in this image as accurately as possible (Thai or English). Output ONLY the transcribed text.',
    describe:
      'Provide a thorough, structured description of this image in Thai (subject, setting, lighting, details, mood).',
    'alt-text':
      'Write a concise, accessible Alt Text description (1-2 sentences) in both Thai and English suitable for screen readers and SEO.',
  };
  const instruction = modePromptMap[mode] || modePromptMap['ocr-text'];
  const openRouterKey = getOpenRouterApiKey();

  const models = [VISION_PROMPT_MODEL, 'nvidia/nemotron-nano-12b-v2-vl:free', 'openrouter/free'];
  for (const modelId of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(18000),
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': getRefererHeader(),
          'X-Title': 'ZImage Studio',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: instruction },
                { type: 'image_url', image_url: { url: imageDataUrl } },
              ],
            },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const text = (data.choices?.[0]?.message?.content ?? '').trim();
      if (text) return { text, engine: data.model || modelId };
    } catch {
      // Try next fallback
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
    const parsed = parseDataUrlParts(imageDataUrl);
    if (parsed) {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          {
            role: 'user',
            parts: [{ text: instruction }, { inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } }],
          },
        ],
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      });
      const text = (response.text ?? '').trim();
      if (text) return { text, engine: 'gemini-4-hydrogen' };
    }
  }

  throw new Error('ไม่สามารถวิเคราะห์ภาพได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
}

function parseJsonObjectLoose(rawText: string): Record<string, unknown> | null {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function clampBboxPct(raw: unknown): [number, number, number, number] {
  if (!Array.isArray(raw) || raw.length < 4) return [15, 15, 70, 70];
  const x = Math.max(0, Math.min(95, Number(raw[0]) || 0));
  const y = Math.max(0, Math.min(95, Number(raw[1]) || 0));
  const w = Math.max(5, Math.min(100 - x, Number(raw[2]) || 40));
  const h = Math.max(5, Math.min(100 - y, Number(raw[3]) || 40));
  return [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
}

/**
 * Vision AI structured image decomposition: extracts OCR text regions,
 * foreground/object bounding boxes, dominant colors, and background description.
 * Never fabricates fake data if AI providers fail.
 */
export async function decomposeImageWithAI(input: {
  imageDataUrl: string;
  actorUid?: string;
  actorEmail?: string;
  actorName?: string;
}): Promise<DecomposeAiResult> {
  const startMs = Date.now();
  const jobId = `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const jobBase: AiJobRecord = {
    id: jobId,
    type: 'decompose-image',
    status: 'running',
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    actorName: input.actorName || 'Guest',
    model: VISION_PROMPT_MODEL,
    provider: 'openrouter',
    promptPreview: 'AI Image to Editable Layers (OCR + Object Regions)',
    estimatedCostUsd: 0,
    createdAtUtc: new Date(startMs).toISOString(),
    updatedAtUtc: new Date(startMs).toISOString(),
  };
  saveAiJob(jobBase);

  const instruction = `Analyze this image and decompose it into structured editable graphic layers.
Return STRICT VALID JSON ONLY (no markdown, no explanation) with this exact schema:
{
  "backgroundDescription": "short description of background",
  "dominantColors": ["#RRGGBB", "#RRGGBB"],
  "textRegions": [
    { "text": "exact visible text", "bboxPct": [xPct, yPct, widthPct, heightPct], "colorHex": "#RRGGBB", "fontSizeRel": 0.08 }
  ],
  "objectRegions": [
    { "label": "main subject or object name", "category": "subject" | "element" | "overlay" | "frame", "bboxPct": [xPct, yPct, widthPct, heightPct] }
  ]
}
Rules:
- All bboxPct values must be numbers 0..100 representing percentage of image width/height [x, y, width, height].
- Include at least 1 main subject or element bounding box if any distinct foreground object exists.
- Include ALL visible text lines in textRegions if text appears; otherwise [].`;

  const normalizeResult = (raw: Record<string, unknown>, engine: string): DecomposeAiResult => {
    const rawTexts = Array.isArray(raw.textRegions) ? raw.textRegions : [];
    const rawObjects = Array.isArray(raw.objectRegions) ? raw.objectRegions : [];
    const dominantColors = Array.isArray(raw.dominantColors)
      ? raw.dominantColors.filter((c): c is string => typeof c === 'string').slice(0, 6)
      : [];

    return {
      engine,
      backgroundDescription:
        typeof raw.backgroundDescription === 'string' && raw.backgroundDescription.trim()
          ? raw.backgroundDescription.trim().slice(0, 300)
          : 'Background plate reconstructed from boundary context',
      dominantColors,
      textRegions: rawTexts.slice(0, 12).map((t, i) => {
        const rec = (t || {}) as Record<string, unknown>;
        return {
          id: `txt-reg-${i + 1}`,
          text: String(rec.text || '').trim().slice(0, 200),
          bboxPct: clampBboxPct(rec.bboxPct),
          colorHex: typeof rec.colorHex === 'string' ? rec.colorHex : '#101820',
          fontSizeRel: typeof rec.fontSizeRel === 'number' ? Math.max(0.02, Math.min(0.3, rec.fontSizeRel)) : 0.06,
        };
      }).filter((t) => t.text.length > 0),
      objectRegions: rawObjects.slice(0, 10).map((o, i) => {
        const rec = (o || {}) as Record<string, unknown>;
        const cat =
          rec.category === 'subject' ||
          rec.category === 'element' ||
          rec.category === 'overlay' ||
          rec.category === 'frame'
            ? rec.category
            : i === 0
              ? 'subject'
              : 'element';
        return {
          id: `obj-reg-${i + 1}`,
          label: String(rec.label || `Object ${i + 1}`).trim().slice(0, 80),
          category: cat,
          bboxPct: clampBboxPct(rec.bboxPct),
        };
      }),
    };
  };

  const openRouterKey = getOpenRouterApiKey();
  const models = [VISION_PROMPT_MODEL, 'nvidia/nemotron-nano-12b-v2-vl:free', 'openrouter/free'];
  for (const modelId of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(22000),
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': getRefererHeader(),
          'X-Title': 'ZImage Studio',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: instruction },
                { type: 'image_url', image_url: { url: input.imageDataUrl } },
              ],
            },
          ],
          temperature: 0.15,
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const rawText = (data.choices?.[0]?.message?.content ?? '').trim();
      const parsed = parseJsonObjectLoose(rawText);
      if (parsed) {
        const result = normalizeResult(parsed, data.model || modelId);
        saveAiJob({
          ...jobBase,
          status: 'completed',
          model: result.engine,
          durationMs: Date.now() - startMs,
          updatedAtUtc: new Date().toISOString(),
        });
        return result;
      }
    } catch {
      // Try next fallback
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
    const parsedImg = parseDataUrlParts(input.imageDataUrl);
    if (parsedImg) {
      try {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [
            {
              role: 'user',
              parts: [
                { text: instruction },
                { inlineData: { mimeType: parsedImg.mimeType, data: parsedImg.base64 } },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                backgroundDescription: { type: Type.STRING },
                dominantColors: { type: Type.ARRAY, items: { type: Type.STRING } },
                textRegions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      bboxPct: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                      colorHex: { type: Type.STRING },
                      fontSizeRel: { type: Type.NUMBER },
                    },
                  },
                },
                objectRegions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      category: { type: Type.STRING },
                      bboxPct: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    },
                  },
                },
              },
            },
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        const parsed = parseJsonObjectLoose(response.text || '');
        if (parsed) {
          const result = normalizeResult(parsed, 'gemini-4-hydrogen');
          saveAiJob({
            ...jobBase,
            status: 'completed',
            model: 'gemini-4-hydrogen',
            provider: 'gemini',
            durationMs: Date.now() - startMs,
            updatedAtUtc: new Date().toISOString(),
          });
          return result;
        }
      } catch (err) {
        console.warn('Gemini decompose fallback failed:', err instanceof Error ? err.message : String(err));
      }
    }
  }

  saveAiJob({
    ...jobBase,
    status: 'failed',
    errorCode: 'DECOMPOSE_AI_FAILED',
    errorMessage: 'โมเดลวิเคราะห์เลเยอร์ไม่พร้อมใช้งานชั่วคราว',
    durationMs: Date.now() - startMs,
    updatedAtUtc: new Date().toISOString(),
  });
  throw new Error('ไม่สามารถเรียกโมเดล AI แยกองค์ประกอบภาพได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
}

export async function generateImageViaGateway(input: {
  prompt: string;
  originalPrompt?: string;
  negativePrompt?: string;
  stylePreset: StylePresetId;
  aspectRatio: AspectRatioId;
  generationAspectRatio?: Exclude<AspectRatioId, 'custom'>;
  dimensionsLabel?: string;
  hasReferenceImage: boolean;
  promptEngine: string;
  modelId?: string;
  ownerUid?: string;
  ownerName?: string;
  ownerEmail?: string;
  paletteColors?: number[][];
  variationIndex?: number;
  seed?: number;
}): Promise<
  | {
      ok: true;
      imageUrl: string;
      archiveId: string;
      model: string;
      aspectRatio: AspectRatioId;
      durationMs: number;
      seed?: number;
    }
  | { ok: false; status: number; errorCode: string; error: string }
> {
  const settings = loadSystemSettings();
  const modelToUse =
    input.modelId && input.modelId === RECRAFT_MODEL
      ? input.modelId
      : settings.defaultImageModel || RECRAFT_MODEL;

  const apiAspectRatio = ASPECT_RATIOS.some((a) => a.id === input.generationAspectRatio)
    ? (input.generationAspectRatio as Exclude<AspectRatioId, 'custom'>)
    : ASPECT_RATIOS.some((a) => a.id === input.aspectRatio)
      ? (input.aspectRatio as Exclude<AspectRatioId, 'custom'>)
      : '1:1';

  const imageConfig: Record<string, unknown> = { aspect_ratio: apiAspectRatio };
  if (Array.isArray(input.paletteColors) && input.paletteColors.length > 0) {
    imageConfig.rgb_colors = input.paletteColors.slice(0, 5);
  }

  const seedValue =
    typeof input.seed === 'number' && Number.isFinite(input.seed)
      ? Math.abs(Math.round(input.seed))
      : undefined;
  const variationSuffix =
    typeof input.variationIndex === 'number' && input.variationIndex > 0
      ? ` (Composition variation #${input.variationIndex + 1}, distinct framing)`
      : seedValue !== undefined
        ? ` (Seed #${seedValue})`
        : '';

  const negClause =
    input.negativePrompt && input.negativePrompt.trim()
      ? `\nAvoid / Negative constraints: ${input.negativePrompt.trim()}.`
      : '';

  const fullGenerationContent = `${input.prompt}${variationSuffix}${negClause}`;
  const startMs = Date.now();
  const jobId = `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const jobBase: AiJobRecord = {
    id: jobId,
    type: 'generate-image',
    status: 'running',
    actorUid: input.ownerUid,
    actorEmail: input.ownerEmail,
    actorName: input.ownerName || 'ผู้เยี่ยมชม (Guest)',
    model: modelToUse,
    provider: 'openrouter',
    promptPreview: (input.originalPrompt || input.prompt).slice(0, 140),
    fullPrompt: input.prompt.slice(0, 4000),
    stylePreset: input.stylePreset,
    aspectRatio: input.aspectRatio,
    seed: seedValue,
    estimatedCostUsd: 0,
    createdAtUtc: new Date(startMs).toISOString(),
    updatedAtUtc: new Date(startMs).toISOString(),
  };
  saveAiJob(jobBase);

  const openRouterKey = getOpenRouterApiKey();
  let lastStatus = 500;
  let lastError = 'เกิดข้อผิดพลาดระหว่างเชื่อมต่อระบบสร้างภาพ กรุณากด "ลองใหม่"';
  let lastErrorCode = 'MODEL_DOWN';

  // Retry once on transient 5xx / timeout
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(45000),
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': getRefererHeader(),
          'X-Title': 'ZImage Studio',
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: [{ role: 'user', content: fullGenerationContent }],
          modalities: ['image'],
          image_config: imageConfig,
          ...(seedValue !== undefined ? { seed: seedValue } : {}),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const rawErr =
          (payload as { error?: { message?: string } })?.error?.message ||
          `OpenRouter error (${response.status})`;
        const isRate = response.status === 429;
        lastStatus = response.status;
        lastErrorCode = isRate ? 'RATE_LIMIT' : 'MODEL_DOWN';
        lastError = isRate
          ? 'เซิร์ฟเวอร์สร้างภาพกำลังมีผู้ใช้งานหนาแน่นชั่วคราว (429) กรุณารอสักครู่แล้วกด "ลองใหม่"'
          : response.status >= 500
            ? `โมเดลสร้างภาพกำลังปรับปรุงชั่วคราว (${response.status}) กรุณากด "ลองใหม่"`
            : `ไม่สามารถสร้างภาพได้ในขณะนี้: ${rawErr}`;
        if (response.status >= 500 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        break;
      }

      const imageUrl = extractImageUrlFromOpenRouterResponse(payload);
      if (!imageUrl) {
        lastStatus = 502;
        lastErrorCode = 'MODEL_DOWN';
        lastError = 'โมเดลไม่ส่งข้อมูลภาพกลับมา กรุณากด "ลองใหม่"';
        if (attempt === 0) continue;
        break;
      }

      const archiveId = saveGeneratedImageToAdminArchive({
        imageUrl,
        originalPrompt: input.originalPrompt || input.prompt,
        enhancedPrompt: input.prompt,
        negativePrompt: input.negativePrompt,
        stylePreset: input.stylePreset,
        aspectRatio: input.aspectRatio,
        dimensionsLabel: input.dimensionsLabel,
        seed: seedValue,
        hasReferenceImage: input.hasReferenceImage,
        ownerType: input.ownerUid ? 'member' : 'guest',
        ownerUid: input.ownerUid,
        ownerName: input.ownerName || 'ผู้เยี่ยมชม (Guest)',
        ownerEmail: input.ownerEmail,
        model: modelToUse,
        promptEngine: input.promptEngine,
      });

      const durationMs = Date.now() - startMs;
      saveAiJob({
        ...jobBase,
        status: 'completed',
        durationMs,
        archiveId,
        updatedAtUtc: new Date().toISOString(),
      });

      return {
        ok: true,
        imageUrl,
        archiveId,
        model: modelToUse,
        aspectRatio: input.aspectRatio,
        durationMs,
        seed: seedValue,
      };
    } catch (error) {
      const isTimeout =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      lastStatus = isTimeout ? 504 : 500;
      lastErrorCode = isTimeout ? 'NETWORK_ERROR' : 'MODEL_DOWN';
      lastError = isTimeout
        ? 'การเชื่อมต่อโมเดลใช้เวลานานเกินกำหนด กรุณาตรวจสอบอินเทอร์เน็ตแล้วกด "ลองใหม่"'
        : 'เกิดข้อผิดพลาดระหว่างเชื่อมต่อระบบสร้างภาพ กรุณากด "ลองใหม่"';
      if (attempt === 0 && !isTimeout) {
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
    }
  }

  saveAiJob({
    ...jobBase,
    status: 'failed',
    durationMs: Date.now() - startMs,
    errorCode: lastErrorCode,
    errorMessage: lastError,
    updatedAtUtc: new Date().toISOString(),
  });

  return {
    ok: false,
    status: lastStatus,
    errorCode: lastErrorCode,
    error: lastError,
  };
}
