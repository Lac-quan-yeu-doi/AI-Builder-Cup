import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import type { DashboardCard, GridGeometry } from '@domain/dashboard/models/dashboard-card';
import type {
  DashboardFilter,
  DashboardFilterMapping,
} from '@domain/dashboard/models/dashboard-filter';
import { validateDashboardFilter } from '@domain/dashboard/services/dashboard-filter-normalizer';

export interface DashboardTab {
  readonly id: string;
  readonly name: string;
  readonly order: number;
}

export interface Dashboard {
  readonly id: string;
  readonly organizationId: string;
  readonly collectionId: string;
  readonly title: string;
  readonly description: string | null;
  readonly revision: number;
  readonly tabs: readonly DashboardTab[];
  readonly cards: readonly DashboardCard[];
  readonly filters: readonly DashboardFilter[];
  readonly mappings: readonly DashboardFilterMapping[];
  readonly createdByIdentityId: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateDashboardInput {
  readonly id: string;
  readonly organizationId: string;
  readonly collectionId: string;
  readonly title: string;
  readonly description: string | null;
  readonly createdByIdentityId: string;
  readonly initialTabId: string;
  readonly now: string;
}

export function createDashboard(input: CreateDashboardInput): Dashboard {
  const dashboard: Dashboard = {
    id: input.id,
    organizationId: input.organizationId,
    collectionId: input.collectionId,
    title: input.title.trim(),
    description: input.description,
    revision: 1,
    tabs: [{ id: input.initialTabId, name: 'Tab 1', order: 0 }],
    cards: [],
    filters: [],
    mappings: [],
    createdByIdentityId: input.createdByIdentityId,
    archivedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
  validateDashboard(dashboard);
  return dashboard;
}

export function validateDashboard(dashboard: Dashboard): void {
  requireText(dashboard.title, 'Dashboard title is required.');
  if (dashboard.tabs.length === 0) {
    throw DashboardError.validation('A dashboard must contain at least one tab.');
  }

  requireUnique(
    dashboard.tabs.map((tab) => tab.id),
    'tab IDs',
  );
  requireUnique(
    dashboard.cards.map((card) => card.id),
    'card IDs',
  );
  requireUnique(
    dashboard.filters.map((filter) => filter.id),
    'filter IDs',
  );
  requireUnique(
    dashboard.filters.map((filter) => filter.slug),
    'filter slugs',
  );

  const tabIds = new Set(dashboard.tabs.map((tab) => tab.id));
  const cardIds = new Set(dashboard.cards.map((card) => card.id));
  const filterIds = new Set(dashboard.filters.map((filter) => filter.id));

  for (const card of dashboard.cards) {
    if (!tabIds.has(card.tabId)) {
      throw DashboardError.validation('Every card must belong to a dashboard tab.');
    }
    validateGeometry(card.geometry);
    validateCard(card);
  }

  for (const filter of dashboard.filters) {
    requireText(filter.slug, 'Filter slug is required.');
    requireText(filter.label, 'Filter label is required.');
    validateDashboardFilter(filter);
    if (filter.placement.kind === 'INLINE_CARD' && !cardIds.has(filter.placement.cardId)) {
      throw DashboardError.validation('Inline filter placement must reference a dashboard card.');
    }
  }

  for (const mapping of dashboard.mappings) {
    if (!filterIds.has(mapping.filterId) || !cardIds.has(mapping.cardId)) {
      throw DashboardError.validation('Filter mappings must stay inside the dashboard.');
    }
    const card = dashboard.cards.find((candidate) => candidate.id === mapping.cardId);
    if (card === undefined || !mappingMatchesCard(card, mapping)) {
      throw DashboardError.validation('Filter mapping target is invalid for its card.');
    }
  }
}

export function removeDashboardCard(dashboard: Dashboard, cardId: string): Dashboard {
  const updated: Dashboard = {
    ...dashboard,
    cards: dashboard.cards.filter((card) => card.id !== cardId),
    filters: dashboard.filters.map((filter) =>
      filter.placement.kind === 'INLINE_CARD' && filter.placement.cardId === cardId
        ? { ...filter, placement: { kind: 'TOP_OF_PAGE' as const } }
        : filter,
    ),
    mappings: dashboard.mappings.filter((mapping) => mapping.cardId !== cardId),
  };
  validateDashboard(updated);
  return updated;
}

export function removeDashboardFilter(dashboard: Dashboard, filterId: string): Dashboard {
  const updated: Dashboard = {
    ...dashboard,
    filters: dashboard.filters.filter((filter) => filter.id !== filterId),
    mappings: dashboard.mappings.filter((mapping) => mapping.filterId !== filterId),
  };
  validateDashboard(updated);
  return updated;
}

function validateGeometry(geometry: GridGeometry): void {
  const values = [geometry.x, geometry.y, geometry.width, geometry.height];
  if (!values.every(Number.isInteger)) {
    throw DashboardError.validation('Grid geometry must use integer units.');
  }
  if (
    geometry.x < 0 ||
    geometry.y < 0 ||
    geometry.width <= 0 ||
    geometry.height <= 0 ||
    geometry.x + geometry.width > 24
  ) {
    throw DashboardError.validation('Card geometry must fit inside the 24-column grid.');
  }
}

function validateCard(card: DashboardCard): void {
  switch (card.kind) {
    case 'CHART':
      requireText(card.chartId, 'Chart cards require a chart reference.');
      return;
    case 'HEADING':
      requireText(card.content.text, 'Heading cards require text.');
      return;
    case 'TEXT':
      requireText(card.content.markdown, 'Text cards require content.');
      return;
    case 'LINK':
      requireText(card.content.label, 'Link cards require a label.');
      requireText(card.content.url, 'Link cards require a URL.');
      if (!isSafeDashboardLink(card.content.url)) {
        throw DashboardError.validation('Link cards require an HTTP(S) or internal URL.');
      }
      return;
  }
}

function isSafeDashboardLink(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('/') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://')
  );
}

function mappingMatchesCard(card: DashboardCard, mapping: DashboardFilterMapping): boolean {
  if (card.kind === 'CHART') {
    return (
      (mapping.target.kind === 'FIELD' && mapping.target.fieldId.trim().length > 0) ||
      (mapping.target.kind === 'NATIVE_QUERY_VARIABLE' &&
        mapping.target.variableKey.trim().length > 0)
    );
  }
  return (
    mapping.target.kind === 'CONTENT_VARIABLE' && mapping.target.variableName.trim().length > 0
  );
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw DashboardError.validation(`Dashboard ${label} must be unique.`);
  }
}

function requireText(value: string, message: string): void {
  if (!value.trim()) throw DashboardError.validation(message);
}
