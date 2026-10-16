import type {
  VisualQueryDefinition,
  VisualQueryPreviewStage,
} from '@/src/entities/models/canonical-chart';

export type { VisualQueryPreviewStage } from '@/src/entities/models/canonical-chart';

/**
 * Projects a visual question to the clauses that are available at a notebook
 * stage. The projection is intentionally pure: previewing a step must not
 * mutate the draft that will eventually be saved.
 */
export function projectVisualQueryPreview(
  query: VisualQueryDefinition,
  stage: VisualQueryPreviewStage,
): VisualQueryDefinition {
  const base = cloneQuery(query);

  switch (stage) {
    case 'DATA':
      return withoutAfterData(base);
    case 'JOIN':
      return withoutAfterJoin(base);
    case 'FILTER':
      return withoutAfterFilter(base);
    case 'SUMMARIZE':
      return withoutAfterSummarize(base);
    case 'SORT_LIMIT':
      return base;
  }
}

function cloneQuery(query: VisualQueryDefinition): VisualQueryDefinition {
  return {
    ...query,
    parameters: [...query.parameters],
    joins: query.joins.map((join) => ({
      ...join,
      table: { ...join.table },
      conditions: join.conditions.map((condition) => ({ ...condition })),
    })),
    projections: query.projections.map((projection) => ({ ...projection })),
    customExpressions: query.customExpressions.map((expression) => ({ ...expression })),
    filters: [...query.filters],
    aggregations: query.aggregations.map((aggregation) => ({ ...aggregation })),
    breakouts: [...query.breakouts],
    postAggregationFilters: [...query.postAggregationFilters],
    orderBy: query.orderBy.map((item) => ({ ...item })),
  };
}

function withoutAfterData(query: VisualQueryDefinition): VisualQueryDefinition {
  return {
    ...query,
    joins: [],
    filters: [],
    aggregations: [],
    breakouts: [],
    postAggregationFilters: [],
    orderBy: [],
    limit: undefined,
  };
}

function withoutAfterJoin(query: VisualQueryDefinition): VisualQueryDefinition {
  return {
    ...query,
    filters: [],
    aggregations: [],
    breakouts: [],
    postAggregationFilters: [],
    orderBy: [],
    limit: undefined,
  };
}

function withoutAfterFilter(query: VisualQueryDefinition): VisualQueryDefinition {
  return {
    ...query,
    aggregations: [],
    breakouts: [],
    postAggregationFilters: [],
    orderBy: [],
    limit: undefined,
  };
}

function withoutAfterSummarize(query: VisualQueryDefinition): VisualQueryDefinition {
  return {
    ...query,
    orderBy: [],
    limit: undefined,
  };
}
