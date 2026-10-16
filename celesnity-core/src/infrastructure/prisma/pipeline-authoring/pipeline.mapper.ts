import type { Prisma } from '@generated/prisma/client';

import { PipelineError } from '@domain/pipeline-authoring/errors/pipeline.errors';
import type {
  Pipeline,
  PipelineEdge,
  PipelineGraph,
  PipelineNode,
} from '@domain/pipeline-authoring/models/pipeline';

export const PIPELINE_SELECTION = {
  id: true,
  name: true,
  databaseName: true,
  description: true,
  status: true,
  version: true,
  graph: true,
  createdById: true,
  createdByDisplayName: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PipelineRecord = Prisma.PipelineGetPayload<{ select: typeof PIPELINE_SELECTION }>;

export class PipelineMapper {
  public toDomain(record: PipelineRecord): Pipeline {
    if (record.status !== 'DRAFT') {
      throw PipelineError.validation('The stored pipeline status is invalid.');
    }
    return {
      id: record.id,
      name: record.name,
      ...(record.databaseName === null ? {} : { databaseName: record.databaseName }),
      ...(record.description === null ? {} : { description: record.description }),
      status: record.status,
      version: record.version,
      graph: this.graph(record.graph),
      createdBy: { id: record.createdById, displayName: record.createdByDisplayName },
      ...(record.archivedAt === null ? {} : { archivedAt: record.archivedAt.toISOString() }),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  public graphInput(graph: PipelineGraph): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(graph)) as Prisma.InputJsonValue;
  }

  public graph(value: Prisma.JsonValue): PipelineGraph {
    const graph = this.record(value);
    return {
      nodes: this.array(graph.nodes).map((node) => this.node(node)),
      edges: this.array(graph.edges).map((edge) => this.edge(edge)),
    };
  }

  private node(value: Prisma.JsonValue): PipelineNode {
    const node = this.record(value);
    const position = this.record(node.position);
    const config = this.record(node.config);
    return {
      id: this.string(node.id),
      definitionType: this.string(node.definitionType),
      ...(node.resourceId === undefined ? {} : { resourceId: this.string(node.resourceId) }),
      position: { x: this.number(position.x), y: this.number(position.y) },
      config,
    };
  }

  private edge(value: Prisma.JsonValue): PipelineEdge {
    const edge = this.record(value);
    return {
      ...(edge.id === undefined ? {} : { id: this.string(edge.id) }),
      sourceNodeId: this.string(edge.sourceNodeId),
      sourcePortId: this.string(edge.sourcePortId),
      targetNodeId: this.string(edge.targetNodeId),
      targetPortId: this.string(edge.targetPortId),
    };
  }

  private record(
    value: Prisma.JsonValue | undefined,
  ): Readonly<Record<string, Prisma.JsonValue | undefined>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw PipelineError.validation('The stored pipeline graph is invalid.');
    }
    return value;
  }

  private array(value: Prisma.JsonValue | undefined): readonly Prisma.JsonValue[] {
    if (!Array.isArray(value)) {
      throw PipelineError.validation('The stored pipeline graph is invalid.');
    }
    return value;
  }

  private string(value: Prisma.JsonValue | undefined): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw PipelineError.validation('The stored pipeline graph is invalid.');
    }
    return value;
  }

  private number(value: Prisma.JsonValue | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw PipelineError.validation('The stored pipeline graph is invalid.');
    }
    return value;
  }
}
