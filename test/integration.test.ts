import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { PreferenceRepository } from '../src/infra/repositories/preference-repository.js';
import { PolicyRepository } from '../src/infra/repositories/policy-repository.js';
import { PreferenceService } from '../src/app/preference-service.js';
import { EvaluationService } from '../src/app/evaluation-service.js';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://app:app@localhost:5430/notification_preferences';

const describeDb = process.env.SKIP_DB_TESTS ? describe.skip : describe;

describeDb('Integration', () => {
  let sql: postgres.Sql;
  let prefRepo: PreferenceRepository;
  let policyRepo: PolicyRepository;
  let prefService: PreferenceService;
  let evalService: EvaluationService;

  const ALICE = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  beforeAll(async () => {
    sql = postgres(DATABASE_URL, { onnotice: () => {} });
    prefRepo = new PreferenceRepository(sql);
    policyRepo = new PolicyRepository(sql);
    prefService = new PreferenceService(prefRepo);
    evalService = new EvaluationService(prefRepo, policyRepo);
  });

  afterAll(async () => {
    await sql.end();
  });

  it('defaults seeded for universal channels', async () => {
    const defaults = await prefRepo.getDefaults();
    expect(defaults).toHaveLength(6);
  });

  it('user exists with email and phone', async () => {
    const user = await prefRepo.getUser(ALICE);
    expect(user).not.toBeNull();
    expect(user!.email).toBe('alice@example.com');
    expect(user!.phone).toBe('+490123456789');
  });

  it('allows transactional email by default', async () => {
    const r = await evalService.evaluate(ALICE, 'transactional', 'email', 'US', new Date());
    expect(r.decision).toBe('allow');
  });

  it('respects user override', async () => {
    const uid = '00000000-0000-0000-0000-000000000001';
    await prefService.createUser(uid, 'x@y.com', '+70000000000', 'US');
    await prefService.updatePreference(uid, 'marketing', 'email', true);
    expect((await evalService.evaluate(uid, 'marketing', 'email', 'US', new Date())).decision).toBe('allow');
    await prefService.updatePreference(uid, 'marketing', 'email', false);
    expect((await evalService.evaluate(uid, 'marketing', 'email', 'US', new Date())).decision).toBe('deny');
  });

  it('global policy blocks marketing sms in EU', async () => {
    const uid = '00000000-0000-0000-0000-000000000002';
    await prefService.createUser(uid, 'x@y.com', '+70000000000', 'US');
    await prefService.updatePreference(uid, 'marketing', 'sms', true);
    expect((await evalService.evaluate(uid, 'marketing', 'sms', 'EU', new Date())).decision).toBe('deny');
    expect((await evalService.evaluate(uid, 'marketing', 'sms', 'US', new Date())).decision).toBe('allow');
  });

  it('denies email if user has no email', async () => {
    const uid = '00000000-0000-0000-0000-000000000003';
    await prefService.createUser(uid, null, '+70000000000', 'US');
    const r = await evalService.evaluate(uid, 'transactional', 'email', 'US', new Date());
    expect(r.decision).toBe('deny');
    expect(r.reason).toBe('blocked_by_contact_missing');
  });

  it('denies sms if user has no phone', async () => {
    const uid = '00000000-0000-0000-0000-000000000004';
    await prefService.createUser(uid, 'x@y.com', null, 'US');
    const r = await evalService.evaluate(uid, 'transactional', 'sms', 'US', new Date());
    expect(r.decision).toBe('deny');
    expect(r.reason).toBe('blocked_by_contact_missing');
  });

  it('denies messenger if not connected', async () => {
    const r = await evalService.evaluate(ALICE, 'marketing', 'signal', 'US', new Date());
    expect(r.decision).toBe('deny');
    expect(r.reason).toBe('blocked_by_messenger_not_connected');
  });

  it('allows messenger if connected and enabled', async () => {
    const uid = '00000000-0000-0000-0000-000000000005';
    await prefService.createUser(uid, 'x@y.com', '+70000000000', 'US');
    await prefRepo.connectMessenger(uid, 'telegram');
    await prefService.updatePreference(uid, 'marketing', 'telegram', true);
    const r = await evalService.evaluate(uid, 'marketing', 'telegram', 'US', new Date());
    expect(r.decision).toBe('allow');
  });

  it('is idempotent', async () => {
    const uid = '00000000-0000-0000-0000-000000000006';
    await prefService.createUser(uid, 'x@y.com', '+70000000000', 'US');
    await prefService.updatePreference(uid, 'marketing', 'email', true);
    await prefService.updatePreference(uid, 'marketing', 'email', true);
    const prefs = await prefRepo.getUserPreferences(uid);
    expect(prefs.find((p) => p.category === 'marketing' && p.channel === 'email')?.enabled).toBe(true);
  });

  it('supports multiple quiet hours intervals', async () => {
    const uid = '00000000-0000-0000-0000-000000000007';
    await prefService.createUser(uid, 'x@y.com', '+70000000000', 'US');
    await prefService.updatePreference(uid, 'marketing', 'push', true);

    await prefService.updateQuietHours(uid, [
      { startTime: '12:00', endTime: '14:00', timezone: 'Europe/Berlin' },
      { startTime: '22:00', endTime: '08:00', timezone: 'Europe/Berlin' },
    ]);

    const qh = await prefRepo.getQuietHours(uid);
    expect(qh).toHaveLength(2);

    // 11:00Z = 13:00 CEST (within 12:00-14:00 lunch interval)
    const insideLunch = await evalService.evaluate(uid, 'marketing', 'push', 'US', new Date('2026-05-21T11:00:00Z'));
    expect(insideLunch.decision).toBe('deny');
    expect(insideLunch.reason).toBe('blocked_by_quiet_hours');

    // 23:00Z = 01:00 CEST (within 22:00-08:00 night interval)
    const insideNight = await evalService.evaluate(uid, 'marketing', 'push', 'US', new Date('2026-05-21T23:00:00Z'));
    expect(insideNight.decision).toBe('deny');

    // 15:00Z = 17:00 CEST (outside both intervals)
    const outside = await evalService.evaluate(uid, 'marketing', 'push', 'US', new Date('2026-05-21T15:00:00Z'));
    expect(outside.decision).toBe('allow');

    // Replacing intervals works
    await prefService.updateQuietHours(uid, [{ startTime: '09:00', endTime: '17:00', timezone: 'Europe/Berlin' }]);
    const qh2 = await prefRepo.getQuietHours(uid);
    expect(qh2).toHaveLength(1);
  });

  it('blocks per-channel in quiet hours', async () => {
    const uid = '00000000-0000-0000-0000-000000000008';
    await prefService.createUser(uid, 'x@y.com', '+70000000000', 'US');
    await prefService.updatePreference(uid, 'marketing', 'push', true);
    await prefService.updatePreference(uid, 'marketing', 'sms', true);

    // Block sms during work hours, block push at night
    await prefService.updateQuietHours(uid, [
      { startTime: '08:00', endTime: '18:00', timezone: 'Europe/Berlin', channel: 'sms' },
      { startTime: '18:00', endTime: '08:00', timezone: 'Europe/Berlin', channel: 'push' },
    ]);

    // 15:00Z = 17:00 CEST — sms blocked, push allowed
    expect((await evalService.evaluate(uid, 'marketing', 'sms', 'US', new Date('2026-05-21T15:00:00Z'))).decision).toBe('deny');
    expect((await evalService.evaluate(uid, 'marketing', 'push', 'US', new Date('2026-05-21T15:00:00Z'))).decision).toBe('allow');

    // 23:00Z = 01:00 CEST — push blocked, sms allowed
    expect((await evalService.evaluate(uid, 'marketing', 'push', 'US', new Date('2026-05-21T23:00:00Z'))).decision).toBe('deny');
    expect((await evalService.evaluate(uid, 'marketing', 'sms', 'US', new Date('2026-05-21T23:00:00Z'))).decision).toBe('allow');
  });
});
