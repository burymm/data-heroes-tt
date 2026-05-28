import { describe, it, expect, vi } from 'vitest';
import { PreferenceService } from '../src/app/preference-service.js';
import type { PreferenceRepository } from '../src/infra/repositories/preference-repository.js';

function mockRepo(overrides: Partial<PreferenceRepository> = {}): PreferenceRepository {
  return {
    getUser: vi.fn(),
    createUser: vi.fn(),
    getDefaults: vi.fn(),
    getUserPreferences: vi.fn(),
    upsertUserPreference: vi.fn(),
    getQuietHours: vi.fn(),
    getUserMessengers: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as PreferenceRepository;
}

describe('Idempotency', () => {
  it('same preference twice is idempotent', async () => {
    const upsertMock = vi.fn().mockResolvedValue(undefined);
    const svc = new PreferenceService(mockRepo({ upsertUserPreference: upsertMock }));

    await svc.updatePreference('u', 'marketing', 'email', false);
    await svc.updatePreference('u', 'marketing', 'email', false);

    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledWith('u', 'marketing', 'email', false);
  });

  it('toggling is valid', async () => {
    const upsertMock = vi.fn().mockResolvedValue(undefined);
    const svc = new PreferenceService(mockRepo({ upsertUserPreference: upsertMock }));

    await svc.updatePreference('u', 'marketing', 'email', true);
    await svc.updatePreference('u', 'marketing', 'email', false);
    await svc.updatePreference('u', 'marketing', 'email', true);

    expect(upsertMock.mock.calls).toEqual([
      ['u', 'marketing', 'email', true],
      ['u', 'marketing', 'email', false],
      ['u', 'marketing', 'email', true],
    ]);
  });
});
