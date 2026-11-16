import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECRAFT_MODEL,
  STYLE_PRESETS,
  VISION_PROMPT_MODEL,
  isRefusalResponse,
} from './src/utils/promptLogic.ts';
import type {
  AspectRatioId,
  RequestStatus,
  StructuredPromptFields,
  StylePresetId,
} from './src/utils/promptLogic.ts';
import { computeEffectiveAccessStatus } from './src/utils/trialReferralRules.ts';
import type { AdminPermissionKey, PlanTier, UserRole } from './src/utils/trialReferralRules.ts';
import {
  analyzeImageWithAI,
  decomposeImageWithAI,
  enhancePromptPipeline,
  generateImageViaGateway,
  sanitizeReferenceImages,
} from './server/aiGateway.ts';
import { verifyAdminWithPermission, verifyFirebaseUserFromRequest } from './server/authAndRbac.ts';
import {
  ARCHIVE_IMAGES_DIR,
  appendAuditLog,
  ensureDataDirs,
  getQuotaSnapshot,
  incrementQuotaUsage,
  loadAiJobs,
  loadAllEntitlements,
  loadArchiveIndex,
  loadAuditLogs,
  loadGuestRequests,
  loadReferralLedger,
  loadSystemSettings,
  resolveQuotaActorKey,
  saveArchiveIndex,
  saveGuestRequests,
  saveSystemSettings,
} from './server/store.ts';
import {
  applyAdminUserAction,
  claimReferralCodeForUser,
  clawbackReferralEntry,
  enrichEntitlementWithStatus,
  exportReferralsCsv,
  incrementUserUsageCount,
} from './server/trialReferralService.ts';
import type { AdminUserActionType } from './server/trialReferralService.ts';
import type { ServerGuestRequestItem, SystemSettingsRecord } from './server/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  ensureDataDirs();
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const settings = loadSystemSettings();
    res.json({
      ok: true,
      model: settings.defaultImageModel || RECRAFT_MODEL,
      visionModel: settings.defaultVisionModel || VISION_PROMPT_MODEL,
      dailyLimit: settings.defaultDailyLimit,
      maintenanceMode: settings.maintenanceMode,
    });
  });

  app.get('/api/system/public-config', (_req: Request, res: Response) => {
    const settings = loadSystemSettings();
    res.json({
      trialHours: settings.trialHours,
      monthlyInviteCap: settings.monthlyInviteCap,
      milestoneDays: settings.milestoneDays,
      defaultDailyLimit: settings.defaultDailyLimit,
      defaultImageModel: settings.defaultImageModel,
      defaultVisionModel: settings.defaultVisionModel,
      allowGuestGeneration: settings.allowGuestGeneration,
      maintenanceMode: settings.maintenanceMode,
      maintenanceBanner: settings.maintenanceBanner,
      aiFeaturesEnabled: settings.aiFeaturesEnabled,
    });
  });

  app.get('/api/quota', async (req: Request, res: Response) => {
    const verified = await verifyFirebaseUserFromRequest(req);
    const uid =
      verified?.uid || (typeof req.query.uid === 'string' ? req.query.uid : undefined);
    const actorKey = resolveQuotaActorKey(req.ip || req.headers['x-forwarded-for'], uid);
    const override = verified?.entitlement.dailyQuotaOverride ?? null;
    res.json(getQuotaSnapshot(actorKey, override));
  });

  app.get('/api/me/entitlement', async (req: Request, res: Response) => {
    const actor = await verifyFirebaseUserFromRequest(req);
    if (!actor) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบด้วย Google ก่อนดูข้อมูลสิทธิ์สมาชิก' });
      return;
    }
    if (actor.sessionRevoked) {
      res.status(401).json({
        errorCode: 'SESSION_REVOKED',
        error: 'เซสชันของคุณถูกบังคับออกจากระบบโดยผู้ดูแล กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
      });
      return;
    }
    const ledger = loadReferralLedger().filter((r) => r.inviterUid === actor.uid);
    const jobs = loadAiJobs()
      .filter((j) => j.actorUid === actor.uid)
      .slice(0, 30);

    res.json({
      entitlement: enrichEntitlementWithStatus(actor.entitlement),
      referralHistory: ledger.slice(0, 25),
      recentJobs: jobs,
      settings: {
        trialHours: loadSystemSettings().trialHours,
        monthlyInviteCap: loadSystemSettings().monthlyInviteCap,
        milestoneDays: loadSystemSettings().milestoneDays,
      },
    });
  });

  app.post('/api/referrals/claim', async (req: Request, res: Response) => {
    const actor = await verifyFirebaseUserFromRequest(req);
    if (!actor || !actor.emailVerified) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ที่ยืนยันตัวตนแล้ว' });
      return;
    }
    if (actor.sessionRevoked) {
      res.status(401).json({ errorCode: 'SESSION_REVOKED', error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
      return;
    }
    const body = req.body as { referralCode?: string };
    const ipRaw = req.ip || req.headers['x-forwarded-for'] || 'local';
    const ipHash = crypto.createHash('sha256').update(String(ipRaw)).digest('hex').slice(0, 20);
    const result = claimReferralCodeForUser({
      invitee: actor.entitlement,
      inviteeEmailVerified: actor.emailVerified,
      rawCode: String(body.referralCode || ''),
      ipHash,
    });
    if (!result.ok) {
      res.status(400).json({ errorCode: result.code, error: result.error });
      return;
    }
    res.json({
      ok: true,
      inviterEmail: result.inviterEmail,
      deltaDaysGranted: result.deltaDaysGranted,
      milestoneStep: result.milestoneStep,
      entitlement: enrichEntitlementWithStatus(result.updatedInvitee),
    });
  });

  app.get('/api/ai/jobs', async (req: Request, res: Response) => {
    const actor = await verifyFirebaseUserFromRequest(req);
    if (!actor) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนดูประวัติงาน AI' });
      return;
    }
    const all = loadAiJobs();
    const mine = all.filter((j) => j.actorUid === actor.uid).slice(0, 40);
    res.json({ items: mine });
  });

  app.post('/api/enhance-prompt', async (req: Request, res: Response) => {
    try {
      const settings = loadSystemSettings();
      if (settings.maintenanceMode || !settings.aiFeaturesEnabled.promptEnhancer) {
        res.status(503).json({
          errorCode: 'FEATURE_DISABLED',
          error: settings.maintenanceBanner || 'ระบบเรียบเรียงพรอมต์ปิดปรับปรุงชั่วคราวโดยผู้ดูแล',
        });
        return;
      }

      const actor = await verifyFirebaseUserFromRequest(req);
      const body = req.body as {
        description?: string;
        stylePreset?: StylePresetId;
        textInImage?: string;
        referenceImages?: string[];
        structuredFields?: Partial<StructuredPromptFields>;
        preserveLength?: boolean;
        preferredVisionModel?: string;
      };
      const referenceImages = sanitizeReferenceImages(body.referenceImages);
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const hasStructuredMain = Boolean(body.structuredFields?.mainPrompt?.trim());

      if (!description && !hasStructuredMain && referenceImages.length === 0) {
        res.status(400).json({ error: 'กรุณาระบุคำอธิบายหรือแนบภาพอ้างอิงก่อนเรียบเรียงพรอมต์' });
        return;
      }

      const stylePreset: StylePresetId = STYLE_PRESETS.some((s) => s.id === body.stylePreset)
        ? (body.stylePreset as StylePresetId)
        : 'auto';

      const result = await enhancePromptPipeline({
        description,
        stylePreset,
        textInImage: body.textInImage,
        referenceImages,
        structuredFields: body.structuredFields,
        preserveLength: body.preserveLength !== false,
        preferredVisionModel: body.preferredVisionModel,
        actorUid: actor?.uid,
        actorEmail: actor?.email,
        actorName: actor?.displayName,
      });

      if (result.status === 'refused') {
        res.json({ status: 'refused', message: 'REFUSE' });
        return;
      }
      res.json(result);
    } catch (error) {
      console.error('Enhance prompt error:', error);
      res.status(500).json({
        errorCode: 'MODEL_DOWN',
        error:
          error instanceof Error
            ? `ระบบช่วยเขียนพรอมต์ขัดข้องชั่วคราว (${error.message})`
            : 'ไม่สามารถเรียบเรียงพรอมต์ได้ในขณะนี้ กรุณาลองใหม่',
      });
    }
  });

  app.post('/api/analyze-image', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        imageDataUrl?: string;
        mode?: 'ocr-text' | 'ocr-table' | 'handwriting' | 'describe' | 'alt-text';
      };
      if (typeof body.imageDataUrl !== 'string' || !body.imageDataUrl.startsWith('data:image/')) {
        res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์ภาพก่อนวิเคราะห์' });
        return;
      }
      const mode = body.mode || 'ocr-text';
      const result = await analyzeImageWithAI(body.imageDataUrl, mode);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        errorCode: 'MODEL_DOWN',
        error: error instanceof Error ? error.message : 'ไม่สามารถวิเคราะห์ภาพได้ในขณะนี้',
      });
    }
  });

  app.post('/api/ai/decompose-image', async (req: Request, res: Response) => {
    try {
      const settings = loadSystemSettings();
      if (settings.maintenanceMode || !settings.aiFeaturesEnabled.aiDecompose) {
        res.status(503).json({
          errorCode: 'FEATURE_DISABLED',
          error: 'ระบบแยกเลเยอร์ AI ถูกปิดใช้งานชั่วคราวโดยผู้ดูแลระบบ',
        });
        return;
      }
      const actor = await verifyFirebaseUserFromRequest(req);
      if (actor && actor.entitlement.suspended) {
        res.status(403).json({ errorCode: 'SUSPENDED', error: 'บัญชีของคุณถูกระงับการใช้งานชั่วคราว' });
        return;
      }
      if (actor && actor.entitlement.featureOverrides.aiDecompose === false) {
        res.status(403).json({ errorCode: 'FEATURE_DISABLED', error: 'สิทธิ์แยกเลเยอร์ AI ถูกปิดสำหรับบัญชีนี้' });
        return;
      }

      const body = req.body as { imageDataUrl?: string };
      if (typeof body.imageDataUrl !== 'string' || !body.imageDataUrl.startsWith('data:image/')) {
        res.status(400).json({ errorCode: 'VALIDATION_ERROR', error: 'กรุณาอัปโหลดไฟล์ภาพที่ถูกต้องก่อนแยกเลเยอร์' });
        return;
      }

      const result = await decomposeImageWithAI({
        imageDataUrl: body.imageDataUrl,
        actorUid: actor?.uid,
        actorEmail: actor?.email,
        actorName: actor?.displayName,
      });
      res.json(result);
    } catch (error) {
      res.status(502).json({
        errorCode: 'DECOMPOSE_AI_FAILED',
        error:
          error instanceof Error
            ? error.message
            : 'ไม่สามารถวิเคราะห์แยกเลเยอร์จากภาพนี้ได้ กรุณาลองใหม่',
      });
    }
  });

  app.post('/api/generate-image', async (req: Request, res: Response) => {
    try {
      const settings = loadSystemSettings();
      if (settings.maintenanceMode || !settings.aiFeaturesEnabled.aiGeneration) {
        res.status(503).json({
          errorCode: 'FEATURE_DISABLED',
          error: settings.maintenanceBanner || 'ระบบสร้างภาพ AI อยู่ในช่วงปิดปรับปรุงชั่วคราว',
        });
        return;
      }

      const actor = await verifyFirebaseUserFromRequest(req);
      if (actor) {
        if (actor.sessionRevoked) {
          res.status(401).json({
            errorCode: 'SESSION_REVOKED',
            error: 'เซสชันถูกยกเลิก กรุณาเข้าสู่ระบบใหม่',
          });
          return;
        }
        if (actor.entitlement.suspended) {
          res.status(403).json({
            errorCode: 'SUSPENDED',
            error: actor.entitlement.suspendedReason || 'บัญชีของคุณถูกระงับการใช้งาน',
          });
          return;
        }
        if (actor.entitlement.featureOverrides.aiGeneration === false) {
          res.status(403).json({
            errorCode: 'FEATURE_DISABLED',
            error: 'สิทธิ์สร้างภาพ AI ถูกปิดสำหรับบัญชีนี้',
          });
          return;
        }
        const access = computeEffectiveAccessStatus(actor.entitlement);
        if (!access.isActive) {
          res.status(403).json({
            errorCode: 'TRIAL_EXPIRED',
            error: 'สิทธิ์ทดลองใช้ 72 ชั่วโมงหมดอายุแล้ว เชิญเพื่อนหรือติดต่อผู้ดูแลเพื่อขยายวันใช้งาน',
          });
          return;
        }
      } else if (!settings.allowGuestGeneration) {
        res.status(401).json({
          errorCode: 'LOGIN_REQUIRED',
          error: 'ผู้ดูแลระบบกำหนดให้เข้าสู่ระบบด้วย Google ก่อนสร้างภาพ AI',
        });
        return;
      }

      const body = req.body as {
        prompt?: string;
        originalPrompt?: string;
        negativePrompt?: string;
        stylePreset?: StylePresetId;
        aspectRatio?: AspectRatioId;
        generationAspectRatio?: Exclude<AspectRatioId, 'custom'>;
        dimensionsLabel?: string;
        hasReferenceImage?: boolean;
        promptEngine?: string;
        modelId?: string;
        ownerUid?: string;
        ownerName?: string;
        ownerEmail?: string;
        paletteColors?: number[][];
        variationIndex?: number;
        seed?: number;
      };

      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt) {
        res.status(400).json({ errorCode: 'VALIDATION_ERROR', error: 'กรุณาระบุพรอมต์สำหรับสร้างภาพ' });
        return;
      }
      if (isRefusalResponse(prompt)) {
        res.status(422).json({
          status: 'refused',
          errorCode: 'VALIDATION_ERROR',
          error: 'REFUSE: คำขอนี้ไม่สอดคล้องกับนโยบายความปลอดภัย กรุณาปรับข้อความแล้วลองใหม่',
        });
        return;
      }

      const effectiveUid = actor?.uid || body.ownerUid;
      const actorKey = resolveQuotaActorKey(req.ip || req.headers['x-forwarded-for'], effectiveUid);
      const quotaOverride = actor?.entitlement.dailyQuotaOverride ?? null;
      const quotaBefore = getQuotaSnapshot(actorKey, quotaOverride);
      if (quotaBefore.remaining <= 0) {
        res.status(429).json({
          errorCode: 'RATE_LIMIT',
          quota: quotaBefore,
          error: `สร้างภาพครบโควตา ${quotaBefore.limit} ภาพต่อวันแล้ว กรุณาลองใหม่พรุ่งนี้ (สตูดิโอแต่งภาพ แยกเลเยอร์ และวิดีโอยังใช้งานได้ฟรีไม่จำกัด)`,
        });
        return;
      }

      const stylePreset: StylePresetId = STYLE_PRESETS.some((s) => s.id === body.stylePreset)
        ? (body.stylePreset as StylePresetId)
        : 'auto';

      const result = await generateImageViaGateway({
        prompt,
        originalPrompt: body.originalPrompt || prompt,
        negativePrompt: body.negativePrompt,
        stylePreset,
        aspectRatio: body.aspectRatio || '1:1',
        generationAspectRatio: body.generationAspectRatio,
        dimensionsLabel: body.dimensionsLabel,
        hasReferenceImage: Boolean(body.hasReferenceImage),
        promptEngine: body.promptEngine || VISION_PROMPT_MODEL,
        modelId: body.modelId,
        ownerUid: actor?.uid || body.ownerUid,
        ownerName: actor?.displayName || body.ownerName || 'ผู้เยี่ยมชม (Guest)',
        ownerEmail: actor?.email || body.ownerEmail,
        paletteColors: body.paletteColors,
        variationIndex: body.variationIndex,
        seed: body.seed,
      });

      if (!result.ok) {
        res.status(result.status).json({
          errorCode: result.errorCode,
          error: result.error,
        });
        return;
      }

      const quotaAfter = incrementQuotaUsage(actorKey, 1, quotaOverride);
      if (actor?.uid) {
        incrementUserUsageCount(actor.uid, 1);
      }

      res.json({
        imageUrl: result.imageUrl,
        archiveId: result.archiveId,
        model: result.model,
        aspectRatio: result.aspectRatio,
        durationMs: result.durationMs,
        seed: result.seed,
        quota: quotaAfter,
      });
    } catch (error) {
      console.error('Generate image error:', error);
      res.status(500).json({
        errorCode: 'MODEL_DOWN',
        error: 'เกิดข้อผิดพลาดระหว่างเชื่อมต่อระบบสร้างภาพ กรุณากด "ลองใหม่"',
      });
    }
  });

  // Public summary of guest requests (count + sanitized status timeline without PII)
  app.get('/api/requests/summary', (req: Request, res: Response) => {
    const clientToken = typeof req.query.clientToken === 'string' ? req.query.clientToken : '';
    const todayKey = new Date().toISOString().slice(0, 10);
    const list = loadGuestRequests();
    const ip = req.ip || 'local';
    const clientKey = crypto.createHash('sha256').update(`${ip}|${clientToken}`).digest('hex').slice(0, 20);
    const submittedToday = Boolean(
      clientToken && list.some((r) => r.clientKey === clientKey && r.dateKey === todayKey)
    );
    const avgRating =
      list.length > 0
        ? Number((list.reduce((sum, r) => sum + r.rating, 0) / list.length).toFixed(1))
        : 0;
    res.json({
      guestCount: list.length,
      guestAvgRating: avgRating,
      submittedToday,
      todayKey,
      recentTimeline: list.slice(0, 12).map((r) => ({
        id: r.id,
        authorName: r.authorName,
        subject: r.subject,
        rating: r.rating,
        status: r.status,
        adminNote: r.adminNote,
        dateKey: r.dateKey,
        createdAtIso: r.createdAtIso,
      })),
    });
  });

  app.post('/api/requests', (req: Request, res: Response) => {
    const body = req.body as {
      clientToken?: string;
      authorName?: string;
      subject?: string;
      message?: string;
      rating?: number;
      dateKey?: string;
    };
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 140) : '';
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
    const authorName =
      typeof body.authorName === 'string' && body.authorName.trim()
        ? body.authorName.trim().slice(0, 100)
        : 'ผู้เยี่ยมชม ZImage';
    const rating = Number(body.rating);
    const dateKey =
      typeof body.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dateKey)
        ? body.dateKey
        : new Date().toISOString().slice(0, 10);

    if (!subject || !message || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'กรุณากรอกหัวข้อ ข้อความ และเลือกคะแนน 1-5 ดาวให้ครบถ้วน' });
      return;
    }

    const clientToken = typeof body.clientToken === 'string' && body.clientToken ? body.clientToken : 'anon';
    const ip = req.ip || 'local';
    const clientKey = crypto.createHash('sha256').update(`${ip}|${clientToken}`).digest('hex').slice(0, 20);
    const list = loadGuestRequests();

    if (list.some((r) => r.clientKey === clientKey && r.dateKey === dateKey)) {
      res.status(429).json({
        error: 'วันนี้คุณส่งจดหมายคำขอถึงเจ้าหน้าที่แล้ว (ส่งได้วันละ 1 ครั้ง)',
      });
      return;
    }

    const now = new Date().toISOString();
    const item: ServerGuestRequestItem = {
      id: `greq-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      clientKey,
      dateKey,
      authorName,
      subject,
      message,
      rating,
      status: 'submitted',
      adminNote: '',
      createdAtIso: now,
      updatedAtIso: now,
    };
    saveGuestRequests([item, ...list]);
    res.json({ item });
  });

  // ============================================================================
  // OWNER & ADMIN RBAC CONTROL CENTER ENDPOINTS
  // ============================================================================

  app.get('/api/admin/overview', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'overview');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const users = Object.values(loadAllEntitlements()).map(enrichEntitlementWithStatus);
    const referrals = loadReferralLedger();
    const jobs = loadAiJobs();
    const archive = loadArchiveIndex();
    const settings = loadSystemSettings();

    const activeTrialCount = users.filter((u) => u.accessStatus.status === 'active_trial').length;
    const activeBonusCount = users.filter((u) => u.accessStatus.status === 'active_bonus').length;
    const proCount = users.filter((u) => u.plan === 'pro' || u.role === 'owner' || u.role === 'admin').length;
    const suspendedCount = users.filter((u) => u.suspended).length;
    const completedJobs = jobs.filter((j) => j.status === 'completed').length;
    const failedJobs = jobs.filter((j) => j.status === 'failed').length;

    res.json({
      actor: {
        uid: authz.actor.uid,
        email: authz.actor.email,
        role: authz.actor.role,
        isOwner: authz.actor.isOwner,
        adminPermissions: authz.actor.adminPermissions,
      },
      metrics: {
        totalUsers: users.length,
        activeTrialCount,
        activeBonusCount,
        proCount,
        suspendedCount,
        totalArchiveImages: archive.length,
        totalQualifiedReferrals: referrals.filter((r) => r.status === 'qualified').length,
        totalBonusDaysGranted: referrals
          .filter((r) => r.status === 'qualified')
          .reduce((sum, r) => sum + r.deltaDaysGranted, 0),
        totalAiJobs: jobs.length,
        completedJobs,
        failedJobs,
      },
      settings,
    });
  });

  app.get('/api/admin/users', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'users');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const users = Object.values(loadAllEntitlements())
      .map(enrichEntitlementWithStatus)
      .filter(
        (u) =>
          !q ||
          u.email.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.referralCode.toLowerCase().includes(q)
      )
      .sort((a, b) => Date.parse(b.lastSeenAtUtc) - Date.parse(a.lastSeenAtUtc));

    res.json({ users, total: users.length });
  });

  app.post('/api/admin/users/:uid/action', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'users');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const body = req.body as {
      action?: AdminUserActionType;
      days?: number;
      plan?: PlanTier;
      featureKey?: 'aiGeneration' | 'aiDecompose' | 'proEditor' | 'videoEditor' | 'psdExport';
      featureValue?: boolean;
      dailyQuotaOverride?: number | null;
      reason?: string;
      role?: UserRole;
      adminPermissions?: AdminPermissionKey[];
    };
    if (!body.action) {
      res.status(400).json({ error: 'กรุณาระบุประเภทคำสั่ง' });
      return;
    }
    const result = applyAdminUserAction({
      actor: authz.actor,
      targetUid: String(req.params.uid || ''),
      action: body.action,
      days: body.days,
      plan: body.plan,
      featureKey: body.featureKey,
      featureValue: body.featureValue,
      dailyQuotaOverride: body.dailyQuotaOverride,
      reason: body.reason,
      role: body.role,
      adminPermissions: body.adminPermissions,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, user: enrichEntitlementWithStatus(result.user) });
  });

  app.get('/api/admin/referrals', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'referrals');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    if (req.query.format === 'csv') {
      const csv = exportReferralsCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="zimage-referrals.csv"');
      res.send(csv);
      return;
    }
    res.json({ items: loadReferralLedger() });
  });

  app.post('/api/admin/referrals/:id/clawback', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'referrals');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const body = req.body as { reason?: string };
    const result = clawbackReferralEntry({
      actor: authz.actor,
      entryId: String(req.params.id || ''),
      reason: body.reason,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, entry: result.entry });
  });

  app.get('/api/admin/ai-jobs', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'jobs');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    res.json({ items: loadAiJobs() });
  });

  app.get('/api/admin/settings', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'settings');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    res.json({ settings: loadSystemSettings() });
  });

  app.patch('/api/admin/settings', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'settings');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const prev = loadSystemSettings();
    const patch = req.body as Partial<SystemSettingsRecord>;
    const next: SystemSettingsRecord = {
      ...prev,
      trialHours:
        typeof patch.trialHours === 'number' && patch.trialHours >= 1 && patch.trialHours <= 720
          ? Math.round(patch.trialHours)
          : prev.trialHours,
      monthlyInviteCap:
        typeof patch.monthlyInviteCap === 'number' && patch.monthlyInviteCap >= 1 && patch.monthlyInviteCap <= 50
          ? Math.round(patch.monthlyInviteCap)
          : prev.monthlyInviteCap,
      defaultDailyLimit:
        typeof patch.defaultDailyLimit === 'number' && patch.defaultDailyLimit >= 1 && patch.defaultDailyLimit <= 5000
          ? Math.round(patch.defaultDailyLimit)
          : prev.defaultDailyLimit,
      allowGuestGeneration:
        typeof patch.allowGuestGeneration === 'boolean'
          ? patch.allowGuestGeneration
          : prev.allowGuestGeneration,
      maintenanceMode:
        typeof patch.maintenanceMode === 'boolean' ? patch.maintenanceMode : prev.maintenanceMode,
      maintenanceBanner:
        typeof patch.maintenanceBanner === 'string'
          ? patch.maintenanceBanner.trim().slice(0, 300)
          : prev.maintenanceBanner,
      milestoneDays: patch.milestoneDays
        ? { ...prev.milestoneDays, ...patch.milestoneDays }
        : prev.milestoneDays,
      aiFeaturesEnabled: patch.aiFeaturesEnabled
        ? { ...prev.aiFeaturesEnabled, ...patch.aiFeaturesEnabled }
        : prev.aiFeaturesEnabled,
      updatedAtUtc: new Date().toISOString(),
      updatedByEmail: authz.actor.email,
    };
    saveSystemSettings(next);
    appendAuditLog({
      actorUid: authz.actor.uid,
      actorEmail: authz.actor.email,
      actorRole: authz.actor.role,
      action: 'settings.update',
      targetType: 'settings',
      targetId: 'global',
      summary: `${authz.actor.email} updated system settings`,
      beforeJson: JSON.stringify(prev),
      afterJson: JSON.stringify(next),
    });
    res.json({ ok: true, settings: next });
  });

  app.get('/api/admin/audit-logs', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'audit');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    res.json({ items: loadAuditLogs().slice(0, 200) });
  });

  app.get('/api/admin/generated-archive', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'gallery');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const list = loadArchiveIndex();
    const hydrated = list.slice(0, 60).map((item) => {
      let imageDataUrl = '';
      try {
        const fp = path.join(ARCHIVE_IMAGES_DIR, item.imageFile);
        if (fs.existsSync(fp)) {
          imageDataUrl = fs.readFileSync(fp, 'utf8');
        }
      } catch {
        imageDataUrl = '';
      }
      return {
        ...item,
        imageDataUrl,
      };
    });
    res.json({ totalCount: list.length, items: hydrated });
  });

  app.delete('/api/admin/generated-archive/:id', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'gallery');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const id = req.params.id;
    const list = loadArchiveIndex();
    const target = list.find((item) => item.id === id);
    if (target) {
      const fp = path.join(ARCHIVE_IMAGES_DIR, target.imageFile);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    saveArchiveIndex(list.filter((item) => item.id !== id));
    appendAuditLog({
      actorUid: authz.actor.uid,
      actorEmail: authz.actor.email,
      actorRole: authz.actor.role,
      action: 'archive.delete',
      targetType: 'archive',
      targetId: String(id),
      summary: `Deleted archive image ${id}`,
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/requests', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'requests');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    res.json({ items: loadGuestRequests() });
  });

  app.patch('/api/admin/requests/:id', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'requests');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const id = req.params.id;
    const body = req.body as { status?: RequestStatus; adminNote?: string };
    const validStatuses: RequestStatus[] = ['submitted', 'reviewed', 'in-progress', 'completed'];
    const list = loadGuestRequests();
    const updated = list.map((item) =>
      item.id === id
        ? {
            ...item,
            status: body.status && validStatuses.includes(body.status) ? body.status : item.status,
            adminNote:
              typeof body.adminNote === 'string'
                ? body.adminNote.trim().slice(0, 1000)
                : item.adminNote,
            updatedAtIso: new Date().toISOString(),
          }
        : item
    );
    saveGuestRequests(updated);
    res.json({ ok: true });
  });

  app.delete('/api/admin/requests/:id', async (req: Request, res: Response) => {
    const authz = await verifyAdminWithPermission(req, 'requests');
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return;
    }
    const id = req.params.id;
    saveGuestRequests(loadGuestRequests().filter((item) => item.id !== id));
    res.json({ ok: true });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`ZImage server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
