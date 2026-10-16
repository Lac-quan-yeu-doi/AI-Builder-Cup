import { z } from 'zod';

export const citationRefSchema = z.object({
  type: z.enum(['chart', 'document']),
  id: z.string().min(1),
  page: z.number().int().min(1).optional(),
});

export const resolveCitationsInputSchema = z.array(citationRefSchema).min(1).max(100);
