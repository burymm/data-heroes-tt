import { z } from 'zod';
import { CATEGORIES, REGIONS } from '../domain/types.js';

const categorySchema = z.enum(CATEGORIES);
const channelSchema = z.string().min(1, 'Channel is required');
const regionSchema = z.enum(REGIONS);

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createUserBody = z.object({
  id: z.string().min(1, 'User id is required — provided by auth service'),
  email: z.string().email().nullable().optional(),
  phone: z.string().min(1).nullable().optional(),
  region: regionSchema.optional(),
});

const categoryOrAll = z.union([categorySchema, z.literal('*')]);

export const updatePreferencesBody = z.object({
  category: categoryOrAll,
  channel: channelSchema,
  enabled: z.boolean(),
});

export const messengerBody = z.object({
  messenger: z.string().min(1, 'Messenger name is required'),
});

const quietHoursInterval = z.object({
  startTime: z.string().regex(timeRegex, 'Must be HH:mm (00-23)'),
  endTime: z.string().regex(timeRegex, 'Must be HH:mm (00-23)'),
  timezone: z.string().min(1, 'Timezone is required'),
  channel: z.string().min(1).optional(),
});

export const quietHoursBody = z.array(quietHoursInterval).min(0);

export const evaluateBody = z.object({
  userId: z.string().min(1),
  category: categorySchema,
  channel: channelSchema,
  region: regionSchema,
  datetime: z.string().datetime(),
});
