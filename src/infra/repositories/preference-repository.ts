import type { Sql } from 'postgres';
import type {
  Category,
  Channel,
  PreferenceEntry,
  QuietHours,
  UserMessenger,
  User,
  Region,
} from '../../domain/types.js';

export class PreferenceRepository {
  constructor(private readonly db: Sql) {}

  async getUser(userId: string): Promise<User | null> {
    const rows = await this
      .db`SELECT id, email, phone, region FROM users WHERE id = ${userId}`;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      email: r.email ?? null,
      phone: r.phone ?? null,
      region: r.region as Region,
    };
  }

  async createUser(
    userId: string,
    email: string | null,
    phone: string | null,
    region: Region,
  ): Promise<void> {
    await this.db`
      INSERT INTO users (id, email, phone, region)
      VALUES (${userId}, ${email}, ${phone}, ${region})
      ON CONFLICT (id) DO UPDATE SET email = ${email}, phone = ${phone}, region = ${region}
    `;
  }

  async getDefaults(): Promise<PreferenceEntry[]> {
    const rows = await this
      .db`SELECT category, channel, enabled FROM default_preferences`;
    return rows.map(mapPrefRow);
  }

  async getUserPreferences(userId: string): Promise<PreferenceEntry[]> {
    const rows = await this
      .db`SELECT category, channel, enabled FROM user_preferences WHERE user_id = ${userId}`;
    return rows.map(mapPrefRow);
  }

  async upsertUserPreference(
    userId: string,
    category: Category,
    channel: Channel,
    enabled: boolean,
  ): Promise<void> {
    await this.db`
      INSERT INTO user_preferences (user_id, category, channel, enabled)
      VALUES (${userId}, ${category}, ${channel}, ${enabled})
      ON CONFLICT (user_id, category, channel)
      DO UPDATE SET enabled = ${enabled}, updated_at = now()
    `;
  }

  async batchUpsertUserPreferences(
    userId: string,
    entries: { category: Category; channel: Channel; enabled: boolean }[],
  ): Promise<void> {
    await this.db.begin(async (tx) => {
      for (const e of entries) {
        await tx`
          INSERT INTO user_preferences (user_id, category, channel, enabled)
          VALUES (${userId}, ${e.category}, ${e.channel}, ${e.enabled})
          ON CONFLICT (user_id, category, channel)
          DO UPDATE SET enabled = ${e.enabled}, updated_at = now()
        `;
      }
    });
  }

  async getQuietHours(userId: string): Promise<QuietHours[]> {
    const rows = await this
      .db`SELECT start_time, end_time, timezone, channel FROM user_quiet_hours WHERE user_id = ${userId} ORDER BY id`;
    return rows.map((r: any) => ({
      startTime: r.start_time as string,
      endTime: r.end_time as string,
      timezone: r.timezone as string,
      ...(r.channel ? { channel: r.channel as string } : {}),
    }));
  }

  async setQuietHours(
    userId: string,
    intervals: QuietHours[],
  ): Promise<void> {
    await this.db.begin(async (tx) => {
      await tx`DELETE FROM user_quiet_hours WHERE user_id = ${userId}`;
      for (const qh of intervals) {
        await tx`
          INSERT INTO user_quiet_hours (user_id, start_time, end_time, timezone, channel)
          VALUES (${userId}, ${qh.startTime}, ${qh.endTime}, ${qh.timezone}, ${qh.channel ?? null})
        `;
      }
    });
  }

  async getUserMessengers(userId: string): Promise<UserMessenger[]> {
    const rows = await this
      .db`SELECT messenger, connected_at FROM user_messengers WHERE user_id = ${userId}`;
    return rows.map((r: any) => ({
      messenger: r.messenger as string,
      connectedAt: r.connected_at as Date,
    }));
  }

  async connectMessenger(userId: string, messenger: string): Promise<void> {
    await this.db`
      INSERT INTO user_messengers (user_id, messenger) VALUES (${userId}, ${messenger})
      ON CONFLICT DO NOTHING
    `;
  }

  async disconnectMessenger(userId: string, messenger: string): Promise<void> {
    await this
      .db`DELETE FROM user_messengers WHERE user_id = ${userId} AND messenger = ${messenger}`;
  }
}

function mapPrefRow(row: any): PreferenceEntry {
  return {
    category: row.category as Category,
    channel: row.channel as string,
    enabled: row.enabled,
  };
}
