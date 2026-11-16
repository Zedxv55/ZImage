import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DAILY_GENERATION_LIMIT,
  RECRAFT_MODEL,
  SUPER_ADMIN_EMAIL,
  VISION_PROMPT_MODEL,
} from '../src/utils/promptLogic.ts';
import {
  DEFAULT_MONTHLY_INVITE_CAP,
  DEFAULT_TRIAL_HOURS,
  REFERRAL_MILESTONE_TOTAL_DAYS,
} from '../src/utils/trialReferralRules.ts';
import type {
  AiJobRecord,
  AuditLogRecord,
  ReferralLedgerEntry,
  ServerGeneratedArchiveItem,
  ServerGuestRequestItem,
  ServerUserEntitlement,
  SystemSettingsRecord,
} from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const DATA_DIR = path.resolve(ROOT_DIR, '.data');
export const ARCHIVE_IMAGES_DIR = path.join(DATA_DIR, 'archive-images');
export const GENERATED_ARCHIVE_PATH = path.join(DATA_DIR, 'generated-archive.json');
export const GUEST_REQUESTS_PATH = path.join(DATA_DIR, 'guest-requests.json');
export const DAILY_QUOTA_PATH = path.join(DATA_DIR, 'daily-quota.json');
export const ENTITLEMENTS_PATH = path.join(DATA_DIR, 'user-entitlements.json');
export const REFERRALS_PATH = path.join(DATA_DIR, 'referral-ledger.json');
export const AI_JOBS_PATH = path.join(DATA_DIR, 'ai-jobs.json');
export const AUDIT_LOGS_PATH = path.join(DATA_DIR, 'audit-logs.json');
export const SYSTEM_SETTINGS_PATH = path.join(DATA_DIR, 'system-settings.json');

export interface DailyQuotaStore {
  [dateKey: string]: Record<string, number>;
}

export function ensureDataDirs(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ARCHIVE_IMAGES_DIR)) fs.mkdirSync(ARCHIVE_IMAGES_DIR, { recursive: true });
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDataDirs();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function getDefaultSystemSettings(): SystemSettingsRecord {
  const envLimit = Number(process.env.DAILY_GENERATION_LIMIT || DEFAULT_DAILY_GENERATION_LIMIT);
  return {
    trialHours: DEFAULT_TRIAL_HOURS,
    monthlyInviteCap: DEFAULT_MONTHLY_INVITE_CAP,
    milestoneDays: { ...REFERRAL_MILESTONE_TOTAL_DAYS },
    defaultDailyLimit:
      Number.isFinite(envLimit) && envLimit >= 1 ? Math.round(envLimit) : DEFAULT_DAILY_GENERATION_LIMIT,
    defaultImageModel: RECRAFT_MODEL,
    defaultVisionModel: VISION_PROMPT_MODEL,
    allowGuestGeneration: true,
    maintenanceMode: false,
    maintenanceBanner: '',
    aiFeaturesEnabled: {
      aiGeneration: true,
      aiDecompose: true,
      promptEnhancer: true,
      videoEditor: true,
      psdExport: true,
    },
    updatedAtUtc: new Date().toISOString(),
    updatedByEmail: SUPER_ADMIN_EMAIL,
  };
}

export function loadSystemSettings(): SystemSettingsRecord {
  const defaults = getDefaultSystemSettings();
  const saved = readJsonFile<Partial<SystemSettingsRecord>>(SYSTEM_SETTINGS_PATH, {});
  return {
    ...defaults,
    ...saved,
    milestoneDays: { ...defaults.milestoneDays, ...(saved.milestoneDays || {}) },
    aiFeaturesEnabled: { ...defaults.aiFeaturesEnabled, ...(saved.aiFeaturesEnabled || {}) },
  };
}

export function saveSystemSettings(next: SystemSettingsRecord): SystemSettingsRecord {
  writeJsonFile(SYSTEM_SETTINGS_PATH, next);
  return next;
}

export function loadAllEntitlements(): Record<string, ServerUserEntitlement> {
  return readJsonFile<Record<string, ServerUserEntitlement>>(ENTITLEMENTS_PATH, {});
}

export function saveAllEntitlements(map: Record<string, ServerUserEntitlement>): void {
  writeJsonFile(ENTITLEMENTS_PATH, map);
}

export function loadReferralLedger(): ReferralLedgerEntry[] {
  return readJsonFile<ReferralLedgerEntry[]>(REFERRALS_PATH, []);
}

export function saveReferralLedger(entries: ReferralLedgerEntry[]): void {
  writeJsonFile(REFERRALS_PATH, entries.slice(0, 2000));
}

export function loadAiJobs(): AiJobRecord[] {
  return readJsonFile<AiJobRecord[]>(AI_JOBS_PATH, []);
}

export function saveAiJob(job: AiJobRecord): void {
  const list = loadAiJobs();
  const idx = list.findIndex((j) => j.id === job.id);
  if (idx >= 0) {
    list[idx] = job;
  } else {
    list.unshift(job);
  }
  writeJsonFile(AI_JOBS_PATH, list.slice(0, 400));
}

export function loadAuditLogs(): AuditLogRecord[] {
  return readJsonFile<AuditLogRecord[]>(AUDIT_LOGS_PATH, []);
}

export function appendAuditLog(entry: Omit<AuditLogRecord, 'id' | 'timestampUtc'>): AuditLogRecord {
  const record: AuditLogRecord = {
    ...entry,
    id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestampUtc: new Date().toISOString(),
  };
  const existing = loadAuditLogs();
  writeJsonFile(AUDIT_LOGS_PATH, [record, ...existing].slice(0, 1500));
  return record;
}

export function loadArchiveIndex(): ServerGeneratedArchiveItem[] {
  return readJsonFile<ServerGeneratedArchiveItem[]>(GENERATED_ARCHIVE_PATH, []);
}

export function saveArchiveIndex(items: ServerGeneratedArchiveItem[]): void {
  writeJsonFile(GENERATED_ARCHIVE_PATH, items.slice(0, 250));
}

export function loadGuestRequests(): ServerGuestRequestItem[] {
  return readJsonFile<ServerGuestRequestItem[]>(GUEST_REQUESTS_PATH, []);
}

export function saveGuestRequests(items: ServerGuestRequestItem[]): void {
  writeJsonFile(GUEST_REQUESTS_PATH, items.slice(0, 500));
}

export function getTodayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function resolveQuotaActorKey(
  ipRaw: string | string[] | undefined,
  explicitUid?: string
): string {
  if (explicitUid && explicitUid.trim()) {
    return `uid:${explicitUid.trim().slice(0, 128)}`;
  }
  const ipStr = Array.isArray(ipRaw) ? ipRaw[0] : ipRaw || 'local';
  const hash = crypto.createHash('sha256').update(String(ipStr)).digest('hex').slice(0, 20);
  return `guest:${hash}`;
}

export function getQuotaSnapshot(
  actorKey: string,
  overrideLimit?: number | null
): {
  limit: number;
  used: number;
  remaining: number;
  dateKey: string;
} {
  const settings = loadSystemSettings();
  const limit =
    typeof overrideLimit === 'number' && overrideLimit >= 0
      ? Math.round(overrideLimit)
      : settings.defaultDailyLimit;
  const dateKey = getTodayUtcKey();
  const store = readJsonFile<DailyQuotaStore>(DAILY_QUOTA_PATH, {});
  const used = store[dateKey]?.[actorKey] || 0;
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    dateKey,
  };
}

export function incrementQuotaUsage(
  actorKey: string,
  count: number = 1,
  overrideLimit?: number | null
): {
  limit: number;
  used: number;
  remaining: number;
  dateKey: string;
} {
  const settings = loadSystemSettings();
  const limit =
    typeof overrideLimit === 'number' && overrideLimit >= 0
      ? Math.round(overrideLimit)
      : settings.defaultDailyLimit;
  const dateKey = getTodayUtcKey();
  const store = readJsonFile<DailyQuotaStore>(DAILY_QUOTA_PATH, {});
  const pruned: DailyQuotaStore = {};
  for (const key of Object.keys(store).sort().slice(-6)) {
    pruned[key] = store[key];
  }
  if (!pruned[dateKey]) pruned[dateKey] = {};
  const nextUsed = (pruned[dateKey][actorKey] || 0) + count;
  pruned[dateKey][actorKey] = nextUsed;
  writeJsonFile(DAILY_QUOTA_PATH, pruned);
  return {
    limit,
    used: nextUsed,
    remaining: Math.max(0, limit - nextUsed),
    dateKey,
  };
}

export function resetDailyQuotaForActor(actorKey: string): void {
  const dateKey = getTodayUtcKey();
  const store = readJsonFile<DailyQuotaStore>(DAILY_QUOTA_PATH, {});
  if (store[dateKey]) {
    store[dateKey][actorKey] = 0;
    writeJsonFile(DAILY_QUOTA_PATH, store);
  }
}
