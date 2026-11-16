import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VISION_PROMPT_MODEL,
  DEFAULT_DAILY_GENERATION_LIMIT,
  PHOTOREALISM_PRESETS,
  WIRED_IMAGE_MODELS,
  WIRED_VISION_MODELS,
  isAdminUser,
  countWords,
  measurePromptStats,
  enforceWordLimit,
  isRefusalResponse,
  extractEnglishFidelityTokens,
  appendStyleToPrompt,
  buildStructuredFallbackPrompt,
  buildUnlimitedStructuredPrompt,
  clampCustomPixelDimensions,
  mapCustomDimensionsToAspectRatio,
  validateBlueprintImagePayload,
  validateBlueprintRequestPayload,
} from './promptLogic';

test('VISION_PROMPT_MODEL uses nvidia/nemotron-3.5-super-vl:free and wired registries exist', () => {
  assert.equal(VISION_PROMPT_MODEL, 'nvidia/nemotron-3.5-super-vl:free');
  assert.equal(DEFAULT_DAILY_GENERATION_LIMIT, 20);
  assert.ok(WIRED_IMAGE_MODELS.some((m) => m.id === 'recraft/recraft-v4.1-flash-v2:free'));
  assert.ok(WIRED_VISION_MODELS.some((m) => m.id === 'nvidia/nemotron-3.5-super-vl:free'));
  assert.equal(PHOTOREALISM_PRESETS.filter((p) => p.id !== 'none').length, 8);
});

test('isAdminUser grants access only to verified admin emails', () => {
  assert.equal(isAdminUser('zbcd1053@gmail.com', true), true);
  assert.equal(isAdminUser('ZBCD1053@GMAIL.COM', true), true);
  assert.equal(isAdminUser('zeetosit@gmail.com', true), true);
  assert.equal(isAdminUser('zbcd1053@gmail.com', false), false);
  assert.equal(isAdminUser('other@gmail.com', true), false);
  assert.equal(isAdminUser(null, true), false);
});

test('enforceWordLimit caps output when explicit maxWords is provided and strips wrappers', () => {
  const longText = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
  const capped = enforceWordLimit(`"${longText}"`, 120);
  assert.equal(countWords(capped), 120);
});

test('isRefusalResponse accurately detects REFUSE signals', () => {
  assert.equal(isRefusalResponse('REFUSE'), true);
  assert.equal(isRefusalResponse('  refuse. '), true);
  assert.equal(isRefusalResponse('A cute orange cat on the beach'), false);
});

test('FIDELITY FIRST: Thai colors, subjects, counts, and settings map accurately to English prompt tokens', () => {
  const tokens = extractEnglishFidelityTokens('แมวสีส้มสองตัวนั่งบนชายหาดสีทองตอนพระอาทิตย์ตก');
  assert.ok(tokens.includes('cat'));
  assert.ok(tokens.includes('orange'));
  assert.ok(tokens.includes('two'));
  assert.ok(tokens.includes('beach and ocean'));
  assert.ok(tokens.includes('gold'));
  assert.ok(tokens.includes('golden sunset dusk'));

  const structured = buildStructuredFallbackPrompt(
    'หนุมานถือตรีศูลสีทองในวัดไทยยามค่ำคืน',
    'fine-art'
  );
  assert.ok(structured.includes('Hanuman'));
  assert.ok(structured.includes('gold'));
  assert.ok(structured.includes('Thai temple'));
  assert.ok(structured.includes('nighttime'));
  assert.ok(structured.toLowerCase().includes('thai fine art'));
});

test('appendStyleToPrompt adds style medium without overwriting original subject or truncating long prompts', () => {
  const longDetails = Array.from({ length: 180 }, (_, i) => `detail${i}`).join(' ');
  const original = `Two white lotus flowers in a royal navy blue ceramic bowl ${longDetails}`;
  const styled = appendStyleToPrompt(original, 'watercolor');
  assert.ok(styled.includes(original));
  assert.ok(styled.toLowerCase().includes('watercolor'));
  assert.ok(countWords(styled) > 180);
});

test('buildStructuredFallbackPrompt preserves unlimited length by default and supports optional 120-word cap', () => {
  const capped = buildStructuredFallbackPrompt('A serene lakeside cabin', 'photorealistic', 'LAKEVIEW', false);
  assert.ok(capped.includes('Subject:'));
  assert.ok(capped.includes('Setting:'));
  assert.ok(capped.includes('Style:'));
  assert.ok(capped.includes('Composition:'));
  assert.ok(capped.includes('Lighting:'));
  assert.ok(capped.includes('Color palette:'));
  assert.ok(capped.includes('Quality:'));
  assert.ok(capped.includes('"LAKEVIEW"'));
  assert.ok(countWords(capped) <= 120);

  const longInput = Array.from({ length: 220 }, (_, i) => `token${i}`).join(' ');
  const unlimited = buildStructuredFallbackPrompt(longInput, 'photorealistic');
  assert.ok(unlimited.includes('token219'));
  assert.ok(countWords(unlimited) > 220);
});

test('buildUnlimitedStructuredPrompt combines all 9 structured sections and photorealism specs without truncation', () => {
  const built = buildUnlimitedStructuredPrompt({
    mode: 'unlimited',
    mainPrompt: 'Editorial fashion portrait in a sunlit Bangkok conservatory',
    subjectDetails: 'Tailored ivory silk blazer, crisp gold embroidery',
    environment: 'Botanical glasshouse with terracotta pots',
    composition: '3/4 vertical portrait frame with clean headroom',
    photorealismPreset: 'luxury-campaign',
    negativePrompt: 'plastic skin, extra fingers, watermark',
    qualityEnhancements: 'authentic film texture, sharp iris reflections',
  });
  assert.ok(built.combinedPrompt.includes('Editorial fashion portrait'));
  assert.ok(built.combinedPrompt.includes('Luxury Campaign'));
  assert.ok(built.combinedPrompt.includes('medium format digital 80mm'));
  assert.equal(built.negativePrompt, 'plastic skin, extra fingers, watermark');
  assert.ok(built.sectionsApplied.includes('Luxury Campaign'));
  const stats = measurePromptStats(built.combinedPrompt);
  assert.ok(stats.chars > 100 && stats.words > 15 && stats.approxTokens >= stats.words);
});

test('custom pixel dimensions clamp and map to nearest aspect ratio', () => {
  assert.deepEqual(clampCustomPixelDimensions(1920, 1080), { width: 1920, height: 1080, valid: true });
  assert.equal(clampCustomPixelDimensions(10, 1080).valid, false);
  assert.equal(mapCustomDimensionsToAspectRatio(1920, 1080), '16:9');
  assert.equal(mapCustomDimensionsToAspectRatio(1080, 1920), '9:16');
  assert.equal(mapCustomDimensionsToAspectRatio(1000, 1000), '1:1');
  assert.equal(mapCustomDimensionsToAspectRatio(1200, 900), '4:3');
});

test('validateBlueprintImagePayload enforces schema limits including custom ratio and fine-art preset', () => {
  assert.equal(
    validateBlueprintImagePayload({
      originalPrompt: 'หนุมานลายกนกทอง',
      enhancedPrompt: 'Subject: Hanuman...',
      stylePreset: 'fine-art',
      aspectRatio: 'custom',
      dimensionsLabel: '1080×1350',
      imageDataUrl: 'data:image/png;base64,AAAA1234567890',
    }).valid,
    true
  );

  assert.equal(
    validateBlueprintImagePayload({
      originalPrompt: '',
      enhancedPrompt: 'Subject: Cat',
      stylePreset: 'photorealistic',
      aspectRatio: '16:9',
      imageDataUrl: 'data:image/webp;base64,AAAA1234567890',
    }).valid,
    false
  );
});

test('validateBlueprintRequestPayload enforces daily request rules', () => {
  assert.equal(
    validateBlueprintRequestPayload({
      subject: 'อยากได้เครื่องมือลบสิวอัตโนมัติ',
      message: 'เพิ่มเครื่องมือรีทัชผิวหน้าสำหรับการสมัครงาน',
      rating: 5,
      dateKey: '2026-11-16',
    }).valid,
    true
  );

  assert.equal(
    validateBlueprintRequestPayload({
      subject: 'Feedback',
      message: 'Great app',
      rating: 6,
      dateKey: '2026-11-16',
    }).valid,
    false
  );

  assert.equal(
    validateBlueprintRequestPayload({
      subject: 'Feedback',
      message: 'Great app',
      rating: 4,
      dateKey: 'invalid-date',
    }).valid,
    false
  );
});
