-- Notification Preferences Service — schema & seed data

CREATE TYPE category AS ENUM (
  'transactional',
  'marketing'
);

CREATE TYPE region AS ENUM (
  'EU',
  'US',
  'APAC',
  'LATAM'
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id      text PRIMARY KEY,
  email   text,
  phone   text,
  region  region NOT NULL DEFAULT 'US',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Default preferences for universal channels (email, sms, push)
CREATE TABLE IF NOT EXISTS default_preferences (
  category  category NOT NULL,
  channel   text NOT NULL,
  enabled   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (category, channel)
);

-- Per-user preference overrides (sparse — deviations from defaults)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id   text NOT NULL REFERENCES users(id),
  category  category NOT NULL,
  channel   text NOT NULL,
  enabled   boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category, channel)
);

-- Global deny-policies (category + channel + region)
CREATE TABLE IF NOT EXISTS global_policies (
  category  category NOT NULL,
  channel   text NOT NULL,
  region    region NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category, channel, region)
);

-- Which messengers a user has connected (telegram, viber, whatsapp, etc.)
CREATE TABLE IF NOT EXISTS user_messengers (
  user_id     text NOT NULL REFERENCES users(id),
  messenger   text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, messenger)
);

-- Quiet hours per user (multiple intervals allowed, per-channel or all)
CREATE TABLE IF NOT EXISTS user_quiet_hours (
  id         serial PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id),
  start_time time NOT NULL,
  end_time   time NOT NULL,
  timezone   text NOT NULL DEFAULT 'UTC',
  channel    text,  -- null = applies to all channels
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiet_hours_user_id ON user_quiet_hours(user_id);

-- Prevent duplicate intervals for the same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiet_hours_dedup ON user_quiet_hours(user_id, start_time, end_time, timezone, COALESCE(channel, ''));

-- ── Seed data ────────────────────────────────────────────────────────────────

INSERT INTO default_preferences (category, channel, enabled) VALUES
  ('transactional', 'email', true),
  ('transactional', 'sms',   true),
  ('transactional', 'push',  true),
  ('marketing',     'email', false),
  ('marketing',     'sms',   false),
  ('marketing',     'push',  false)
ON CONFLICT DO NOTHING;

INSERT INTO global_policies (category, channel, region) VALUES
  ('marketing', 'sms', 'EU')
ON CONFLICT DO NOTHING;

-- ── Users ────────────────────────────────────────────────────────────────────

INSERT INTO users (id, email, phone, region) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'alice@example.com',    '+490123456789', 'EU'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'bob@example.com',      null,            'US'),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', null,                   '+12025551234',  'APAC')
ON CONFLICT DO NOTHING;

INSERT INTO user_preferences (user_id, category, channel, enabled) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'marketing', 'email', true),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'marketing', 'push',  false)
ON CONFLICT DO NOTHING;

INSERT INTO user_quiet_hours (user_id, start_time, end_time, timezone, channel) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '22:00', '08:00', 'Europe/Berlin', 'push'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '08:00', '22:00', 'Europe/Berlin', 'sms'),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', '23:00', '07:00', 'Asia/Tokyo', null)
ON CONFLICT (user_id, start_time, end_time, timezone, COALESCE(channel, '')) DO NOTHING;

INSERT INTO user_messengers (user_id, messenger) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'telegram'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'viber'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'telegram')
ON CONFLICT DO NOTHING;
