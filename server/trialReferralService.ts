import crypto from 'node:crypto';
import { ADMIN_EMAILS, SUPER_ADMIN_EMAIL } from '../src/utils/promptLogic.ts';
import {
  ALL_ADMIN_PERMISSIONS,
  computeEffectiveAccessStatus,
  computeMilestoneDeltaDays,
  getUtcMonthKey,
  syncMonthlyInviteReset,
  validateReferralClaim,
} from '../src/utils/trialReferralRules.ts';
import type { AdminPermissionKey, PlanTier, UserRole } from '../src/utils/trialReferralRules.ts';
import {
  appendAuditLog,
  loadAllEntitlements,
  loadReferralLedger,
  loadSystemSettings,
  resetDailyQuotaForActor,
  saveAllEntitlements,
  saveReferralLedger,
} from './store.ts';
import type { ReferralLedgerEntry, ServerUserEntitlement } from './types.ts';
import type { VerifiedActor } from './authAndRbac.ts';

function generateReferralCode(uid: string): string {
  const hash = crypto.createHash('sha256').update(uid).digest('hex').slice(0, 6).toUpperCase();
  return `ZI-${hash}`;
}

export function ensureUserEntitlement(input: {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
}): ServerUserEntitlement {
  const settings = loadSystemSettings();
  const map = loadAllEntitlements();
  const emailLower = input.email.trim().toLowerCase();
  const now = new Date();
  const nowIso = now.toISOString();

  const existing = map[input.uid];
  if (existing) {
    const rolled = syncMonthlyInviteReset(existing, now);
    const isOwner = input.emailVerified && emailLower === SUPER_ADMIN_EMAIL;
    const isBootstrappedAdmin =
      input.emailVerified && (ADMIN_EMAILS as readonly string[]).includes(emailLower);

    const updated: ServerUserEntitlement = {
      ...rolled,
      email: emailLower,
      displayName: (input.displayName || rolled.displayName || emailLower.split('@')[0]).slice(0, 100),
      photoURL: input.photoURL ?? rolled.photoURL,
      role: isOwner ? 'owner' : isBootstrappedAdmin && rolled.role === 'user' ? 'admin' : rolled.role,
      adminPermissions: isOwner
        ? [...ALL_ADMIN_PERMISSIONS]
        : isBootstrappedAdmin && rolled.adminPermissions.length === 0
          ? [...ALL_ADMIN_PERMISSIONS]
          : rolled.adminPermissions,
      lastSeenAtUtc: nowIso,
      updatedAtUtc: nowIso,
    };
    map[input.uid] = updated;
    saveAllEntitlements(map);
    return updated;
  }

  const isOwner = input.emailVerified && emailLower === SUPER_ADMIN_EMAIL;
  const isBootstrappedAdmin =
    input.emailVerified && (ADMIN_EMAILS as readonly string[]).includes(emailLower);
  const role: UserRole = isOwner ? 'owner' : isBootstrappedAdmin ? 'admin' : 'user';
  const trialMs = settings.trialHours * 60 * 60 * 1000;

  const created: ServerUserEntitlement = {
    uid: input.uid,
    email: emailLower,
    displayName: (input.displayName || emailLower.split('@')[0] || 'ZImage Member').slice(0, 100),
    photoURL: input.photoURL || '',
    role,
    adminPermissions: role === 'owner' || role === 'admin' ? [...ALL_ADMIN_PERMISSIONS] : [],
    plan: role === 'owner' || role === 'admin' ? 'pro' : 'trial',
    trialStartedAtUtc: nowIso,
    trialExpiresAtUtc: new Date(now.getTime() + trialMs).toISOString(),
    bonusDaysTotal: 0,
    monthlyInviteCount: 0,
    monthlyInviteMonthKey: getUtcMonthKey(now),
    referralCode: generateReferralCode(input.uid),
    suspended: false,
    sessionVersion: 1,
    usageCountTotal: 0,
    dailyQuotaOverride: null,
    featureOverrides: {
      aiGeneration: true,
      aiDecompose: true,
      proEditor: true,
      videoEditor: true,
      psdExport: true,
    },
    lastSeenAtUtc: nowIso,
    createdAtUtc: nowIso,
    updatedAtUtc: nowIso,
  };

  map[input.uid] = created;
  saveAllEntitlements(map);
  return created;
}

export function incrementUserUsageCount(uid: string, count: number = 1): void {
  const map = loadAllEntitlements();
  const ent = map[uid];
  if (!ent) return;
  ent.usageCountTotal = (ent.usageCountTotal || 0) + count;
  ent.updatedAtUtc = new Date().toISOString();
  map[uid] = ent;
  saveAllEntitlements(map);
}

export function claimReferralCodeForUser(input: {
  invitee: ServerUserEntitlement;
  inviteeEmailVerified: boolean;
  rawCode: string;
  ipHash: string;
}): {
  ok: true;
  inviterEmail: string;
  deltaDaysGranted: number;
  milestoneStep: number;
  updatedInvitee: ServerUserEntitlement;
} | { ok: false; code: string; error: string } {
  const cleanCode = input.rawCode.trim().toUpperCase();
  if (!cleanCode) {
    return { ok: false, code: 'EMPTY_CODE', error: 'กรุณากรอกรหัสแนะนำ' };
  }

  const settings = loadSystemSettings();
  const map = loadAllEntitlements();
  const inviter = Object.values(map).find((u) => u.referralCode.toUpperCase() === cleanCode);
  if (!inviter) {
    return { ok: false, code: 'INVALID_CODE', error: 'ไม่พบรหัสแนะนำนี้ในระบบ' };
  }

  const syncedInviter = syncMonthlyInviteReset(inviter, new Date());
  const check = validateReferralClaim({
    inviterUid: syncedInviter.uid,
    inviteeUid: input.invitee.uid,
    inviteeEmailVerified: input.inviteeEmailVerified,
    inviteeAlreadyReferred: Boolean(input.invitee.referredByUid),
    inviterMonthlyInviteCount: syncedInviter.monthlyInviteCount,
    monthlyCap: settings.monthlyInviteCap,
  });

  if (!check.ok) {
    return { ok: false, code: check.code, error: check.reason };
  }

  // Anti-fraud: prevent same inviter+ipHash spamming >2 referrals/month
  const ledger = loadReferralLedger();
  const sameIpThisMonth = ledger.filter(
    (e) =>
      e.inviterUid === syncedInviter.uid &&
      e.monthKey === syncedInviter.monthlyInviteMonthKey &&
      e.ipHash === input.ipHash &&
      e.status === 'qualified'
  ).length;
  if (sameIpThisMonth >= 2) {
    return {
      ok: false,
      code: 'IP_RATE_LIMIT',
      error: 'ตรวจพบการรับสิทธิ์จากเครือข่ายเดิมซ้ำเกินกำหนด ระบบปฏิเสธเพื่อป้องกันการใช้งานผิดวัตถุประสงค์',
    };
  }

  const prevCount = syncedInviter.monthlyInviteCount;
  const nextCount = prevCount + 1;
  const milestone = computeMilestoneDeltaDays(
    prevCount,
    nextCount,
    settings.monthlyInviteCap,
    settings.milestoneDays
  );

  const nowIso = new Date().toISOString();
  syncedInviter.monthlyInviteCount = nextCount;
  syncedInviter.bonusDaysTotal = (syncedInviter.bonusDaysTotal || 0) + milestone.deltaDays;
  syncedInviter.updatedAtUtc = nowIso;

  const updatedInvitee: ServerUserEntitlement = {
    ...input.invitee,
    referredByUid: syncedInviter.uid,
    referredByCode: syncedInviter.referralCode,
    bonusDaysTotal: (input.invitee.bonusDaysTotal || 0) + 1, // Welcome +1 day for verified referred friend
    updatedAtUtc: nowIso,
  };

  map[syncedInviter.uid] = syncedInviter;
  map[updatedInvitee.uid] = updatedInvitee;
  saveAllEntitlements(map);

  const entry: ReferralLedgerEntry = {
    id: `ref-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    inviterUid: syncedInviter.uid,
    inviterEmail: syncedInviter.email,
    inviteeUid: updatedInvitee.uid,
    inviteeEmail: updatedInvitee.email,
    referralCode: syncedInviter.referralCode,
    monthKey: syncedInviter.monthlyInviteMonthKey,
    milestoneStep: nextCount,
    deltaDaysGranted: milestone.deltaDays,
    status: 'qualified',
    ipHash: input.ipHash,
    createdAtUtc: nowIso,
    updatedAtUtc: nowIso,
  };
  saveReferralLedger([entry, ...ledger]);

  appendAuditLog({
    actorUid: updatedInvitee.uid,
    actorEmail: updatedInvitee.email,
    actorRole: updatedInvitee.role,
    action: 'referral.claim',
    targetType: 'referral',
    targetId: entry.id,
    summary: `${updatedInvitee.email} claimed referral ${syncedInviter.referralCode} from ${syncedInviter.email} (milestone #${nextCount}, +${milestone.deltaDays}d)`,
    afterJson: JSON.stringify({
      inviterMonthlyInviteCount: nextCount,
      inviterBonusDaysTotal: syncedInviter.bonusDaysTotal,
      deltaDaysGranted: milestone.deltaDays,
    }),
  });

  return {
    ok: true,
    inviterEmail: syncedInviter.email,
    deltaDaysGranted: milestone.deltaDays,
    milestoneStep: nextCount,
    updatedInvitee,
  };
}

export type AdminUserActionType =
  | 'add-days'
  | 'subtract-days'
  | 'reset-trial-72h'
  | 'reset-usage-only'
  | 'reset-referral-only'
  | 'expire-now'
  | 'set-plan'
  | 'toggle-feature'
  | 'set-daily-quota'
  | 'suspend'
  | 'restore'
  | 'force-logout'
  | 'set-role-permissions';

export function applyAdminUserAction(input: {
  actor: VerifiedActor;
  targetUid: string;
  action: AdminUserActionType;
  days?: number;
  plan?: PlanTier;
  featureKey?: keyof ServerUserEntitlement['featureOverrides'];
  featureValue?: boolean;
  dailyQuotaOverride?: number | null;
  reason?: string;
  role?: UserRole;
  adminPermissions?: AdminPermissionKey[];
}): { ok: true; user: ServerUserEntitlement } | { ok: false; status: number; error: string } {
  const map = loadAllEntitlements();
  const target = map[input.targetUid];
  if (!target) {
    return { ok: false, status: 404, error: 'ไม่พบข้อมูลผู้ใช้งานในระบบ' };
  }

  const settings = loadSystemSettings();
  const beforeSnapshot = {
    role: target.role,
    plan: target.plan,
    trialExpiresAtUtc: target.trialExpiresAtUtc,
    bonusDaysTotal: target.bonusDaysTotal,
    monthlyInviteCount: target.monthlyInviteCount,
    usageCountTotal: target.usageCountTotal,
    suspended: target.suspended,
    sessionVersion: target.sessionVersion,
    dailyQuotaOverride: target.dailyQuotaOverride,
    featureOverrides: target.featureOverrides,
  };

  if (target.email === SUPER_ADMIN_EMAIL && input.actor.uid !== target.uid) {
    return {
      ok: false,
      status: 403,
      error: 'ไม่สามารถแก้ไขสิทธิ์หรือระงับบัญชี Owner หลักได้',
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const next: ServerUserEntitlement = {
    ...target,
    featureOverrides: { ...target.featureOverrides },
    updatedAtUtc: nowIso,
  };

  switch (input.action) {
    case 'add-days': {
      const days = Math.max(1, Math.min(3650, Math.round(Number(input.days || 1))));
      next.bonusDaysTotal = (next.bonusDaysTotal || 0) + days;
      break;
    }
    case 'subtract-days': {
      const days = Math.max(1, Math.min(3650, Math.round(Number(input.days || 1))));
      next.bonusDaysTotal = Math.max(0, (next.bonusDaysTotal || 0) - days);
      break;
    }
    case 'reset-trial-72h': {
      const trialMs = settings.trialHours * 60 * 60 * 1000;
      next.trialStartedAtUtc = nowIso;
      next.trialExpiresAtUtc = new Date(now.getTime() + trialMs).toISOString();
      next.plan = 'trial';
      break;
    }
    case 'reset-usage-only': {
      // STRICT SEPARATION: resets ONLY usage counts & daily quota, never touches referrals
      next.usageCountTotal = 0;
      resetDailyQuotaForActor(`uid:${target.uid}`);
      break;
    }
    case 'reset-referral-only': {
      // STRICT SEPARATION: resets ONLY monthly referral invite count, never touches usage count
      next.monthlyInviteCount = 0;
      next.monthlyInviteMonthKey = getUtcMonthKey(now);
      break;
    }
    case 'expire-now': {
      next.trialExpiresAtUtc = new Date(now.getTime() - 60000).toISOString();
      next.bonusDaysTotal = 0;
      next.plan = 'free';
      break;
    }
    case 'set-plan': {
      if (input.plan && ['trial', 'free', 'pro', 'custom'].includes(input.plan)) {
        next.plan = input.plan;
      }
      break;
    }
    case 'toggle-feature': {
      if (input.featureKey) {
        next.featureOverrides[input.featureKey] = Boolean(input.featureValue);
      }
      break;
    }
    case 'set-daily-quota': {
      next.dailyQuotaOverride =
        input.dailyQuotaOverride === null || input.dailyQuotaOverride === undefined
          ? null
          : Math.max(0, Math.min(10000, Math.round(Number(input.dailyQuotaOverride))));
      break;
    }
    case 'suspend': {
      next.suspended = true;
      next.suspendedReason = (input.reason || 'ถูกระงับการใช้งานโดยผู้ดูแลระบบ').slice(0, 300);
      next.sessionVersion = (next.sessionVersion || 1) + 1;
      break;
    }
    case 'restore': {
      next.suspended = false;
      next.suspendedReason = '';
      break;
    }
    case 'force-logout': {
      next.sessionVersion = (next.sessionVersion || 1) + 1;
      break;
    }
    case 'set-role-permissions': {
      if (!input.actor.isOwner) {
        return {
          ok: false,
          status: 403,
          error: 'เฉพาะ Owner (zbcd1053@gmail.com) เท่านั้นที่ปรับแต่งบทบาทและสิทธิ์เมนู Admin ได้',
        };
      }
      if (target.email === SUPER_ADMIN_EMAIL) {
        return { ok: false, status: 400, error: 'ไม่สามารถลดสิทธิ์ Owner หลักได้' };
      }
      if (input.role && ['admin', 'moderator', 'user'].includes(input.role)) {
        next.role = input.role;
      }
      if (Array.isArray(input.adminPermissions)) {
        next.adminPermissions = input.adminPermissions.filter((p) =>
          ALL_ADMIN_PERMISSIONS.includes(p)
        );
      }
      break;
    }
  }

  map[target.uid] = next;
  saveAllEntitlements(map);

  const afterSnapshot = {
    role: next.role,
    plan: next.plan,
    trialExpiresAtUtc: next.trialExpiresAtUtc,
    bonusDaysTotal: next.bonusDaysTotal,
    monthlyInviteCount: next.monthlyInviteCount,
    usageCountTotal: next.usageCountTotal,
    suspended: next.suspended,
    sessionVersion: next.sessionVersion,
    dailyQuotaOverride: next.dailyQuotaOverride,
    featureOverrides: next.featureOverrides,
  };

  appendAuditLog({
    actorUid: input.actor.uid,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: `user.${input.action}`,
    targetType: 'user',
    targetId: target.uid,
    summary: `${input.actor.email} performed ${input.action} on ${target.email}`,
    beforeJson: JSON.stringify(beforeSnapshot),
    afterJson: JSON.stringify(afterSnapshot),
  });

  return { ok: true, user: next };
}

export function clawbackReferralEntry(input: {
  actor: VerifiedActor;
  entryId: string;
  reason?: string;
}): { ok: true; entry: ReferralLedgerEntry } | { ok: false; status: number; error: string } {
  const ledger = loadReferralLedger();
  const idx = ledger.findIndex((e) => e.id === input.entryId);
  if (idx < 0) return { ok: false, status: 404, error: 'ไม่พบรายการแนะนำในระบบ' };

  const target = ledger[idx];
  if (target.status === 'clawed_back') {
    return { ok: false, status: 400, error: 'รายการนี้ถูกเรียกคืนโบนัสไปแล้ว' };
  }

  const map = loadAllEntitlements();
  const inviter = map[target.inviterUid];
  const nowIso = new Date().toISOString();

  if (inviter) {
    inviter.bonusDaysTotal = Math.max(0, (inviter.bonusDaysTotal || 0) - target.deltaDaysGranted);
    inviter.monthlyInviteCount = Math.max(0, (inviter.monthlyInviteCount || 0) - 1);
    inviter.updatedAtUtc = nowIso;
    map[inviter.uid] = inviter;
    saveAllEntitlements(map);
  }

  const updatedEntry: ReferralLedgerEntry = {
    ...target,
    status: 'clawed_back',
    reason: (input.reason || 'เรียกคืนสิทธิ์โดยผู้ดูแลระบบ').slice(0, 200),
    updatedAtUtc: nowIso,
  };
  ledger[idx] = updatedEntry;
  saveReferralLedger(ledger);

  appendAuditLog({
    actorUid: input.actor.uid,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: 'referral.clawback',
    targetType: 'referral',
    targetId: updatedEntry.id,
    summary: `Clawed back +${target.deltaDaysGranted}d from ${target.inviterEmail} for invitee ${target.inviteeEmail}`,
    beforeJson: JSON.stringify({ status: target.status, deltaDaysGranted: target.deltaDaysGranted }),
    afterJson: JSON.stringify({ status: 'clawed_back', reason: updatedEntry.reason }),
  });

  return { ok: true, entry: updatedEntry };
}

export function exportReferralsCsv(): string {
  const ledger = loadReferralLedger();
  const header = [
    'ID',
    'TimestampUTC',
    'MonthKey',
    'InviterEmail',
    'InviteeEmail',
    'ReferralCode',
    'MilestoneStep',
    'DeltaDaysGranted',
    'Status',
    'Note',
  ].join(',');
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = ledger.map((r) =>
    [
      esc(r.id),
      esc(r.createdAtUtc),
      esc(r.monthKey),
      esc(r.inviterEmail),
      esc(r.inviteeEmail),
      esc(r.referralCode),
      r.milestoneStep,
      r.deltaDaysGranted,
      esc(r.status),
      esc(r.reason || ''),
    ].join(',')
  );
  return `\uFEFF${header}\n${rows.join('\n')}`;
}

export function enrichEntitlementWithStatus(ent: ServerUserEntitlement) {
  const access = computeEffectiveAccessStatus(ent);
  return {
    ...ent,
    accessStatus: access,
  };
}
