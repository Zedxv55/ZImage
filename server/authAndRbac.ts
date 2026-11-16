import type { Request } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_EMAILS, SUPER_ADMIN_EMAIL } from '../src/utils/promptLogic.ts';
import {
  ALL_ADMIN_PERMISSIONS,
  hasAdminMenuPermission,
} from '../src/utils/trialReferralRules.ts';
import type { AdminPermissionKey, UserRole } from '../src/utils/trialReferralRules.ts';
import { ensureUserEntitlement } from './trialReferralService.ts';
import type { ServerUserEntitlement } from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export function getFirebaseApiKey(): string {
  try {
    const cfgPath = path.resolve(ROOT_DIR, 'firebase-applet-config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { apiKey?: string };
    return cfg.apiKey || '';
  } catch {
    return '';
  }
}

export interface VerifiedActor {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  photoURL: string;
  role: UserRole;
  adminPermissions: AdminPermissionKey[];
  isOwner: boolean;
  isAdmin: boolean;
  sessionRevoked: boolean;
  entitlement: ServerUserEntitlement;
}

export async function verifyFirebaseUserFromRequest(req: Request): Promise<VerifiedActor | null> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;

  const apiKey = getFirebaseApiKey();
  if (!apiKey) return null;

  try {
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(6000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    );
    if (!lookupRes.ok) return null;
    const data = (await lookupRes.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
        photoUrl?: string;
      }>;
    };
    const u = data.users?.[0];
    if (!u || !u.localId || !u.email) return null;

    const emailLower = u.email.trim().toLowerCase();
    const emailVerified = u.emailVerified === true;
    const displayName = (u.displayName || emailLower.split('@')[0] || 'ZImage Member').slice(0, 100);
    const photoURL = (u.photoUrl || '').slice(0, 500);

    const entitlement = ensureUserEntitlement({
      uid: u.localId,
      email: emailLower,
      emailVerified,
      displayName,
      photoURL,
    });

    const isOwner = emailVerified && emailLower === SUPER_ADMIN_EMAIL;
    const isAdmin =
      emailVerified &&
      (isOwner ||
        entitlement.role === 'admin' ||
        entitlement.role === 'moderator' ||
        (ADMIN_EMAILS as readonly string[]).includes(emailLower));

    const headerSessionRaw = req.headers['x-session-version'];
    const headerSession = typeof headerSessionRaw === 'string' ? Number(headerSessionRaw) : NaN;
    const sessionRevoked =
      Number.isFinite(headerSession) && headerSession < entitlement.sessionVersion;

    return {
      uid: u.localId,
      email: emailLower,
      emailVerified,
      displayName,
      photoURL,
      role: isOwner ? 'owner' : entitlement.role,
      adminPermissions: isOwner ? [...ALL_ADMIN_PERMISSIONS] : entitlement.adminPermissions,
      isOwner,
      isAdmin,
      sessionRevoked,
      entitlement,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminWithPermission(
  req: Request,
  neededPermission: AdminPermissionKey
): Promise<{ ok: true; actor: VerifiedActor } | { ok: false; status: number; error: string }> {
  const actor = await verifyFirebaseUserFromRequest(req);
  if (!actor || !actor.emailVerified) {
    return { ok: false, status: 403, error: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ที่ยืนยันตัวตนแล้ว' };
  }
  if (actor.sessionRevoked) {
    return {
      ok: false,
      status: 401,
      error: 'เซสชันของคุณถูกยกเลิกโดยผู้ดูแลระบบ กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
    };
  }
  if (!actor.isAdmin || !hasAdminMenuPermission(actor.role, actor.adminPermissions, neededPermission)) {
    return {
      ok: false,
      status: 403,
      error: 'บัญชีของคุณไม่มีสิทธิ์เข้าถึงเมนูผู้ดูแลส่วนนี้',
    };
  }
  return { ok: true, actor };
}
