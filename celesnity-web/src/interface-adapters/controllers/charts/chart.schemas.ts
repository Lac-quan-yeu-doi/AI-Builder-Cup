import { z } from 'zod';

import { CHART_TYPES } from '@/src/entities/models/chart';

const encodingSchema = z.object({
  field: z.string().min(1),
  type: z.enum(['quantitative', 'temporal', 'ordinal', 'nominal']).optional(),
  aggregate: z.string().optional(),
  title: z.string().optional(),
  sort: z.union([z.string(), z.array(z.string())]).optional(),
});

export const createChartInputSchema = z.object({
  runId: z.string().nullable().optional(),
  title: z.string(),
  chartType: z.enum(CHART_TYPES),
  /**
   * The query the chart is drawn from. Core requires it on create — a chart
   * carries its own provenance so it can be refreshed — and the schema
   * omitting it stripped the field before the request was built, which is why
   * every creation came back "The request contains invalid fields."
   */
  sql: z.string().optional(),
  encodings: z.record(z.string(), encodingSchema).optional(),
  data: z.array(z.record(z.string(), z.unknown())).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const patchChartInputSchema = z.object({
  id: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  patch: z.object({
    title: z.string().optional(),
    chartType: z.enum(CHART_TYPES).optional(),
    encodings: z.record(z.string(), encodingSchema).optional(),
    data: z.array(z.record(z.string(), z.unknown())).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    vlSpec: z.record(z.string(), z.unknown()).nullable().optional(),
    sql: z.string().nullable().optional(),
  }),
});

export const deleteChartInputSchema = z.object({
  id: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
});

// `file` is validated separately (`instanceof File`) — zod has no schema for
// a File/Blob instance, and this is only the id/version half of the input.
export const setChartDataFromCsvMetaSchema = z.object({
  id: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
});

export const suggestChartEncodingsInputSchema = z.object({
  userId: z.string().min(1),
  title: z.string(),
  chartType: z.enum(CHART_TYPES),
  columns: z.array(z.string()),
  sampleRows: z.array(z.record(z.string(), z.unknown())),
});
