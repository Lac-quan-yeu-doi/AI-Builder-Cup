import { z } from 'zod';

export const catalogNameSchema = z.string();
export const catalogNamespaceScopeSchema = z.enum(['writable', 'readable']);

export const listTablesInputSchema = z.object({
  catalog: z.string(),
  schema: z.string(),
});

export const tableRefSchema = z.object({
  catalog: z.string(),
  schema: z.string(),
  table: z.string(),
});

export const tablePreviewRequestSchema = tableRefSchema.extend({
  deviceId: z.uuid().optional(),
});
