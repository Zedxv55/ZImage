import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  Check,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Gift,
  History,
  LayoutGrid,
  List,
  LogOut,
  Mail,
  Maximize2,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Star,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import {
  ADMIN_EMAILS,
  STYLE_PRESETS,
  SUPER_ADMIN_EMAIL,
} from '../utils/promptLogic';
import type { AspectRatioId, ImageVisibility, RequestStatus, StylePresetId } from '../utils/promptLogic';
import { downloadUrlAsPng, triggerBlobDownload } from '../utils/canvasImageHelper';
import type { MemberRecord, RequestRecord, VaultImageRecord } from '../lib/firebase';
import type { LightboxImageData } from './LightboxModal';
import {
  ALL_ADMIN_PERMISSIONS,
  computeEffectiveAccessStatus,
  formatBangkokDateTime,
} from '../utils/trialReferralRules';
import type { AdminPermissionKey, PlanTier, UserRole } from '../utils/trialReferralRules';

export interface ServerArchiveImageItem {
  id: string;
  originalPrompt: string;
  enhancedPrompt: string;
  stylePreset: StylePresetId;
  aspectRatio: AspectRatioId;
  dimensionsLabel?: string;
  hasReferenceImage?: boolean;
  ownerType: 'guest' | 'member';
  ownerUid?: string;
  ownerName: string;
  ownerEmail?: string;
  model: string;
  promptEngine?: string;
  createdAtIso: string;
  imageDataUrl: string;
}

export interface ServerGuestRequestRecord {
  id: string;
  dateKey: string;
  authorName: string;
  subject: string;
  message: string;
  rating: number;
  status: RequestStatus;
  adminNote: string;
  createdAtIso: string;
  updatedAtIso: string;
}

interface UnifiedAdminImage {
  key: string;
  source: 'firestore' | 'archive';
  rawId: string;
  imageUrl: string;
  originalPrompt: string;
  enhancedPrompt: string;
  stylePreset: StylePresetId;
  aspectRatio: AspectRatioId;
  dimensionsLabel?: string;
  ownerType: 'guest' | 'member';
  ownerId: string;
  ownerName: string;
  ownerEmail?: string;
  model: string;
  visibility?: ImageVisibility;
  dateLabel: string;
  sortMs: number;
}

interface UnifiedAdminRequest {
  key: string;
  source: 'firestore' | 'guest';
  rawId: string;
  authorName: string;
  dateKey: string;
  subject: string;
  message: string;
  rating: number;
  status: RequestStatus;
  adminNote: string;
  sortMs: number;
}

interface AdminControlUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  adminPermissions: AdminPermissionKey[];
  plan: PlanTier;
  trialStartedAtUtc: string;
  trialExpiresAtUtc: string;
  bonusDaysTotal: number;
  monthlyInviteCount: number;
  monthlyInviteMonthKey: string;
  referralCode: string;
  suspended: boolean;
  suspendedReason?: string;
  sessionVersion: number;
  usageCountTotal: number;
  dailyQuotaOverride?: number | null;
  featureOverrides: {
    aiGeneration?: boolean;
    aiDecompose?: boolean;
    proEditor?: boolean;
    videoEditor?: boolean;
    psdExport?: boolean;
  };
  lastSeenAtUtc: string;
}

interface AdminReferralRow {
  id: string;
  inviterEmail: string;
  inviteeEmail: string;
  referralCode: string;
  monthKey: string;
  milestoneStep: number;
  deltaDaysGranted: number;
  status: 'qualified' | 'clawed_back' | 'rejected';
  reason?: string;
  createdAtUtc: string;
}

interface AdminAiJobRow {
  id: string;
  type: string;
  status: string;
  actorEmail?: string;
  actorName: string;
  model: string;
  promptPreview: string;
  durationMs?: number;
  errorMessage?: string;
  createdAtUtc: string;
}

interface AdminAuditRow {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  timestampUtc: string;
}

interface AdminSettingsState {
  trialHours: number;
  monthlyInviteCap: number;
  defaultDailyLimit: number;
  allowGuestGeneration: boolean;
  maintenanceMode: boolean;
  maintenanceBanner: string;
  aiFeaturesEnabled: {
    aiGeneration: boolean;
    aiDecompose: boolean;
    promptEnhancer: boolean;
    videoEditor: boolean;
    psdExport: boolean;
  };
}

interface AdminOverviewMetrics {
  totalUsers: number;
  activeTrials: number;
  suspendedUsers: number;
  qualifiedReferrals: number;
  totalAiJobs: number;
  failedAiJobs: number;
  totalArchiveImages: number;
}

const REQUEST_STATUS_OPTIONS: Array<{ id: RequestStatus; label: string }> = [
  { id: 'submitted', label: 'ส่งคำขอ' },
  { id: 'reviewed', label: 'รับเรื่อง' },
  { id: 'in-progress', label: 'กำลังพัฒนา' },
  { id: 'completed', label: 'เสร็จสิ้น' },
];

type AdminSectionTab =
  | 'images'
  | 'requests'
  | 'overview'
  | 'users'
  | 'referrals'
  | 'jobs'
  | 'settings'
  | 'audit';

interface AdminViewProps {
  user?: User | null;
  isAdmin: boolean;
  allImages: VaultImageRecord[];
  serverArchiveImages: ServerArchiveImageItem[];
  members: MemberRecord[];
  firestoreRequests: RequestRecord[];
  serverGuestRequests: ServerGuestRequestRecord[];
  loadingImages: boolean;
  loadingMembers: boolean;
  onRefreshAll: () => Promise<void>;
  onChangeVisibility: (imageId: string, visibility: ImageVisibility) => Promise<void>;
  onDeleteImage: (imageId: string) => Promise<void>;
  onDeleteServerArchive: (archiveId: string) => Promise<void>;
  onUpdateRequestStatus: (
    source: 'firestore' | 'guest',
    id: string,
    status: RequestStatus,
    adminNote: string
  ) => Promise<void>;
  onDeleteRequest: (source: 'firestore' | 'guest', id: string) => Promise<void>;
  onOpenLightbox: (item: LightboxImageData) => void;
  onOpenInEditor: (item: LightboxImageData) => void;
}

export function AdminView({
  user,
  isAdmin,
  allImages,
  serverArchiveImages,
  members,
  firestoreRequests,
  serverGuestRequests,
  loadingImages,
  loadingMembers,
  onRefreshAll,
  onChangeVisibility,
  onDeleteImage,
  onDeleteServerArchive,
  onUpdateRequestStatus,
  onDeleteRequest,
  onOpenLightbox,
  onOpenInEditor,
}: AdminViewProps) {
  const [sectionTab, setSectionTab] = useState<AdminSectionTab>('images');
  const [viewMode, setViewMode] = useState<'gallery' | 'table'>('gallery');
  const [searchQuery, setSearchQuery] = useState('');
  const [imageFilter, setImageFilter] = useState<
    'all' | 'guest' | 'member' | 'featured' | 'private' | 'hidden'
  >('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Request status/note local edits
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [draftStatuses, setDraftStatuses] = useState<Record<string, RequestStatus>>({});
  const [savedRequestKey, setSavedRequestKey] = useState<string | null>(null);

  // Server RBAC & Control Center state
  const [controlBusy, setControlBusy] = useState(false);
  const [controlNotice, setControlNotice] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [overviewMetrics, setOverviewMetrics] = useState<AdminOverviewMetrics | null>(null);
  const [controlUsers, setControlUsers] = useState<AdminControlUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserUid, setSelectedUserUid] = useState<string | null>(null);
  const [customDaysInput, setCustomDaysInput] = useState<number>(7);
  const [dailyQuotaInput, setDailyQuotaInput] = useState<string>('');
  const [referralsList, setReferralsList] = useState<AdminReferralRow[]>([]);
  const [jobsList, setJobsList] = useState<AdminAiJobRow[]>([]);
  const [auditList, setAuditList] = useState<AdminAuditRow[]>([]);
  const [settingsState, setSettingsState] = useState<AdminSettingsState | null>(null);
  const [draftRole, setDraftRole] = useState<UserRole>('user');
  const [draftPerms, setDraftPerms] = useState<AdminPermissionKey[]>([]);

  const isOwner = Boolean(
    user?.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
  );

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!user) throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ');
      const token = await user.getIdToken();
      const resp = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
      });
      return resp;
    },
    [user]
  );

  const loadControlCenterData = useCallback(async () => {
    if (!isAdmin || !user) return;
    setControlBusy(true);
    setControlError(null);
    try {
      const [ovRes, usersRes, refRes, jobsRes, setRes, auditRes] = await Promise.all([
        authFetch('/api/admin/overview'),
        authFetch(`/api/admin/users?q=${encodeURIComponent(userSearch)}`),
        authFetch('/api/admin/referrals'),
        authFetch('/api/admin/ai-jobs'),
        authFetch('/api/admin/settings'),
        authFetch('/api/admin/audit-logs'),
      ]);

      if (ovRes.ok) {
        const d = await ovRes.json();
        setOverviewMetrics(d.metrics || null);
      }
      if (usersRes.ok) {
        const d = await usersRes.json();
        setControlUsers(Array.isArray(d.users) ? d.users : []);
      }
      if (refRes.ok) {
        const d = await refRes.json();
        setReferralsList(Array.isArray(d.items) ? d.items : []);
      }
      if (jobsRes.ok) {
        const d = await jobsRes.json();
        setJobsList(Array.isArray(d.items) ? d.items : []);
      }
      if (setRes.ok) {
        const d = await setRes.json();
        setSettingsState(d.settings || null);
      }
      if (auditRes.ok) {
        const d = await auditRes.json();
        setAuditList(Array.isArray(d.items) ? d.items : []);
      }
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'ไม่สามารถดึงข้อมูลศูนย์ควบคุมได้');
    } finally {
      setControlBusy(false);
    }
  }, [isAdmin, user, authFetch, userSearch]);

  useEffect(() => {
    if (
      isAdmin &&
      user &&
      (sectionTab === 'overview' ||
        sectionTab === 'users' ||
        sectionTab === 'referrals' ||
        sectionTab === 'jobs' ||
        sectionTab === 'settings' ||
        sectionTab === 'audit')
    ) {
      void loadControlCenterData();
    }
  }, [isAdmin, user, sectionTab, loadControlCenterData]);

  const selectedControlUser = useMemo(
    () => controlUsers.find((u) => u.uid === selectedUserUid) || null,
    [controlUsers, selectedUserUid]
  );

  useEffect(() => {
    if (selectedControlUser) {
      setDraftRole(selectedControlUser.role);
      setDraftPerms(selectedControlUser.adminPermissions || []);
      setDailyQuotaInput(
        selectedControlUser.dailyQuotaOverride != null
          ? String(selectedControlUser.dailyQuotaOverride)
          : ''
      );
    }
  }, [selectedControlUser]);

  const runUserAction = async (
    uid: string,
    payload: Record<string, unknown>,
    successLabel: string
  ) => {
    setControlBusy(true);
    setControlError(null);
    setControlNotice(null);
    try {
      const resp = await authFetch(`/api/admin/users/${encodeURIComponent(uid)}/action`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'ดำเนินการไม่สำเร็จ');
      }
      setControlNotice(successLabel);
      await loadControlCenterData();
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'ไม่สามารถดำเนินการได้');
    } finally {
      setControlBusy(false);
    }
  };

  const handleDownloadReferralsCsv = async () => {
    try {
      const resp = await authFetch('/api/admin/referrals?format=csv');
      if (!resp.ok) throw new Error('ดาวน์โหลด CSV ไม่สำเร็จ');
      const csvText = await resp.text();
      triggerBlobDownload(
        new Blob([csvText], { type: 'text/csv;charset=utf-8' }),
        `zimage-referrals-${new Date().toISOString().slice(0, 10)}.csv`
      );
      setControlNotice('ส่งออกไฟล์ CSV รายการชวนเพื่อนสำเร็จ');
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'ไม่สามารถดาวน์โหลด CSV ได้');
    }
  };

  const handleClawbackReferral = async (referralId: string) => {
    setControlBusy(true);
    setControlError(null);
    try {
      const resp = await authFetch(`/api/admin/referrals/${encodeURIComponent(referralId)}/clawback`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Admin manual review clawback' }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'เรียกคืนสิทธิ์ไม่สำเร็จ');
      setControlNotice('เรียกคืนโบนัสจากรายการแนะนำนี้เรียบร้อยแล้ว');
      await loadControlCenterData();
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'เรียกคืนสิทธิ์ไม่สำเร็จ');
    } finally {
      setControlBusy(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsState) return;
    setControlBusy(true);
    setControlError(null);
    setControlNotice(null);
    try {
      const resp = await authFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settingsState),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'บันทึกการตั้งค่าระบบไม่สำเร็จ');
      setSettingsState(data.settings);
      setControlNotice('บันทึกการตั้งค่าระบบทั้งหมดเรียบร้อยแล้ว');
    } catch (err) {
      setControlError(err instanceof Error ? err.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setControlBusy(false);
    }
  };

  const memberEmailMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      if (m.email) map.set(m.uid, m.email);
    }
    return map;
  }, [members]);

  const unifiedImages = useMemo<UnifiedAdminImage[]>(() => {
    const fsList: UnifiedAdminImage[] = allImages.map((img) => {
      const sortMs = img.createdAt?.toDate ? img.createdAt.toDate().getTime() : 0;
      const dateLabel = img.createdAt?.toDate
        ? img.createdAt.toDate().toLocaleString('th-TH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '-';
      return {
        key: `fs-${img.id}`,
        source: 'firestore',
        rawId: img.id,
        imageUrl: img.imageDataUrl,
        originalPrompt: img.originalPrompt,
        enhancedPrompt: img.enhancedPrompt,
        stylePreset: img.stylePreset,
        aspectRatio: img.aspectRatio,
        dimensionsLabel: img.dimensionsLabel,
        ownerType: 'member',
        ownerId: img.ownerId,
        ownerName: img.ownerName,
        ownerEmail: memberEmailMap.get(img.ownerId),
        model: img.model,
        visibility: img.visibility,
        dateLabel,
        sortMs,
      };
    });

    const archList: UnifiedAdminImage[] = serverArchiveImages
      .filter((a) => Boolean(a.imageDataUrl))
      .map((a) => {
        const dt = new Date(a.createdAtIso);
        const sortMs = Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
        const dateLabel = Number.isNaN(dt.getTime())
          ? a.createdAtIso
          : dt.toLocaleString('th-TH', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
        return {
          key: `arch-${a.id}`,
          source: 'archive',
          rawId: a.id,
          imageUrl: a.imageDataUrl,
          originalPrompt: a.originalPrompt,
          enhancedPrompt: a.enhancedPrompt,
          stylePreset: a.stylePreset,
          aspectRatio: a.aspectRatio,
          dimensionsLabel: a.dimensionsLabel,
          ownerType: a.ownerType,
          ownerId: a.ownerUid || 'guest',
          ownerName: a.ownerName,
          ownerEmail: a.ownerEmail,
          model: a.model,
          dateLabel,
          sortMs,
        };
      });

    return [...archList, ...fsList].sort((a, b) => b.sortMs - a.sortMs);
  }, [allImages, serverArchiveImages, memberEmailMap]);

  const filteredImages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedImages.filter((img) => {
      if (imageFilter === 'guest' && img.ownerType !== 'guest') return false;
      if (imageFilter === 'member' && img.ownerType !== 'member') return false;
      if (
        (imageFilter === 'featured' || imageFilter === 'private' || imageFilter === 'hidden') &&
        img.visibility !== imageFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        img.originalPrompt.toLowerCase().includes(q) ||
        img.enhancedPrompt.toLowerCase().includes(q) ||
        img.ownerName.toLowerCase().includes(q) ||
        img.ownerId.toLowerCase().includes(q) ||
        (img.ownerEmail || '').toLowerCase().includes(q) ||
        img.stylePreset.toLowerCase().includes(q)
      );
    });
  }, [unifiedImages, searchQuery, imageFilter]);

  const unifiedRequests = useMemo<UnifiedAdminRequest[]>(() => {
    const fsReqs: UnifiedAdminRequest[] = firestoreRequests.map((r) => ({
      key: `fs-req-${r.id}`,
      source: 'firestore',
      rawId: r.id,
      authorName: r.authorName,
      dateKey: r.dateKey,
      subject: r.subject,
      message: r.message,
      rating: r.rating,
      status: r.status,
      adminNote: r.adminNote,
      sortMs: r.createdAt?.toDate ? r.createdAt.toDate().getTime() : Date.parse(r.dateKey) || 0,
    }));

    const guestReqs: UnifiedAdminRequest[] = serverGuestRequests.map((r) => ({
      key: `guest-req-${r.id}`,
      source: 'guest',
      rawId: r.id,
      authorName: `${r.authorName} (Guest)`,
      dateKey: r.dateKey,
      subject: r.subject,
      message: r.message,
      rating: r.rating,
      status: r.status,
      adminNote: r.adminNote,
      sortMs: Date.parse(r.createdAtIso) || 0,
    }));

    return [...fsReqs, ...guestReqs].sort((a, b) => b.sortMs - a.sortMs);
  }, [firestoreRequests, serverGuestRequests]);

  const avgRating = useMemo(() => {
    if (unifiedRequests.length === 0) return '—';
    const total = unifiedRequests.reduce((sum, r) => sum + r.rating, 0);
    return (total / unifiedRequests.length).toFixed(1);
  }, [unifiedRequests]);

  const guestImageCount = useMemo(
    () => unifiedImages.filter((i) => i.ownerType === 'guest').length,
    [unifiedImages]
  );

  const toLightboxData = (img: UnifiedAdminImage): LightboxImageData => ({
    id: img.rawId,
    imageUrl: img.imageUrl,
    originalPrompt: img.originalPrompt,
    enhancedPrompt: img.enhancedPrompt,
    stylePreset: img.stylePreset,
    aspectRatio: img.aspectRatio,
    authorName: img.ownerName,
    authorEmail: img.ownerEmail,
    modelName: img.model,
    dateLabel: img.dateLabel,
  });

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-8 space-y-3 shadow-sm">
          <ShieldAlert className="mx-auto h-8 w-8 text-red-600" />
          <h1 className="font-display text-xl font-bold text-[#101820] dark:text-[#F8FAFC]">
            เฉพาะผู้ดูแลระบบเท่านั้น
          </h1>
          <p className="text-sm text-[#64748B] dark:text-slate-400">
            กรุณาเข้าสู่ระบบด้วยบัญชี Google ที่ได้รับสิทธิ์ผู้ดูแลระบบ ({ADMIN_EMAILS.join(', ')})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6 lg:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E2E8F0] dark:border-slate-800 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#101820] dark:text-[#F8FAFC]">
            ศูนย์ควบคุมผู้ดูแลระบบ · ZImage Admin &amp; Owner RBAC
          </h1>
          <p className="mt-1 text-sm text-[#64748B] dark:text-slate-400">
            รวมคลังภาพทั้งหมด · คำขอผู้ใช้ · จัดการสมาชิก/Trial 72 ชม. · โบนัสชวนเพื่อน · ประวัติ AI · ตั้งค่าระบบ
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await onRefreshAll();
            await loadControlCenterData();
          }}
          disabled={loadingMembers || controlBusy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3.5 py-2 text-xs font-semibold text-[#101820] dark:text-slate-200 hover:bg-[#F7F9FC] dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingMembers || controlBusy ? 'animate-spin' : ''}`} />
          <span>รีเฟรชข้อมูลทั้งหมด</span>
        </button>
      </div>

      {/* 4-column Tabular Overview Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 shadow-sm">
          <p className="text-xs font-medium text-[#64748B] dark:text-slate-400">ภาพที่สร้างทั้งหมด</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#101820] dark:text-[#F8FAFC] font-mono-tabular">
            {unifiedImages.length}
          </p>
          <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
            ผู้เยี่ยมชม {guestImageCount} · สมาชิก {unifiedImages.length - guestImageCount}
          </p>
        </div>
        <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 shadow-sm">
          <p className="text-xs font-medium text-[#64748B] dark:text-slate-400">คำขอถึงเจ้าหน้าที่</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#2563EB] dark:text-[#60A5FA] font-mono-tabular">
            {unifiedRequests.length}
          </p>
          <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
            คะแนนเฉลี่ย {avgRating} / 5 ดาว
          </p>
        </div>
        <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 shadow-sm">
          <p className="text-xs font-medium text-[#64748B] dark:text-slate-400">สมาชิกในระบบ</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[#101820] dark:text-[#F8FAFC] font-mono-tabular">
            {overviewMetrics?.totalUsers ?? members.length}
          </p>
          <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-slate-400 font-mono-tabular">
            Trial Active {overviewMetrics?.activeTrials ?? '—'} · ระงับ {overviewMetrics?.suspendedUsers ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-4 shadow-sm">
          <p className="text-xs font-medium text-[#64748B] dark:text-slate-400">สิทธิ์ผู้ดูแลระบบ</p>
          <p className="mt-1.5 text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] truncate">
            {isOwner ? 'OWNER (Super Admin)' : 'ADMIN'}
          </p>
          <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-slate-400 truncate">
            {ADMIN_EMAILS.join(' · ')}
          </p>
        </div>
      </div>

      {controlNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4 shrink-0" />
          <span>{controlNotice}</span>
        </div>
      )}

      {controlError && (
        <div role="alert" className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
          {controlError}
        </div>
      )}

      {/* Section Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-1">
          {(
            [
              { id: 'images', label: `ภาพทั้งหมด (${unifiedImages.length})`, icon: LayoutGrid },
              { id: 'requests', label: `คำขอ (${unifiedRequests.length})`, icon: Mail },
              { id: 'overview', label: 'ภาพรวมระบบ', icon: Activity },
              { id: 'users', label: `สมาชิก & Trial (${controlUsers.length || members.length})`, icon: Users },
              { id: 'referrals', label: 'ชวนเพื่อน & CSV', icon: Gift },
              { id: 'jobs', label: 'ประวัติ AI', icon: History },
              { id: 'settings', label: 'ตั้งค่าระบบ', icon: Settings },
              { id: 'audit', label: 'Audit Logs', icon: ShieldCheck },
            ] as Array<{ id: AdminSectionTab; label: string; icon: typeof Users }>
          ).map((t) => {
            const Icon = t.icon;
            const active = sectionTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSectionTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#64748B] dark:text-slate-400 hover:text-[#101820] dark:hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {sectionTab === 'images' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อ อีเมล หรือพรอมต์..."
                className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] py-2 pl-9 pr-3 text-xs text-[#101820] dark:text-[#F8FAFC] focus:border-[#2563EB] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-1">
              {(
                [
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'guest', label: 'ผู้เยี่ยมชม' },
                  { id: 'member', label: 'สมาชิก' },
                  { id: 'featured', label: 'แนะนำ' },
                  { id: 'hidden', label: 'ซ่อน' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setImageFilter(f.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    imageFilter === f.id
                      ? 'bg-white dark:bg-[#101820] text-[#101820] dark:text-[#F8FAFC] shadow-xs'
                      : 'text-[#64748B] dark:text-slate-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-1">
              <button
                type="button"
                onClick={() => setViewMode('gallery')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                  viewMode === 'gallery'
                    ? 'bg-white dark:bg-[#101820] text-[#101820] dark:text-[#F8FAFC] shadow-xs'
                    : 'text-[#64748B] dark:text-slate-400'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>แกลเลอรี</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-[#101820] text-[#101820] dark:text-[#F8FAFC] shadow-xs'
                    : 'text-[#64748B] dark:text-slate-400'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>ตาราง</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: ALL IMAGES */}
      {sectionTab === 'images' && (
        loadingImages && unifiedImages.length === 0 ? (
          <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-10 text-center text-sm text-[#64748B] dark:text-slate-400">
            กำลังโหลดข้อมูลรูปภาพทั้งหมด...
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-10 text-center text-sm text-[#64748B] dark:text-slate-400">
            ไม่พบข้อมูลรูปภาพที่ตรงกับเงื่อนไข
          </div>
        ) : viewMode === 'gallery' ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredImages.map((img) => {
              const styleLabel =
                STYLE_PRESETS.find((s) => s.id === img.stylePreset)?.labelEn || img.stylePreset;
              const lb = toLightboxData(img);

              return (
                <article
                  key={img.key}
                  className="flex flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => onOpenLightbox(lb)}
                    aria-label={`เปิดดูรายละเอียดภาพ ${img.originalPrompt}`}
                    className="checkerboard-stage group relative aspect-[4/3] w-full overflow-hidden cursor-pointer"
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.originalPrompt}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    <span className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <Maximize2 className="h-3.5 w-3.5" />
                    </span>
                  </button>

                  <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
                        <span>
                          {img.dimensionsLabel || img.aspectRatio} · {styleLabel}
                        </span>
                        <span className="font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                          {img.source === 'archive'
                            ? img.ownerType === 'guest'
                              ? 'สร้างโดย Guest'
                              : 'ประวัติการสร้าง'
                            : img.visibility === 'featured'
                              ? 'แนะนำ'
                              : img.visibility === 'hidden'
                                ? 'ซ่อน'
                                : 'คลังสมาชิก'}
                        </span>
                      </div>

                      <div className="rounded-lg bg-[#F7F9FC] dark:bg-[#0B1F3A] p-2.5 text-xs space-y-0.5 border border-[#E2E8F0] dark:border-slate-800">
                        <p className="font-semibold text-[#101820] dark:text-[#F8FAFC] truncate">{img.ownerName}</p>
                        <p className="text-[11px] text-[#64748B] dark:text-slate-400 font-mono-tabular truncate">
                          {img.ownerEmail || (img.ownerType === 'guest' ? 'ไม่เข้าสู่ระบบ (Guest)' : `UID: ${img.ownerId}`)}
                        </p>
                        <p className="text-[11px] text-[#64748B] dark:text-slate-500 font-mono-tabular">
                          {img.model} · {img.dateLabel}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400">คำอธิบายต้นฉบับ</p>
                        <p className="mt-0.5 text-xs font-medium text-[#101820] dark:text-[#F8FAFC] line-clamp-2">
                          {img.originalPrompt}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
                          พรอมต์ภาษาอังกฤษ (Prompt Expert)
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[#64748B] dark:text-slate-400 line-clamp-3">
                          {img.enhancedPrompt}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenInEditor(lb)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 text-xs font-medium text-white hover:bg-[#1D4ED8] cursor-pointer"
                        >
                          <Sliders className="h-3.5 w-3.5" />
                          <span>แก้ไข</span>
                        </button>
                        <button
                          type="button"
                          disabled={downloadingId === img.key}
                          onClick={async () => {
                            setDownloadingId(img.key);
                            try {
                              await downloadUrlAsPng(img.imageUrl, `zimage-${img.rawId}`);
                            } finally {
                              setDownloadingId(null);
                            }
                          }}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 text-xs font-medium text-[#101820] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>PNG</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {img.source === 'firestore' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === img.key}
                              onClick={async () => {
                                setBusyId(img.key);
                                try {
                                  await onChangeVisibility(
                                    img.rawId,
                                    img.visibility === 'featured' ? 'private' : 'featured'
                                  );
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              aria-label="แนะนำขึ้นแกลเลอรี"
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer ${
                                img.visibility === 'featured'
                                  ? 'border-[#2563EB] bg-blue-50 dark:bg-[#0B1F3A] text-[#2563EB]'
                                  : 'border-[#E2E8F0] dark:border-slate-700 text-[#64748B] dark:text-slate-400'
                              }`}
                            >
                              <Star className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              disabled={busyId === img.key}
                              onClick={async () => {
                                setBusyId(img.key);
                                try {
                                  await onChangeVisibility(
                                    img.rawId,
                                    img.visibility === 'hidden' ? 'private' : 'hidden'
                                  );
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              aria-label="ซ่อนภาพ"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 text-[#64748B] dark:text-slate-400 cursor-pointer"
                            >
                              {img.visibility === 'hidden' ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                          </>
                        )}

                        {confirmDeleteId === img.key ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busyId === img.key}
                              onClick={async () => {
                                setBusyId(img.key);
                                try {
                                  if (img.source === 'firestore') {
                                    await onDeleteImage(img.rawId);
                                  } else {
                                    await onDeleteServerArchive(img.rawId);
                                  }
                                } finally {
                                  setBusyId(null);
                                  setConfirmDeleteId(null);
                                }
                              }}
                              className="h-8 rounded-lg bg-red-600 px-2 text-[11px] font-semibold text-white hover:bg-red-700 cursor-pointer"
                            >
                              ลบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="h-8 rounded-lg border border-[#E2E8F0] dark:border-slate-700 px-2 text-[11px] cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(img.key)}
                            aria-label={`ลบภาพของ ${img.ownerName}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 text-[#64748B] hover:border-red-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] shadow-sm">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-400">
                  <th className="px-4 py-3 font-semibold">ภาพ</th>
                  <th className="px-4 py-3 font-semibold">คำอธิบาย &amp; พรอมต์</th>
                  <th className="px-4 py-3 font-semibold">ผู้สร้าง / โมเดล</th>
                  <th className="px-4 py-3 font-semibold text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {filteredImages.map((img) => {
                  const lb = toLightboxData(img);
                  return (
                    <tr key={img.key} className="hover:bg-[#F7F9FC] dark:hover:bg-[#0B1F3A]/50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenLightbox(lb)}
                          className="block h-16 w-22 overflow-hidden rounded-lg border border-[#E2E8F0] dark:border-slate-700 cursor-pointer"
                        >
                          <img src={img.imageUrl} alt={img.originalPrompt} className="h-full w-full object-cover" />
                        </button>
                      </td>
                      <td className="px-4 py-3 max-w-md space-y-1">
                        <p className="font-medium text-[#101820] dark:text-[#F8FAFC]">{img.originalPrompt}</p>
                        <p className="text-[#64748B] dark:text-slate-400 leading-relaxed line-clamp-2">{img.enhancedPrompt}</p>
                        <p className="text-[11px] text-[#64748B] font-mono-tabular">
                          {img.dimensionsLabel || img.aspectRatio} · {img.stylePreset} · {img.dateLabel}
                        </p>
                      </td>
                      <td className="px-4 py-3 space-y-0.5">
                        <p className="font-medium text-[#101820] dark:text-[#F8FAFC]">{img.ownerName}</p>
                        <p className="text-[11px] text-[#64748B] font-mono-tabular">
                          {img.ownerEmail || (img.ownerType === 'guest' ? 'Guest' : img.ownerId)}
                        </p>
                        <p className="text-[11px] text-[#64748B] font-mono-tabular">{img.model}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenInEditor(lb)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 font-medium text-white hover:bg-[#1D4ED8] cursor-pointer"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadUrlAsPng(img.imageUrl, `zimage-${img.rawId}`)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 px-2.5 font-medium cursor-pointer"
                          >
                            PNG
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (img.source === 'firestore') await onDeleteImage(img.rawId);
                              else await onDeleteServerArchive(img.rawId);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 text-[#64748B] hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* TAB 2: REQUESTS TIMELINE */}
      {sectionTab === 'requests' && (
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-6 space-y-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#2563EB] dark:text-[#60A5FA]" />
              <div>
                <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                  ไทม์ไลน์จดหมายคำขอถึงเจ้าหน้าที่ทั้งหมด
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  อัปเดตสถานะและตอบกลับผู้ใช้ได้ทันที
                </p>
              </div>
            </div>
            <div className="text-xs font-mono-tabular text-[#64748B] dark:text-slate-400">
              รวม {unifiedRequests.length} ฉบับ · คะแนนเฉลี่ย {avgRating} ดาว
            </div>
          </div>

          {unifiedRequests.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#64748B] dark:text-slate-400">
              ยังไม่มีคำขอหรือข้อเสนอแนะจากผู้ใช้ในขณะนี้
            </div>
          ) : (
            <ol className="space-y-4">
              {unifiedRequests.map((req) => {
                const currentStatus = draftStatuses[req.key] || req.status;
                const currentNote =
                  draftNotes[req.key] !== undefined ? draftNotes[req.key] : req.adminNote;

                return (
                  <li
                    key={req.key}
                    className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-sm font-bold text-[#101820] dark:text-[#F8FAFC]">
                          {req.subject}
                        </h3>
                        <p className="text-xs text-[#64748B] dark:text-slate-400 font-mono-tabular">
                          จาก {req.authorName} · วันที่ {req.dateKey}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-mono-tabular font-semibold text-amber-500">
                        {Array.from({ length: 5 }, (_, idx) => (
                          <Star
                            key={idx}
                            className={`h-3.5 w-3.5 ${
                              idx < req.rating ? 'fill-amber-400 text-amber-500' : 'text-slate-300 dark:text-slate-600'
                            }`}
                          />
                        ))}
                        <span className="ml-1 text-[#101820] dark:text-[#F8FAFC]">{req.rating}/5</span>
                      </div>
                    </div>

                    <p className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] p-3 text-xs leading-relaxed text-[#101820] dark:text-slate-200 whitespace-pre-wrap">
                      {req.message}
                    </p>

                    <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400 mb-1">
                          สถานะบนไทม์ไลน์
                        </label>
                        <select
                          value={currentStatus}
                          onChange={(e) =>
                            setDraftStatuses((prev) => ({
                              ...prev,
                              [req.key]: e.target.value as RequestStatus,
                            }))
                          }
                          className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-2.5 py-2 text-xs font-medium text-[#101820] dark:text-[#F8FAFC]"
                        >
                          {REQUEST_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400 mb-1">
                          ข้อความตอบกลับจากเจ้าหน้าที่
                        </label>
                        <input
                          type="text"
                          value={currentNote}
                          onChange={(e) =>
                            setDraftNotes((prev) => ({
                              ...prev,
                              [req.key]: e.target.value,
                            }))
                          }
                          placeholder="เช่น รับเรื่องแล้ว กำลังพัฒนา..."
                          className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 py-2 text-xs text-[#101820] dark:text-[#F8FAFC]"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === req.key}
                          onClick={async () => {
                            setBusyId(req.key);
                            try {
                              await onUpdateRequestStatus(req.source, req.rawId, currentStatus, currentNote);
                              setSavedRequestKey(req.key);
                              setTimeout(() => setSavedRequestKey(null), 1800);
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#2563EB] px-3.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50"
                        >
                          {savedRequestKey === req.key ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>บันทึกแล้ว</span>
                            </>
                          ) : (
                            <span>อัปเดต</span>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={busyId === req.key}
                          onClick={async () => {
                            setBusyId(req.key);
                            try {
                              await onDeleteRequest(req.source, req.rawId);
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          aria-label="ลบคำขอนี้"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] text-[#64748B] hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {/* TAB 3: OVERVIEW */}
      {sectionTab === 'overview' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'สมาชิกที่ยืนยันบัญชีทั้งหมด', val: overviewMetrics?.totalUsers ?? 0 },
            { label: 'สมาชิกที่กำลัง Trial / Bonus', val: overviewMetrics?.activeTrials ?? 0 },
            { label: 'บัญชีที่ถูกระงับ (Suspended)', val: overviewMetrics?.suspendedUsers ?? 0 },
            { label: 'การชวนเพื่อนที่ยืนยันแล้ว', val: overviewMetrics?.qualifiedReferrals ?? 0 },
            { label: 'งาน AI ที่ประมวลผลทั้งหมด', val: overviewMetrics?.totalAiJobs ?? 0 },
            { label: 'งาน AI ที่ล้มเหลว', val: overviewMetrics?.failedAiJobs ?? 0 },
            { label: 'ภาพบน Archive เซิร์ฟเวอร์', val: overviewMetrics?.totalArchiveImages ?? 0 },
            { label: 'ภาพบน Firestore Vault', val: allImages.length },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 shadow-sm"
            >
              <p className="text-xs text-[#64748B] dark:text-slate-400">{stat.label}</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#101820] dark:text-[#F8FAFC] mt-1">
                {stat.val}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: USERS & TRIAL / RBAC MANAGEMENT */}
      {sectionTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="ค้นหาอีเมล ชื่อ หรือรหัสเชิญ..."
                className="w-full rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] py-2 pl-9 pr-3 text-xs text-[#101820] dark:text-[#F8FAFC]"
              />
            </div>
            <button
              type="button"
              onClick={loadControlCenterData}
              className="rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-3 py-2 text-xs font-medium cursor-pointer"
            >
              ค้นหา / รีเฟรชรายชื่อ
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:items-start">
            <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] shadow-sm">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] text-[#64748B] dark:text-slate-400">
                    <th className="px-4 py-3 font-semibold">ผู้ใช้</th>
                    <th className="px-4 py-3 font-semibold">บทบาท · แพ็กเกจ</th>
                    <th className="px-4 py-3 font-semibold">สิทธิ์ 72h &amp; ชวนเพื่อน</th>
                    <th className="px-4 py-3 font-semibold text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                  {controlUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-[#64748B]">
                        ยังไม่มีบัญชีที่ลงทะเบียนผ่าน Entitlement API (แสดงจาก Firestore: {members.length} บัญชี)
                      </td>
                    </tr>
                  ) : (
                    controlUsers.map((u) => {
                      const access = computeEffectiveAccessStatus(u);
                      const isSelected = selectedUserUid === u.uid;
                      return (
                        <tr
                          key={u.uid}
                          className={`hover:bg-[#F7F9FC] dark:hover:bg-[#0B1F3A]/60 ${
                            isSelected ? 'bg-blue-50/60 dark:bg-[#0B1F3A]' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#101820] dark:text-[#F8FAFC]">{u.displayName}</p>
                            <p className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
                              {u.email}
                            </p>
                            <p className="text-[10px] font-mono-tabular text-[#64748B]">
                              Code: {u.referralCode} · Usage: {u.usageCountTotal}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                              {u.role.toUpperCase()} · {u.plan.toUpperCase()}
                            </p>
                            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                              {u.suspended ? 'ถูกระงับ (Suspended)' : access.remainingLabel}
                            </p>
                          </td>
                          <td className="px-4 py-3 font-mono-tabular text-[11px] text-[#64748B] dark:text-slate-400">
                            <p>โบนัส +{u.bonusDaysTotal} วัน</p>
                            <p>
                              เชิญเดือนนี้ {u.monthlyInviteCount}/5
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedUserUid(u.uid)}
                              className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
                            >
                              ควบคุม
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Selected User Action Drawer */}
            <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-4 shadow-sm">
              {selectedControlUser ? (
                <>
                  <div className="border-b border-[#E2E8F0] dark:border-slate-800 pb-3">
                    <h3 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                      จัดการบัญชี: {selectedControlUser.displayName}
                    </h3>
                    <p className="text-xs text-[#64748B] dark:text-slate-400">
                      {selectedControlUser.email} · UID: {selectedControlUser.uid}
                    </p>
                    <p className="text-[11px] font-mono-tabular text-[#64748B] mt-1">
                      หมดอายุ Trial (Bangkok): {formatBangkokDateTime(selectedControlUser.trialExpiresAtUtc)} · Session v{selectedControlUser.sessionVersion}
                    </p>
                  </div>

                  {/* Trial & Bonus Days */}
                  <div className="space-y-2">
                    <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                      ปรับวันใช้งาน / รีเซ็ตสิทธิ์
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={customDaysInput}
                        onChange={(e) => setCustomDaysInput(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 font-mono-tabular text-xs"
                      />
                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(
                            selectedControlUser.uid,
                            { action: 'add-days', days: customDaysInput },
                            `เพิ่มวันใช้งาน +${customDaysInput} วันแล้ว`
                          )
                        }
                        className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        +เพิ่มวัน
                      </button>
                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(
                            selectedControlUser.uid,
                            { action: 'subtract-days', days: customDaysInput },
                            `ลดวันใช้งาน -${customDaysInput} วันแล้ว`
                          )
                        }
                        className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 px-3 py-1.5 text-xs font-medium cursor-pointer"
                      >
                        -ลดวัน
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(
                            selectedControlUser.uid,
                            { action: 'reset-trial-72h' },
                            'รีเซ็ต Trial 72 ชม. ใหม่แล้ว'
                          )
                        }
                        className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-2 text-[11px] font-medium cursor-pointer"
                      >
                        รีเซ็ต Trial 72 ชม.
                      </button>
                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(
                            selectedControlUser.uid,
                            { action: 'expire-now' },
                            'ตั้งค่าสิทธิ์หมดอายุทันทีแล้ว'
                          )
                        }
                        className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-2.5 py-2 text-[11px] font-medium text-red-700 dark:text-red-300 cursor-pointer"
                      >
                        Expire ทันที
                      </button>
                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(
                            selectedControlUser.uid,
                            { action: 'reset-usage-only' },
                            'รีเซ็ตโควตาใช้งานอย่างเดียวเรียบร้อย'
                          )
                        }
                        className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-2 text-[11px] font-medium cursor-pointer"
                      >
                        รีเซ็ตโควตาใช้งานอย่างเดียว
                      </button>
                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(
                            selectedControlUser.uid,
                            { action: 'reset-referral-only' },
                            'รีเซ็ตสิทธิ์ชวนเพื่อนอย่างเดียวเรียบร้อย'
                          )
                        }
                        className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-2 text-[11px] font-medium cursor-pointer"
                      >
                        รีเซ็ตสิทธิ์ชวนเพื่อนอย่างเดียว
                      </button>
                    </div>
                  </div>

                  {/* Plan & Daily Quota */}
                  <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                    <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                      แพ็กเกจ (Plan) &amp; โควตารายวันเฉพาะบุคคล
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['trial', 'free', 'pro', 'custom'] as PlanTier[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          disabled={controlBusy}
                          onClick={() =>
                            runUserAction(selectedControlUser.uid, { action: 'set-plan', plan: p }, `เปลี่ยนแพ็กเกจเป็น ${p.toUpperCase()} แล้ว`)
                          }
                          className={`rounded-lg border py-1.5 text-[11px] font-semibold uppercase cursor-pointer ${
                            selectedControlUser.plan === p
                              ? 'border-[#2563EB] bg-[#2563EB] text-white'
                              : 'border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A]'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        placeholder="เช่น 50 (ว่าง=ค่าเริ่มต้น)"
                        value={dailyQuotaInput}
                        onChange={(e) => setDailyQuotaInput(e.target.value)}
                        className="flex-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(
                            selectedControlUser.uid,
                            {
                              action: 'set-daily-quota',
                              dailyQuotaOverride: dailyQuotaInput.trim() ? Number(dailyQuotaInput) : null,
                            },
                            'อัปเดตโควตารายวันแล้ว'
                          )
                        }
                        className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        ตั้งโควตา
                      </button>
                    </div>
                  </div>

                  {/* Feature Toggles */}
                  <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                    <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
                      เปิด/ปิดฟีเจอร์เฉพาะบุคคล
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { key: 'aiGeneration', label: 'AI เจนภาพ' },
                          { key: 'aiDecompose', label: 'AI แยกเลเยอร์' },
                          { key: 'proEditor', label: 'Pro Editor' },
                          { key: 'videoEditor', label: 'Video Editor' },
                          { key: 'psdExport', label: 'ส่งออก .PSD' },
                        ] as const
                      ).map((feat) => {
                        const enabled = selectedControlUser.featureOverrides[feat.key] !== false;
                        return (
                          <button
                            key={feat.key}
                            type="button"
                            disabled={controlBusy}
                            onClick={() =>
                              runUserAction(
                                selectedControlUser.uid,
                                { action: 'toggle-feature', featureKey: feat.key, featureValue: !enabled },
                                `อัปเดตสิทธิ์ ${feat.label} แล้ว`
                              )
                            }
                            className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium cursor-pointer ${
                              enabled
                                ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                : 'border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                            }`}
                          >
                            {feat.label}: {enabled ? 'เปิด' : 'ปิด'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Suspend / Restore / Force Logout */}
                  <div className="flex flex-wrap gap-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                    {selectedControlUser.suspended ? (
                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(selectedControlUser.uid, { action: 'restore' }, 'ปลดระงับบัญชีแล้ว')
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        <span>ปลดระงับ (Restore)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(
                            selectedControlUser.uid,
                            { action: 'suspend', reason: 'Admin suspended account' },
                            'ระงับการใช้งานบัญชีแล้ว'
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        <span>ระงับบัญชี (Suspend)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={controlBusy}
                      onClick={() =>
                        runUserAction(
                          selectedControlUser.uid,
                          { action: 'force-logout' },
                          'สั่ง Force Logout สำเร็จ (บัญชีจะต้องเข้าสู่ระบบใหม่)'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Force Logout</span>
                    </button>
                  </div>

                  {/* Owner-Only RBAC Role & Admin Menu Permissions */}
                  {isOwner && (
                    <div className="space-y-2 border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
                      <span className="block text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                        Owner RBAC: กำหนดบทบาท &amp; สิทธิ์เมนูแอดมิน
                      </span>
                      <select
                        value={draftRole}
                        onChange={(e) => setDraftRole(e.target.value as UserRole)}
                        className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs"
                      >
                        {(['user', 'moderator', 'admin', 'owner'] as UserRole[]).map((r) => (
                          <option key={r} value={r}>
                            {r.toUpperCase()}
                          </option>
                        ))}
                      </select>

                      <div className="grid grid-cols-2 gap-1.5">
                        {ALL_ADMIN_PERMISSIONS.map((perm) => {
                          const checked = draftPerms.includes(perm);
                          return (
                            <label key={perm} className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setDraftPerms((prev) =>
                                    e.target.checked ? [...prev, perm] : prev.filter((p) => p !== perm)
                                  )
                                }
                                className="accent-[#2563EB]"
                              />
                              <span>{perm}</span>
                            </label>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        disabled={controlBusy}
                        onClick={() =>
                          runUserAction(
                            selectedControlUser.uid,
                            { action: 'set-role-permissions', role: draftRole, adminPermissions: draftPerms },
                            'อัปเดตบทบาทและสิทธิ์เมนูแอดมินเรียบร้อย'
                          )
                        }
                        className="w-full rounded-lg bg-[#2563EB] py-2 text-xs font-semibold text-white cursor-pointer"
                      >
                        บันทึกสิทธิ์ RBAC
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  คลิกปุ่ม &ldquo;ควบคุม&rdquo; ที่รายชื่อสมาชิกทางซ้ายเพื่อเพิ่ม/ลดวันใช้งาน รีเซ็ต Trial รีเซ็ตโควตา ตั้งค่าฟีเจอร์ หรือกำหนดสิทธิ์แอดมิน
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: REFERRALS & CSV */}
      {sectionTab === 'referrals' && (
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
                สมุดบัญชีชวนเพื่อนทั้งหมด ({referralsList.length} รายการ)
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                ตรวจสอบรหัสแนะนำ ขั้นบันไดโบนัส เรียกคืนสิทธิ์ (Clawback) หรือส่งออก CSV
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadReferralsCsv}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>ส่งออก CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">ผู้เชิญ</th>
                  <th className="py-2 px-3 font-medium">ผู้ถูกเชิญ</th>
                  <th className="py-2 px-3 font-medium">ขั้นที่ · วัน</th>
                  <th className="py-2 px-3 font-medium">สถานะ</th>
                  <th className="py-2 px-3 font-medium">เวลา</th>
                  <th className="py-2 pl-3 text-right font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {referralsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#64748B]">
                      ยังไม่มีประวัติการใช้รหัสแนะนำในระบบ
                    </td>
                  </tr>
                ) : (
                  referralsList.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-3">{r.inviterEmail}</td>
                      <td className="py-2.5 px-3">{r.inviteeEmail}</td>
                      <td className="py-2.5 px-3 font-mono-tabular">
                        #{r.milestoneStep} · +{r.deltaDaysGranted} วัน
                      </td>
                      <td className="py-2.5 px-3">
                        {r.status === 'qualified' ? 'ยืนยันแล้ว' : r.status === 'clawed_back' ? 'เรียกคืนแล้ว' : r.status}
                      </td>
                      <td className="py-2.5 px-3 text-[#64748B]">{formatBangkokDateTime(r.createdAtUtc)}</td>
                      <td className="py-2.5 pl-3 text-right">
                        {r.status === 'qualified' ? (
                          <button
                            type="button"
                            disabled={controlBusy}
                            onClick={() => handleClawbackReferral(r.id)}
                            className="rounded-lg border border-red-200 dark:border-red-900 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            Clawback
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 6: AI JOBS */}
      {sectionTab === 'jobs' && (
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-3 shadow-sm">
          <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
            ประวัติการเรียกใช้ AI ทั้งระบบ ({jobsList.length} รายการ)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">ผู้ใช้</th>
                  <th className="py-2 px-3 font-medium">ประเภท · โมเดล</th>
                  <th className="py-2 px-3 font-medium">คำสั่งย่อ</th>
                  <th className="py-2 px-3 font-medium">สถานะ · เวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {jobsList.map((j) => (
                  <tr key={j.id}>
                    <td className="py-2.5 pr-3">{j.actorEmail || j.actorName}</td>
                    <td className="py-2.5 px-3 font-mono-tabular text-[11px]">
                      {j.type} · {j.model}
                    </td>
                    <td className="py-2.5 px-3 max-w-sm truncate">{j.promptPreview}</td>
                    <td className="py-2.5 px-3 text-[11px] text-[#64748B]">
                      {j.status} {j.durationMs ? `· ${(j.durationMs / 1000).toFixed(1)}s` : ''} ·{' '}
                      {formatBangkokDateTime(j.createdAtUtc)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 7: SYSTEM SETTINGS */}
      {sectionTab === 'settings' && settingsState && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-6 space-y-5 shadow-sm max-w-2xl"
        >
          <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
            ตั้งค่าระบบกลาง · Trial 72h &amp; AI Feature Toggles
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-xs">
              <span className="text-[#64748B] dark:text-slate-400">ชั่วโมง Trial เริ่มต้น (UTC)</span>
              <input
                type="number"
                min={1}
                max={720}
                value={settingsState.trialHours}
                onChange={(e) =>
                  setSettingsState({ ...settingsState, trialHours: Number(e.target.value) || 72 })
                }
                className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 font-mono-tabular"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-[#64748B] dark:text-slate-400">เพดานชวนเพื่อน/เดือน</span>
              <input
                type="number"
                min={1}
                max={50}
                value={settingsState.monthlyInviteCap}
                onChange={(e) =>
                  setSettingsState({ ...settingsState, monthlyInviteCap: Number(e.target.value) || 5 })
                }
                className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 font-mono-tabular"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-[#64748B] dark:text-slate-400">โควตารายวัน (Guest/Default)</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={settingsState.defaultDailyLimit}
                onChange={(e) =>
                  setSettingsState({ ...settingsState, defaultDailyLimit: Number(e.target.value) || 30 })
                }
                className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 font-mono-tabular"
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[#101820] dark:text-[#F8FAFC]">
              การเปิดใช้งานฟีเจอร์ระบบ
            </span>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsState.allowGuestGeneration}
                  onChange={(e) =>
                    setSettingsState({ ...settingsState, allowGuestGeneration: e.target.checked })
                  }
                  className="accent-[#2563EB]"
                />
                <span>อนุญาตผู้เยี่ยมชม (Guest) สร้างภาพทดลอง</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsState.maintenanceMode}
                  onChange={(e) =>
                    setSettingsState({ ...settingsState, maintenanceMode: e.target.checked })
                  }
                  className="accent-[#2563EB]"
                />
                <span>เปิดโหมดบำรุงรักษาระบบ (Maintenance Mode)</span>
              </label>
              {(
                [
                  { key: 'aiGeneration', label: 'เปิด AI เจนภาพ' },
                  { key: 'aiDecompose', label: 'เปิด AI แยกเลเยอร์' },
                  { key: 'promptEnhancer', label: 'เปิด Prompt Expert' },
                  { key: 'videoEditor', label: 'เปิด Video Editor' },
                  { key: 'psdExport', label: 'เปิดส่งออกไฟล์ .PSD' },
                ] as const
              ).map((item) => (
                <label key={item.key} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsState.aiFeaturesEnabled[item.key]}
                    onChange={(e) =>
                      setSettingsState({
                        ...settingsState,
                        aiFeaturesEnabled: {
                          ...settingsState.aiFeaturesEnabled,
                          [item.key]: e.target.checked,
                        },
                      })
                    }
                    className="accent-[#2563EB]"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block space-y-1 text-xs">
            <span className="text-[#64748B] dark:text-slate-400">ข้อความประกาศบำรุงรักษา (ถ้ามี)</span>
            <input
              type="text"
              value={settingsState.maintenanceBanner}
              onChange={(e) => setSettingsState({ ...settingsState, maintenanceBanner: e.target.value })}
              className="w-full rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 text-xs"
            />
          </label>

          <button
            type="submit"
            disabled={controlBusy}
            className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer disabled:opacity-50"
          >
            บันทึกการตั้งค่าระบบ
          </button>
        </form>
      )}

      {/* TAB 8: AUDIT LOGS */}
      {sectionTab === 'audit' && (
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-3 shadow-sm">
          <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
            บันทึกการตรวจสอบ (Audit Logs · {auditList.length} รายการ)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">ผู้ดำเนินการ</th>
                  <th className="py-2 px-3 font-medium">การกระทำ</th>
                  <th className="py-2 px-3 font-medium">รายละเอียด</th>
                  <th className="py-2 pl-3 font-medium">เวลา (Bangkok)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {auditList.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-3">
                      {log.actorEmail} ({log.actorRole})
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-[#2563EB] dark:text-[#60A5FA]">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-3">{log.summary}</td>
                    <td className="py-2.5 pl-3 text-[#64748B]">{formatBangkokDateTime(log.timestampUtc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
