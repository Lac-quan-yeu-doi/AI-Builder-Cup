import { ChartError } from '@domain/chart/errors/chart.errors';
import {
  validateQueryDefinition,
  type QueryDefinition,
} from '@domain/chart/models/query-definition';
import type { VisualizationDefinition } from '@domain/chart/models/visualization-definition';

export const canonicalWriteKeys = Object.freeze([
  'organizationId',
  'collectionId',
  'ownerIdentityId',
  'title',
  'description',
  'provenance',
  'currentRevisionNumber',
  'legacyState',
  'archivedAt',
  'queryDefinition',
  'visualizationDefinition',
  'outputSchema',
  'queryHash',
  'createdByIdentityId',
] as const);

export function encodeQueryDefinition(definition: QueryDefinition): Record<string, unknown> {
  validateQueryDefinition(definition);
  return definition as unknown as Record<string, unknown>;
}

export function decodeQueryDefinition(value: unknown): QueryDefinition {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isQueryMode(value.mode)) {
    throw ChartError.queryInvalid('Stored query definition is malformed.');
  }
  const definition = value as unknown as QueryDefinition;
  validateQueryDefinition(definition);
  return definition;
}

export function encodeVisualizationDefinition(
  definition: VisualizationDefinition,
): Record<string, unknown> {
  return definition as unknown as Record<string, unknown>;
}

export function decodeVisualizationDefinition(value: unknown): VisualizationDefinition {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isVisualizationType(value.type)) {
    const type = isRecord(value) && typeof value.type === 'string' ? value.type : 'unknown';
    throw ChartError.unsupportedChartType(type);
  }
  return value as unknown as VisualizationDefinition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isQueryMode(value: unknown): value is QueryDefinition['mode'] {
  return value === 'VISUAL' || value === 'NATIVE';
}

function isVisualizationType(value: unknown): value is VisualizationDefinition['type'] {
  return (
    value === 'TABLE' ||
    value === 'NUMBER' ||
    value === 'BAR' ||
    value === 'LINE' ||
    value === 'AREA' ||
    value === 'PIE' ||
    value === 'SCATTER'
  );
}
