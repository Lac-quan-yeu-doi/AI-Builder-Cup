import {
  createDefaultVisualization,
  type VisualizationDefinition,
  type VisualizationType,
} from '@/src/entities/models/canonical-chart';

/**
 * Migrates only compatible role bindings when a user changes chart type.
 * Unknown bindings are dropped; the query and its in-memory result rows are untouched.
 */
export function transitionVisualizationType(
  current: VisualizationDefinition,
  nextType: VisualizationType,
  fields: readonly string[],
  hints: VisualizationRoleHints = {},
): VisualizationDefinition {
  if (current.type === nextType) return bindVisualizationToFields(current, fields, hints);

  const candidates = roleCandidates(current);

  switch (nextType) {
    case 'TABLE': {
      const next = defaultVisualization('TABLE');
      return {
        ...next,
        roles: {
          columns: validDistinct(candidates.columns.length ? candidates.columns : fields, fields),
        },
      };
    }
    case 'NUMBER': {
      const next = defaultVisualization('NUMBER');
      return {
        ...next,
        roles: {
          measure: firstValid([...candidates.measures, ...(hints.measures ?? [])], fields),
        },
      };
    }
    case 'PIE': {
      const next = defaultVisualization('PIE');
      const measure = firstValid([...candidates.measures, ...(hints.measures ?? [])], fields);
      return {
        ...next,
        roles: {
          measure,
          breakout: firstValid(
            [...candidates.breakouts, ...candidates.categories, ...(hints.categories ?? [])],
            fields,
            measure,
          ),
        },
      };
    }
    case 'BAR': {
      const next = defaultVisualization('BAR');
      const measures = validDistinct([...candidates.measures, ...(hints.measures ?? [])], fields);
      const category = firstValid([...candidates.categories, ...(hints.categories ?? [])], fields);
      const inferred = inferCartesianRoles(candidates, fields);
      return {
        ...next,
        roles: {
          category: category || inferred.category,
          measures: measures.length ? measures : inferred.measures,
          ...(firstValid(candidates.series, fields)
            ? { breakout: firstValid(candidates.series, fields) }
            : {}),
        },
      };
    }
    case 'LINE': {
      const next = defaultVisualization('LINE');
      const measures = validDistinct([...candidates.measures, ...(hints.measures ?? [])], fields);
      const x = firstValid([...candidates.categories, ...(hints.categories ?? [])], fields);
      const inferred = inferCartesianRoles(candidates, fields);
      return {
        ...next,
        roles: {
          x: x || inferred.category,
          measures: measures.length ? measures : inferred.measures,
          ...(firstValid(candidates.series, fields)
            ? { series: firstValid(candidates.series, fields) }
            : {}),
        },
      };
    }
    case 'AREA': {
      const next = defaultVisualization('AREA');
      const measures = validDistinct([...candidates.measures, ...(hints.measures ?? [])], fields);
      const x = firstValid([...candidates.categories, ...(hints.categories ?? [])], fields);
      const inferred = inferCartesianRoles(candidates, fields);
      return {
        ...next,
        roles: {
          x: x || inferred.category,
          measures: measures.length ? measures : inferred.measures,
          ...(firstValid(candidates.series, fields)
            ? { series: firstValid(candidates.series, fields) }
            : {}),
        },
      };
    }
    case 'SCATTER': {
      const next = defaultVisualization('SCATTER');
      const inferred = inferCartesianRoles(candidates, fields);
      return {
        ...next,
        roles: {
          x:
            firstValid([...candidates.categories, ...(hints.categories ?? [])], fields) ||
            inferred.category,
          y:
            firstValid([...candidates.measures, ...(hints.measures ?? [])], fields) ||
            inferred.measures[0] ||
            '',
          ...(firstValid(candidates.series, fields)
            ? { series: firstValid(candidates.series, fields) }
            : {}),
          ...(firstValid(candidates.size, fields)
            ? { size: firstValid(candidates.size, fields) }
            : {}),
        },
      };
    }
  }
}

/** Fills or repairs the selected visualization roles after query preview discovers its schema. */
export function bindVisualizationToFields(
  current: VisualizationDefinition,
  fields: readonly string[],
  hints: VisualizationRoleHints = {},
): VisualizationDefinition {
  const candidates = roleCandidates(current);

  switch (current.type) {
    case 'TABLE':
      return {
        ...current,
        roles: {
          columns: validDistinct(
            current.roles.columns.length ? current.roles.columns : fields,
            fields,
          ),
        },
      };
    case 'NUMBER':
      return {
        ...current,
        roles: { measure: firstValid([current.roles.measure, ...fields], fields) },
      };
    case 'PIE': {
      const measure = firstValid(
        [current.roles.measure, ...(hints.measures ?? []), ...fields.slice(1), ...fields],
        fields,
      );
      return {
        ...current,
        roles: {
          measure,
          breakout: firstValid(
            [current.roles.breakout, ...(hints.categories ?? []), ...fields],
            fields,
            measure,
          ),
        },
      };
    }
    case 'BAR': {
      const inferred = inferCartesianRoles(candidates, fields);
      const breakout = firstValid([current.roles.breakout], fields);
      const hintedMeasures = validDistinct(hints.measures ?? [], fields);
      return {
        ...current,
        roles: {
          category:
            firstValid([current.roles.category, ...(hints.categories ?? [])], fields) ||
            inferred.category,
          measures: validDistinct(current.roles.measures, fields).length
            ? validDistinct(current.roles.measures, fields)
            : hintedMeasures.length
              ? hintedMeasures
              : inferred.measures,
          ...(breakout ? { breakout } : {}),
        },
      };
    }
    case 'LINE':
    case 'AREA': {
      const inferred = inferCartesianRoles(candidates, fields);
      const series = firstValid([current.roles.series], fields);
      const hintedMeasures = validDistinct(hints.measures ?? [], fields);
      return {
        ...current,
        roles: {
          x:
            firstValid([current.roles.x, ...(hints.categories ?? [])], fields) || inferred.category,
          measures: validDistinct(current.roles.measures, fields).length
            ? validDistinct(current.roles.measures, fields)
            : hintedMeasures.length
              ? hintedMeasures
              : inferred.measures,
          ...(series ? { series } : {}),
        },
      };
    }
    case 'SCATTER': {
      const inferred = inferCartesianRoles(candidates, fields);
      const series = firstValid([current.roles.series], fields);
      const size = firstValid([current.roles.size], fields);
      return {
        ...current,
        roles: {
          x: firstValid([current.roles.x], fields) || inferred.category,
          y: firstValid([current.roles.y], fields) || inferred.measures[0] || '',
          ...(series ? { series } : {}),
          ...(size ? { size } : {}),
        },
      };
    }
  }
}

export interface VisualizationRoleHints {
  readonly categories?: readonly string[];
  readonly measures?: readonly string[];
}

type DefinitionOf<T extends VisualizationType> = Extract<
  VisualizationDefinition,
  { readonly type: T }
>;

function defaultVisualization<T extends VisualizationType>(type: T): DefinitionOf<T> {
  return createDefaultVisualization(type) as DefinitionOf<T>;
}

interface RoleCandidates {
  readonly categories: readonly string[];
  readonly measures: readonly string[];
  readonly series: readonly string[];
  readonly breakouts: readonly string[];
  readonly columns: readonly string[];
  readonly size: readonly string[];
}

function roleCandidates(definition: VisualizationDefinition): RoleCandidates {
  switch (definition.type) {
    case 'TABLE':
      return {
        categories: [],
        measures: [],
        series: [],
        breakouts: [],
        columns: definition.roles.columns,
        size: [],
      };
    case 'NUMBER':
      return {
        categories: [],
        measures: [definition.roles.measure],
        series: [],
        breakouts: [],
        columns: [],
        size: [],
      };
    case 'PIE':
      return {
        categories: [],
        measures: [definition.roles.measure],
        series: [],
        breakouts: [definition.roles.breakout],
        columns: [],
        size: [],
      };
    case 'BAR':
      return {
        categories: [definition.roles.category],
        measures: definition.roles.measures,
        series: definition.roles.breakout ? [definition.roles.breakout] : [],
        breakouts: definition.roles.breakout ? [definition.roles.breakout] : [],
        columns: [],
        size: [],
      };
    case 'LINE':
    case 'AREA':
      return {
        categories: [definition.roles.x],
        measures: definition.roles.measures,
        series: definition.roles.series ? [definition.roles.series] : [],
        breakouts: [],
        columns: [],
        size: [],
      };
    case 'SCATTER':
      return {
        categories: [definition.roles.x],
        measures: [definition.roles.y],
        series: definition.roles.series ? [definition.roles.series] : [],
        breakouts: [],
        columns: [],
        size: definition.roles.size ? [definition.roles.size] : [],
      };
  }
}

function firstValid(
  candidates: readonly (string | undefined)[],
  fields: readonly string[],
  fallback?: string,
): string {
  const value = candidates.find((candidate) => candidate && fields.includes(candidate));
  if (value) return value;
  return fallback && fields.includes(fallback) ? fallback : '';
}

function validDistinct(
  candidates: readonly string[],
  fields: readonly string[],
): readonly string[] {
  return Array.from(
    new Set(candidates.filter((candidate) => candidate && fields.includes(candidate))),
  );
}

function inferCartesianRoles(
  candidates: RoleCandidates,
  fields: readonly string[],
): { readonly category: string; readonly measures: readonly string[] } {
  const available = validDistinct(candidates.columns, fields).length
    ? validDistinct(candidates.columns, fields)
    : fields;
  if (available.length < 2) return { category: '', measures: [] };
  return { category: available[0] ?? '', measures: available.slice(1) };
}
