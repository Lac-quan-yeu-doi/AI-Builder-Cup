import { z } from 'zod';

export const listPendingActionsInputSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'failed']).optional(),
  actorSource: z.enum(['agent', 'browser', 'dev-bypass', 'anonymous']).optional(),
  runId: z.string().min(1).optional(),
});

export const getPendingActionInputSchema = z.object({
  id: z.string().min(1),
});

export const decidePendingActionInputSchema = z.object({
  id: z.string().min(1),
});
