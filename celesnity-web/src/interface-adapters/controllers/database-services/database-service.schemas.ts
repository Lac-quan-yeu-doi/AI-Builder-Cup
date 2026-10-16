import { z } from 'zod';

const detailsSchema = z.record(z.string(), z.unknown());

export const databaseServiceDetailsInputSchema = detailsSchema;

export const databaseServiceInputSchema = z.object({
  name: z.string().trim().min(1),
  /** Catalog database to link immediately after creation. */
  initialDatabaseName: z.string().trim().min(1).optional(),
  /** @deprecated Use initialDatabaseName. */
  databaseName: z.string().trim().min(1).optional(),
  connectorType: z.string().trim().min(1),
  details: detailsSchema,
});

export const databaseServiceIdSchema = z.string().min(1);
export const databaseNameSchema = z.string().trim().min(1).max(120);

export const cdcConnectionProfileInputSchema = z.object({
  details: detailsSchema,
  setupMode: z.enum(['existing', 'managed']),
  publicationName: z.string().trim().min(1).max(63).optional(),
  slotName: z.string().trim().min(1).max(63).optional(),
});

export const updateDatabaseServiceInputSchema = z.object({
  id: databaseServiceIdSchema,
  input: z.object({
    name: z.string().trim().min(1).optional(),
    details: detailsSchema.optional(),
  }),
});
