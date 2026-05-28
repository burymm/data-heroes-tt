import { describe, it, expect, vi } from 'vitest';
import { EvaluationService } from '../src/app/evaluation-service.js';
import type { PreferenceRepository } from '../src/infra/repositories/preference-repository.js';
import type { PolicyRepository } from '../src/infra/repositories/policy-repository.js';

const defaultUser = { id: 'u', email: 'a@b.com', phone: '+70000000000', region: 'US' as const };

function mockPrefs(overrides: Partial<PreferenceRepository> = {}): PreferenceRepository {
  return {
    getUser: vi.fn().mockResolvedValue(defaultUser),
    getDefaults: vi.fn().mockResolvedValue([]),
    getUserPreferences: vi.fn().mockResolvedValue([]),
    getQuietHours: vi.fn().mockResolvedValue([]),
    getUserMessengers: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as PreferenceRepository;
}

const policies = { getGlobalPolicies: vi.fn().mockResolvedValue([]) } as unknown as PolicyRepository;

describe('Quiet hours', () => {
  // Interval without channel = blocks ALL channels (any category)
  it('blocks any channel (no channel filter) during quiet hours', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getDefaults: vi.fn().mockResolvedValue([{ category: 'transactional', channel: 'push', enabled: true }, { category: 'marketing', channel: 'push', enabled: true }]), getUserPreferences: vi.fn().mockResolvedValue([]), getQuietHours: vi.fn().mockResolvedValue([{ startTime: '22:00', endTime: '08:00', timezone: 'Europe/Berlin' }]) }),
      policies,
    );
    // 23:30Z = 01:30 CEST — inside interval, no channel filter
    expect((await svc.evaluate('u', 'marketing', 'push', 'US', new Date('2026-05-21T23:30:00Z'))).decision).toBe('deny');
    expect((await svc.evaluate('u', 'transactional', 'push', 'US', new Date('2026-05-21T23:30:00Z'))).decision).toBe('deny');
  });

  it('allows outside quiet hours', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getDefaults: vi.fn().mockResolvedValue([{ category: 'marketing', channel: 'push', enabled: true }]), getUserPreferences: vi.fn().mockResolvedValue([]), getQuietHours: vi.fn().mockResolvedValue([{ startTime: '22:00', endTime: '08:00', timezone: 'Europe/Berlin' }]) }),
      policies,
    );
    const r = await svc.evaluate('u', 'marketing', 'push', 'US', new Date('2026-05-21T18:30:00Z'));
    expect(r).toEqual({ decision: 'allow', reason: null });
  });

  // Interval with channel = blocks only that specific channel
  it('blocks only the matching channel when channel is set', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getDefaults: vi.fn().mockResolvedValue([{ category: 'marketing', channel: 'push', enabled: true }, { category: 'marketing', channel: 'sms', enabled: true }]), getUserPreferences: vi.fn().mockResolvedValue([]), getQuietHours: vi.fn().mockResolvedValue([{ startTime: '08:00', endTime: '22:00', timezone: 'Europe/Berlin', channel: 'sms' }]) }),
      policies,
    );
    // 15:00Z = 17:00 CEST — inside interval, channel=sms
    expect((await svc.evaluate('u', 'marketing', 'sms', 'US', new Date('2026-05-21T15:00:00Z'))).decision).toBe('deny');
    // Same time, different channel — not blocked
    expect((await svc.evaluate('u', 'marketing', 'push', 'US', new Date('2026-05-21T15:00:00Z'))).decision).toBe('allow');
  });

  // Multi-interval: one blocks all (night), one blocks specific (sms daytime)
  it('handles mix of all-channel and per-channel intervals', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getDefaults: vi.fn().mockResolvedValue([{ category: 'marketing', channel: 'push', enabled: true }, { category: 'marketing', channel: 'sms', enabled: true }]), getUserPreferences: vi.fn().mockResolvedValue([]), getQuietHours: vi.fn().mockResolvedValue([{ startTime: '22:00', endTime: '08:00', timezone: 'Europe/Berlin', channel: 'push' }, { startTime: '08:00', endTime: '22:00', timezone: 'Europe/Berlin', channel: 'sms' }]) }),
      policies,
    );
    // 23:00Z = 01:00 CEST — push blocked (night), sms allowed (no sms filter at night)
    expect((await svc.evaluate('u', 'marketing', 'push', 'US', new Date('2026-05-21T23:00:00Z'))).decision).toBe('deny');
    expect((await svc.evaluate('u', 'marketing', 'sms', 'US', new Date('2026-05-21T23:00:00Z'))).decision).toBe('allow');
    // 15:00Z = 17:00 CEST — sms blocked (day), push allowed (no push filter at day)
    expect((await svc.evaluate('u', 'marketing', 'sms', 'US', new Date('2026-05-21T15:00:00Z'))).decision).toBe('deny');
    expect((await svc.evaluate('u', 'marketing', 'push', 'US', new Date('2026-05-21T15:00:00Z'))).decision).toBe('allow');
  });
});
