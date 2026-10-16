'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

import { Badge, type BadgeVariant } from '@/app/_components/ui/badge';
import { cn } from '@/app/_components/ui/utils';
import type { NodeCategory, NodePort } from '@/src/entities/models/node-definition';

export type PipelineNodeData = {
  readonly label: string;
  readonly category: NodeCategory;
  readonly description: string;
  readonly resourceLabel?: string;
  readonly inputPorts: readonly NodePort[];
  readonly outputPorts: readonly NodePort[];
  readonly errorCount: number;
  readonly warningCount: number;
  /** The palette no longer offers this definition — its resource is gone. */
  readonly unresolved: boolean;
};

export type PipelineFlowNode = Node<PipelineNodeData, 'pipeline'>;

const categoryTones: Readonly<Record<NodeCategory, BadgeVariant>> = {
  SOURCE: 'info',
  TRANSFORM: 'secondary',
  TARGET: 'success',
};

const handleClass = 'size-[10px] rounded-full border-2 border-white bg-primary';

/** Ports are spread evenly down the edge they belong to. */
function handleOffset(index: number, total: number): string {
  return `${((index + 1) / (total + 1)) * 100}%`;
}

export function PipelineNodeCard({ data, selected }: NodeProps<PipelineFlowNode>) {
  const hasErrors = data.errorCount > 0;
  const hasWarnings = data.warningCount > 0;
  return (
    <div
      className={cn(
        'w-[196px] rounded-xl border bg-card px-[11px] py-[9px] shadow-100',
        selected ? 'border-primary' : 'border-border',
        hasErrors && 'border-destructive/40 bg-destructive/5',
        !hasErrors && hasWarnings && 'border-status-warning/40 bg-status-warning-light',
      )}
    >
      {data.inputPorts.map((port, index) => (
        <Handle
          className={handleClass}
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          style={{ top: handleOffset(index, data.inputPorts.length) }}
          title={port.label}
        />
      ))}

      <div className="flex items-start justify-between gap-2">
        <strong className="text-caption leading-[1.3] wrap-anywhere">{data.label}</strong>
        <Badge variant={categoryTones[data.category]}>{data.category}</Badge>
      </div>

      <p
        className="mt-[5px] line-clamp-1 text-micro leading-[1.45] text-muted-foreground"
        title={data.resourceLabel ?? data.description}
      >
        {data.resourceLabel ?? data.description}
      </p>

      {data.unresolved ? (
        <p className="mt-[7px] text-micro font-semibold text-destructive">Definition unavailable</p>
      ) : null}

      {hasErrors ? (
        <p className="mt-[7px] text-micro font-semibold text-destructive">
          {data.errorCount} blocking {data.errorCount === 1 ? 'issue' : 'issues'}
        </p>
      ) : hasWarnings ? (
        <p className="mt-[7px] text-micro font-semibold text-status-warning-dark">
          {data.warningCount} runtime {data.warningCount === 1 ? 'check' : 'checks'}
        </p>
      ) : null}

      {data.outputPorts.map((port, index) => (
        <Handle
          className={handleClass}
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{ top: handleOffset(index, data.outputPorts.length) }}
          title={port.label}
        />
      ))}
    </div>
  );
}
