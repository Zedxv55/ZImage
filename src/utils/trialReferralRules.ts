export type UserRole = 'owner' | 'admin' | 'moderator' | 'user';

export type PlanTier = 'trial' | 'free' | 'pro' | 'custom';

export type AdminPermissionKey =
  | 'overview'
  | 'users'
  | 'referrals'
  | 'jobs'
  | 'settings'
  | 'audit'
  | 'gallery'
  | 'requests';

export const ALL_ADMIN_PERMISSIONS: AdminPermissionKey[] = [
  'overview',
  'users',
  'referrals',
  'jobs',
  'settings',
  'audit',
  'gallery',
  'requests',
];

export const DEFAULT_TRIAL_HOURS = 72;
export const DEFAULT_MONTHLY_INVITE_CAP = 5;

/**
 * Cumulative milestone total bonus days for monthly qualified referrals 1..5.
 * Non-stacking: reaching milestone N grants total Nth milestone days for that month.
 * 1 -> 1d (+1), 2 -> 4d (+3), 3 -> 8d (+4), 4 -> 16d (+8), 5 -> 32d (+16).
 */
export const REFERRAL_MILESTONE_TOTAL_DAYS: Record<number, number> = {
  1: 1,
  2: 4,
  3: 8,
  4: 16,
  5: 32,
};

export interface EntitlementState {
  uid: string;
  email: string;
  role: UserRole;
  adminPermissions: AdminPermissionKey[];
  plan: PlanTier;
  trialStartedAtUtc: string;
  trialExpiresAtUtc: string;
  bonusDaysTotal: number;
  monthlyInviteCount: number;
  monthlyInviteMonthKey: string;
  referredByUid?: string;
  referredByCode?: string;
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
}

export function getUtcMonthKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

export function formatBangkokDateTime(isoUtc: string): string {
  const dt = new Date(isoUtc);
  if (Number.isNaN(dt.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt);
}

/**
 * Computes the exact incremental bonus days awarded when a user's
 * monthly qualified referral count increases from prevCount -> nextCount.
 */
export function computeMilestoneDeltaDays(
  prevCount: number,
  nextCount: number,
  monthlyCap: number = DEFAULT_MONTHLY_INVITE_CAP,
  rewardTable: Record<number, number> = REFERRAL_MILESTONE_TOTAL_DAYS
): {
  cappedPrev: number;
  cappedNext: number;
  prevTotalDays: number;
  nextTotalDays: number;
  deltaDays: number;
} {
  const cappedPrev = Math.max(0, Math.min(monthlyCap, Math.floor(prevCount)));
  const cappedNext = Math.max(cappedPrev, Math.min(monthlyCap, Math.floor(nextCount)));
  const prevTotalDays = cappedPrev > 0 ? Number(rewardTable[cappedPrev] || 0) : 0;
  const nextTotalDays = cappedNext > 0 ? Number(rewardTable[cappedNext] || 0) : 0;
  return {
    cappedPrev,
    cappedNext,
    prevTotalDays,
    nextTotalDays,
    deltaDays: Math.max(0, nextTotalDays - prevTotalDays),
  };
}

/**
 * Resets monthly invite counter when UTC month advances WITHOUT removing accrued bonusDaysTotal.
 */
export function syncMonthlyInviteReset<
  T extends Pick<EntitlementState, 'monthlyInviteCount' | 'monthlyInviteMonthKey' | 'bonusDaysTotal'>,
>(account: T, now: Date = new Date()): T {
  const currentMonth = getUtcMonthKey(now);
  if (account.monthlyInviteMonthKey === currentMonth) {
    return account;
  }
  return {
    ...account,
    monthlyInviteCount: 0,
    monthlyInviteMonthKey: currentMonth,
    bonusDaysTotal: account.bonusDaysTotal, // Never stripped on monthly rollover
  };
}

export function computeEffectiveAccessStatus(
  account: Pick<
    EntitlementState,
    'role' | 'plan' | 'trialExpiresAtUtc' | 'bonusDaysTotal' | 'suspended'
  >,
  nowMs: number = Date.now()
): {
  status: 'active_admin' | 'active_pro' | 'active_trial' | 'active_bonus' | 'expired' | 'suspended';
  isActive: boolean;
  effectiveExpiresAtMs: number;
  remainingMs: number;
  remainingLabel: string;
} {
  if (account.suspended) {
    return {
      status: 'suspended',
      isActive: false,
      effectiveExpiresAtMs: 0,
      remainingMs: 0,
      remainingLabel: 'บัญชีถูกระงับการใช้งาน',
    };
  }
  if (account.role === 'owner' || account.role === 'admin') {
    return {
      status: 'active_admin',
      isActive: true,
      effectiveExpiresAtMs: Number.MAX_SAFE_INTEGER,
      remainingMs: Number.MAX_SAFE_INTEGER,
      remainingLabel: 'สิทธิ์ผู้ดูแลระบบ (ไม่หมดอายุ)',
    };
  }
  if (account.plan === 'pro' || account.plan === 'custom') {
    return {
      status: 'active_pro',
      isActive: true,
      effectiveExpiresAtMs: Number.MAX_SAFE_INTEGER,
      remainingMs: Number.MAX_SAFE_INTEGER,
      remainingLabel: account.plan === 'pro' ? 'แพ็กเกจ Pro ใช้งานต่อเนื่อง' : 'สิทธิ์พิเศษ Custom',
    };
  }

  const trialEndMs = Date.parse(account.trialExpiresAtUtc);
  const baseEndMs = Number.isFinite(trialEndMs) ? trialEndMs : nowMs;
  const effectiveExpiresAtMs = baseEndMs + Math.max(0, account.bonusDaysTotal) * 24 * 60 * 60 * 1000;
  const remainingMs = Math.max(0, effectiveExpiresAtMs - nowMs);
  const isActive = remainingMs > 0;

  if (!isActive) {
    return {
      status: 'expired',
      isActive: false,
      effectiveExpiresAtMs,
      remainingMs: 0,
      remainingLabel: 'หมดเวลาทดลองใช้งาน 72 ชม. แล้ว',
    };
  }

  const totalMins = Math.floor(remainingMs / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  const remainingLabel =
    days > 0 ? `${days} วัน ${hours} ชม. ${mins} นาที` : `${hours} ชม. ${mins} นาที`;

  const isPureTrial = nowMs < baseEndMs;
  return {
    status: isPureTrial ? 'active_trial' : 'active_bonus',
    isActive: true,
    effectiveExpiresAtMs,
    remainingMs,
    remainingLabel,
  };
}

export function validateReferralClaim(input: {
  inviterUid: string;
  inviteeUid: string;
  inviteeEmailVerified: boolean;
  inviteeAlreadyReferred: boolean;
  inviterMonthlyInviteCount: number;
  monthlyCap?: number;
}): { ok: true } | { ok: false; reason: string; code: string } {
  const cap = input.monthlyCap ?? DEFAULT_MONTHLY_INVITE_CAP;
  if (!input.inviteeEmailVerified) {
    return {
      ok: false,
      code: 'UNVERIFIED_EMAIL',
      reason: 'ต้องยืนยันอีเมล Google ที่ผ่านการตรวจสอบก่อนจึงจะรับสิทธิ์อ้างอิงได้',
    };
  }
  if (input.inviterUid === input.inviteeUid) {
    return {
      ok: false,
      code: 'SELF_REFERRAL',
      reason: 'ไม่สามารถใช้รหัสแนะนำของบัญชีตนเองได้',
    };
  }
  if (input.inviteeAlreadyReferred) {
    return {
      ok: false,
      code: 'ALREADY_REFERRED',
      reason: 'บัญชีนี้เคยรับสิทธิ์จากผู้แนะนำแล้ว (จำกัด 1 ครั้งต่อ 1 บัญชี)',
    };
  }
  if (input.inviterMonthlyInviteCount >= cap) {
    return {
      ok: false,
      code: 'MONTHLY_CAP_REACHED',
      reason: `ผู้แนะนำครบโควตาสูงสุด ${cap} คนต่อเดือนแล้ว`,
    };
  }
  return { ok: true };
}

export function hasAdminMenuPermission(
  role: UserRole,
  permissions: AdminPermissionKey[],
  needed: AdminPermissionKey
): boolean {
  if (role === 'owner') return true;
  if (role !== 'admin' && role !== 'moderator') return false;
  return permissions.includes(needed);
}
