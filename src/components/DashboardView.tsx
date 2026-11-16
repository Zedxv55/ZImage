import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Bookmark,
  Check,
  Clock,
  Copy,
  Gift,
  History,
  Layers,
  LogIn,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import type { SavedPromptRecord, StudioProjectRecord } from '../lib/firebase';
import type { AspectRatioId, StylePresetId } from '../utils/promptLogic';
import {
  DEFAULT_MONTHLY_INVITE_CAP,
  REFERRAL_MILESTONE_TOTAL_DAYS,
  computeEffectiveAccessStatus,
  formatBangkokDateTime,
} from '../utils/trialReferralRules';
import type { EntitlementState } from '../utils/trialReferralRules';

export interface DashboardReferralRecord {
  id: string;
  inviterUid: string;
  inviterEmail: string;
  inviteeUid: string;
  inviteeEmail: string;
  referralCode: string;
  monthKey: string;
  milestoneStep: number;
  deltaDaysGranted: number;
  status: 'qualified' | 'clawed_back' | 'rejected';
  createdAtUtc: string;
}

export interface DashboardAiJobRecord {
  id: string;
  type: 'enhance-prompt' | 'generate-image' | 'decompose-image' | 'analyze-image';
  status: 'queued' | 'running' | 'completed' | 'failed';
  model: string;
  promptPreview: string;
  fullPrompt?: string;
  stylePreset?: StylePresetId;
  aspectRatio?: AspectRatioId;
  durationMs?: number;
  errorMessage?: string;
  createdAtUtc: string;
}

interface DashboardViewProps {
  user: User | null;
  entitlement: EntitlementState | null;
  referralHistory: DashboardReferralRecord[];
  recentJobs: DashboardAiJobRecord[];
  savedPrompts: SavedPromptRecord[];
  studioProjects: StudioProjectRecord[];
  loading: boolean;
  onSignIn: () => void;
  onRefreshEntitlement: () => Promise<void>;
  onClaimReferralCode: (code: string) => Promise<{ ok: boolean; message: string }>;
  onLoadSavedPrompt: (item: SavedPromptRecord) => void;
  onDeleteSavedPrompt: (id: string) => Promise<void>;
  onOpenStudioProject: (item: StudioProjectRecord) => void;
  onDeleteStudioProject: (id: string) => Promise<void>;
  onRerunPrompt: (prompt: string, stylePreset?: StylePresetId, aspectRatio?: AspectRatioId) => void;
}

function formatCountdownSeconds(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const hh = String(hrs).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return days > 0 ? `${days} วัน ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export function DashboardView({
  user,
  entitlement,
  referralHistory,
  recentJobs,
  savedPrompts,
  studioProjects,
  loading,
  onSignIn,
  onRefreshEntitlement,
  onClaimReferralCode,
  onLoadSavedPrompt,
  onDeleteSavedPrompt,
  onOpenStudioProject,
  onDeleteStudioProject,
  onRerunPrompt,
}: DashboardViewProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [claimCodeInput, setClaimCodeInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Live 1-second timer for 72h UTC Trial & Bonus countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const accessSummary = useMemo(() => {
    if (!entitlement) return null;
    return computeEffectiveAccessStatus(entitlement, nowMs);
  }, [entitlement, nowMs]);

  if (!user) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-8 text-center space-y-4 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-[#0B1F3A] text-[#2563EB] dark:text-[#60A5FA]">
            <Users className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#101820] dark:text-[#F8FAFC]">
            แดชบอร์ดสมาชิก · สิทธิ์ทดลอง 72 ชม. &amp; ชวนเพื่อนรับวันเพิ่ม
          </h1>
          <p className="mx-auto max-w-lg text-sm text-[#64748B] dark:text-slate-400">
            เข้าสู่ระบบด้วย Google เพื่อดูนับถอยหลังสิทธิ์ทดลองใช้งาน 72 ชั่วโมง (UTC) รับรหัสแนะนำเพื่อนสูงสุด 5 คน/เดือน
            (โบนัสสูงสุด +32 วัน) รวมถึงจัดการพรอมต์ที่บันทึก โปรเจกต์สตูดิโอ และประวัติงาน AI ทั้งหมด
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#2563EB] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
          >
            <LogIn className="h-4 w-4" />
            <span>เข้าสู่ระบบด้วย Google</span>
          </button>
        </div>
      </div>
    );
  }

  const inviteUrl =
    entitlement?.referralCode && typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${encodeURIComponent(entitlement.referralCode)}`
      : '';

  const handleCopy = async (text: string, which: 'code' | 'link') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'code') {
        setCopiedCode(true);
        window.setTimeout(() => setCopiedCode(false), 1800);
      } else {
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 1800);
      }
    } catch {
      // ignore clipboard errors
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = claimCodeInput.trim().toUpperCase();
    if (!trimmed) return;
    setClaiming(true);
    setClaimFeedback(null);
    try {
      const res = await onClaimReferralCode(trimmed);
      setClaimFeedback({ ok: res.ok, msg: res.message });
      if (res.ok) setClaimCodeInput('');
    } finally {
      setClaiming(false);
    }
  };

  const milestoneSteps = [1, 2, 3, 4, 5];
  const currentMonthlyCount = entitlement?.monthlyInviteCount || 0;

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#101820] dark:text-[#F8FAFC]">
            แดชบอร์ดบัญชี &amp; คลังสร้างสรรค์
          </h1>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            {user.displayName || user.email} · {user.email}
            {entitlement ? ` · บทบาท ${entitlement.role.toUpperCase()} · แพ็กเกจ ${entitlement.plan.toUpperCase()}` : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing || loading}
          onClick={async () => {
            setRefreshing(true);
            try {
              await onRefreshEntitlement();
            } finally {
              setRefreshing(false);
            }
          }}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-[#101820] px-4 py-2 text-xs font-semibold text-[#101820] dark:text-slate-200 hover:bg-[#F7F9FC] dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>อัปเดตสถานะล่าสุด</span>
        </button>
      </div>

      {/* Top Metrics & Trial Countdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Card 1: 72h Trial + Bonus Expiry Countdown */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
              <Clock className="h-4 w-4" />
              <span>สถานะสิทธิ์ทดลอง 72 ชม. (UTC)</span>
            </span>
            <span className="font-mono-tabular text-xs font-semibold text-[#64748B] dark:text-slate-400">
              {accessSummary?.status === 'active_admin'
                ? 'ผู้ดูแล'
                : accessSummary?.status === 'active_pro'
                  ? 'PRO'
                  : accessSummary?.isActive
                    ? 'ใช้งานได้'
                    : 'หมดอายุ'}
            </span>
          </div>

          <div className="font-mono-tabular text-2xl font-bold text-[#101820] dark:text-[#F8FAFC]">
            {accessSummary
              ? accessSummary.remainingMs === Number.MAX_SAFE_INTEGER
                ? 'ไม่หมดอายุ'
                : accessSummary.isActive
                  ? formatCountdownSeconds(accessSummary.remainingMs)
                  : 'หมดเวลาทดลองแล้ว'
              : loading
                ? 'กำลังโหลด...'
                : '—'}
          </div>

          {entitlement && (
            <div className="space-y-1 text-[11px] text-[#64748B] dark:text-slate-400 border-t border-[#E2E8F0] dark:border-slate-800 pt-2.5">
              <p>
                เวลาหมดอายุสุทธิ (Bangkok):{' '}
                <span className="font-medium text-[#101820] dark:text-slate-200">
                  {accessSummary?.effectiveExpiresAtMs &&
                  accessSummary.effectiveExpiresAtMs < Number.MAX_SAFE_INTEGER
                    ? formatBangkokDateTime(new Date(accessSummary.effectiveExpiresAtMs).toISOString())
                    : 'ต่อเนื่อง (ไม่มีวันหมดอายุ)'}
                </span>
              </p>
              <p className="font-mono-tabular">
                UTC Trial End: {entitlement.trialExpiresAtUtc.slice(0, 19).replace('T', ' ')}Z · วันโบนัสสะสม:{' '}
                +{entitlement.bonusDaysTotal} วัน
              </p>
            </div>
          )}
        </section>

        {/* Card 2: Usage & Quota */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
            <Sparkles className="h-4 w-4" />
            <span>โควตา &amp; สถิติการสร้างสรรค์</span>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-xl bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3">
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">งานที่สร้างสะสม</p>
              <p className="font-mono-tabular text-xl font-bold text-[#101820] dark:text-[#F8FAFC] mt-0.5">
                {entitlement?.usageCountTotal ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3">
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">พรอมต์ &amp; โปรเจกต์ที่เก็บ</p>
              <p className="font-mono-tabular text-xl font-bold text-[#101820] dark:text-[#F8FAFC] mt-0.5">
                {savedPrompts.length} · {studioProjects.length}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-[#64748B] dark:text-slate-400">
            โควตารายวัน:{' '}
            {entitlement?.dailyQuotaOverride != null
              ? `${entitlement.dailyQuotaOverride} ภาพ/วัน (กำหนดพิเศษ)`
              : 'ตามแผนการใช้งานมาตรฐาน'}
            {' · '}เครื่องมือแต่งภาพ/วิดีโอ/PSD ฝั่งเบราว์เซอร์ใช้งานได้ฟรีไม่จำกัด
          </p>
        </section>

        {/* Card 3: Referral Code & Claim */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
              <Gift className="h-4 w-4" />
              <span>รหัสแนะนำเพื่อนของคุณ</span>
            </span>
            <span className="font-mono-tabular text-xs text-[#64748B] dark:text-slate-400">
              เดือนนี้ {currentMonthlyCount} / {DEFAULT_MONTHLY_INVITE_CAP} คน
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-3 py-2 font-mono-tabular text-sm font-bold text-[#101820] dark:text-[#F8FAFC]">
              {entitlement?.referralCode || '—'}
            </div>
            <button
              type="button"
              onClick={() => handleCopy(entitlement?.referralCode || '', 'code')}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-[#E2E8F0] dark:border-slate-700 px-3 text-xs font-medium text-[#101820] dark:text-slate-200 hover:bg-[#F7F9FC] dark:hover:bg-slate-800 cursor-pointer"
            >
              {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedCode ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleCopy(inviteUrl, 'link')}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-[#2563EB] px-3 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'คัดลอกลิงก์แล้ว' : 'ลิงก์เชิญ'}</span>
            </button>
          </div>

          {!entitlement?.referredByUid ? (
            <form onSubmit={handleClaimSubmit} className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={claimCodeInput}
                onChange={(e) => setClaimCodeInput(e.target.value)}
                placeholder="กรอกรหัสแนะนำจากเพื่อน (เช่น ZI-...)"
                className="flex-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-[#F7F9FC] dark:bg-[#0B1F3A] px-2.5 py-1.5 text-xs text-[#101820] dark:text-[#F8FAFC]"
              />
              <button
                type="submit"
                disabled={claiming || !claimCodeInput.trim()}
                className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-40 cursor-pointer"
              >
                {claiming ? 'ตรวจสอบ...' : 'ใช้รหัส'}
              </button>
            </form>
          ) : (
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              บัญชีนี้เชื่อมต่อรหัสผู้แนะนำแล้ว ({entitlement.referredByCode || 'ยืนยันแล้ว'})
            </p>
          )}

          {claimFeedback && (
            <p
              className={`text-[11px] font-medium ${
                claimFeedback.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {claimFeedback.msg}
            </p>
          )}
        </section>
      </div>

      {/* Milestone Step Tracker (1→1d, 2→4d, 3→8d, 4→16d, 5→32d) */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
              ตารางขั้นบันไดโบนัสชวนเพื่อนรายเดือน (Non-Stacking Milestone สูงสุด 5 คน/เดือน)
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              ชวนเพื่อนยืนยันบัญชี Google ครบขั้นบันไดรับวันใช้งานรวมสูงสุด 32 วัน/เดือน (วันโบนัสสะสมไม่ถูกลบเมื่อขึ้นเดือนใหม่)
            </p>
          </div>
          <span className="font-mono-tabular text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
            ความคืบหน้าเดือน {entitlement?.monthlyInviteMonthKey || '—'}: {currentMonthlyCount}/5
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {milestoneSteps.map((step) => {
            const reached = currentMonthlyCount >= step;
            const totalDays = REFERRAL_MILESTONE_TOTAL_DAYS[step];
            return (
              <div
                key={step}
                className={`rounded-xl border p-3 transition-colors ${
                  reached
                    ? 'border-[#2563EB] bg-blue-50/70 dark:bg-[#0B1F3A]'
                    : 'border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A]/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className={reached ? 'text-[#2563EB] dark:text-[#60A5FA]' : 'text-[#64748B] dark:text-slate-400'}>
                    คนที่ {step}
                  </span>
                  {reached && <Check className="h-3.5 w-3.5 text-[#2563EB] dark:text-[#60A5FA]" />}
                </div>
                <p className="font-mono-tabular text-lg font-bold text-[#101820] dark:text-[#F8FAFC] mt-1">
                  +{totalDays} วันรวม
                </p>
                <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                  {reached ? 'ปลดล็อกโบนัสแล้ว' : `เชิญอีก ${step - currentMonthlyCount} คน`}
                </p>
              </div>
            );
          })}
        </div>

        {referralHistory.length > 0 && (
          <div className="border-t border-[#E2E8F0] dark:border-slate-800 pt-3">
            <p className="text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] mb-2">
              ประวัติการชวนเพื่อนล่าสุด ({referralHistory.length} รายการ)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium">เพื่อนที่เชิญ</th>
                    <th className="py-2 px-3 font-medium">ขั้นที่</th>
                    <th className="py-2 px-3 font-medium">วันโบนัสที่ได้</th>
                    <th className="py-2 px-3 font-medium">สถานะ</th>
                    <th className="py-2 pl-3 font-medium">วันที่</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                  {referralHistory.slice(0, 10).map((ref) => (
                    <tr key={ref.id} className="text-[#101820] dark:text-slate-200">
                      <td className="py-2 pr-3">{ref.inviteeEmail}</td>
                      <td className="py-2 px-3 font-mono-tabular">#{ref.milestoneStep}</td>
                      <td className="py-2 px-3 font-mono-tabular">+{ref.deltaDaysGranted} วัน</td>
                      <td className="py-2 px-3">
                        {ref.status === 'qualified'
                          ? 'ยืนยันสำเร็จ'
                          : ref.status === 'clawed_back'
                            ? 'ถูกเรียกคืน'
                            : 'ไม่ผ่านเกณฑ์'}
                      </td>
                      <td className="py-2 pl-3 text-[#64748B] dark:text-slate-400">
                        {formatBangkokDateTime(ref.createdAtUtc)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Saved Prompts + Studio Projects */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Saved Prompts */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
              <Bookmark className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>คลังพรอมต์ส่วนตัว ({savedPrompts.length})</span>
            </h2>
          </div>

          {savedPrompts.length === 0 ? (
            <p className="rounded-xl bg-[#F7F9FC] dark:bg-[#0B1F3A] p-4 text-xs text-[#64748B] dark:text-slate-400">
              ยังไม่มีพรอมต์ที่บันทึกไว้ — กดปุ่ม &ldquo;บันทึกพรอมต์&rdquo; ในหน้า AI Studio เพื่อเก็บไว้ใช้ซ้ำได้ทันที
            </p>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {savedPrompts.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] truncate">{p.title}</p>
                      <p className="text-[11px] text-[#64748B] dark:text-slate-400 line-clamp-2 mt-0.5">
                        {p.prompt}
                      </p>
                      <p className="text-[10px] text-[#64748B] dark:text-slate-500 mt-1">
                        สไตล์ {p.stylePreset} · สัดส่วน {p.aspectRatio}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onLoadSavedPrompt(p)}
                        className="rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
                      >
                        โหลดใช้
                      </button>
                      <button
                        type="button"
                        aria-label="ลบพรอมต์"
                        onClick={() => onDeleteSavedPrompt(p.id)}
                        className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Saved Studio Projects */}
        <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
              <Layers className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
              <span>โปรเจกต์สตูดิโอบน Cloud ({studioProjects.length})</span>
            </h2>
          </div>

          {studioProjects.length === 0 ? (
            <p className="rounded-xl bg-[#F7F9FC] dark:bg-[#0B1F3A] p-4 text-xs text-[#64748B] dark:text-slate-400">
              ยังไม่มีโปรเจกต์สตูดิโอบน Cloud — กด &ldquo;บันทึกโปรเจกต์ลง Cloud Projects&rdquo; ในหน้า Pro Editor เพื่อเปิดแก้ต่อได้ทุกอุปกรณ์
            </p>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {studioProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F7F9FC] dark:bg-[#0B1F3A] p-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#101820] dark:text-[#F8FAFC] truncate">{proj.title}</p>
                    <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                      ประเภท: {proj.kind} · ขนาดข้อมูล {(proj.projectJson.length / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenStudioProject(proj)}
                      className="rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
                    >
                      เปิดแก้ไข
                    </button>
                    <button
                      type="button"
                      aria-label="ลบโปรเจกต์"
                      onClick={() => onDeleteStudioProject(proj.id)}
                      className="rounded-lg border border-[#E2E8F0] dark:border-slate-700 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* AI Job History */}
      <section className="rounded-2xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-[#101820] p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 font-display text-base font-bold text-[#101820] dark:text-[#F8FAFC]">
            <History className="h-4 w-4 text-[#2563EB] dark:text-[#60A5FA]" />
            <span>ประวัติการทำงาน AI ล่าสุด ({recentJobs.length})</span>
          </h2>
        </div>

        {recentJobs.length === 0 ? (
          <p className="rounded-xl bg-[#F7F9FC] dark:bg-[#0B1F3A] p-4 text-xs text-[#64748B] dark:text-slate-400">
            ยังไม่มีรายการเรียกใช้งาน AI ในบัญชีนี้
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">ประเภทงาน</th>
                  <th className="py-2 px-3 font-medium">โมเดล</th>
                  <th className="py-2 px-3 font-medium">คำสั่งย่อ</th>
                  <th className="py-2 px-3 font-medium">สถานะ · เวลา</th>
                  <th className="py-2 pl-3 font-medium text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {recentJobs.slice(0, 20).map((job) => (
                  <tr key={job.id} className="text-[#101820] dark:text-slate-200">
                    <td className="py-2.5 pr-3 font-medium">{job.type}</td>
                    <td className="py-2.5 px-3 font-mono-tabular text-[11px] text-[#64748B] dark:text-slate-400">
                      {job.model}
                    </td>
                    <td className="py-2.5 px-3 max-w-[320px] truncate">{job.promptPreview || '—'}</td>
                    <td className="py-2.5 px-3 text-[11px] text-[#64748B] dark:text-slate-400">
                      {job.status === 'completed' ? 'สำเร็จ' : job.status === 'failed' ? 'ล้มเหลว' : job.status}
                      {job.durationMs ? ` · ${(job.durationMs / 1000).toFixed(1)}s` : ''}
                      {' · '}
                      {formatBangkokDateTime(job.createdAtUtc)}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      {job.fullPrompt || job.promptPreview ? (
                        <button
                          type="button"
                          onClick={() =>
                            onRerunPrompt(
                              job.fullPrompt || job.promptPreview,
                              job.stylePreset,
                              job.aspectRatio
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 px-2.5 py-1 text-[11px] font-medium hover:bg-[#F7F9FC] dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>ใช้พรอมต์นี้</span>
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
