import { z } from 'zod';

export const scriptIdSchema = z.string();

export const scriptVersionInputSchema = z.object({
  scriptId: z.string(),
  versionNumber: z.number(),
});

export const editableScriptDraftSchema = z.object({
  scriptId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  connectionId: z.string(),
  source: z.string(),
  viewedVersionNumber: z.number().optional(),
});
