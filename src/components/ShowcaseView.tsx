import { Maximize2, PenLine, Sliders } from 'lucide-react';
import { CURATED_SHOWCASE_ITEMS } from '../data/showcasePresets';
import type { VaultImageRecord } from '../lib/firebase';
import type { LightboxImageData } from './LightboxModal';

interface ShowcaseViewProps {
  featuredImages: VaultImageRecord[];
  onOpenLightbox: (item: LightboxImageData) => void;
  onOpenInEditor: (item: LightboxImageData) => void;
  onContinuePrompt: (item: LightboxImageData) => void;
  onGoToStudio: () => void;
}

export function ShowcaseView({
  featuredImages,
  onOpenLightbox,
  onOpenInEditor,
  onContinuePrompt,
  onGoToStudio,
}: ShowcaseViewProps) {
  const combinedItems: LightboxImageData[] = [
    ...featuredImages.map((img) => ({
      id: img.id,
      imageUrl: img.imageDataUrl,
      originalPrompt: img.originalPrompt,
      enhancedPrompt: img.enhancedPrompt,
      stylePreset: img.stylePreset,
      aspectRatio: img.aspectRatio,
      authorName: img.ownerName,
      modelName: img.model,
      itemType: img.itemType,
      sourceImageId: img.sourceImageId,
      projectJson: img.projectJson,
      dateLabel: img.createdAt?.toDate
        ? img.createdAt.toDate().toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'ล่าสุด',
    })),
    ...CURATED_SHOWCASE_ITEMS.map((item) => ({
      id: item.id,
      title: item.title,
      imageUrl: item.imageUrl,
      originalPrompt: item.originalPrompt,
      enhancedPrompt: item.enhancedPrompt,
      stylePreset: item.stylePreset,
      aspectRatio: item.aspectRatio,
      authorName: item.authorName,
      dateLabel: item.createdLabel,
    })),
  ];

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 lg:py-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E2E8F0] dark:border-slate-800 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
            แกลเลอรีผลงานสร้างสรรค์ ZImage
          </h1>
          <p className="mt-1 text-sm text-[#64748B] dark:text-slate-400">
            รวมผลงานแนะนำจากสมาชิกและตัวอย่างงานศิลปะพร้อมใช้งาน ส่งเข้าสตูดิโอแต่งภาพหรือสร้างต่อได้ทันที
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToStudio}
          className="min-h-[42px] rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer whitespace-nowrap shadow-sm"
        >
          สร้างภาพของคุณเอง
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {combinedItems.map((item) => (
          <article
            key={item.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] shadow-sm"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F7F9FC] dark:bg-[#0B1F3A]">
              <img
                src={item.imageUrl}
                alt={item.title || item.originalPrompt}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onOpenLightbox(item)}
                aria-label={`ขยายดูภาพ ${item.title || item.originalPrompt}`}
                className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] dark:border-slate-700 bg-white/90 dark:bg-[#101820]/90 text-[#101820] dark:text-[#F8FAFC] hover:bg-[#2563EB] hover:text-white transition-colors cursor-pointer"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col justify-between p-4 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-slate-400 font-mono-tabular">
                  <span>{item.aspectRatio}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.stylePreset}</span>
                  {item.authorName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{item.authorName}</span>
                    </>
                  )}
                </div>
                <h2 className="line-clamp-2 font-serif-thai text-sm font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  {item.title || item.originalPrompt}
                </h2>
                <p className="line-clamp-2 text-xs text-[#64748B] dark:text-slate-400">{item.enhancedPrompt}</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => onOpenLightbox(item)}
                  className="text-xs font-medium text-[#64748B] dark:text-slate-400 hover:text-[#2563EB] dark:hover:text-[#60A5FA] cursor-pointer"
                >
                  ดูพรอมต์
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenInEditor(item)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <Sliders className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                    <span>แต่งภาพนี้</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onContinuePrompt(item)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    <span>สร้างต่อ</span>
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
