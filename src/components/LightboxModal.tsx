import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  GitBranch,
  PenLine,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { STYLE_PRESETS } from '../utils/promptLogic';
import type { AspectRatioId, StylePresetId, VaultItemType } from '../utils/promptLogic';
import { downloadUrlAsPng } from '../utils/canvasImageHelper';
import type { VaultImageRecord } from '../lib/firebase';

export interface LightboxImageData {
  id: string;
  title?: string;
  imageUrl: string;
  originalPrompt: string;
  enhancedPrompt: string;
  stylePreset: StylePresetId;
  aspectRatio: AspectRatioId;
  authorName?: string;
  authorEmail?: string;
  modelName?: string;
  dateLabel?: string;
  itemType?: VaultItemType;
  sourceImageId?: string;
  projectJson?: string;
  albumId?: string;
}

interface LightboxModalProps {
  item: LightboxImageData | null;
  vaultImages?: VaultImageRecord[];
  onSelectVaultRecord?: (record: VaultImageRecord) => void;
  onClose: () => void;
  onContinuePrompt: (item: LightboxImageData) => void;
  onOpenInEditor?: (item: LightboxImageData) => void;
}

const TYPE_LABEL_MAP: Record<VaultItemType, string> = {
  generated: 'ภาพเจน',
  edited: 'ผลงานแต่ง',
  animation: 'ภาพเคลื่อนไหว',
};

export function LightboxModal({
  item,
  vaultImages = [],
  onSelectVaultRecord,
  onClose,
  onContinuePrompt,
  onOpenInEditor,
}: LightboxModalProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!item) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [item, onClose]);

  const parentRecord = useMemo(() => {
    if (!item?.sourceImageId) return null;
    return vaultImages.find((v) => v.id === item.sourceImageId) || null;
  }, [item?.sourceImageId, vaultImages]);

  const derivedRecords = useMemo(() => {
    if (!item?.id) return [];
    return vaultImages.filter((v) => v.sourceImageId === item.id);
  }, [item?.id, vaultImages]);

  if (!item) return null;

  const styleMeta = STYLE_PRESETS.find((s) => s.id === item.stylePreset);
  const styleLabel = styleMeta ? `${styleMeta.labelTh} (${styleMeta.labelEn})` : item.stylePreset;
  const itemTypeLabel = item.itemType ? TYPE_LABEL_MAP[item.itemType] : 'ภาพเจน';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.enhancedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleDownloadPng = async () => {
    setDownloading(true);
    try {
      await downloadUrlAsPng(item.imageUrl, `zimage-${item.id}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="รายละเอียดภาพที่สร้าง"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 sm:p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative grid w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] text-[#101820] dark:text-[#F8FAFC] shadow-2xl lg:grid-cols-[1.35fr_1fr]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดหน้าต่างดูภาพ"
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] dark:border-slate-700 bg-white/95 dark:bg-[#0B1F3A]/95 text-[#101820] dark:text-[#F8FAFC] hover:bg-[#2563EB] hover:text-white transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Image Stage with checkerboard for transparent PNGs */}
        <div className="checkerboard-stage flex items-center justify-center p-4 sm:p-6 max-h-[48vh] lg:max-h-[90vh]">
          <img
            src={item.imageUrl}
            alt={item.originalPrompt}
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
          />
        </div>

        {/* Metadata & Actions */}
        <div className="flex flex-col justify-between overflow-y-auto p-6 bg-white dark:bg-[#101820] border-t lg:border-t-0 lg:border-l border-[#E2E8F0] dark:border-slate-800">
          <div className="space-y-5 pr-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-slate-400 font-mono-tabular">
                <span className="font-semibold text-[#2563EB] dark:text-[#60A5FA]">{itemTypeLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{item.aspectRatio}</span>
                <span aria-hidden="true">·</span>
                <span>{styleLabel}</span>
                {item.authorName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{item.authorName}</span>
                  </>
                )}
                {item.authorEmail && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{item.authorEmail}</span>
                  </>
                )}
                {item.dateLabel && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{item.dateLabel}</span>
                  </>
                )}
              </div>
              <h2 className="mt-2 font-display text-lg font-semibold text-[#101820] dark:text-[#F8FAFC]">
                {item.title || item.originalPrompt}
              </h2>
              {item.modelName && (
                <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400 font-mono-tabular">
                  Model: {item.modelName}
                </p>
              )}
            </div>

            <div className="border-t border-[#E2E8F0] dark:border-slate-800 pt-4">
              <p className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">คำอธิบายต้นฉบับ</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#101820] dark:text-slate-200">
                {item.originalPrompt}
              </p>
            </div>

            <div className="border-t border-[#E2E8F0] dark:border-slate-800 pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                  พรอมต์ภาษาอังกฤษ (Prompt Expert)
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer whitespace-nowrap"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกพรอมต์'}</span>
                </button>
              </div>
              <p className="mt-2 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3.5 text-xs leading-relaxed text-[#64748B] dark:text-slate-300">
                {item.enhancedPrompt}
              </p>
            </div>

            {/* Version Lineage Tracking */}
            {(parentRecord || derivedRecords.length > 0) && (
              <div className="border-t border-[#E2E8F0] dark:border-slate-800 pt-4 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                  <GitBranch className="h-3.5 w-3.5" />
                  <span>สายสัมพันธ์เวอร์ชันผลงาน (Lineage)</span>
                </div>

                {parentRecord && (
                  <button
                    type="button"
                    onClick={() => onSelectVaultRecord?.(parentRecord)}
                    className="flex w-full items-center gap-3 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-2 text-left hover:border-[#2563EB] cursor-pointer"
                  >
                    <img
                      src={parentRecord.imageDataUrl}
                      alt={parentRecord.originalPrompt}
                      className="h-11 w-11 rounded-lg object-cover shrink-0 border border-[#E2E8F0] dark:border-slate-700"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono-tabular text-[#2563EB] dark:text-[#60A5FA]">ภาพต้นฉบับ →</p>
                      <p className="truncate text-xs text-[#101820] dark:text-[#F8FAFC]">{parentRecord.originalPrompt}</p>
                    </div>
                  </button>
                )}

                {derivedRecords.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                      ผลงานที่แต่งต่อจากภาพนี้ ({derivedRecords.length}):
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {derivedRecords.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => onSelectVaultRecord?.(child)}
                          className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-1.5 text-left hover:border-[#2563EB] cursor-pointer"
                        >
                          <img
                            src={child.imageDataUrl}
                            alt={child.originalPrompt}
                            className="h-9 w-9 rounded object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-[10px] font-mono-tabular text-[#2563EB] dark:text-[#60A5FA]">
                              {TYPE_LABEL_MAP[child.itemType || 'edited']}
                            </p>
                            <p className="truncate text-[11px] text-[#101820] dark:text-[#F8FAFC]">
                              {child.originalPrompt}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-4">
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownloadPng}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 text-xs font-semibold text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{downloading ? 'กำลังแปลง PNG...' : 'ดาวน์โหลด'}</span>
            </button>
            {onOpenInEditor && (
              <button
                type="button"
                onClick={() => {
                  onOpenInEditor(item);
                  onClose();
                }}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>แต่งภาพนี้</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onContinuePrompt(item);
                onClose();
              }}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#2563EB]/40 bg-blue-50 dark:bg-[#0B1F3A] px-3 py-2 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-blue-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              {item.projectJson ? <Sparkles className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />}
              <span>สร้างต่อ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
