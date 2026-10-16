import type {
  IPipelineRepository,
  PipelineCountQuery,
  PipelineListQuery,
  PipelineSaveResult,
} from '@application/pipeline-authoring/interfaces/i-pipeline-repository';
import type { IPipelineVersionRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-version-repository';
import type { Pipeline } from '@domain/pipeline-authoring/models/pipeline';
import type { PipelineVersionSnapshot } from '@domain/pipeline-authoring/models/pipeline-version';

export class InMemoryPipelineRepository implements IPipelineRepository, IPipelineVersionRepository {
  public readonly items = new Map<string, Pipeline>();
  public readonly versions = new Map<string, PipelineVersionSnapshot>();

  public list(query: PipelineListQuery): Promise<readonly Pipeline[]> {
    return Promise.resolve(
      this.filtered(query)
        .sort((left, right) => {
          const result = String(left[query.sortBy]).localeCompare(String(right[query.sortBy]));
          return query.sortDirection === 'ASC' ? result : -result;
        })
        .slice(query.skip, query.skip + query.take),
    );
  }

  public count(query: PipelineCountQuery): Promise<number> {
    return Promise.resolve(this.filtered(query).length);
  }

  public findActiveById(id: string): Promise<Pipeline | undefined> {
    const pipeline = this.items.get(id);
    return Promise.resolve(pipeline?.archivedAt === undefined ? pipeline : undefined);
  }

  public existsActiveByName(name: string, excludingId?: string): Promise<boolean> {
    return Promise.resolve(
      this.filtered({ keyword: undefined, status: undefined }).some(
        (pipeline) =>
          pipeline.id !== excludingId && pipeline.name.toLowerCase() === name.toLowerCase(),
      ),
    );
  }

  public async create(pipeline: Pipeline): Promise<boolean> {
    if (await this.existsActiveByName(pipeline.name)) return false;
    this.items.set(pipeline.id, pipeline);
    return true;
  }

  public async update(pipeline: Pipeline, expectedVersion: number): Promise<PipelineSaveResult> {
    const current = await this.findActiveById(pipeline.id);
    if (current?.version !== expectedVersion) return 'VERSION_CONFLICT';
    if (await this.existsActiveByName(pipeline.name, pipeline.id)) return 'NAME_CONFLICT';
    this.items.set(pipeline.id, pipeline);
    return 'SAVED';
  }

  public async archive(id: string, archivedAt: string): Promise<boolean> {
    const current = await this.findActiveById(id);
    if (current === undefined) return false;
    this.items.set(id, { ...current, archivedAt, updatedAt: archivedAt });
    return true;
  }

  public createSnapshot(snapshot: PipelineVersionSnapshot): Promise<void> {
    this.versions.set(versionKey(snapshot.pipelineId, snapshot.versionNumber), snapshot);
    return Promise.resolve();
  }

  public find(
    pipelineId: string,
    versionNumber: number,
  ): Promise<PipelineVersionSnapshot | undefined> {
    return Promise.resolve(this.versions.get(versionKey(pipelineId, versionNumber)));
  }

  private filtered(query: PipelineCountQuery): Pipeline[] {
    const keyword = query.keyword?.toLowerCase();
    return [...this.items.values()].filter(
      (pipeline) =>
        pipeline.archivedAt === undefined &&
        (query.status === undefined || pipeline.status === query.status) &&
        (keyword === undefined ||
          pipeline.name.toLowerCase().includes(keyword) ||
          pipeline.description?.toLowerCase().includes(keyword) === true),
    );
  }
}

function versionKey(pipelineId: string, versionNumber: number): string {
  return `${pipelineId}:${String(versionNumber)}`;
}
