import { z } from 'zod';

import { ACTION_CATALOG_DOMAINS } from '@/src/entities/models/action-catalog';

export const listActionCatalogInputSchema = z.enum(ACTION_CATALOG_DOMAINS);
