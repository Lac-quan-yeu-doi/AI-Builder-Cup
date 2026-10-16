import type { ICanonicalChartRepository } from '@application/chart/interfaces/i-chart.repository';
import type {
  IDashboardFilterTargetReader,
  DashboardCardFilterTargets,
} from '@application/dashboard/interfaces/i-dashboard-filter-target.reader';
import type { IDashboardCollectionAuthorizationReader } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { DashboardFilterSemanticType } from '@domain/dashboard/models/dashboard-filter';
import type { OutputColumnFamily } from '@domain/chart/models/visualization-definition';

export class CanonicalChartFilterTargetReader implements IDashboardFilterTargetReader {
  public constructor(
    private readonly charts: ICanonicalChartRepository,
    private readonly collections: IDashboardCollectionAuthorizationReader,
  ) {}

  public async list(
    input: Parameters<IDashboardFilterTargetReader['list']>[0],
  ): Promise<readonly DashboardCardFilterTargets[]> {
    return Promise.all(
      input.cards.map(async ({ cardId, chartId }) => {
        const current = await this.charts.findCanonicalById(
          input.principal.organizationId,
          chartId,
        );
        if (!current || !current.chart.collectionId || current.chart.archivedAt !== null)
          return { cardId, targets: [] };
        try {
          await this.collections.requireAccess(current.chart.collectionId, input.principal, 'VIEW');
        } catch {
          return { cardId, targets: [] };
        }
        const definition = current.revision.queryDefinition;
        if (definition.mode === 'NATIVE') {
          return {
            cardId,
            targets: definition.parameters.map((parameter) => ({
              kind: 'NATIVE_QUERY_VARIABLE' as const,
              variableKey: parameter.name,
              semanticType: parameterType(parameter.type),
            })),
          };
        }
        const byName = new Map(
          current.revision.outputSchema.map((column) => [column.name, column.family]),
        );
        const seen = new Set<string>();
        const candidates = [
          ...definition.projections.map((projection) => ({
            expression: projection.expression,
            outputName: projection.alias,
          })),
          ...definition.breakouts.map((expression, index) => ({
            expression,
            outputName: `breakout_${index + 1}`,
          })),
          ...definition.aggregations.map((aggregation) => ({
            expression: aggregation.expression,
            outputName: aggregation.alias,
          })),
        ];
        const targets = candidates.flatMap(({ expression, outputName }) => {
          if (expression.kind !== 'FIELD') return [];
          const fieldId = `${expression.relation}.${expression.field}`;
          if (seen.has(fieldId)) return [];
          seen.add(fieldId);
          return [
            {
              kind: 'FIELD' as const,
              fieldId,
              semanticType: fieldType(expression.field, byName.get(outputName) ?? 'UNKNOWN'),
            },
          ];
        });
        return { cardId, targets };
      }),
    );
  }
}

function parameterType(type: string): DashboardFilterSemanticType {
  if (type === 'NUMBER') return 'NUMBER';
  if (type === 'BOOLEAN') return 'BOOLEAN';
  if (type === 'DATE' || type === 'TIMESTAMP') return 'DATE_PICKER';
  return 'TEXT_CATEGORY';
}

function familyType(type: OutputColumnFamily): DashboardFilterSemanticType {
  if (type === 'NUMBER') return 'NUMBER';
  if (type === 'BOOLEAN') return 'BOOLEAN';
  if (type === 'DATE' || type === 'TIMESTAMP') return 'DATE_PICKER';
  return 'TEXT_CATEGORY';
}

function fieldType(fieldName: string, family: OutputColumnFamily): DashboardFilterSemanticType {
  return /(^|_)id$/i.test(fieldName) ? 'ID' : familyType(family);
}
