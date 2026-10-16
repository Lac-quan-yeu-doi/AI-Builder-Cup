import type {
  DashboardPrincipal,
  IDashboardCollectionAuthorizationReader,
} from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type {
  DashboardCardFilterTargets,
  IDashboardFilterTargetReader,
} from '@application/dashboard/interfaces/i-dashboard-filter-target.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import { dashboardContentVariables } from '@domain/dashboard/services/dashboard-content-variables';
import type { DashboardFilterSemanticType } from '@domain/dashboard/models/dashboard-filter';

const CONTENT_SEMANTIC_TYPES: readonly DashboardFilterSemanticType[] = [
  'DATE_PICKER',
  'TIME_GROUPING',
  'LOCATION',
  'TEXT_CATEGORY',
  'NUMBER',
  'BOOLEAN',
  'ID',
];

export class ListDashboardFilterTargetsUseCase {
  public constructor(
    private readonly repository: IDashboardRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
    private readonly reader: IDashboardFilterTargetReader,
  ) {}

  public async execute(input: {
    readonly principal: DashboardPrincipal;
    readonly dashboardId: string;
    readonly chartCards?: readonly { readonly cardId: string; readonly chartId: string }[];
  }): Promise<readonly DashboardCardFilterTargets[]> {
    const dashboard = await this.repository.findById(
      input.principal.organizationId,
      input.dashboardId,
    );
    if (dashboard === null || dashboard.archivedAt !== null) throw DashboardError.notFound();
    await this.collections.requireAccess(dashboard.collectionId, input.principal, 'CURATE');
    const persistedChartCards = dashboard.cards.flatMap((card) =>
      card.kind === 'CHART' ? [{ cardId: card.id, chartId: card.chartId }] : [],
    );
    const chartTargets = await this.reader.list({
      principal: input.principal,
      cards: input.chartCards ?? persistedChartCards,
    });
    const contentTargets = dashboard.cards.flatMap((card) => {
      const variables = dashboardContentVariables(card);
      return variables.length === 0
        ? []
        : [
            {
              cardId: card.id,
              targets: variables.flatMap((variableName) =>
                CONTENT_SEMANTIC_TYPES.map((semanticType) => ({
                  kind: 'CONTENT_VARIABLE' as const,
                  variableName,
                  semanticType,
                })),
              ),
            },
          ];
    });
    return [...chartTargets, ...contentTargets];
  }
}
