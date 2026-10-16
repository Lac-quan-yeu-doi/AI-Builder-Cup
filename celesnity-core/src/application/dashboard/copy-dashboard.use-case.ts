import type {
  DashboardPrincipal,
  IDashboardCollectionAuthorizationReader,
} from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardChartReader } from '@application/dashboard/interfaces/i-dashboard-chart.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import { requireDashboardCharts } from '@application/dashboard/dashboard-chart-access.service';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import { validateDashboard, type Dashboard } from '@domain/dashboard/models/dashboard';

export class CopyDashboardUseCase {
  public constructor(
    private readonly repository: IDashboardRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
    private readonly charts: IDashboardChartReader,
    private readonly ids: IIdGenerator,
    private readonly clock: IClock,
  ) {}

  public async execute(input: {
    readonly principal: DashboardPrincipal;
    readonly sourceDashboardId: string;
    readonly collectionId: string;
    readonly title: string;
    readonly draft: Dashboard;
  }): Promise<Dashboard> {
    const source = await this.repository.findById(
      input.principal.organizationId,
      input.sourceDashboardId,
    );
    if (source === null || source.archivedAt !== null) throw DashboardError.notFound();
    if (input.draft.id !== source.id || input.draft.organizationId !== source.organizationId) {
      throw DashboardError.validation('Copy draft identity does not match the source dashboard.');
    }
    await this.collections.requireAccess(source.collectionId, input.principal, 'VIEW');
    await this.collections.requireAccess(input.collectionId, input.principal, 'CURATE');
    await requireDashboardCharts(input.draft, input.principal, this.charts);

    const dashboardId = this.ids.next();
    const tabIds = new Map(input.draft.tabs.map((tab) => [tab.id, this.ids.next()]));
    const cardIds = new Map(input.draft.cards.map((card) => [card.id, this.ids.next()]));
    const filterIds = new Map(input.draft.filters.map((filter) => [filter.id, this.ids.next()]));
    const now = this.clock.now().toISOString();
    const copy: Dashboard = {
      ...input.draft,
      id: dashboardId,
      organizationId: input.principal.organizationId,
      collectionId: input.collectionId,
      title: input.title.trim(),
      revision: 1,
      tabs: input.draft.tabs.map((tab) => ({ ...tab, id: requiredId(tabIds, tab.id) })),
      cards: input.draft.cards.map((card) => ({
        ...card,
        id: requiredId(cardIds, card.id),
        tabId: requiredId(tabIds, card.tabId),
      })),
      filters: input.draft.filters.map((filter) => ({
        ...filter,
        id: requiredId(filterIds, filter.id),
        placement:
          filter.placement.kind === 'INLINE_CARD'
            ? {
                kind: 'INLINE_CARD' as const,
                cardId: requiredId(cardIds, filter.placement.cardId),
              }
            : filter.placement,
      })),
      mappings: input.draft.mappings.map((mapping) => ({
        ...mapping,
        filterId: requiredId(filterIds, mapping.filterId),
        cardId: requiredId(cardIds, mapping.cardId),
      })),
      createdByIdentityId: input.principal.identityId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    validateDashboard(copy);
    return this.repository.copy(copy);
  }
}

function requiredId(ids: ReadonlyMap<string, string>, sourceId: string): string {
  const id = ids.get(sourceId);
  if (id === undefined) throw DashboardError.validation('Copy draft contains a broken reference.');
  return id;
}
