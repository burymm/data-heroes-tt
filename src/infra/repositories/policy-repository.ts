import type { Sql } from 'postgres';
import type {
  Category,
  Channel,
  Region,
  GlobalPolicy,
} from '../../domain/types.js';

const CACHE_TTL_MS = 60_000; // 1 minute

export class PolicyRepository {
  private cache: { data: GlobalPolicy[]; ts: number } | null = null;

  constructor(private readonly db: Sql) {}

  async getGlobalPolicies(): Promise<GlobalPolicy[]> {
    if (this.cache && Date.now() - this.cache.ts < CACHE_TTL_MS) {
      return this.cache.data;
    }
    const rows = await this
      .db`SELECT category, channel, region FROM global_policies`;
    const policies = rows.map((r: any) => ({
      category: r.category as Category,
      channel: r.channel as Channel,
      region: r.region as Region,
    }));
    this.cache = { data: policies, ts: Date.now() };
    return policies;
  }
}
