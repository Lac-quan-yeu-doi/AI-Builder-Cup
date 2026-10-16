import { z } from 'zod';

/** Mirrors the Core API request validation so bad input never reaches it. */
const NAME_MAX_LENGTH = 160;
const DESCRIPTION_MAX_LENGTH = 4000;
const PREVIEW_ROW_LIMIT = 1000;

export const pipelineIdSchema = z.string().min(1);

export const pipelineNodeSchema = z.object({
  id: z.string().min(1).max(120),
  definitionType: z.string().min(1).max(80),
  resourceId: z.string().max(500).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.unknown()),
});

export const pipelineEdgeSchema = z.object({
  id: z.string().min(1).max(120),
  sourceNodeId: z.string().min(1).max(120),
  sourcePortId: z.string().min(1).max(120),
  targetNodeId: z.string().min(1).max(120),
  targetPortId: z.string().min(1).max(120),
});

export const pipelineGraphSchema = z.object({
  nodes: z.array(pipelineNodeSchema).max(500),
  edges: z.array(pipelineEdgeSchema).max(2000),
});

export const pipelineDraftSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  /**
   * The Iceberg database the pipeline is filed under.
   *
   * Zod strips what it does not declare. A pipeline created from inside a
   * database was filed under nothing, so the database's own Pipelines tab —
   * which filters on this — never listed it, while the name it took stayed
   * taken across the workspace.
   */
  databaseName: z.string().trim().min(1).optional(),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
  graph: pipelineGraphSchema,
});

export const savePipelineSchema = z.object({
  pipelineId: pipelineIdSchema,
  input: pipelineDraftSchema.extend({ version: z.number().int().min(1) }),
});

export const clonePipelineSchema = z.object({
  pipelineId: pipelineIdSchema,
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
});

export const listPipelinesQuerySchema = z.object({
  keyword: z.string().max(200).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const validateEdgeSchema = z.object({
  graph: pipelineGraphSchema,
  edge: pipelineEdgeSchema,
});

export const previewNodeSchema = z.object({
  pipelineId: pipelineIdSchema,
  nodeId: z.string().min(1).max(120),
  input: z.object({
    pipelineVersion: z.number().int().min(1),
    limit: z.number().int().min(1).max(PREVIEW_ROW_LIMIT),
  }),
});
