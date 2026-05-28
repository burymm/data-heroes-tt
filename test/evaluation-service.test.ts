import { describe, it, expect, vi } from 'vitest';
import { EvaluationService } from '../src/app/evaluation-service.js';
import type { PreferenceRepository } from '../src/infra/repositories/preference-repository.js';
import type { PolicyRepository } from '../src/infra/repositories/policy-repository.js';

const defaultUser = { id: 'user-1', email: 'a@b.com', phone: '+70000000000', region: 'US' as const };

function mockPrefs(overrides: Partial<PreferenceRepository> = {}): PreferenceRepository {
  return {
    getUser: vi.fn().mockResolvedValue(defaultUser),
    createUser: vi.fn(),
    getDefaults: vi.fn().mockResolvedValue([]),
    getUserPreferences: vi.fn().mockResolvedValue([]),
    getQuietHours: vi.fn().mockResolvedValue([]),
    getUserMessengers: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as PreferenceRepository;
}

function mockPolicies(rows: any[] = []): PolicyRepository {
  return { getGlobalPolicies: vi.fn().mockResolvedValue(rows) } as unknown as PolicyRepository;
}

describe('EvaluationService', () => {
  it('allows when defaults enabled', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getDefaults: vi.fn().mockResolvedValue([{ category: 'marketing', channel: 'email', enabled: true }]), getUserPreferences: vi.fn().mockResolvedValue([]), getQuietHours: vi.fn().mockResolvedValue([]) }),
      mockPolicies(),
    );
    const r = await svc.evaluate('u', 'marketing', 'email', 'US', new Date());
    expect(r).toEqual({ decision: 'allow', reason: null });
  });

  it('denies when global policy blocks', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getDefaults: vi.fn().mockResolvedValue([{ category: 'marketing', channel: 'sms', enabled: true }]), getUserPreferences: vi.fn().mockResolvedValue([]), getQuietHours: vi.fn().mockResolvedValue([]) }),
      mockPolicies([{ category: 'marketing', channel: 'sms', region: 'EU' }]),
    );
    const r = await svc.evaluate('u', 'marketing', 'sms', 'EU', new Date());
    expect(r).toEqual({ decision: 'deny', reason: 'blocked_by_global_policy' });
  });

  it('denies when user has disabled', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getDefaults: vi.fn().mockResolvedValue([{ category: 'marketing', channel: 'email', enabled: true }]), getUserPreferences: vi.fn().mockResolvedValue([{ category: 'marketing', channel: 'email', enabled: false }]), getQuietHours: vi.fn().mockResolvedValue([]) }),
      mockPolicies(),
    );
    const r = await svc.evaluate('u', 'marketing', 'email', 'US', new Date());
    expect(r).toEqual({ decision: 'deny', reason: 'blocked_by_user_preference' });
  });

  it('denies messenger if not connected', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getUserPreferences: vi.fn().mockResolvedValue([]), getQuietHours: vi.fn().mockResolvedValue([]), getUserMessengers: vi.fn().mockResolvedValue([]) }),
      mockPolicies(),
    );
    const r = await svc.evaluate('u', 'marketing', 'telegram', 'US', new Date());
    expect(r).toEqual({ decision: 'deny', reason: 'blocked_by_messenger_not_connected' });
  });

  it('denies email if user has no email on profile', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getUser: vi.fn().mockResolvedValue({ id: 'u', email: null, phone: '+70000000000', region: 'US' }) }),
      mockPolicies(),
    );
    const r = await svc.evaluate('u', 'marketing', 'email', 'US', new Date());
    expect(r).toEqual({ decision: 'deny', reason: 'blocked_by_contact_missing' });
  });

  it('denies sms if user has no phone on profile', async () => {
    const svc = new EvaluationService(
      mockPrefs({ getUser: vi.fn().mockResolvedValue({ id: 'u', email: 'a@b.com', phone: null, region: 'US' }) }),
      mockPolicies(),
    );
    const r = await svc.evaluate('u', 'marketing', 'sms', 'US', new Date());
    expect(r).toEqual({ decision: 'deny', reason: 'blocked_by_contact_missing' });
  });
});
