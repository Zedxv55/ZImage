import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Layers,
  LogIn,
  Moon,
  PenLine,
  Scissors,
  Sparkles,
  Sun,
  Wand2,
  X,
} from 'lucide-react';
import {
  CURATED_SHOWCASE_ITEMS,
  SHOWCASE_CATEGORIES,
} from '../data/showcasePresets';
import type { ShowcaseCategoryId, ShowcaseItem } from '../data/showcasePresets';
import { HanumanEmblemCanvas } from './HanumanEmblemCanvas';
import type { LightboxImageData } from './LightboxModal';

interface LandingViewProps {
  onSignIn: () => void;
  authBusy: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onEnterGuestWorkspace: (tab?: 'studio' | 'decompose' | 'editor' | 'video' | 'tools') => void;
  onUseShowcasePrompt: (item: ShowcaseItem, openAdvanced?: boolean, styleOnly?: boolean) => void;
  onOpenInEditorFromLanding: (item: ShowcaseItem) => void;
  onOpenShowcasePreview: (item: LightboxImageData) => void;
}

const CAPABILITIES = [
  {
    num: '01',
    title: 'AI Image Studio (Unlimited Prompt)',
    desc: 'รองรับคำอธิบายไม่จำกัดความยาว โหมด Simple ถึง Unlimited 9 ช่อง พร้อมพรีเซ็ตบุคคลสมจริง 8 สไตล์และ Seed คุมงานต่อเนื่อง',
    icon: Sparkles,
    tab: 'studio' as const,
  },
  {
    num: '02',
    title: 'AI Image to Editable Layers',
    desc: 'วิเคราะห์ภาพด้วย Vision AI ตรวจจับข้อความและวัตถุ แยกพื้นหลัง ลบฉากหลัง ซ่อมพื้นหลังอัตโนมัติ และส่งต่อเป็นเลเยอร์ PSD',
    icon: Scissors,
    tab: 'decompose' as const,
  },
  {
    num: '03',
    title: 'Pro Graphic & PSD Editor',
    desc: 'แก้ไขข้อความ รูปทรง เวกเตอร์ กลุ่มเลเยอร์ ล็อก สแนปไกด์ กรอบกนกไทย และนำเข้า/ส่งออกไฟล์ .psd ได้จริงบนเบราว์เซอร์',
    icon: Layers,
    tab: 'editor' as const,
  },
  {
    num: '04',
    title: 'Multi-Track Video Timeline',
    desc: 'ตัดต่อวิดีโอหลายแทร็ก วิดีโอ ภาพ ข้อความ เสียง MP3/WAV พร้อมกราฟคลื่นเสียง Keyframe คัลเลอร์เกรด และส่งออก WebM/MP4',
    icon: Clapperboard,
    tab: 'video' as const,
  },
];

const PROMPT_LESSONS = [
  {
    step: '01. Subject & Specific Details',
    thTitle: 'ระบุตัวแบบให้ชัด (Subject)',
    enExample: 'Editorial portrait of a Thai ceramist in indigo linen apron, hands shaping wet clay',
    tip: 'ระบุอายุ บุคลิก ท่าทาง สีหน้า เนื้อผ้า และจำนวนวัตถุให้ชัดเจนเพื่อลดอาการ AI เดา',
  },
  {
    step: '02. Camera, Lens & Lighting',
    thTitle: 'กำหนดเลนส์และทิศทางแสง (Camera & Light)',
    enExample: '85mm f/1.8 prime lens, soft north window key light, subtle rim highlight on hair',
    tip: 'การใส่ระยะเลนส์ (35mm, 85mm, 105mm macro) และแหล่งแสงจริงทำให้ภาพมีมิติแบบกล้องจริง',
  },
  {
    step: '03. Negative Prompt Guardrails',
    thTitle: 'กันสิ่งที่ไม่ต้องการ (Negative Prompt)',
    enExample: 'plastic skin, airbrushed face, watermark, distorted hands, oversaturated neon',
    tip: 'คัดกรองความผิดเพี้ยนของผิวและองค์ประกอบส่วนเกิน ช่วยให้ภาพบุคคลดูเป็นธรรมชาติ',
  },
];

export function LandingView({
  onSignIn,
  authBusy,
  theme,
  onToggleTheme,
  onEnterGuestWorkspace,
  onUseShowcasePrompt,
  onOpenInEditorFromLanding,
  onOpenShowcasePreview,
}: LandingViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ShowcaseCategoryId>('ALL');
  const [legalDialog, setLegalDialog] = useState<'terms' | 'privacy' | null>(null);

  const visibleShowcase =
    selectedCategory === 'ALL'
      ? CURATED_SHOWCASE_ITEMS
      : CURATED_SHOWCASE_ITEMS.filter((item) => item.category === selectedCategory);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1F3A] text-[#101820] dark:text-[#F8FAFC] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] dark:border-slate-800 bg-white/95 dark:bg-[#0B1F3A]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC] whitespace-nowrap shrink-0"
          >
            ZImage
          </a>

          {/* Zone 2: 4 Single-Line Nav Links */}
          <nav
            aria-label="เมนูหน้าแรก"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#475569] dark:text-slate-300"
          >
            <a
              href="#capabilities"
              className="hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#showcase-gallery"
              className="hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors whitespace-nowrap shrink-0"
            >
              Showcase
            </a>
            <a
              href="#prompt-guide"
              className="hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors whitespace-nowrap shrink-0"
            >
              Prompt Guide
            </a>
            <button
              type="button"
              onClick={() => onEnterGuestWorkspace('studio')}
              className="hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Studio
            </button>
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              disabled={authBusy}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{authBusy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google'}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Section */}
        <section className="border-b border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-4 py-12 sm:px-6 lg:py-16">
          <div className="mx-auto max-w-[1240px] grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B] dark:text-slate-300">
                <span>All-in-One AI Creative Studio</span>
                <span aria-hidden="true">·</span>
                <span>72h Free Trial</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="inline-flex items-center gap-1.5 font-medium text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer whitespace-nowrap"
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="h-3.5 w-3.5" />
                      <span>โหมดสว่าง</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-3.5 w-3.5" />
                      <span>โหมดมืด</span>
                    </>
                  )}
                </button>
              </div>

              <h1
                className="font-display font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC] text-balance leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4.2vw, 3.75rem)' }}
              >
                Create Beyond Imagination.
              </h1>

              <p className="text-base sm:text-lg leading-relaxed text-[#475569] dark:text-slate-300 max-w-2xl">
                แพลตฟอร์มสร้างสรรค์ภาพและวิดีโอครบวงจร รวม AI สร้างภาพพรอมต์ไม่จำกัดความยาว
                ระบบแยกภาพเป็นเลเยอร์ PSD ที่แก้ไขได้จริง สตูดิโอกราฟิก และไทม์ไลน์ตัดต่อวิดีโอหลายแทร็กในที่เดียว
              </p>

              {/* 3 Clear CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={authBusy}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  <LogIn className="h-4 w-4" />
                  <span>{authBusy ? 'กำลังเข้าสู่ระบบ...' : 'เริ่มใช้งานฟรีด้วย Google'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onEnterGuestWorkspace('studio')}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-5 py-3 text-sm font-medium text-[#101820] dark:text-[#F8FAFC] hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
                  <span>ทดลองสร้างภาพ AI</span>
                </button>

                <button
                  type="button"
                  onClick={() => onEnterGuestWorkspace('decompose')}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-5 py-3 text-sm font-medium text-[#475569] dark:text-slate-300 hover:border-[#2563EB] hover:text-[#101820] dark:hover:text-white cursor-pointer whitespace-nowrap"
                >
                  <Scissors className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
                  <span>แยกเลเยอร์ &amp; Editor</span>
                </button>
              </div>
            </div>

            <HanumanEmblemCanvas theme={theme} />
          </div>
        </section>

        {/* Capabilities Strip */}
        <section
          id="capabilities"
          className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 space-y-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
              เครื่องมือสร้างสรรค์ 4 ระบบหลักในแพลตฟอร์มเดียว
            </h2>
            <span className="text-xs text-[#64748B] dark:text-slate-400">
              ทำงานบนเบราว์เซอร์และเชื่อมต่อ Firebase / OpenRouter
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.num}
                  className="flex flex-col justify-between rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#101820] p-5 space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono-tabular text-[#64748B] dark:text-slate-400">
                      <span>{cap.num}</span>
                      <Icon className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
                    </div>
                    <h3 className="font-display text-base font-semibold text-[#101820] dark:text-[#F8FAFC]">
                      {cap.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-[#475569] dark:text-slate-300">
                      {cap.desc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEnterGuestWorkspace(cap.tab)}
                    className="inline-flex min-h-[38px] items-center justify-between rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#0B1F3A] px-3 py-1.5 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                  >
                    <span>เปิดเครื่องมือ</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div className="studio-hairline-divider mx-auto max-w-[1240px]" />

        {/* 14-Category AI Showcase Gallery */}
        <section
          id="showcase-gallery"
          className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 space-y-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
                14 หมวดหมู่ตัวอย่างผลงาน AI Showcase
              </h2>
              <p className="text-sm text-[#475569] dark:text-slate-300">
                ดูพรอมต์จริง พารามิเตอร์ และนำไปใช้สร้างต่อ แก้ไข หรือเปิดแต่งใน Editor ได้ทันที
              </p>
            </div>
            <span className="font-mono-tabular text-xs text-[#64748B] dark:text-slate-400">
              แสดง {visibleShowcase.length} / {CURATED_SHOWCASE_ITEMS.length} ผลงาน
            </span>
          </div>

          {/* Interactive Category Filter Bar */}
          <div
            role="tablist"
            aria-label="ตัวกรองหมวดหมู่ Showcase 14 หมวด"
            className="flex flex-wrap gap-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'ALL'}
              onClick={() => setSelectedCategory('ALL')}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                selectedCategory === 'ALL'
                  ? 'bg-[#2563EB] text-white'
                  : 'border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] text-[#475569] dark:text-slate-300 hover:border-[#2563EB]'
              }`}
            >
              ทั้งหมด (14)
            </button>
            {SHOWCASE_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#2563EB] text-white'
                      : 'border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#101820] text-[#475569] dark:text-slate-300 hover:border-[#2563EB]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Gallery Cards */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleShowcase.map((item) => (
              <article
                key={item.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820]"
              >
                <button
                  type="button"
                  onClick={() =>
                    onOpenShowcasePreview({
                      id: item.id,
                      title: item.title,
                      imageUrl: item.imageUrl,
                      originalPrompt: item.originalPrompt,
                      enhancedPrompt: item.enhancedPrompt,
                      stylePreset: item.stylePreset,
                      aspectRatio: item.aspectRatio,
                      authorName: item.authorName,
                      dateLabel: item.createdLabel,
                    })
                  }
                  aria-label={`เปิดดูภาพเต็ม ${item.title}`}
                  className="group aspect-[4/3] w-full overflow-hidden bg-[#F7F9FC] dark:bg-[#0B1F3A] cursor-pointer"
                >
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </button>

                <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
                  <div className="space-y-2">
                    {/* Clean unboxed metadata */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
                      <span className="font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                        {item.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.aspectRatio}</span>
                      <span aria-hidden="true">·</span>
                      <span>Seed {item.seed}</span>
                    </div>

                    <h3 className="font-display text-base font-semibold text-[#101820] dark:text-[#F8FAFC]">
                      {item.title}
                    </h3>

                    <p className="text-xs leading-relaxed text-[#475569] dark:text-slate-300 line-clamp-2">
                      <strong className="font-semibold text-[#101820] dark:text-slate-200">
                        Prompt:
                      </strong>{' '}
                      {item.enhancedPrompt}
                    </p>

                    <p className="text-[11px] leading-relaxed text-[#64748B] dark:text-slate-400 line-clamp-1">
                      <strong>Negative:</strong> {item.negativePrompt}
                    </p>

                    <p className="font-mono-tabular text-[11px] text-[#64748B] dark:text-slate-400 truncate">
                      Model: {item.model}
                    </p>
                  </div>

                  {/* 4 Required Interactive Actions */}
                  <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#E2E8F0] dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => onUseShowcasePrompt(item, false, false)}
                      className="min-h-[36px] rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer whitespace-nowrap"
                    >
                      ใช้ Prompt นี้
                    </button>
                    <button
                      type="button"
                      onClick={() => onUseShowcasePrompt(item, true, false)}
                      className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                    >
                      <PenLine className="h-3 w-3" />
                      <span>แก้ไข Prompt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenInEditorFromLanding(item)}
                      className="min-h-[36px] rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs font-medium text-[#101820] dark:text-slate-200 hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                    >
                      เปิดภาพใน Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => onUseShowcasePrompt(item, false, true)}
                      className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:border-[#2563EB] cursor-pointer whitespace-nowrap"
                    >
                      <Wand2 className="h-3 w-3" />
                      <span>สร้างภาพในสไตล์นี้</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="studio-hairline-divider mx-auto max-w-[1240px]" />

        {/* Bilingual Prompt Learning Section */}
        <section
          id="prompt-guide"
          className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 space-y-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                <BookOpen className="h-4 w-4" />
                <span>Prompt Learning · Thai &amp; English</span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
                เรียนรู้โครงสร้างการเขียนพรอมต์ระดับมืออาชีพ
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onUseShowcasePrompt(CURATED_SHOWCASE_ITEMS[0], true, false)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer whitespace-nowrap"
            >
              <span>ทดลองโครงสร้าง 9 ช่องใน Studio</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {PROMPT_LESSONS.map((lesson) => (
              <div
                key={lesson.step}
                className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#101820] p-5 space-y-3"
              >
                <p className="font-mono-tabular text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                  {lesson.step}
                </p>
                <h3 className="font-display text-base font-semibold text-[#101820] dark:text-[#F8FAFC]">
                  {lesson.thTitle}
                </h3>
                <p className="text-xs leading-relaxed text-[#475569] dark:text-slate-300">
                  {lesson.tip}
                </p>
                <p className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#0B1F3A] p-2.5 font-mono-tabular text-[11px] leading-relaxed text-[#101820] dark:text-slate-200">
                  {lesson.enExample}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 text-xs text-[#64748B] dark:text-slate-400">
          <span>ZImage Creative Studio · AI Image, Layers, Graphic Editor &amp; Video</span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setLegalDialog('terms')}
              className="hover:text-[#2563EB] dark:hover:text-[#60A5FA] underline underline-offset-4 cursor-pointer"
            >
              ข้อตกลงการใช้งาน
            </button>
            <button
              type="button"
              onClick={() => setLegalDialog('privacy')}
              className="hover:text-[#2563EB] dark:hover:text-[#60A5FA] underline underline-offset-4 cursor-pointer"
            >
              นโยบายความเป็นส่วนตัว
            </button>
          </div>
        </div>
      </footer>

      {legalDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={legalDialog === 'terms' ? 'ข้อตกลงการใช้งาน' : 'นโยบายความเป็นส่วนตัว'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] p-6 space-y-4 text-[#101820] dark:text-[#F8FAFC] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-slate-800 pb-3">
              <h3 className="font-display text-lg font-semibold">
                {legalDialog === 'terms' ? 'ข้อตกลงการใช้งาน ZImage' : 'นโยบายความเป็นส่วนตัว ZImage'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalDialog(null)}
                aria-label="ปิดหน้าต่าง"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 text-[#475569] dark:text-slate-300 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {legalDialog === 'terms' ? (
              <div className="space-y-2.5 text-xs sm:text-sm leading-relaxed text-[#475569] dark:text-slate-300">
                <p>
                  1. เครื่องมือแต่งภาพหลายเลเยอร์ แยกเลเยอร์ ตัดต่อวิดีโอ และแก้ปัญหาภาพทำงานฝั่งเบราว์เซอร์ได้ฟรีไม่จำกัดครั้ง
                </p>
                <p>
                  2. สมาชิกใหม่ได้รับสิทธิ์ทดลองใช้งาน 72 ชั่วโมง (UTC) และสามารถรับวันโบนัสเพิ่มเติมจากการเชิญเพื่อนตามเงื่อนไขรายเดือน
                </p>
                <p>
                  3. ผู้ใช้ต้องไม่สร้างหรืออัปโหลดเนื้อหาที่ผิดกฎหมาย ละเมิดลิขสิทธิ์ หรือละเมิดสิทธิส่วนบุคคลของผู้อื่น
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs sm:text-sm leading-relaxed text-[#475569] dark:text-slate-300">
                <p>
                  1. การเข้าสู่ระบบด้วย Google ใช้ยืนยันตัวตนเพื่อจัดเก็บผลงาน พรอมต์ และโปรเจกต์สตูดิโอบนฐานข้อมูล Firebase อย่างปลอดภัย
                </p>
                <p>
                  2. คีย์ API ของผู้ให้บริการ AI ถูกเก็บรักษาบนเซิร์ฟเวอร์เท่านั้น ไม่ส่งออกสู่ฝั่งเบราว์เซอร์
                </p>
                <p>3. คุณสามารถจัดการหรือลบภาพ อัลบั้ม พรอมต์ และโปรเจกต์ในคลังส่วนตัวได้ทุกเมื่อ</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
