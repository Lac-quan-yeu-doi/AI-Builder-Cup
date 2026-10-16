import type { PipelineValidationIssue } from '@/src/entities/models/pipeline';

export interface ValidationIssueGroup {
  readonly key: string;
  readonly severity: 'ERROR' | 'WARNING';
  /** Present when every issue in the group belongs to one node. */
  readonly nodeId?: string;
  /** True when nothing on this screen can clear it: the scan has to run first. */
  readonly needsMetadata: boolean;
  readonly messages: readonly string[];
}

/**
 * The order a person can actually work in.
 *
 * `SOURCE_SCHEMA_UNAVAILABLE` says the crawler has never scanned this source, so
 * there is no schema, no table and no relation to pick. Every node-config issue
 * under it is a consequence, and Core returns it last because it comes from a
 * second validator. Read top-down, the panel used to send someone to a dropdown
 * that could not have anything in it.
 */
const RANK: Readonly<Record<string, number>> = {
  SOURCE_SCHEMA_UNAVAILABLE: 0,
  CATALOG_SOURCE_INVALID: 1,
  NODE_CONFIG_REQUIRED: 1,
  NODE_CONFIG_INVALID: 1,
};

const GRAPH_RANK = 2;

function rankOf(issue: PipelineValidationIssue): number {
  return RANK[issue.code] ?? GRAPH_RANK;
}

/**
 * One row per thing to do, not one row per rule that fired.
 *
 * A source node with no relation chosen produces three issues: the schema
 * field, the table field, and the catalog relation itself. They name one act,
 * they carry the same `nodeId`, and each used to render its own card with its
 * own identical "Show node" link.
 */
export function groupValidationIssues(
  issues: readonly PipelineValidationIssue[],
): readonly ValidationIssueGroup[] {
  const groups = new Map<string, { group: ValidationIssueGroup; order: number }>();

  issues.forEach((issue, index) => {
    const rank = rankOf(issue);
    const severity = issue.severity === 'WARNING' ? 'WARNING' : 'ERROR';
    const needsMetadata = issue.code === 'SOURCE_SCHEMA_UNAVAILABLE';
    // Node-scoped config issues collapse together. Graph-shape issues stay
    // apart even when they name a node, because each is its own fix.
    const key =
      rank === 1 && issue.nodeId !== undefined
        ? `node:${issue.nodeId}:${severity}`
        : `issue:${index}`;

    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        order: rank * 1000 + index,
        group: {
          key,
          severity,
          ...(issue.nodeId === undefined ? {} : { nodeId: issue.nodeId }),
          needsMetadata,
          messages: [issue.message],
        },
      });
      return;
    }

    groups.set(key, {
      order: existing.order,
      group: {
        ...existing.group,
        needsMetadata: existing.group.needsMetadata || needsMetadata,
        messages: existing.group.messages.includes(issue.message)
          ? existing.group.messages
          : [...existing.group.messages, issue.message],
      },
    });
  });

  return [...groups.values()]
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.group);
}
