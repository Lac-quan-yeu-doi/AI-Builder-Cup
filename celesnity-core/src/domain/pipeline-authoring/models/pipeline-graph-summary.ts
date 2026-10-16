import type { PipelineGraph } from '@domain/pipeline-authoring/models/pipeline';

const ICEBERG_TARGET = 'ICEBERG_TARGET';
const CONNECTION_PREFIX = 'connection:';

/**
 * Facts a client needs about a pipeline without fetching its whole graph.
 *
 * The list endpoint returns summaries, so a caller grouping pipelines by the
 * database they write into would otherwise have to `GET /pipelines/:id` once
 * per row purely to read two values out of the graph.
 */
export interface PipelineGraphSummary {
  /**
   * The Iceberg database the pipeline writes into.
   *
   * `null` when the graph has no target node yet — a draft — and equally when
   * it has targets naming more than one database, because "which database does
   * this pipeline belong to" then has no single answer. Callers that need the
   * full picture read the graph.
   */
  readonly targetDatabase: string | null;
  /** Ids of the database services the source nodes read through, deduplicated. */
  readonly sourceConnectionIds: readonly string[];
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Reads a node's connection reference the same way the graph validator and the
 * compiler do: an explicit `resourceId`, or one derived from `connectionId`.
 * Keeping the three in step matters — a node the compiler resolves but this
 * function does not would go missing from a source listing without any error.
 */
function connectionIdOf(resourceId: string | undefined, config: unknown): string | undefined {
  const explicit = trimmedString(resourceId);
  if (explicit?.startsWith(CONNECTION_PREFIX) === true) {
    return trimmedString(explicit.slice(CONNECTION_PREFIX.length));
  }
  if (typeof config !== 'object' || config === null) {
    return undefined;
  }
  return trimmedString((config as Record<string, unknown>).connectionId);
}

export function summarizePipelineGraph(graph: PipelineGraph): PipelineGraphSummary {
  const databases = new Set<string>();
  const connectionIds = new Set<string>();

  for (const node of graph.nodes) {
    const connectionId = connectionIdOf(node.resourceId, node.config);
    if (connectionId !== undefined) {
      connectionIds.add(connectionId);
    }

    if (node.definitionType.trim().toUpperCase() !== ICEBERG_TARGET) {
      continue;
    }
    const databaseName = trimmedString(node.config.databaseName);
    if (databaseName !== undefined) {
      databases.add(databaseName);
    }
  }

  const [onlyDatabase, ...otherDatabases] = [...databases];

  return {
    targetDatabase: onlyDatabase !== undefined && otherDatabases.length === 0 ? onlyDatabase : null,
    sourceConnectionIds: [...connectionIds],
  };
}
