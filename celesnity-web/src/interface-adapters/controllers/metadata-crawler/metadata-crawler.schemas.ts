import { z } from 'zod';

const discoverySchema = z
  .object({
    includeViews: z.boolean().optional(),
    includeMaterializedViews: z.boolean().optional(),
    includeDdl: z.boolean().optional(),
    databaseIncludes: z.array(z.string().max(200)).max(100).optional(),
    databaseExcludes: z.array(z.string().max(200)).max(100).optional(),
    schemaIncludes: z.array(z.string().max(200)).max(100).optional(),
    schemaExcludes: z.array(z.string().max(200)).max(100).optional(),
    relationIncludes: z.array(z.string().max(200)).max(100).optional(),
    relationExcludes: z.array(z.string().max(200)).max(100).optional(),
  })
  .strict();

export const metadataCrawlerIdSchema = z.string().uuid();

const dailyScheduleSchema = z
  .object({
    cadence: z.literal('DAILY'),
    timeOfDay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
    timezone: z.string().trim().min(1).max(100),
  })
  .strict();

export const assignMetadataCrawlerInputSchema = z.object({
  databaseServiceId: z.string().uuid(),
  name: z.string().trim().min(1).max(160).optional(),
  schedule: dailyScheduleSchema,
  discovery: discoverySchema.partial().optional(),
  timeoutSeconds: z.number().int().min(60).max(86_400).optional(),
});

export const updateMetadataCrawlerInputSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  enabled: z.boolean().optional(),
  schedule: dailyScheduleSchema.optional(),
  discovery: discoverySchema.partial().optional(),
  timeoutSeconds: z.number().int().min(60).max(86_400).optional(),
});

export const metadataCrawlerListQuerySchema = z.object({ includeArchived: z.boolean().optional() });
export const metadataCrawlerRunListQuerySchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});
