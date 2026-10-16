import { z } from 'zod';

const id = z.string().trim().min(1);
const geometry = z.object({
  x: z.number().int().min(0).max(23),
  y: z.number().int().min(0),
  width: z.number().int().min(1).max(24),
  height: z.number().int().min(1),
});
const cardBase = { id, tabId: id, geometry };
const card = z.discriminatedUnion('kind', [
  z.object({
    ...cardBase,
    kind: z.literal('CHART'),
    chartId: id,
    chartRevisionNumber: z.number().int().positive().nullable(),
    visualizationOverrides: z.record(z.string(), z.unknown()),
  }),
  z.object({ ...cardBase, kind: z.literal('HEADING'), content: z.object({ text: z.string() }) }),
  z.object({
    ...cardBase,
    kind: z.literal('TEXT'),
    content: z.object({ markdown: z.string() }),
  }),
  z.object({
    ...cardBase,
    kind: z.literal('LINK'),
    content: z.object({ label: z.string(), url: z.string() }),
  }),
]);
const placement = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('TOP_OF_PAGE') }),
  z.object({ kind: z.literal('INLINE_CARD'), cardId: id }),
]);
const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('FIELD'), fieldId: id }),
  z.object({ kind: z.literal('NATIVE_QUERY_VARIABLE'), variableKey: id }),
  z.object({ kind: z.literal('CONTENT_VARIABLE'), variableName: id }),
]);

export const dashboardIdSchema = id;
export const listDashboardFilterTargetsSchema = z.object({
  dashboardId: id,
  chartCards: z
    .array(z.object({ cardId: id, chartId: id }))
    .max(100)
    .optional(),
});
export const createDashboardSchema = z.object({
  collectionId: id,
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2_000).nullable().default(null),
});
export const dashboardSchema = z.object({
  id,
  collectionId: id,
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2_000).nullable(),
  revision: z.number().int().positive(),
  tabs: z.array(z.object({ id, name: z.string().min(1), order: z.number().int().min(0) })).min(1),
  cards: z.array(card),
  filters: z.array(
    z.object({
      id,
      slug: id,
      label: z.string().min(1),
      semanticType: z.enum([
        'DATE_PICKER',
        'TIME_GROUPING',
        'LOCATION',
        'TEXT_CATEGORY',
        'NUMBER',
        'BOOLEAN',
        'ID',
      ]),
      operator: id,
      defaultValue: z.unknown(),
      required: z.boolean(),
      multiple: z.boolean(),
      valuesSource: z.record(z.string(), z.unknown()).nullable(),
      placement,
      order: z.number().int().min(0),
    }),
  ),
  mappings: z.array(z.object({ filterId: id, cardId: id, target })),
  createdByIdentityId: id,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const copyDashboardSchema = z.object({
  sourceDashboardId: id,
  collectionId: id,
  name: z.string().trim().min(1).max(255),
  draft: dashboardSchema,
});
