import type { Pipeline } from '@domain/pipeline-authoring/models/pipeline';

export interface PipelineListQuery {
  readonly keyword?: string;
  readonly status?: 'DRAFT';
  readonly skip: number;
  readonly take: number;
  readonly sortBy: 'name' | 'createdAt' | 'updatedAt';
  readonly sortDirection: 'ASC' | 'DESC';
}

export type PipelineCountQuery = Pick<PipelineListQuery, 'keyword' | 'status'>;
export type PipelineSaveResult = 'SAVED' | 'VERSION_CONFLICT' | 'NAME_CONFLICT';

export interface IPipelineRepository {
  list(query: PipelineListQuery): Promise<readonly Pipeline[]>;
  count(query: PipelineCountQuery): Promise<number>;
  findActiveById(id: string): Promise<Pipeline | undefined>;
  existsActiveByName(name: string, excludingId?: string): Promise<boolean>;
  create(pipeline: Pipeline): Promise<boolean>;
  update(pipeline: Pipeline, expectedVersion: number): Promise<PipelineSaveResult>;
  archive(id: string, archivedAt: string): Promise<boolean>;
}
