import { randomUUID } from 'node:crypto';

import { Prisma } from '@generated/prisma/client';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import type { DashboardCard } from '@domain/dashboard/models/dashboard-card';
import type {
  DashboardFilter,
  DashboardFilterMapping,
  DashboardFilterSemanticType,
} from '@domain/dashboard/models/dashboard-filter';
import { validateDashboard, type Dashboard } from '@domain/dashboard/models/dashboard';

export interface DashboardAggregateRow {
  readonly id: string;
  readonly organizationId: string;
  readonly collectionId: string;
  readonly title: string;
  readonly description: string | null;
  readonly currentRevision: number;
  readonly createdByIdentityId: string;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly tabs: readonly {
    readonly id: string;
    readonly name: string;
    readonly order: number;
  }[];
  readonly cards: readonly DashboardCardRow[];
  readonly filters: readonly DashboardFilterRow[];
  readonly mappings: readonly DashboardFilterMappingRow[];
}

interface DashboardCardRow {
  readonly id: string;
  readonly tabId: string;
  readonly kind: string;
  readonly chartId: string | null;
  readonly chartRevisionNumber: number | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly content: unknown;
  readonly visualizationOverrides: unknown;
}

interface DashboardFilterRow {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly semanticType: string;
  readonly operator: string;
  readonly defaultValue: unknown;
  readonly required: boolean;
  readonly multiple: boolean;
  readonly valuesSource: unknown;
  readonly placementKind: string;
  readonly placementCardId: string | null;
  readonly order: number;
}

interface DashboardFilterMappingRow {
  readonly filterId: string;
  readonly cardId: string;
  readonly targetKind: string;
  readonly target: unknown;
}

export function toDashboard(row: DashboardAggregateRow): Dashboard {
  const dashboard: Dashboard = {
    id: row.id,
    organizationId: row.organizationId,
    collectionId: row.collectionId,
    title: row.title,
    description: row.description,
    revision: row.currentRevision,
    tabs: row.tabs.map((tab) => ({ id: tab.id, name: tab.name, order: tab.order })),
    cards: row.cards.map(toCard),
    filters: row.filters.map(toFilter),
    mappings: row.mappings.map(toMapping),
    createdByIdentityId: row.createdByIdentityId,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  validateDashboard(dashboard);
  return dashboard;
}

export function toDashboardCreateData(dashboard: Dashboard): Prisma.DashboardUncheckedCreateInput {
  return {
    id: dashboard.id,
    organizationId: dashboard.organizationId,
    collectionId: dashboard.collectionId,
    title: dashboard.title,
    description: dashboard.description,
    currentRevision: dashboard.revision,
    createdByIdentityId: dashboard.createdByIdentityId,
    archivedAt: dashboard.archivedAt ? new Date(dashboard.archivedAt) : null,
    createdAt: new Date(dashboard.createdAt),
    updatedAt: new Date(dashboard.updatedAt),
  };
}

export function toDashboardTabRows(dashboard: Dashboard): Prisma.DashboardTabCreateManyInput[] {
  return dashboard.tabs.map((tab) => ({
    id: tab.id,
    dashboardId: dashboard.id,
    name: tab.name,
    order: tab.order,
  }));
}

export function toDashboardCardRows(dashboard: Dashboard): Prisma.DashboardCardCreateManyInput[] {
  return dashboard.cards.map((card) => ({
    id: card.id,
    dashboardId: dashboard.id,
    tabId: card.tabId,
    kind: card.kind,
    chartId: card.kind === 'CHART' ? card.chartId : null,
    chartRevisionNumber: card.kind === 'CHART' ? card.chartRevisionNumber : null,
    x: card.geometry.x,
    y: card.geometry.y,
    width: card.geometry.width,
    height: card.geometry.height,
    content:
      card.kind === 'CHART' ? Prisma.DbNull : (card.content as unknown as Prisma.InputJsonValue),
    visualizationOverrides:
      card.kind === 'CHART'
        ? (card.visualizationOverrides as Prisma.InputJsonValue)
        : Prisma.DbNull,
  }));
}

export function toDashboardFilterRows(
  dashboard: Dashboard,
): Prisma.DashboardFilterCreateManyInput[] {
  return dashboard.filters.map((filter) => ({
    id: filter.id,
    dashboardId: dashboard.id,
    slug: filter.slug,
    label: filter.label,
    semanticType: filter.semanticType,
    operator: filter.operator,
    defaultValue:
      filter.defaultValue === null ? Prisma.DbNull : (filter.defaultValue as Prisma.InputJsonValue),
    required: filter.required,
    multiple: filter.multiple,
    valuesSource:
      filter.valuesSource === null ? Prisma.DbNull : (filter.valuesSource as Prisma.InputJsonValue),
    placementKind: filter.placement.kind,
    placementCardId: filter.placement.kind === 'INLINE_CARD' ? filter.placement.cardId : null,
    order: filter.order,
  }));
}

export function toDashboardMappingRows(
  dashboard: Dashboard,
): Prisma.DashboardFilterMappingCreateManyInput[] {
  return dashboard.mappings.map((mapping) => ({
    id: randomUUID(),
    dashboardId: dashboard.id,
    filterId: mapping.filterId,
    cardId: mapping.cardId,
    targetKind: mapping.target.kind,
    target: mappingTargetPayload(mapping),
  }));
}

function toCard(row: DashboardCardRow): DashboardCard {
  const base = {
    id: row.id,
    tabId: row.tabId,
    geometry: { x: row.x, y: row.y, width: row.width, height: row.height },
  };
  switch (row.kind) {
    case 'CHART':
      if (!row.chartId || !isRecord(row.visualizationOverrides)) invalidStoredPayload();
      return {
        ...base,
        kind: 'CHART',
        chartId: row.chartId,
        chartRevisionNumber: row.chartRevisionNumber,
        visualizationOverrides: row.visualizationOverrides,
      };
    case 'HEADING':
      return { ...base, kind: 'HEADING', content: headingContent(row.content) };
    case 'TEXT':
      return { ...base, kind: 'TEXT', content: textContent(row.content) };
    case 'LINK':
      return { ...base, kind: 'LINK', content: linkContent(row.content) };
    default:
      throw DashboardError.validation('Stored dashboard card kind is invalid.');
  }
}

function toFilter(row: DashboardFilterRow): DashboardFilter {
  if (!SEMANTIC_TYPES.has(row.semanticType)) invalidStoredPayload();
  if (row.valuesSource !== null && !isRecord(row.valuesSource)) invalidStoredPayload();
  const placement =
    row.placementKind === 'TOP_OF_PAGE'
      ? ({ kind: 'TOP_OF_PAGE' } as const)
      : row.placementKind === 'INLINE_CARD' && row.placementCardId
        ? ({ kind: 'INLINE_CARD', cardId: row.placementCardId } as const)
        : invalidStoredPayload();
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    semanticType: row.semanticType as DashboardFilterSemanticType,
    operator: row.operator,
    defaultValue: row.defaultValue,
    required: row.required,
    multiple: row.multiple,
    valuesSource: row.valuesSource,
    placement,
    order: row.order,
  };
}

function toMapping(row: DashboardFilterMappingRow): DashboardFilterMapping {
  if (!isRecord(row.target)) invalidStoredPayload();
  switch (row.targetKind) {
    case 'FIELD':
      return {
        filterId: row.filterId,
        cardId: row.cardId,
        target: { kind: 'FIELD', fieldId: requiredString(row.target, 'fieldId') },
      };
    case 'NATIVE_QUERY_VARIABLE':
      return {
        filterId: row.filterId,
        cardId: row.cardId,
        target: {
          kind: 'NATIVE_QUERY_VARIABLE',
          variableKey: requiredString(row.target, 'variableKey'),
        },
      };
    case 'CONTENT_VARIABLE':
      return {
        filterId: row.filterId,
        cardId: row.cardId,
        target: {
          kind: 'CONTENT_VARIABLE',
          variableName: requiredString(row.target, 'variableName'),
        },
      };
    default:
      throw DashboardError.validation('Stored dashboard mapping kind is invalid.');
  }
}

function mappingTargetPayload(mapping: DashboardFilterMapping): Readonly<Record<string, string>> {
  switch (mapping.target.kind) {
    case 'FIELD':
      return { fieldId: mapping.target.fieldId };
    case 'NATIVE_QUERY_VARIABLE':
      return { variableKey: mapping.target.variableKey };
    case 'CONTENT_VARIABLE':
      return { variableName: mapping.target.variableName };
  }
}

function headingContent(value: unknown): Readonly<{ text: string }> {
  if (!isRecord(value)) return invalidStoredPayload();
  return { text: requiredString(value, 'text') };
}

function textContent(value: unknown): Readonly<{ markdown: string }> {
  if (!isRecord(value)) return invalidStoredPayload();
  return { markdown: requiredString(value, 'markdown') };
}

function linkContent(value: unknown): Readonly<{ label: string; url: string }> {
  if (!isRecord(value)) return invalidStoredPayload();
  return { label: requiredString(value, 'label'), url: requiredString(value, 'url') };
}

function requiredString(value: Readonly<Record<string, unknown>>, key: string): string {
  const property = value[key];
  if (typeof property !== 'string' || !property.trim()) return invalidStoredPayload();
  return property;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidStoredPayload(): never {
  throw DashboardError.validation('Stored dashboard payload is invalid.');
}

const SEMANTIC_TYPES = new Set([
  'DATE_PICKER',
  'TIME_GROUPING',
  'LOCATION',
  'TEXT_CATEGORY',
  'NUMBER',
  'BOOLEAN',
  'ID',
]);
