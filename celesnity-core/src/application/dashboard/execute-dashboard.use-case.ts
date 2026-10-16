import type {
  DashboardCardExecution,
  DashboardExecution,
  DashboardFilterApplication,
} from '@application/dashboard/dashboard-execution.models';
import type { IDashboardCardExecutor } from '@application/dashboard/interfaces/i-dashboard-card-executor';
import type {
  DashboardPrincipal,
  IDashboardCollectionAuthorizationReader,
} from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import type { DashboardCard, DashboardChartCard } from '@domain/dashboard/models/dashboard-card';
import { normalizeDashboardFilterValue } from '@domain/dashboard/services/dashboard-filter-normalizer';

export class ExecuteDashboardUseCase {
  public constructor(
    private readonly repository: IDashboardRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
    private readonly executor: IDashboardCardExecutor,
  ) {}

  public async execute(input: {
    readonly principal: DashboardPrincipal;
    readonly dashboardId: string;
    readonly tabId: string;
    readonly values: Readonly<Record<string, unknown>>;
    readonly changedFilterIds?: readonly string[];
  }): Promise<DashboardExecution> {
    const dashboard = await this.repository.findById(
      input.principal.organizationId,
      input.dashboardId,
    );
    if (dashboard === null || dashboard.archivedAt !== null) throw DashboardError.notFound();
    await this.collections.requireAccess(dashboard.collectionId, input.principal, 'VIEW');
    if (!dashboard.tabs.some((tab) => tab.id === input.tabId)) {
      throw DashboardError.validation('Dashboard tab is invalid.');
    }

    const effectiveValues = new Map(
      dashboard.filters.map((filter) => {
        const supplied = input.values[filter.slug];
        const missingRequired =
          filter.required && isEmpty(supplied) && isEmpty(filter.defaultValue);
        return [
          filter.id,
          missingRequired ? null : normalizeDashboardFilterValue(filter, supplied),
        ] as const;
      }),
    );
    const changed = input.changedFilterIds ? new Set(input.changedFilterIds) : null;
    const cards = dashboard.cards.filter(
      (card: DashboardCard): card is DashboardChartCard =>
        card.tabId === input.tabId && card.kind === 'CHART',
    );
    const results = await Promise.all(
      cards.map(async (card): Promise<DashboardCardExecution> => {
        const mappings = dashboard.mappings.filter((mapping) => mapping.cardId === card.id);
        if (changed && !mappings.some((mapping) => changed.has(mapping.filterId))) {
          return { cardId: card.id, state: 'UNCHANGED' };
        }
        const filters: DashboardFilterApplication[] = mappings.map((mapping) => {
          const definition = dashboard.filters.find((filter) => filter.id === mapping.filterId);
          if (!definition) throw DashboardError.validation('Dashboard filter mapping is invalid.');
          return {
            filterId: definition.id,
            operator: definition.operator,
            target: mapping.target,
            value: effectiveValues.get(definition.id),
          };
        });
        if (
          mappings.some((mapping) => {
            const definition = dashboard.filters.find((filter) => filter.id === mapping.filterId);
            return definition?.required === true && effectiveValues.get(mapping.filterId) === null;
          })
        )
          return { cardId: card.id, state: 'REQUIRES_FILTER' };

        try {
          const result = await this.executor.execute({
            principal: input.principal,
            chartId: card.chartId,
            revisionNumber: card.chartRevisionNumber,
            filters,
          });
          return { cardId: card.id, ...result };
        } catch {
          return {
            cardId: card.id,
            state: 'ERROR',
            message: 'The dashboard card could not be executed.',
          };
        }
      }),
    );
    return { dashboardId: dashboard.id, tabId: input.tabId, cards: results };
  }
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}
