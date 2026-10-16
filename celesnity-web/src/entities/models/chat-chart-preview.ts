import { z } from 'zod';

import type {
  OutputColumn,
  ParameterValue,
  QueryDefinition,
  VisualizationDefinition,
} from './canonical-chart';

const parameterValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const queryContextSchema = z.object({ catalog: z.string().min(1), schema: z.string().min(1) });
const queryParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'TIMESTAMP']),
  required: z.boolean(),
  defaultValue: parameterValueSchema.optional(),
});

export const canonicalQueryDefinitionSchema = z.discriminatedUnion('mode', [
  z.object({
    schemaVersion: z.literal(1),
    mode: z.literal('NATIVE'),
    context: queryContextSchema,
    parameters: z.array(queryParameterSchema),
    sql: z.string().min(1),
  }),
  z
    .object({
      schemaVersion: z.literal(1),
      mode: z.literal('VISUAL'),
      context: queryContextSchema,
      parameters: z.array(queryParameterSchema),
      source: z.object({
        table: z.object({
          catalog: z.string().min(1),
          schema: z.string().min(1),
          table: z.string().min(1),
        }),
        alias: z.string().min(1),
      }),
      joins: z.array(z.unknown()),
      projections: z.array(z.unknown()),
      customExpressions: z.array(z.unknown()),
      filters: z.array(z.unknown()),
      aggregations: z.array(z.unknown()),
      breakouts: z.array(z.unknown()),
      postAggregationFilters: z.array(z.unknown()),
      orderBy: z.array(z.unknown()),
      limit: z.number().int().positive().optional(),
    })
    .passthrough(),
]);

export const canonicalVisualizationDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.enum(['TABLE', 'NUMBER', 'BAR', 'LINE', 'AREA', 'PIE', 'SCATTER']),
  roles: z.record(z.string(), z.unknown()),
  display: z.record(z.string(), z.unknown()),
});

const outputColumnSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  family: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'UNKNOWN']),
});

const payloadSchema = z.object({
  kind: z.literal('preview'),
  schema_version: z.literal(1),
  title: z.string(),
  description: z.string().nullable(),
  query_definition: canonicalQueryDefinitionSchema,
  visualization_definition: canonicalVisualizationDefinitionSchema,
  output_schema: z.array(outputColumnSchema),
  parameter_values: z.record(z.string(), parameterValueSchema),
  rows: z.array(z.array(parameterValueSchema)),
  run_id: z.string().min(1),
  row_count: z.number().int().nonnegative(),
  byte_count: z.number().int().nonnegative(),
  truncated: z.boolean(),
  display_truncated: z.boolean(),
});

export interface ChatChartPreview {
  readonly kind: 'preview';
  readonly schemaVersion: 1;
  readonly title: string;
  readonly description: string | null;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly outputSchema: readonly OutputColumn[];
  readonly parameterValues: Readonly<Record<string, ParameterValue>>;
  readonly rows: readonly (readonly ParameterValue[])[];
  readonly runId: string;
  readonly rowCount: number;
  readonly byteCount: number;
  readonly truncated: boolean;
  readonly displayTruncated: boolean;
}

export function parseChatChartPreview(input: unknown): ChatChartPreview {
  const payload = payloadSchema.parse(input);
  return {
    kind: payload.kind,
    schemaVersion: payload.schema_version,
    title: payload.title,
    description: payload.description,
    queryDefinition: payload.query_definition as QueryDefinition,
    visualizationDefinition: payload.visualization_definition as VisualizationDefinition,
    outputSchema: payload.output_schema,
    parameterValues: payload.parameter_values,
    rows: payload.rows,
    runId: payload.run_id,
    rowCount: payload.row_count,
    byteCount: payload.byte_count,
    truncated: payload.truncated,
    displayTruncated: payload.display_truncated,
  };
}
