import { z } from 'zod';

export const nodeTypeSchema = z.string().trim().min(1).max(80);

export const paletteKeywordSchema = z.string().max(200).optional();
