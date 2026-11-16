export interface KanokFrameAsset {
  id: string;
  name: string;
  category: 'kanok' | 'lanna' | 'classic';
  buildSvg: (color: string, width: number, height: number) => string;
}

export interface KanokStickerAsset {
  id: string;
  name: string;
  defaultWidth: number;
  defaultHeight: number;
  buildSvg: (color: string) => string;
}

function cornerMotifPath(): string {
  return 'M 14 78 C 14 40 24 22 48 18 C 36 32 32 48 34 62 C 42 42 56 26 84 18 C 62 32 54 46 52 58 C 66 44 82 36 106 34 C 82 44 66 56 58 72 C 44 74 28 76 14 78 Z';
}

export const KANOK_FRAME_ASSETS: KanokFrameAsset[] = [
  {
    id: 'kanok-royal-double',
    name: 'กรอบลายกนกคู่ (รัตนโกสินทร์)',
    category: 'kanok',
    buildSvg: (c, w, h) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
        <rect x="18" y="18" width="${w - 36}" height="${h - 36}" stroke="${c}" stroke-width="5" rx="6"/>
        <rect x="30" y="30" width="${w - 60}" height="${h - 60}" stroke="${c}" stroke-width="2" stroke-dasharray="10 5" rx="4"/>
        <g fill="${c}" opacity="0.95">
          <path d="${cornerMotifPath()}"/>
          <path d="${cornerMotifPath()}" transform="translate(${w}, 0) scale(-1, 1)"/>
          <path d="${cornerMotifPath()}" transform="translate(0, ${h}) scale(1, -1)"/>
          <path d="${cornerMotifPath()}" transform="translate(${w}, ${h}) scale(-1, -1)"/>
        </g>
      </svg>`,
  },
  {
    id: 'kanok-peacock-arch',
    name: 'กรอบซุ้มเรือนแก้วล้านนา',
    category: 'lanna',
    buildSvg: (c, w, h) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
        <path d="M 28 ${h - 28} L 28 110 Q 28 32 ${w / 2} 22 Q ${w - 28} 32 ${w - 28} 110 L ${w - 28} ${h - 28} Z" stroke="${c}" stroke-width="5"/>
        <path d="M 42 ${h - 42} L 42 118 Q 42 46 ${w / 2} 36 Q ${w - 42} 46 ${w - 42} 118 L ${w - 42} ${h - 42} Z" stroke="${c}" stroke-width="2"/>
        <path d="M ${w / 2 - 42} 36 Q ${w / 2} 4 ${w / 2 + 42} 36 Q ${w / 2} 54 ${w / 2 - 42} 36 Z" fill="${c}"/>
        <circle cx="${w / 2}" cy="24" r="5" fill="#12449E"/>
      </svg>`,
  },
  {
    id: 'kanok-flame-corners',
    name: 'กรอบกนกเปลวเพลิงสี่ทิศ',
    category: 'kanok',
    buildSvg: (c, w, h) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
        <rect x="22" y="22" width="${w - 44}" height="${h - 44}" stroke="${c}" stroke-width="4"/>
        <g stroke="${c}" stroke-width="3" fill="${c}" fill-opacity="0.22">
          <path d="M 22 140 Q 45 75 95 45 Q 70 85 52 105 Q 92 75 140 22 L 22 22 Z"/>
          <path d="M ${w - 22} 140 Q ${w - 45} 75 ${w - 95} 45 Q ${w - 70} 85 ${w - 52} 105 Q ${w - 92} 75 ${w - 140} 22 L ${w - 22} 22 Z"/>
          <path d="M 22 ${h - 140} Q 45 ${h - 75} 95 ${h - 45} Q 70 ${h - 85} 52 ${h - 105} Q 92 ${h - 75} 140 ${h - 22} L 22 ${h - 22} Z"/>
          <path d="M ${w - 22} ${h - 140} Q ${w - 45} ${h - 75} ${w - 95} ${h - 45} Q ${w - 70} ${h - 85} ${w - 52} ${h - 105} Q ${w - 92} ${h - 75} ${w - 140} ${h - 22} L ${w - 22} ${h - 22} Z"/>
        </g>
      </svg>`,
  },
  {
    id: 'kanok-diamond-lattice',
    name: 'กรอบประจำยามประดับเพชร',
    category: 'classic',
    buildSvg: (c, w, h) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
        <rect x="16" y="16" width="${w - 32}" height="${h - 32}" stroke="${c}" stroke-width="3"/>
        <rect x="28" y="28" width="${w - 56}" height="${h - 56}" stroke="${c}" stroke-width="3"/>
        ${[
          [w / 2, 22],
          [w / 2, h - 22],
          [22, h / 2],
          [w - 22, h / 2],
        ]
          .map(
            ([cx, cy]) =>
              `<polygon points="${cx},${cy - 14} ${cx + 14},${cy} ${cx},${cy + 14} ${cx - 14},${cy}" fill="${c}"/>`
          )
          .join('')}
      </svg>`,
  },
  {
    id: 'lanna-lotus-border',
    name: 'กรอบกลีบบัวล้านนาวิจิตร',
    category: 'lanna',
    buildSvg: (c, w, h) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
        <rect x="24" y="24" width="${w - 48}" height="${h - 48}" stroke="${c}" stroke-width="4" rx="22"/>
        <rect x="38" y="38" width="${w - 76}" height="${h - 76}" stroke="${c}" stroke-width="1.5" rx="16"/>
        <path d="M ${w / 2 - 48} 24 Q ${w / 2} 58 ${w / 2 + 48} 24" stroke="${c}" stroke-width="4" fill="none"/>
        <path d="M ${w / 2 - 48} ${h - 24} Q ${w / 2} ${h - 58} ${w / 2 + 48} ${h - 24}" stroke="${c}" stroke-width="4" fill="none"/>
        <circle cx="40" cy="40" r="8" fill="${c}"/>
        <circle cx="${w - 40}" cy="40" r="8" fill="${c}"/>
        <circle cx="40" cy="${h - 40}" r="8" fill="${c}"/>
        <circle cx="${w - 40}" cy="${h - 40}" r="8" fill="${c}"/>
      </svg>`,
  },
  {
    id: 'kanok-engraved-stamp',
    name: 'กรอบแสตมป์ลายไทยโบราณ',
    category: 'classic',
    buildSvg: (c, w, h) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
        <rect x="18" y="18" width="${w - 36}" height="${h - 36}" stroke="${c}" stroke-width="6" stroke-dasharray="16 8"/>
        <rect x="34" y="34" width="${w - 68}" height="${h - 68}" stroke="${c}" stroke-width="2.5"/>
        <path d="M 34 64 L 64 34 M ${w - 64} 34 L ${w - 34} 64 M 34 ${h - 64} L 64 ${h - 34} M ${w - 64} ${h - 34} L ${w - 34} ${h - 64}" stroke="${c}" stroke-width="3"/>
      </svg>`,
  },
  {
    id: 'kanok-dokloi-crown',
    name: 'กรอบลายดอกลอยประดับยอด',
    category: 'kanok',
    buildSvg: (c, w, h) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
        <rect x="26" y="34" width="${w - 52}" height="${h - 60}" stroke="${c}" stroke-width="3.5" rx="12"/>
        <path d="M ${w / 2 - 64} 34 C ${w / 2 - 36} 6 ${w / 2 + 36} 6 ${w / 2 + 64} 34 Z" fill="${c}"/>
        <path d="M ${w / 2 - 64} ${h - 26} C ${w / 2 - 36} ${h - 2} ${w / 2 + 36} ${h - 2} ${w / 2 + 64} ${h - 26} Z" fill="${c}"/>
        <circle cx="${w / 2}" cy="18" r="4" fill="#0B1F4D"/>
      </svg>`,
  },
  {
    id: 'kanok-minimal-gold-line',
    name: 'กรอบเส้นทองเรียบหรูมินิมอล',
    category: 'classic',
    buildSvg: (c, w, h) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
        <rect x="20" y="20" width="${w - 40}" height="${h - 40}" stroke="${c}" stroke-width="2.5"/>
        <path d="M 20 72 L 20 20 L 72 20 M ${w - 72} 20 L ${w - 20} 20 L ${w - 20} 72 M 20 ${h - 72} L 20 ${h - 20} L 72 ${h - 20} M ${w - 72} ${h - 20} L ${w - 20} ${h - 20} L ${w - 20} ${h - 72}" stroke="${c}" stroke-width="7"/>
      </svg>`,
  },
];

export const KANOK_STICKER_ASSETS: KanokStickerAsset[] = [
  {
    id: 'sticker-kanok-flame',
    name: 'ลายกนกเปลวเดี่ยว',
    defaultWidth: 220,
    defaultHeight: 220,
    buildSvg: (c) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 120 120" fill="none">
        <path d="M 32 104 C 24 76 34 48 64 16 C 58 44 64 58 78 66 C 68 42 74 28 96 20 C 88 46 92 64 102 74 C 86 78 76 86 72 100 C 58 96 44 98 32 104 Z" fill="${c}" stroke="#091B42" stroke-width="2.5"/>
        <path d="M 46 94 C 46 72 54 54 66 40" stroke="#091B42" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
  },
  {
    id: 'sticker-dok-prajamyam',
    name: 'ดอกประจำยามสี่ทิศ',
    defaultWidth: 200,
    defaultHeight: 200,
    buildSvg: (c) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 120 120" fill="none">
        <path d="M 60 10 L 76 44 L 110 60 L 76 76 L 60 110 L 44 76 L 10 60 L 44 44 Z" fill="${c}" stroke="#091B42" stroke-width="3"/>
        <circle cx="60" cy="60" r="14" fill="#091B42" stroke="${c}" stroke-width="3"/>
        <circle cx="60" cy="60" r="5" fill="${c}"/>
      </svg>`,
  },
  {
    id: 'sticker-dok-loi',
    name: 'ลายดอกลอยมงคล',
    defaultWidth: 200,
    defaultHeight: 200,
    buildSvg: (c) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 120 120" fill="none">
        ${[0, 45, 90, 135, 180, 225, 270, 315]
          .map(
            (deg) =>
              `<path d="M 60 60 Q 72 28 60 12 Q 48 28 60 60 Z" fill="${c}" stroke="#091B42" stroke-width="2" transform="rotate(${deg} 60 60)"/>`
          )
          .join('')}
        <circle cx="60" cy="60" r="13" fill="#091B42" stroke="${c}" stroke-width="3"/>
      </svg>`,
  },
  {
    id: 'sticker-chada-crown',
    name: 'ยอดชฎาทอง',
    defaultWidth: 180,
    defaultHeight: 240,
    buildSvg: (c) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="180" height="240" viewBox="0 0 120 160" fill="none">
        <path d="M 60 8 L 68 48 L 84 68 L 94 118 L 26 118 L 36 68 L 52 48 Z" fill="${c}" stroke="#091B42" stroke-width="3"/>
        <rect x="22" y="118" width="76" height="16" rx="4" fill="${c}" stroke="#091B42" stroke-width="3"/>
        <path d="M 38 96 L 82 96 M 44 76 L 76 76" stroke="#091B42" stroke-width="2.5"/>
      </svg>`,
  },
  {
    id: 'sticker-thai-lotus',
    name: 'ดอกบัวไทย',
    defaultWidth: 220,
    defaultHeight: 180,
    buildSvg: (c) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="220" height="180" viewBox="0 0 140 110" fill="none">
        <path d="M 70 14 Q 94 46 70 86 Q 46 46 70 14 Z" fill="${c}" stroke="#091B42" stroke-width="2.5"/>
        <path d="M 70 86 Q 108 62 114 32 Q 86 44 70 86 Z" fill="${c}" stroke="#091B42" stroke-width="2.5"/>
        <path d="M 70 86 Q 32 62 26 32 Q 54 44 70 86 Z" fill="${c}" stroke="#091B42" stroke-width="2.5"/>
        <path d="M 18 92 Q 70 104 122 92" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
      </svg>`,
  },
  {
    id: 'sticker-corner-vine',
    name: 'กนกเถาวัลย์เข้ามุม',
    defaultWidth: 220,
    defaultHeight: 220,
    buildSvg: (c) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 120 120" fill="none">
        <path d="${cornerMotifPath()}" fill="${c}" stroke="#091B42" stroke-width="2.5"/>
      </svg>`,
  },
  {
    id: 'sticker-trident',
    name: 'ตรีศูลหนุมาน',
    defaultWidth: 160,
    defaultHeight: 240,
    buildSvg: (c) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="160" height="240" viewBox="0 0 100 160" fill="none">
        <path d="M 50 12 L 50 148" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
        <path d="M 50 10 L 58 34 L 42 34 Z" fill="${c}"/>
        <path d="M 24 28 C 20 56 34 72 50 72 C 66 72 80 56 76 28 C 68 48 60 56 50 56 C 40 56 32 48 24 28 Z" fill="${c}" stroke="#091B42" stroke-width="2"/>
      </svg>`,
  },
  {
    id: 'sticker-seal-thai',
    name: 'ตราประทับZImage',
    defaultWidth: 190,
    defaultHeight: 190,
    buildSvg: (c) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="190" height="190" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="48" stroke="${c}" stroke-width="4" stroke-dasharray="8 4"/>
        <circle cx="60" cy="60" r="39" stroke="${c}" stroke-width="2"/>
        <text x="60" y="66" text-anchor="middle" font-family="Prompt, sans-serif" font-weight="700" font-size="22" fill="${c}">ZIMAGE</text>
      </svg>`,
  },
];

const svgImageCache = new Map<string, HTMLImageElement>();

export function svgStringToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function loadSvgAssetImage(svg: string): Promise<HTMLImageElement> {
  const key = svg;
  const cached = svgImageCache.get(key);
  if (cached && cached.complete) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      svgImageCache.set(key, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('ไม่สามารถโหลดลายเส้น SVG ได้'));
    img.src = svgStringToDataUrl(svg);
  });
}
