import { sql } from './infra/db.js';
import { logger } from './infra/logger.js';

async function seed(): Promise<void> {
  logger.info('seeding database…');

  await sql`
    INSERT INTO default_preferences (category, channel, enabled) VALUES
      ('transactional', 'email', true),
      ('transactional', 'sms',   true),
      ('transactional', 'push',  true),
      ('marketing',     'email', false),
      ('marketing',     'sms',   false),
      ('marketing',     'push',  false)
    ON CONFLICT DO NOTHING
  `;

  await sql`
    INSERT INTO global_policies (category, channel, region) VALUES
      ('marketing', 'sms', 'EU')
    ON CONFLICT DO NOTHING
  `;

  await sql`
    INSERT INTO users (id, email, phone, region) VALUES
      ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'alice@example.com',    '+490123456789', 'EU'),
      ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'bob@example.com',      null,            'US'),
      ('c3d4e5f6-a7b8-9012-cdef-123456789012', null,                   '+12025551234',  'APAC')
    ON CONFLICT DO NOTHING
  `;

  await sql`
    INSERT INTO user_preferences (user_id, category, channel, enabled) VALUES
      ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'marketing', 'email', true),
      ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'marketing', 'push',  false)
    ON CONFLICT DO NOTHING
  `;

  await sql`
    INSERT INTO user_quiet_hours (user_id, start_time, end_time, timezone, channel) VALUES
      ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '22:00', '08:00', 'Europe/Berlin', 'push'),
      ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '08:00', '22:00', 'Europe/Berlin', 'sms'),
      ('c3d4e5f6-a7b8-9012-cdef-123456789012', '23:00', '07:00', 'Asia/Tokyo', null)
    ON CONFLICT (user_id, start_time, end_time, timezone, COALESCE(channel, '')) DO NOTHING
  `;

  await sql`
    INSERT INTO user_messengers (user_id, messenger) VALUES
      ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'telegram'),
      ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'viber'),
      ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'telegram')
    ON CONFLICT DO NOTHING
  `;

  logger.info('seed complete');
  await sql.end();
}

seed().catch((err) => {
  logger.fatal(err, 'seed failed');
  process.exit(1);
});
