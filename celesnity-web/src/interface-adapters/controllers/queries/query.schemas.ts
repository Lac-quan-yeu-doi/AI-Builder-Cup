import { z } from 'zod';

export const queryIdSchema = z.string();
export const queryCatalogSchema = z.string();
export const querySessionSchema = z.object({
  sql: z.string(),
  context: z.object({
    catalog: z.string(),
    namespace: z.string().optional(),
  }),
});
