export const CATEGORIES = ['transactional', 'marketing'] as const;
export type Category = (typeof CATEGORIES)[number];

const UNIVERSAL_CHANNELS = ['email', 'sms', 'push'] as const;
type UniversalChannel = (typeof UNIVERSAL_CHANNELS)[number];

export function isUniversalChannel(channel: string): channel is UniversalChannel {
  return UNIVERSAL_CHANNELS.includes(channel as UniversalChannel);
}

export type Channel = string;

export const REGIONS = ['EU', 'US', 'APAC', 'LATAM'] as const;
export type Region = (typeof REGIONS)[number];

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  region: Region;
}

export interface QuietHours {
  startTime: string;
  endTime: string;
  timezone: string;
  channel?: string; // undefined = applies to all channels
}

export interface PreferenceEntry {
  category: Category;
  channel: Channel;
  enabled: boolean;
}

export interface GlobalPolicy {
  category: Category;
  channel: Channel;
  region: Region;
}

export interface UserMessenger {
  messenger: string;
  connectedAt: Date;
}

type Decision = 'allow' | 'deny';

export type DenyReason =
  | 'user_not_found'
  | 'blocked_by_global_policy'
  | 'blocked_by_quiet_hours'
  | 'blocked_by_user_preference'
  | 'blocked_by_default_preference'
  | 'blocked_by_messenger_not_connected'
  | 'blocked_by_contact_missing';

export interface EvaluationResult {
  decision: Decision;
  reason: DenyReason | null;
}
