import type { AspectRatioId, PhotorealismPresetId, StylePresetId } from '../utils/promptLogic';

import imgKanokGold from '../assets/images/sample_thai_kanok_gold_1794816115397.jpg';
import imgTempleDusk from '../assets/images/sample_thai_temple_dusk_1794816115426.jpg';
import imgMythicalNaga from '../assets/images/sample_thai_mythical_naga_1794816116164.jpg';
import imgWoodcut from '../assets/images/sample_thai_engraving_woodcut_1794816116273.jpg';
import imgKyotoArch from '../assets/images/showcase_kyoto_architecture_1794809203820.jpg';
import imgCeramic from '../assets/images/showcase_ceramic_editorial_1794809204087.jpg';
import imgKoiVector from '../assets/images/showcase_botanical_vector_1794809204862.jpg';
import imgTokyoTeahouse from '../assets/images/showcase_tokyo_teahouse_1794809205717.jpg';
import imgPortraitEditorial from '../assets/images/showcase_portrait_editorial_1794820977735.jpg';
import imgFoodMatcha from '../assets/images/showcase_food_matcha_1794820978238.jpg';
import imgBrandLogo from '../assets/images/showcase_brand_logo_1794820978426.jpg';
import imgProductWatch from '../assets/images/showcase_product_watch_1794820978453.jpg';
import imgAnimeGuardian from '../assets/images/showcase_anime_guardian_1794820979464.jpg';
import imgSocialCampaign from '../assets/images/showcase_social_campaign_1794820979946.jpg';

export type ShowcaseCategoryId =
  | 'Portrait'
  | 'Fashion'
  | 'Product'
  | 'Food'
  | 'Architecture'
  | 'Graphic Design'
  | 'Poster'
  | 'Brand Identity'
  | 'Social Media'
  | 'Anime'
  | 'Fantasy'
  | 'Cinematography'
  | 'Illustration'
  | 'Photorealistic Human';

export const SHOWCASE_CATEGORIES: ShowcaseCategoryId[] = [
  'Portrait',
  'Fashion',
  'Product',
  'Food',
  'Architecture',
  'Graphic Design',
  'Poster',
  'Brand Identity',
  'Social Media',
  'Anime',
  'Fantasy',
  'Cinematography',
  'Illustration',
  'Photorealistic Human',
];

export interface ShowcaseItem {
  id: string;
  category: ShowcaseCategoryId;
  title: string;
  originalPrompt: string;
  enhancedPrompt: string;
  negativePrompt: string;
  model: string;
  stylePreset: StylePresetId;
  photorealismPreset: PhotorealismPresetId;
  aspectRatio: Exclude<AspectRatioId, 'custom'>;
  seed: number;
  imageUrl: string;
  authorName: string;
  createdLabel: string;
}

export const CURATED_SHOWCASE_ITEMS: ShowcaseItem[] = [
  {
    id: 'cat-portrait-editorial',
    category: 'Portrait',
    title: 'พอร์ตเทรตแสงหน้าต่างธรรมชาติ 85mm',
    originalPrompt: 'ภาพถ่ายพอร์ตเทรตบุคคลแสงหน้าต่างธรรมชาติ ผิวจริงมีรายละเอียดรูขุมขน แฟชั่นมินิมอลโทนน้ำเงินสเลต',
    enhancedPrompt:
      'Authentic 85mm f/1.8 editorial portrait by a north-facing architectural window, natural skin pores and fine micro-texture, poised calm gaze, tailored slate-blue wool blazer, soft window shadow falloff, unretouched magazine realism.',
    negativePrompt: 'plastic skin, airbrushed face, harsh neon, watermark, distorted eyes, extra fingers',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'photorealistic',
    photorealismPreset: 'natural-window-light',
    aspectRatio: '3:4',
    seed: 1048291,
    imageUrl: imgPortraitEditorial,
    authorName: 'ZImage Studio',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-photorealistic-human',
    category: 'Photorealistic Human',
    title: 'สกินโทนสมจริงระดับแคมเปญสากล',
    originalPrompt: 'พอร์ตเทรตแสงบิวตี้เอดิทอเรียลเน้นรายละเอียดผิวธรรมชาติ ดวงตาคมชัด โทนสะอาดหรูหรา',
    enhancedPrompt:
      'High-fashion beauty editorial portrait with authentic skin pores, delicate catchlights in the iris, soft diffused overhead octabox lighting, clean architectural backdrop in cool off-white, 105mm macro clarity, zero plastic smoothing.',
    negativePrompt: 'waxy skin, overly smooth face, cgi render, uncanny pupils, text artifacts',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'photorealistic',
    photorealismPreset: 'beauty-editorial',
    aspectRatio: '3:4',
    seed: 2294017,
    imageUrl: imgPortraitEditorial,
    authorName: 'ZImage Editorial',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-fashion-lookbook',
    category: 'Fashion',
    title: 'แคมเปญแฟชั่นมินิมอลร่วมสมัย',
    originalPrompt: 'ภาพแฟชั่นลุคบุ๊คชุดสูทสีกรมท่าและเครื่องประดับทองคำในแกลเลอรีคอนกรีตแสงธรรมชาติ',
    enhancedPrompt:
      'Luxury fashion campaign still in a minimalist concrete and travertine gallery, tailored deep navy ensemble with crisp fabric weave, warm afternoon sunlight slicing diagonally, medium format 80mm lens, refined posture.',
    negativePrompt: 'deformed hands, warped fabric, cluttered background, blurry face, lowres',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'photorealistic',
    photorealismPreset: 'luxury-campaign',
    aspectRatio: '4:3',
    seed: 3918402,
    imageUrl: imgCeramic,
    authorName: 'ZImage Lookbook',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-product-watch',
    category: 'Product',
    title: 'นาฬิกาสเตนเลสและแซฟไฟร์บนแท่นหิน',
    originalPrompt: 'ภาพถ่ายสินค้าเชิงพาณิชย์ นาฬิกาโครโนกราฟหน้าปัดน้ำเงินเข้มวางบนหินสเลต มีเงาสะท้อนคมชัด',
    enhancedPrompt:
      'Precision commercial product photograph of a brushed titanium luxury chronograph watch with a deep royal navy dial resting on dark sculpted slate stone, razor-sharp specular highlights on sapphire crystal, 90mm tilt-shift studio macro.',
    negativePrompt: 'scratches, dust specks, illegible dial markers, warped bezel, watermark',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'photorealistic',
    photorealismPreset: 'commercial-photography',
    aspectRatio: '1:1',
    seed: 4820193,
    imageUrl: imgProductWatch,
    authorName: 'ZImage Commercial',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-food-matcha',
    category: 'Food',
    title: 'มัทฉะเกรดพิธีการและขนมญี่ปุ่น',
    originalPrompt: 'ภาพถ่ายอาหาร มัทฉะตีฟองละเอียดในชามเซรามิกแฮนด์เมดคู่กับวากาชิบนโต๊ะไม้โอ๊คแสงเช้า',
    enhancedPrompt:
      'Artisanal culinary photograph of ceremonial matcha foam in a hand-thrown ceramic chawan beside delicate wagashi confections on pale white oak, soft morning window illumination, shallow 50mm f/2.0 depth of field, tactile steam and crema.',
    negativePrompt: 'plastic food, oversaturated green, harsh flash, messy crumbs, blurry focus',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'photorealistic',
    photorealismPreset: 'natural-window-light',
    aspectRatio: '4:3',
    seed: 5192044,
    imageUrl: imgFoodMatcha,
    authorName: 'ZImage Culinary',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-architecture-kyoto',
    category: 'Architecture',
    title: 'ศาลาสถาปัตยกรรมกลางป่าไผ่ยามเช้า',
    originalPrompt: 'ศาลาคอนกรีตมินิมอลกลางป่าไผ่เกียวโตตอนเช้ามีหมอกสีทองและสระน้ำสะท้อน',
    enhancedPrompt:
      'Minimalist architectural concrete pavilion nestled in a serene Kyoto bamboo forest at dawn, soft golden mist drifting through tall stalks, calm reflective water basin in foreground, wide-angle 24mm tilt-shift architectural photography.',
    negativePrompt: 'tilted verticals, lens flare glare, tourists, plastic foliage, noisy shadows',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'photorealistic',
    photorealismPreset: 'commercial-photography',
    aspectRatio: '16:9',
    seed: 6049182,
    imageUrl: imgKyotoArch,
    authorName: 'ZImage Architecture',
    createdLabel: '15 Nov 2026',
  },
  {
    id: 'cat-graphic-design-vector',
    category: 'Graphic Design',
    title: 'กราฟิกเวกเตอร์ปลาคราฟใบบัวมรกต',
    originalPrompt: 'ภาพวาดเวกเตอร์ปลาคราฟสีส้มแหวกว่ายใต้ใบบัวสีเขียวมรกตมุมมองจากด้านบน',
    enhancedPrompt:
      'Modernist flat vector graphic design of vibrant koi fish gliding beneath geometric emerald water lilies and crisp concentric ripples, top-down Swiss editorial layout, cobalt blue and coral accent palette, razor-sharp edges.',
    negativePrompt: 'muddy gradients, photorealistic noise, sketchy pencil lines, blurry bitmap',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'flat-vector',
    photorealismPreset: 'none',
    aspectRatio: '1:1',
    seed: 7138290,
    imageUrl: imgKoiVector,
    authorName: 'ZImage Graphic',
    createdLabel: '15 Nov 2026',
  },
  {
    id: 'cat-poster-kanok',
    category: 'Poster',
    title: 'โปสเตอร์ลายเส้นแกะสลักครุฑและกนก',
    originalPrompt: 'ภาพแกะสลักลายเส้นครีมทองบนพื้นน้ำเงินเข้มเป็นรูปครุฑสยายปีกล้อมด้วยลายกนก',
    enhancedPrompt:
      'Museum exhibition poster artwork rendered in fine copperplate woodcut engraving, warm gold-cream ink on deep Prussian navy paper depicting a majestic Thai Garuda framed by symmetrical Kanok scrollwork, archival printmaking precision.',
    negativePrompt: 'modern neon font, blurry halftone, cropped wings, smudge artifacts',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'fine-art',
    photorealismPreset: 'none',
    aspectRatio: '3:4',
    seed: 8047123,
    imageUrl: imgWoodcut,
    authorName: 'ZImage Print',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-brand-identity',
    category: 'Brand Identity',
    title: 'ตราสัญลักษณ์เรขาคณิตน้ำเงินสเลต',
    originalPrompt: 'โลโก้และระบบอัตลักษณ์แบรนด์เรขาคณิตมินิมอลโทนสีน้ำเงินโคบอลต์บนกระดาษเท็กซ์เจอร์สะอาด',
    enhancedPrompt:
      'Minimalist geometric brand emblem and corporate identity monogram stamped in deep navy and cobalt blue on crisp cotton stationery stock, balanced negative space, Swiss modernist grid symmetry, clean studio presentation.',
    negativePrompt: '3d bevel cliché, glossy gradients, illegible tiny text, cluttered ornament',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'logo',
    photorealismPreset: 'none',
    aspectRatio: '1:1',
    seed: 8839201,
    imageUrl: imgBrandLogo,
    authorName: 'ZImage Identity',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-social-media',
    category: 'Social Media',
    title: 'ชุดภาพแคมเปญสินค้าไลฟ์สไตล์โซเชียล',
    originalPrompt: 'ภาพแคมเปญโซเชียลมีเดียโทนสว่างสะอาดตา จัดวางองค์ประกอบพร้อมพื้นที่พาดหัวโฆษณา',
    enhancedPrompt:
      'Clean commercial social media campaign layout featuring sculptural glass skincare bottle on brushed aluminum plinth, ample clean negative space on upper third for headline typography, crisp softbox reflections, cobalt and off-white aesthetic.',
    negativePrompt: 'garbled ai text, crooked label, messy props, dark muddy shadows',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'photorealistic',
    photorealismPreset: 'commercial-photography',
    aspectRatio: '4:3',
    seed: 9120483,
    imageUrl: imgSocialCampaign,
    authorName: 'ZImage Campaign',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-anime-guardian',
    category: 'Anime',
    title: 'ผู้พิทักษ์อนิเมะท่ามกลางพายุคลื่นน้ำเงิน',
    originalPrompt: 'ตัวละครผู้พิทักษ์สไตล์อนิเมะคุณภาพภาพยนตร์ ยืนกลางคลื่นพายุสีน้ำเงินครามและแสงขอบสีฟ้าใส',
    enhancedPrompt:
      'Theatrical feature-film anime key visual of a heroic guardian standing atop swirling cobalt storm waves, crisp hand-drawn cel linework, dramatic sapphire rim light, billowing cloak dynamics, clean Makoto-inspired sky depth.',
    negativePrompt: 'chibi, deformed face, stiff pose, muddy compression, watermark',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'anime',
    photorealismPreset: 'none',
    aspectRatio: '16:9',
    seed: 9482710,
    imageUrl: imgAnimeGuardian,
    authorName: 'ZImage Anime',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-fantasy-naga',
    category: 'Fantasy',
    title: 'พญานาคราชเกศทองท่ามกลางเมฆา',
    originalPrompt: 'พญานาคสีทองเกศวิจิตรเลื้อยกลางหมู่เมฆสีน้ำเงินครามยามค่ำคืนสไตล์จิตรกรรมไทย',
    enhancedPrompt:
      'Mythological fantasy mural artwork of a radiant golden Naga serpent with ornate crest soaring amidst deep indigo storm clouds, classical Ramakien brushwork infused with dramatic volumetric rim lighting, royal cobalt and antique gold.',
    negativePrompt: 'western cartoon dragon, plastic scales, flat lighting, low detail',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'fine-art',
    photorealismPreset: 'none',
    aspectRatio: '1:1',
    seed: 9721045,
    imageUrl: imgMythicalNaga,
    authorName: 'ZImage Fine Art',
    createdLabel: '16 Nov 2026',
  },
  {
    id: 'cat-cinematography-teahouse',
    category: 'Cinematography',
    title: 'เรือนชาไม้ในตรอกหลังฝนตกอนามอร์ฟิก',
    originalPrompt: 'ร้านน้ำชาไม้ญี่ปุ่นโบราณในตรอกหินแคบๆ หลังฝนตกตอนพลบค่ำ มีโคมไฟอบอุ่นและแสงสะท้อนพื้นเปียก',
    enhancedPrompt:
      'Anamorphic 50mm T2.0 motion picture frame of a quiet wooden tea house in a narrow stone alley after twilight rain, warm practical paper lanterns reflecting over wet cobblestones against cool slate-blue shadows, subtle film grain.',
    negativePrompt: 'daylight noon, saturated neon pink, wide selfie distortion, cartoon',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'photorealistic',
    photorealismPreset: 'cinematic-portrait',
    aspectRatio: '3:4',
    seed: 9812390,
    imageUrl: imgTokyoTeahouse,
    authorName: 'ZImage Cinema',
    createdLabel: '15 Nov 2026',
  },
  {
    id: 'cat-illustration-kanok',
    category: 'Illustration',
    title: 'วิจิตรศิลป์กนกไทยและสถาปัตยกรรมริมน้ำ',
    originalPrompt: 'ภาพวาดวิจิตรลายกนกไทยสีทองอ่อนช้อยประดับวัดริมแม่น้ำยามพลบค่ำโทนน้ำเงินหลวง',
    enhancedPrompt:
      'Fine illustration blending intricate gold-leaf Thai Kanok floral motifs and glowing lotus blossoms with riverside temple silhouettes at twilight, deep royal navy atmosphere, layered gouache and metallic ink detailing.',
    negativePrompt: 'sloppy symmetry, muddy gray, neon purple, distorted spire',
    model: 'recraft/recraft-v4.1-flash-v2:free',
    stylePreset: 'fine-art',
    photorealismPreset: 'none',
    aspectRatio: '4:3',
    seed: 9945102,
    imageUrl: imgKanokGold,
    authorName: 'ZImage Illustration',
    createdLabel: '16 Nov 2026',
  },
];

// Keep Temple Dusk reachable as an additional featured asset reference
export const HERO_FEATURED_TEMPLE = imgTempleDusk;
