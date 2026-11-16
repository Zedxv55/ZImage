import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckSquare,
  Dices,
  Download,
  Folder,
  FolderPlus,
  Heart,
  Layers,
  LogIn,
  Maximize2,
  PenLine,
  Pencil,
  Search,
  Sliders,
  Square,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { STYLE_PRESETS } from '../utils/promptLogic';
import type { StylePresetId, VaultItemType } from '../utils/promptLogic';
import { downloadUrlAsPng, triggerBlobDownload } from '../utils/canvasImageHelper';
import { createZipArchive } from '../utils/imageProcessing';
import type { AlbumRecord, VaultImageRecord } from '../lib/firebase';
import type { LightboxImageData } from './LightboxModal';
import type { SessionCreation } from './StudioView';

interface VaultViewProps {
  user: User | null;
  images: VaultImageRecord[];
  albums: AlbumRecord[];
  loading: boolean;
  sessionCreations: SessionCreation[];
  onSignIn: () => void;
  onToggleFavorite: (imageId: string, nextValue: boolean) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
  onSyncSessionCreations: () => Promise<void>;
  onCreateAlbum: (name: string) => Promise<void>;
  onRenameAlbum: (albumId: string, name: string) => Promise<void>;
  onDeleteAlbum: (albumId: string) => Promise<void>;
  onMoveImagesToAlbum: (imageIds: string[], albumId: string) => Promise<void>;
  onOpenLightbox: (item: LightboxImageData) => void;
  onOpenInEditor: (item: LightboxImageData) => void;
  onOpenMultipleInEditor: (items: LightboxImageData[]) => void;
  onContinuePrompt: (item: LightboxImageData) => void;
  onGenerateVariation: (item: LightboxImageData) => Promise<void>;
  onGoToStudio: () => void;
}

const ITEM_TYPE_LABEL: Record<VaultItemType, string> = {
  generated: 'ภาพเจน',
  edited: 'ผลงานแต่ง',
  animation: 'ภาพเคลื่อนไหว',
};

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const idx = dataUrl.indexOf(',');
  const base64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function VaultView({
  user,
  images,
  albums,
  loading,
  sessionCreations,
  onSignIn,
  onToggleFavorite,
  onDeleteImage,
  onSyncSessionCreations,
  onCreateAlbum,
  onRenameAlbum,
  onDeleteAlbum,
  onMoveImagesToAlbum,
  onOpenLightbox,
  onOpenInEditor,
  onOpenMultipleInEditor,
  onContinuePrompt,
  onGenerateVariation,
  onGoToStudio,
}: VaultViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'favorites' | VaultItemType>('all');
  const [styleFilter, setStyleFilter] = useState<'all' | StylePresetId>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [activeAlbumId, setActiveAlbumId] = useState<string>('all');

  const [newAlbumName, setNewAlbumName] = useState('');
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [renamingAlbumId, setRenamingAlbumId] = useState<string | null>(null);
  const [renameAlbumDraft, setRenameAlbumDraft] = useState('');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchAlbumTarget, setBatchAlbumTarget] = useState<string>('');
  const [batchBusy, setBatchBusy] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [varyingId, setVaryingId] = useState<string | null>(null);
  const [syncingSession, setSyncingSession] = useState(false);

  const unsavedSessionItems = useMemo(
    () => sessionCreations.filter((item) => !item.savedDocId),
    [sessionCreations]
  );

  const filteredImages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const nowMs = Date.now();
    return images.filter((img) => {
      const effectiveType: VaultItemType = img.itemType || 'generated';
      if (typeFilter === 'favorites' && !img.isFavorite) return false;
      if (typeFilter !== 'all' && typeFilter !== 'favorites' && effectiveType !== typeFilter) {
        return false;
      }
      if (styleFilter !== 'all' && img.stylePreset !== styleFilter) return false;
      if (activeAlbumId !== 'all') {
        if (activeAlbumId === 'unassigned') {
          if (img.albumId) return false;
        } else if (img.albumId !== activeAlbumId) {
          return false;
        }
      }
      if (dateFilter !== 'all') {
        const ms = img.createdAt?.toDate ? img.createdAt.toDate().getTime() : 0;
        if (ms > 0) {
          const ageDays = (nowMs - ms) / (1000 * 60 * 60 * 24);
          if (dateFilter === 'today' && ageDays > 1) return false;
          if (dateFilter === '7d' && ageDays > 7) return false;
          if (dateFilter === '30d' && ageDays > 30) return false;
        }
      }
      if (!q) return true;
      return (
        img.originalPrompt.toLowerCase().includes(q) ||
        img.enhancedPrompt.toLowerCase().includes(q)
      );
    });
  }, [images, searchQuery, typeFilter, styleFilter, activeAlbumId, dateFilter]);

  const favoriteCount = useMemo(
    () => images.filter((i) => i.isFavorite).length,
    [images]
  );

  const toLightboxItem = (img: VaultImageRecord): LightboxImageData => ({
    id: img.id,
    imageUrl: img.imageDataUrl,
    originalPrompt: img.originalPrompt,
    enhancedPrompt: img.enhancedPrompt,
    stylePreset: img.stylePreset,
    aspectRatio: img.aspectRatio,
    authorName: img.ownerName,
    modelName: img.model,
    itemType: img.itemType || 'generated',
    sourceImageId: img.sourceImageId,
    projectJson: img.projectJson,
    albumId: img.albumId,
    dateLabel: img.createdAt?.toDate
      ? img.createdAt.toDate().toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : 'เมื่อสักครู่',
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBatchZip = async () => {
    const selected = images.filter((i) => selectedIds.includes(i.id));
    if (selected.length === 0) return;
    setBatchBusy(true);
    try {
      const entries = selected.map((img, idx) => ({
        name: `zimage_${String(idx + 1).padStart(2, '0')}_${img.id.slice(0, 8)}.png`,
        bytes: dataUrlToUint8Array(img.imageDataUrl),
      }));
      const zipBytes = createZipArchive(entries);
      triggerBlobDownload(
        new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' }),
        `zimage-vault-${Date.now()}.zip`
      );
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBatchBusy(true);
    try {
      for (const id of selectedIds) {
        await onDeleteImage(id);
      }
      setSelectedIds([]);
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchMoveAlbum = async () => {
    if (selectedIds.length === 0) return;
    setBatchBusy(true);
    try {
      await onMoveImagesToAlbum(selectedIds, batchAlbumTarget);
      setSelectedIds([]);
    } finally {
      setBatchBusy(false);
    }
  };

  const handleSendSelectedToStudio = () => {
    const selected = images.filter((i) => selectedIds.includes(i.id)).map(toLightboxItem);
    if (selected.length > 0) {
      onOpenMultipleInEditor(selected);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-8 sm:p-10 text-center space-y-5 shadow-sm">
          <h1 className="font-display text-2xl font-bold text-[#101820] dark:text-[#F8FAFC]">
            คลังผลงานส่วนตัวบน Firebase
          </h1>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-[#64748B] dark:text-slate-400">
            เข้าสู่ระบบด้วยบัญชี Google เพื่อบันทึกภาพที่สร้าง ผลงานแต่งเลเยอร์ และภาพเคลื่อนไหว พร้อมจัดอัลบั้มและเปิดแต่งต่อได้จากทุกอุปกรณ์
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="h-4 w-4" />
              <span>เข้าสู่ระบบด้วย Google</span>
            </button>
          </div>
          {unsavedSessionItems.length > 0 && (
            <p className="text-xs text-[#2563EB] dark:text-[#60A5FA] font-mono-tabular">
              คุณมีภาพที่สร้างไว้ในเซสชันนี้ {unsavedSessionItems.length} ภาพ รอการบันทึกหลังเข้าสู่ระบบ
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 lg:py-8 space-y-6">
      {/* Header & Metrics */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E2E8F0] dark:border-slate-800 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
            คลังผลงานส่วนตัว (Vault)
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-slate-400 font-mono-tabular">
            <span>ทั้งหมด {images.length} รายการ</span>
            <span aria-hidden="true">·</span>
            <span>รายการโปรด {favoriteCount}</span>
            <span aria-hidden="true">·</span>
            <span>อัลบั้ม {albums.length}</span>
            <span aria-hidden="true">·</span>
            <span>ซิงค์กับ Firebase อัตโนมัติ</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {unsavedSessionItems.length > 0 && (
            <button
              type="button"
              disabled={syncingSession}
              onClick={async () => {
                setSyncingSession(true);
                try {
                  await onSyncSessionCreations();
                } finally {
                  setSyncingSession(false);
                }
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#2563EB]/40 bg-blue-50 dark:bg-[#0B1F3A] px-3.5 py-2 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-blue-100 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              <UploadCloud className="h-4 w-4" />
              <span>
                {syncingSession
                  ? 'กำลังบันทึก...'
                  : `บันทึกภาพจากเซสชัน (${unsavedSessionItems.length})`}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onGoToStudio}
            className="min-h-[40px] rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer whitespace-nowrap"
          >
            สร้างภาพใหม่
          </button>
        </div>
      </div>

      {/* Album / Folder Strip */}
      <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
            <Folder className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
            <span>โฟลเดอร์ / อัลบั้มของฉัน</span>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newAlbumName.trim()) return;
              setCreatingAlbum(true);
              try {
                await onCreateAlbum(newAlbumName.trim());
                setNewAlbumName('');
              } finally {
                setCreatingAlbum(false);
              }
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              maxLength={60}
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder="สร้างอัลบั้มใหม่..."
              className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
            />
            <button
              type="submit"
              disabled={creatingAlbum || !newAlbumName.trim()}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#2563EB] px-3 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>เพิ่ม</span>
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveAlbumId('all')}
            className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
              activeAlbumId === 'all'
                ? 'bg-[#2563EB] text-white font-semibold'
                : 'border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-300'
            }`}
          >
            ทั้งหมด ({images.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveAlbumId('unassigned')}
            className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
              activeAlbumId === 'unassigned'
                ? 'bg-[#2563EB] text-white font-semibold'
                : 'border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-300'
            }`}
          >
            ยังไม่จัดอัลบั้ม
          </button>

          {albums.map((alb) => {
            const count = images.filter((i) => i.albumId === alb.id).length;
            const active = activeAlbumId === alb.id;
            return (
              <div
                key={alb.id}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${
                  active
                    ? 'border-[#2563EB] bg-[#2563EB] text-white font-semibold'
                    : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#101820] dark:text-[#F8FAFC]'
                }`}
              >
                {renamingAlbumId === alb.id ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!renameAlbumDraft.trim()) return;
                      await onRenameAlbum(alb.id, renameAlbumDraft.trim());
                      setRenamingAlbumId(null);
                    }}
                    className="flex items-center gap-1"
                  >
                    <input
                      type="text"
                      value={renameAlbumDraft}
                      onChange={(e) => setRenameAlbumDraft(e.target.value)}
                      className="w-28 rounded bg-white dark:bg-[#101820] px-1.5 py-0.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
                      autoFocus
                    />
                    <button type="submit" className="text-[11px] underline cursor-pointer">
                      บันทึก
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveAlbumId(alb.id)}
                      className="cursor-pointer whitespace-nowrap"
                    >
                      {alb.name} ({count})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingAlbumId(alb.id);
                        setRenameAlbumDraft(alb.name);
                      }}
                      aria-label={`เปลี่ยนชื่ออัลบั้ม ${alb.name}`}
                      className="opacity-70 hover:opacity-100 cursor-pointer p-0.5"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAlbum(alb.id)}
                      aria-label={`ลบอัลบั้ม ${alb.name}`}
                      className="opacity-70 hover:text-red-500 hover:opacity-100 cursor-pointer p-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาคำอธิบายหรือพรอมต์..."
            aria-label="ค้นหาภาพในคลัง"
            className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] py-2 pl-9 pr-3.5 text-sm text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-1">
            {(
              [
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'favorites', label: 'รายการโปรด' },
                { id: 'generated', label: 'ภาพเจน' },
                { id: 'edited', label: 'ผลงานแต่ง' },
                { id: 'animation', label: 'ภาพเคลื่อนไหว' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${
                  typeFilter === t.id
                    ? 'bg-[#2563EB] text-white font-semibold'
                    : 'text-[#64748B] dark:text-slate-400 hover:text-[#101820] dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            aria-label="กรองตามสไตล์"
            value={styleFilter}
            onChange={(e) => setStyleFilter(e.target.value as 'all' | StylePresetId)}
            className="min-h-[38px] rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 text-xs text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
          >
            <option value="all">ทุกสไตล์</option>
            {STYLE_PRESETS.filter((s) => s.id !== 'auto').map((s) => (
              <option key={s.id} value={s.id}>
                {s.labelTh}
              </option>
            ))}
          </select>

          <select
            aria-label="กรองตามวันที่"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | '7d' | '30d')}
            className="min-h-[38px] rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 text-xs text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
          >
            <option value="all">ทุกช่วงเวลา</option>
            <option value="today">วันนี้</option>
            <option value="7d">7 วันล่าสุด</option>
            <option value="30d">30 วันล่าสุด</option>
          </select>
        </div>
      </div>

      {/* Multi-Select Batch Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2563EB] bg-blue-50 dark:bg-[#0B1F3A] px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
            <span>เลือกอยู่ {selectedIds.length} รายการ</span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-[#2563EB] dark:text-[#60A5FA] underline cursor-pointer"
            >
              ยกเลิกเลือก
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSendSelectedToStudio}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>ส่งเข้าสตูดิโอแต่งภาพ ({selectedIds.length} ภาพ)</span>
            </button>
            <button
              type="button"
              disabled={batchBusy}
              onClick={handleBatchZip}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 text-xs font-medium text-[#101820] dark:text-slate-200 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[#2563EB]" />
              <span>ดาวน์โหลด ZIP</span>
            </button>
            {albums.length > 0 && (
              <div className="flex items-center gap-1">
                <select
                  value={batchAlbumTarget}
                  onChange={(e) => setBatchAlbumTarget(e.target.value)}
                  className="min-h-[36px] rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2 text-xs text-[#101820] dark:text-[#F8FAFC]"
                >
                  <option value="">นำออกจากอัลบั้ม</option>
                  {albums.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={batchBusy}
                  onClick={handleBatchMoveAlbum}
                  className="min-h-[36px] rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] cursor-pointer"
                >
                  ย้ายเข้าอัลบั้ม
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={batchBusy}
              onClick={handleBatchDelete}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>ลบที่เลือก</span>
            </button>
          </div>
        </div>
      )}

      {/* Vault Content States */}
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="overflow-hidden rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820]">
              <div className="aspect-[4/3] w-full animate-pulse bg-[#F7F9FC] dark:bg-[#0B1F3A]" />
              <div className="p-4 space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-12 text-center space-y-3 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-[#101820] dark:text-[#F8FAFC]">
            {images.length === 0 ? 'ยังไม่มีภาพในคลังส่วนตัวของคุณ' : 'ไม่พบภาพที่ตรงกับตัวกรอง'}
          </h2>
          <p className="text-sm text-[#64748B] dark:text-slate-400">
            {images.length === 0
              ? 'เริ่มสร้างภาพหรือแต่งภาพในสตูดิโอ แล้วกดบันทึกคลังเพื่อเก็บผลงานทั้งหมดไว้ที่นี่'
              : 'ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง'}
          </p>
          <div className="pt-2">
            {images.length === 0 ? (
              <button
                type="button"
                onClick={onGoToStudio}
                className="min-h-[42px] rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
              >
                ไปยังหน้าสร้างภาพ
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('all');
                  setStyleFilter('all');
                  setDateFilter('all');
                  setActiveAlbumId('all');
                }}
                className="min-h-[40px] rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-4 py-2 text-xs font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredImages.map((img) => {
            const lb = toLightboxItem(img);
            const isSelected = selectedIds.includes(img.id);
            const itemTypeLabel = ITEM_TYPE_LABEL[img.itemType || 'generated'];
            const albumName = img.albumId
              ? albums.find((a) => a.id === img.albumId)?.name
              : undefined;

            return (
              <article
                key={img.id}
                className={`flex flex-col overflow-hidden rounded-2xl border bg-white dark:bg-[#101820] transition-all shadow-sm ${
                  isSelected
                    ? 'border-[#2563EB] ring-2 ring-[#2563EB]/30'
                    : 'border-[#E2E8F0] dark:border-slate-800'
                }`}
              >
                <div className="checkerboard-stage relative aspect-[4/3] w-full overflow-hidden">
                  <img
                    src={img.imageDataUrl}
                    alt={img.originalPrompt}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSelect(img.id)}
                    aria-label={isSelected ? 'ยกเลิกเลือกภาพ' : 'เลือกภาพเพื่อทำรายการยกชุด'}
                    className="absolute left-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white/90 dark:bg-[#101820]/90 text-[#2563EB] dark:text-[#60A5FA] hover:bg-[#2563EB] hover:text-white cursor-pointer"
                  >
                    {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenLightbox(lb)}
                    aria-label={`ขยายดูภาพ ${img.originalPrompt}`}
                    className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] dark:border-slate-700 bg-white/90 dark:bg-[#101820]/90 text-[#101820] dark:text-[#F8FAFC] hover:bg-[#2563EB] hover:text-white cursor-pointer"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-1 flex-col justify-between p-4 space-y-3.5">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#64748B] dark:text-slate-400 font-mono-tabular">
                      <span className="font-semibold text-[#2563EB] dark:text-[#60A5FA]">{itemTypeLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{img.aspectRatio}</span>
                      <span aria-hidden="true">·</span>
                      <span>{lb.dateLabel}</span>
                      {albumName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#101820] dark:text-[#F8FAFC]">{albumName}</span>
                        </>
                      )}
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-[#101820] dark:text-[#F8FAFC]">
                      {img.originalPrompt}
                    </h3>
                  </div>

                  <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenInEditor(lb)}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                        <span>แต่งภาพนี้</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onContinuePrompt(lb)}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-[11px] font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <PenLine className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                        <span>สร้างต่อ</span>
                      </button>

                      <button
                        type="button"
                        disabled={varyingId === img.id}
                        onClick={async () => {
                          setVaryingId(img.id);
                          try {
                            await onGenerateVariation(lb);
                          } finally {
                            setVaryingId(null);
                          }
                        }}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-[11px] font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                      >
                        <Dices className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
                        <span>{varyingId === img.id ? 'กำลังสุ่ม...' : 'เจนอีกแบบ'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadUrlAsPng(img.imageDataUrl, `zimage-${img.id}`)}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-[11px] font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>ดาวน์โหลด</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleFavorite(img.id, !img.isFavorite)}
                        className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 text-[11px] font-medium cursor-pointer ${
                          img.isFavorite
                            ? 'border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300'
                            : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-300'
                        }`}
                      >
                        <Heart className={`h-3.5 w-3.5 ${img.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                        <span>บันทึกคลัง</span>
                      </button>

                      {confirmDeleteId === img.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={deletingId === img.id}
                            onClick={async () => {
                              setDeletingId(img.id);
                              try {
                                await onDeleteImage(img.id);
                              } finally {
                                setDeletingId(null);
                                setConfirmDeleteId(null);
                              }
                            }}
                            className="min-h-[34px] rounded-lg bg-red-600 px-2.5 text-[11px] font-semibold text-white hover:bg-red-700 cursor-pointer"
                          >
                            ยืนยันลบ
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[34px] rounded-lg border border-[#E2E8F0] dark:border-slate-700 px-2 text-[11px] cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(img.id)}
                          aria-label={`ลบภาพ ${img.originalPrompt}`}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/50 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>ลบ</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
