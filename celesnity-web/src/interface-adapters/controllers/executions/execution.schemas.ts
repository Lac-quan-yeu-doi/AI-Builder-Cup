import { z } from 'zod';

export const executionIdSchema = z.string();

export const rerunExecutionInputSchema = z.object({
  scriptId: z.string(),
  scriptVersionId: z.string(),
});
