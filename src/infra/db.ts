import postgres from 'postgres';
import { logger } from './logger.js';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://app:app@localhost:5432/notification_preferences';

export const sql = postgres(DATABASE_URL, {
  onnotice: () => {},
});

export async function pingDb(): Promise<void> {
  await sql`SELECT 1`;
  logger.info('database connection ok');
}
