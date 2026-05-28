import type {
  Category,
  Channel,
  Region,
  EvaluationResult,
  DenyReason,
  User,
  QuietHours,
  PreferenceEntry,
  GlobalPolicy,
  UserMessenger,
} from '../domain/types.js';
import { CATEGORIES, isUniversalChannel } from '../domain/types.js';
import type { PreferenceRepository } from '../infra/repositories/preference-repository.js';
import type { PolicyRepository } from '../infra/repositories/policy-repository.js';
import { logger } from '../infra/logger.js';

interface ChannelAvailability {
  category: Category;
  channel: Channel;
  available: boolean;
  reason: DenyReason | null;
}

interface EvaluationData {
  user: User;
  allPolicies: GlobalPolicy[];
  quietHours: QuietHours[];
  userPrefs: PreferenceEntry[];
  defaults: PreferenceEntry[];
  messengers: UserMessenger[];
}

export class EvaluationService {
  constructor(
    private readonly prefs: PreferenceRepository,
    private readonly policies: PolicyRepository,
  ) {}

  async loadEvaluationData(userId: string): Promise<EvaluationData | null> {
    const user = await this.prefs.getUser(userId);
    if (!user) return null;
    const [allPolicies, quietHours, userPrefs, defaults, messengers] = await Promise.all([
      this.policies.getGlobalPolicies(),
      this.prefs.getQuietHours(userId),
      this.prefs.getUserPreferences(userId),
      this.prefs.getDefaults(),
      this.prefs.getUserMessengers(userId),
    ]);
    return { user, allPolicies, quietHours, userPrefs, defaults, messengers };
  }

  async evaluateAll(
    userId: string,
    region: Region,
    datetime: Date,
  ): Promise<ChannelAvailability[]> {
    const data = await this.loadEvaluationData(userId);
    if (!data) return [];

    const allChannels: string[] = ['email', 'sms', 'push', ...data.messengers.map((m) => m.messenger)];

    const results: ChannelAvailability[] = [];
    for (const category of CATEGORIES) {
      for (const channel of allChannels) {
        const { decision, reason } = this.check(data, category, channel, region, datetime);
        results.push({ category, channel, available: decision === 'allow', reason });
      }
    }
    return results;
  }

  async evaluate(
    userId: string,
    category: Category,
    channel: Channel,
    region: Region,
    datetime: Date,
  ): Promise<EvaluationResult> {
    const data = await this.loadEvaluationData(userId);
    if (!data) {
      logger.info({ userId }, 'user not found');
      return { decision: 'deny', reason: 'user_not_found' };
    }
    return this.check(data, category, channel, region, datetime);
  }

  private check(
    data: EvaluationData,
    category: Category,
    channel: Channel,
    region: Region,
    datetime: Date,
  ): EvaluationResult {
    const { user, allPolicies, quietHours, userPrefs, defaults, messengers } = data;

    // 1. Global policies — highest priority
    for (const p of allPolicies) {
      if (p.category === category && p.channel === channel && p.region === region) {
        logger.info({ userId: user.id, category, channel, region }, 'denied by global policy');
        return { decision: 'deny', reason: 'blocked_by_global_policy' };
      }
    }

    // 2. Contact info check — user must have email for email, phone for sms
    if (channel === 'email' && !user.email) {
      logger.info({ userId: user.id }, 'denied — no email');
      return { decision: 'deny', reason: 'blocked_by_contact_missing' };
    }
    if (channel === 'sms' && !user.phone) {
      logger.info({ userId: user.id }, 'denied — no phone');
      return { decision: 'deny', reason: 'blocked_by_contact_missing' };
    }

    // 3. Messenger check
    if (!isUniversalChannel(channel)) {
      if (!messengers.some((m) => m.messenger === channel)) {
        logger.info({ userId: user.id, channel }, 'denied by messenger not connected');
        return { decision: 'deny', reason: 'blocked_by_messenger_not_connected' };
      }
    }

    // 4. Quiet hours — check all intervals
    for (const qh of quietHours) {
      if (this.isInQuietHours(datetime, qh)) {
        if (!qh.channel || qh.channel === channel) {
          logger.info({ userId: user.id, category, channel }, 'denied by quiet hours');
          return { decision: 'deny', reason: 'blocked_by_quiet_hours' };
        }
      }
    }

    // 5. User preference
    const override = userPrefs.find(
      (p) => p.category === category && p.channel === channel,
    );
    if (override && !override.enabled) {
      logger.info({ userId: user.id, category, channel }, 'denied by user preference');
      return { decision: 'deny', reason: 'blocked_by_user_preference' };
    }
    if (override && override.enabled) {
      logger.info({ userId: user.id, category, channel }, 'allowed');
      return { decision: 'allow', reason: null };
    }

    // 6. Default preference
    if (isUniversalChannel(channel)) {
      const defaultPref = defaults.find(
        (p) => p.category === category && p.channel === channel,
      );
      if (!defaultPref || !defaultPref.enabled) {
        logger.info({ userId: user.id, category, channel }, 'denied by default preference');
        return { decision: 'deny', reason: 'blocked_by_default_preference' };
      }
      logger.info({ userId: user.id, category, channel }, 'allowed');
      return { decision: 'allow', reason: null };
    }

    // For messenger channels — same default as universal: transactional allow, marketing deny
    if (category === 'transactional') {
      logger.info({ userId: user.id, category, channel }, 'allowed');
      return { decision: 'allow', reason: null };
    }
    logger.info({ userId: user.id, category, channel }, 'denied by default preference');
    return { decision: 'deny', reason: 'blocked_by_default_preference' };
  }

  private isInQuietHours(date: Date, qh: {
    startTime: string;
    endTime: string;
    timezone: string;
  }): boolean {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: qh.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);

    const [startH, startM] = qh.startTime.split(':').map(Number);
    const [endH, endM] = qh.endTime.split(':').map(Number);

    const nowMinutes = hour * 60 + minute;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
}
