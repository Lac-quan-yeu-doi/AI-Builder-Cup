import type { QueryDefinition } from '@/src/entities/models/canonical-chart';

export interface ArtifactSource {
  /** `catalog.schema.table`, or as much of it as the definition names. */
  readonly label: string;
  /** The SQL behind the artifact, when the query was written rather than built. */
  readonly sql: string | null;
  readonly shownRows: number;
  /** What the run reported, which can exceed what came back. */
  readonly totalRows: number;
  readonly truncated: boolean;
}

/**
 * The source of a chart, read off the query the agent ran.
 *
 * `NATIVE` means somebody wrote SQL, so the SQL is what there is to show and
 * the context names the database. `VISUAL` means the question was built, so the
 * table it was built on is named outright and there is no SQL to fold away.
 */
export function chartSource(
  definition: QueryDefinition,
  shownRows: number,
  totalRows: number,
  truncated: boolean,
): ArtifactSource {
  const base: Pick<ArtifactSource, 'shownRows' | 'totalRows' | 'truncated'> = {
    shownRows,
    totalRows,
    truncated,
  };

  if (definition.mode === 'NATIVE') {
    return {
      ...base,
      label: `${definition.context.catalog}.${definition.context.schema}`,
      sql: definition.sql,
    };
  }

  const { table } = definition.source;
  return {
    ...base,
    label: `${table.catalog}.${table.schema}.${table.table}`,
    sql: null,
  };
}
