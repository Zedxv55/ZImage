import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MONTHLY_INVITE_CAP,
  computeEffectiveAccessStatus,
  computeMilestoneDeltaDays,
  hasAdminMenuPermission,
  syncMonthlyInviteReset,
  validateReferralClaim,
} from './trialReferralRules';

test('milestone bonus days match exact 1->1d, 2->4d, 3->8d, 4->16d, 5->32d non-stacking schedule', () => {
  const r1 = computeMilestoneDeltaDays(0, 1);
  assert.equal(r1.nextTotalDays, 1);
  assert.equal(r1.deltaDays, 1);

  const r2 = computeMilestoneDeltaDays(1, 2);
  assert.equal(r2.nextTotalDays, 4);
  assert.equal(r2.deltaDays, 3);

  const r3 = computeMilestoneDeltaDays(2, 3);
  assert.equal(r3.nextTotalDays, 8);
  assert.equal(r3.deltaDays, 4);

  const r4 = computeMilestoneDeltaDays(3, 4);
  assert.equal(r4.nextTotalDays, 16);
  assert.equal(r4.deltaDays, 8);

  const r5 = computeMilestoneDeltaDays(4, 5);
  assert.equal(r5.nextTotalDays, 32);
  assert.equal(r5.deltaDays, 16);

  // Sum of deltas 1 + 3 + 4 + 8 + 16 = 32
  assert.equal(r1.deltaDays + r2.deltaDays + r3.deltaDays + r4.deltaDays + r5.deltaDays, 32);

  // Exceeding cap grants 0 extra days
  const r6 = computeMilestoneDeltaDays(5, 6);
  assert.equal(r6.deltaDays, 0);
});

test('monthly invite counter resets on UTC month rollover without stripping accrued bonusDaysTotal', () => {
  const account = {
    monthlyInviteCount: 5,
    monthlyInviteMonthKey: '2026-10',
    bonusDaysTotal: 32,
  };
  const rolled = syncMonthlyInviteReset(account, new Date('2026-11-01T00:05:00.000Z'));
  assert.equal(rolled.monthlyInviteCount, 0);
  assert.equal(rolled.monthlyInviteMonthKey, '2026-11');
  assert.equal(rolled.bonusDaysTotal, 32);
});

test('72-hour UTC trial expires accurately and extends cleanly with bonus days', () => {
  const startMs = Date.parse('2026-11-01T00:00:00.000Z');
  const endIso = new Date(startMs + 72 * 3600 * 1000).toISOString();

  const beforeEnd = computeEffectiveAccessStatus(
    { role: 'user', plan: 'trial', trialExpiresAtUtc: endIso, bonusDaysTotal: 0, suspended: false },
    startMs + 71 * 3600 * 1000
  );
  assert.equal(beforeEnd.isActive, true);
  assert.equal(beforeEnd.status, 'active_trial');

  const afterEnd = computeEffectiveAccessStatus(
    { role: 'user', plan: 'trial', trialExpiresAtUtc: endIso, bonusDaysTotal: 0, suspended: false },
    startMs + 73 * 3600 * 1000
  );
  assert.equal(afterEnd.isActive, false);
  assert.equal(afterEnd.status, 'expired');

  const withBonus = computeEffectiveAccessStatus(
    { role: 'user', plan: 'trial', trialExpiresAtUtc: endIso, bonusDaysTotal: 4, suspended: false },
    startMs + 100 * 3600 * 1000
  );
  assert.equal(withBonus.isActive, true);
  assert.equal(withBonus.status, 'active_bonus');
});

test('referral claim anti-fraud blocks self-referral, unverified email, duplicates, and >5/month cap', () => {
  assert.equal(
    validateReferralClaim({
      inviterUid: 'u1',
      inviteeUid: 'u1',
      inviteeEmailVerified: true,
      inviteeAlreadyReferred: false,
      inviterMonthlyInviteCount: 0,
    }).ok,
    false
  );
  assert.equal(
    validateReferralClaim({
      inviterUid: 'u1',
      inviteeUid: 'u2',
      inviteeEmailVerified: false,
      inviteeAlreadyReferred: false,
      inviterMonthlyInviteCount: 0,
    }).ok,
    false
  );
  assert.equal(
    validateReferralClaim({
      inviterUid: 'u1',
      inviteeUid: 'u2',
      inviteeEmailVerified: true,
      inviteeAlreadyReferred: true,
      inviterMonthlyInviteCount: 0,
    }).ok,
    false
  );
  assert.equal(
    validateReferralClaim({
      inviterUid: 'u1',
      inviteeUid: 'u2',
      inviteeEmailVerified: true,
      inviteeAlreadyReferred: false,
      inviterMonthlyInviteCount: DEFAULT_MONTHLY_INVITE_CAP,
    }).ok,
    false
  );
  assert.equal(
    validateReferralClaim({
      inviterUid: 'u1',
      inviteeUid: 'u2',
      inviteeEmailVerified: true,
      inviteeAlreadyReferred: false,
      inviterMonthlyInviteCount: 2,
    }).ok,
    true
  );
});

test('RBAC menu permission enforcement grants owner all access and limits moderator/user', () => {
  assert.equal(hasAdminMenuPermission('owner', [], 'settings'), true);
  assert.equal(hasAdminMenuPermission('moderator', ['overview', 'requests'], 'requests'), true);
  assert.equal(hasAdminMenuPermission('moderator', ['overview', 'requests'], 'settings'), false);
  assert.equal(hasAdminMenuPermission('user', ['overview'], 'overview'), false);
});
