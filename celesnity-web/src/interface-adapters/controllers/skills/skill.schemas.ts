import { z } from 'zod';

export const skillNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const createSkillInputSchema = z.object({
  name: skillNameSchema,
  description: z.string(),
  namespace: z.string(),
  body: z.string(),
});

export const updateSkillInputSchema = z.object({
  name: skillNameSchema,
  description: z.string(),
  namespace: z.string(),
  body: z.string(),
});

export const getSkillInputSchema = z.string().min(1);

export const deleteSkillInputSchema = z.string().min(1);
