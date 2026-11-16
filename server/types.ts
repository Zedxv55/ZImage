import type { AspectRatioId, RequestStatus, StylePresetId } from '../src/utils/promptLogic.ts';
import type { AdminPermissionKey, PlanTier, UserRole } from '../src/utils/trialReferralRules.ts';

export interface ServerUserEntitlement {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
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
  lastSeenAtUtc: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface ReferralLedgerEntry {
  id: string;
  inviterUid: string;
  inviterEmail: string;
  inviteeUid: string;
  inviteeEmail: string;
  referralCode: string;
  monthKey: string;
  milestoneStep: number; // 1..5
  deltaDaysGranted: number;
  status: 'qualified' | 'clawed_back' | 'rejected';
  ipHash?: string;
  reason?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface AiJobRecord {
  id: string;
  type: 'enhance-prompt' | 'generate-image' | 'decompose-image' | 'analyze-image';
  status: 'queued' | 'running' | 'completed' | 'failed';
  actorUid?: string;
  actorEmail?: string;
  actorName: string;
  model: string;
  provider: 'openrouter' | 'gemini' | 'local';
  promptPreview: string;
  fullPrompt?: string;
  stylePreset?: StylePresetId;
  aspectRatio?: AspectRatioId;
  seed?: number;
  durationMs?: number;
  estimatedCostUsd: number;
  errorCode?: string;
  errorMessage?: string;
  archiveId?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface AuditLogRecord {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  targetType: 'user' | 'referral' | 'settings' | 'archive' | 'request' | 'system';
  targetId: string;
  summary: string;
  beforeJson?: string;
  afterJson?: string;
  timestampUtc: string;
}

export interface SystemSettingsRecord {
  trialHours: number;
  monthlyInviteCap: number;
  milestoneDays: Record<number, number>;
  defaultDailyLimit: number;
  defaultImageModel: string;
  defaultVisionModel: string;
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
  updatedAtUtc: string;
  updatedByEmail: string;
}

export interface ServerGeneratedArchiveItem {
  id: string;
  originalPrompt: string;
  enhancedPrompt: string;
  negativePrompt?: string;
  stylePreset: StylePresetId;
  aspectRatio: AspectRatioId;
  dimensionsLabel?: string;
  seed?: number;
  hasReferenceImage: boolean;
  ownerType: 'guest' | 'member';
  ownerUid?: string;
  ownerName: string;
  ownerEmail?: string;
  model: string;
  promptEngine: string;
  createdAtIso: string;
  imageFile: string;
}

export interface ServerGuestRequestItem {
  id: string;
  clientKey: string;
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
