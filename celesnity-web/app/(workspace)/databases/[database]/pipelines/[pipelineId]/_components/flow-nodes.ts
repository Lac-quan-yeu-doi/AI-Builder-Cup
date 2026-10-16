import type { NodeChange } from '@xyflow/react';

import type { PipelineGraph, PipelinePosition } from '@/src/entities/models/pipeline';
import type { NodeDefinitionSummaryViewModel } from '@/src/interface-adapters/presenters/node-definition.presenter';

import type { PipelineFlowNode, PipelineNodeData } from './pipeline-node-card';

export interface NodeValidationCounts {
  readonly errors: number;
  readonly warnings: number;
}

const fallbackInputPorts = [
  { id: 'input', label: 'Input', dataType: 'DATASET', required: true },
] as const;

const fallbackOutputPorts = [
  { id: 'output', label: 'Output', dataType: 'DATASET', required: false },
] as const;

export interface CommittedMove {
  readonly id: string;
  readonly position: PipelinePosition;
}

/**
 * Projects the domain graph onto React Flow's node array.
 *
 * `previous` is not an optimisation. React Flow stores a node's measured size
 * and handle bounds against the exact object it was handed (`adoptUserNodes`
 * compares by reference); hand it a fresh object and those measurements are
 * dropped, the flow is marked uninitialized, and the node repaints without
 * dimensions for a frame. Reusing the previous object whenever nothing visible
 * changed — and carrying `measured` forward when something did — is what keeps
 * a dragged node from flickering.
 */
export function toFlowNodes(
  graph: PipelineGraph,
  definitions: ReadonlyMap<string, NodeDefinitionSummaryViewModel>,
  issueCounts: ReadonlyMap<string, NodeValidationCounts>,
  selectedNodeId: string | undefined,
  previous: readonly PipelineFlowNode[] = [],
): PipelineFlowNode[] {
  const previousById = new Map(previous.map((node) => [node.id, node]));
  const genericIcebergTarget = [...definitions.values()].find(
    (definition) =>
      definition.type === 'ICEBERG_TARGET' && definition.resourceId.split('.').length === 1,
  );

  return graph.nodes.map((node) => {
    const exactDefinition = node.resourceId ? definitions.get(node.resourceId) : undefined;
    // Older saved pipelines bind a target to a concrete table resource while the
    // current palette exposes one configurable catalog target. Reuse that generic
    // definition for presentation only; source bindings still fail closed when a
    // saved connection disappears.
    const definition =
      exactDefinition ??
      (node.definitionType === 'ICEBERG_TARGET' ? genericIcebergTarget : undefined);
    const configuredResourceLabel =
      node.definitionType === 'ICEBERG_TARGET'
        ? icebergTargetLabel(node.config)
        : node.definitionType === 'ICEBERG_SOURCE'
          ? icebergSourceLabel(node.config)
          : undefined;
    const data: PipelineNodeData = {
      label: definition?.label ?? node.definitionType,
      category: definition?.category ?? 'TRANSFORM',
      description: definition?.description ?? '',
      ...(configuredResourceLabel || definition?.resourceLabel
        ? { resourceLabel: configuredResourceLabel ?? definition?.resourceLabel }
        : {}),
      inputPorts: definition?.inputPorts ?? fallbackInputPorts,
      outputPorts: definition?.outputPorts ?? fallbackOutputPorts,
      errorCount: issueCounts.get(node.id)?.errors ?? 0,
      warningCount: issueCounts.get(node.id)?.warnings ?? 0,
      unresolved: definition === undefined,
    };
    const selected = node.id === selectedNodeId;
    const existing = previousById.get(node.id);

    if (
      existing &&
      existing.position.x === node.position.x &&
      existing.position.y === node.position.y &&
      existing.selected === selected &&
      sameData(existing.data, data)
    ) {
      return existing;
    }

    return {
      ...existing,
      id: node.id,
      type: 'pipeline',
      position: node.position,
      selected,
      data,
    };
  });
}

function icebergSourceLabel(config: Readonly<Record<string, unknown>>): string | undefined {
  const databaseName =
    typeof config.catalogDatabaseName === 'string' ? config.catalogDatabaseName : undefined;
  const tableName =
    typeof config.catalogTableName === 'string' ? config.catalogTableName : undefined;
  return databaseName && tableName ? `${databaseName}.${tableName}` : undefined;
}

function icebergTargetLabel(config: Readonly<Record<string, unknown>>): string | undefined {
  const databaseName = typeof config.databaseName === 'string' ? config.databaseName : undefined;
  const configuredTable =
    config.tableMode === 'CREATE_NEW' ? config.newTableName : config.tableName;
  const tableName = typeof configuredTable === 'string' ? configuredTable : undefined;
  return databaseName && tableName ? `${databaseName}.${tableName}` : undefined;
}

/**
 * Position changes arrive on every pointer move with `dragging: true`. Only the
 * release — or a programmatic move, which reports no drag at all — belongs in
 * the domain graph; committing every frame would make each one a graph edit.
 */
export function committedMoves(
  changes: readonly NodeChange<PipelineFlowNode>[],
): readonly CommittedMove[] {
  return changes.flatMap((change) =>
    change.type === 'position' && change.position && !change.dragging
      ? [{ id: change.id, position: change.position }]
      : [],
  );
}

export function removedNodeIds(
  changes: readonly NodeChange<PipelineFlowNode>[],
): readonly string[] {
  return changes.flatMap((change) => (change.type === 'remove' ? [change.id] : []));
}

function sameData(left: PipelineNodeData, right: PipelineNodeData): boolean {
  return (
    left.label === right.label &&
    left.category === right.category &&
    left.description === right.description &&
    left.resourceLabel === right.resourceLabel &&
    left.errorCount === right.errorCount &&
    left.warningCount === right.warningCount &&
    left.unresolved === right.unresolved &&
    left.inputPorts === right.inputPorts &&
    left.outputPorts === right.outputPorts
  );
}
