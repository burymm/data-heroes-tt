import type {
  Category,
  Channel,
  PreferenceEntry,
  QuietHours,
  UserMessenger,
  Region,
} from '../domain/types.js';
import type { PreferenceRepository } from '../infra/repositories/preference-repository.js';
import { logger } from '../infra/logger.js';

export class PreferenceService {
  constructor(private readonly repo: PreferenceRepository) {}

  async getPreferences(userId: string): Promise<{
    defaults: PreferenceEntry[];
    overrides: PreferenceEntry[];
    messengers: UserMessenger[];
    quietHours: QuietHours[];
    effective: PreferenceEntry[];
  }> {
    const [defaults, overrides, messengers, quietHours] = await Promise.all([
      this.repo.getDefaults(),
      this.repo.getUserPreferences(userId),
      this.repo.getUserMessengers(userId),
      this.repo.getQuietHours(userId),
    ]);

    const overrideMap = new Map(
      overrides.map((o) => [`${o.category}:${o.channel}`, o]),
    );

    const effective = defaults.map((d) => {
      const override = overrideMap.get(`${d.category}:${d.channel}`);
      return override ?? d;
    });

    return { defaults, overrides, messengers, quietHours, effective };
  }

  async createUser(
    id: string,
    email: string | null,
    phone: string | null,
    region: Region,
  ): Promise<void> {
    await this.repo.createUser(id, email, phone, region);
    logger.info({ id, email, phone, region }, 'user created');
  }

  async updatePreference(
    userId: string,
    category: Category,
    channel: Channel,
    enabled: boolean,
  ): Promise<void> {
    await this.repo.upsertUserPreference(userId, category, channel, enabled);
    logger.info({ userId, category, channel, enabled }, 'preference updated');
  }

  async batchUpdatePreference(
    userId: string,
    channel: Channel,
    enabled: boolean,
  ): Promise<void> {
    await this.repo.batchUpsertUserPreferences(userId, [
      { category: 'transactional' as Category, channel, enabled },
      { category: 'marketing' as Category, channel, enabled },
    ]);
    logger.info({ userId, channel, enabled }, 'batch preference updated');
  }

  async updateQuietHours(
    userId: string,
    intervals: QuietHours[],
  ): Promise<void> {
    await this.repo.setQuietHours(userId, intervals);
    logger.info({ userId, intervals }, 'quiet hours updated');
  }

  async connectMessenger(userId: string, messenger: string): Promise<void> {
    await this.repo.connectMessenger(userId, messenger);
    logger.info({ userId, messenger }, 'messenger connected');
  }

  async disconnectMessenger(userId: string, messenger: string): Promise<void> {
    await this.repo.disconnectMessenger(userId, messenger);
    logger.info({ userId, messenger }, 'messenger disconnected');
  }
}
