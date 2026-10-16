import { z } from 'zod';

const parameterValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const chartDraftSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  collectionId: z.string(),
  queryDefinition: z.object({ schemaVersion: z.literal(1) }).passthrough(),
  visualizationDefinition: z.object({ schemaVersion: z.literal(1) }).passthrough(),
  outputSchema: z.array(z.object({ name: z.string(), type: z.string(), family: z.string() })),
  parameterValues: z.record(z.string(), parameterValueSchema),
});

export const createCanonicalChartSchema = chartDraftSchema;

export const compileCanonicalChartQuerySchema = z.object({
  queryDefinition: z
    .object({
      schemaVersion: z.literal(1),
      mode: z.enum(['VISUAL', 'NATIVE']),
    })
    .passthrough(),
  parameterValues: z.record(z.string(), parameterValueSchema).default({}),
});

export const previewCanonicalChartQuerySchema = compileCanonicalChartQuerySchema;
