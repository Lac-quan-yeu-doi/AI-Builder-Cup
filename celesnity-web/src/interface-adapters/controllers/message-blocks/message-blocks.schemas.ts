import { z } from 'zod';

export const roomIdSchema = z.string().min(1);
