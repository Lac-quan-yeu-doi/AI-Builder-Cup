import type {
  IPipelineNodePreviewer,
  NodePreviewResult,
} from '@application/pipeline-authoring/interfaces/i-pipeline-node-previewer';
import type { IPipelineRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-repository';
import type { IPipelineVersionRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-version-repository';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { PipelineGraphValidator } from '@application/pipeline-authoring/pipeline-graph.validator';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IPipelineSourceMembershipReader } from '@application/pipeline-authoring/interfaces/i-pipeline-source-membership-reader';
import { PipelineError } from '@domain/pipeline-authoring/errors/pipeline.errors';
import { summarizePipelineGraph } from '@domain/pipeline-authoring/models/pipeline-graph-summary';
import type {
  Pipeline,
  PipelineEdge,
  PipelineGraph,
  PipelineValidationResult,
} from '@domain/pipeline-authoring/models/pipeline';

export interface PipelinePage {
  readonly items: readonly Pipeline[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
export interface ListPipelinesQuery {
  readonly keyword?: string;
  readonly status?: 'DRAFT';
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy: 'name' | 'createdAt' | 'updatedAt';
  readonly sortDirection: 'ASC' | 'DESC';
}
export interface SavePipelineInput {
  readonly name: string;
  /** Iceberg database the pipeline is filed under; omitted when created outside one. */
  readonly databaseName?: string;
  readonly description?: string;
  readonly graph: PipelineGraph;
}
export interface UpdatePipelineInput extends SavePipelineInput {
  readonly version: number;
}

export class PipelineAuthoringUseCases {
  public constructor(
    private readonly repository: IPipelineRepository,
    private readonly versions: IPipelineVersionRepository,
    private readonly validator: PipelineGraphValidator,
    private readonly previewer: IPipelineNodePreviewer,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly sourceMemberships: IPipelineSourceMembershipReader,
  ) {}

  public async list(query: ListPipelinesQuery): Promise<PipelinePage> {
    const keyword = cleanOptional(query.keyword);
    const filter = {
      ...(keyword === undefined ? {} : { keyword }),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const [items, totalItems] = await Promise.all([
      this.repository.list({
        ...filter,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      }),
      this.repository.count(filter),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
    };
  }

  public async create(input: SavePipelineInput): Promise<Pipeline> {
    if (input.graph.nodes.length > 0) await this.assertGraphValid(input.graph);
    const now = this.clock.now().toISOString();
    const pipeline: Pipeline = {
      id: this.ids.next(),
      name: cleanName(input.name),
      ...(cleanOptional(input.databaseName) === undefined
        ? {}
        : { databaseName: cleanOptional(input.databaseName) }),
      ...(cleanOptional(input.description) === undefined
        ? {}
        : { description: cleanOptional(input.description) }),
      status: 'DRAFT',
      version: 1,
      graph: input.graph,
      createdBy: { id: 'system', displayName: 'System' },
      createdAt: now,
      updatedAt: now,
    };
    await this.unitOfWork.commit(async () => {
      await this.assertSourcesLinked(pipeline.databaseName, pipeline.graph);
      if (!(await this.repository.create(pipeline))) throw PipelineError.nameConflict();
      await this.versions.createSnapshot({
        id: this.ids.next(),
        pipelineId: pipeline.id,
        versionNumber: pipeline.version,
        graph: pipeline.graph,
        createdAt: pipeline.createdAt,
      });
    });
    return pipeline;
  }

  public async get(id: string): Promise<Pipeline> {
    const pipeline = await this.repository.findActiveById(id);
    if (pipeline === undefined) throw PipelineError.notFound();
    return pipeline;
  }

  public async update(id: string, input: UpdatePipelineInput): Promise<Pipeline> {
    const current = await this.get(id);
    if (current.version !== input.version) throw PipelineError.versionConflict();
    await this.assertGraphValid(input.graph);
    const updated: Pipeline = {
      ...current,
      name: cleanName(input.name),
      ...(cleanOptional(input.databaseName) === undefined
        ? { databaseName: undefined }
        : { databaseName: cleanOptional(input.databaseName) }),
      ...(cleanOptional(input.description) === undefined
        ? { description: undefined }
        : { description: cleanOptional(input.description) }),
      graph: input.graph,
      version: current.version + 1,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.unitOfWork.commit(async () => {
      await this.assertSourcesLinked(updated.databaseName, updated.graph);
      const result = await this.repository.update(updated, input.version);
      if (result === 'NAME_CONFLICT') throw PipelineError.nameConflict();
      if (result === 'VERSION_CONFLICT') throw PipelineError.versionConflict();
      await this.versions.createSnapshot({
        id: this.ids.next(),
        pipelineId: updated.id,
        versionNumber: updated.version,
        graph: updated.graph,
        createdAt: updated.updatedAt,
      });
    });
    return updated;
  }

  public async archive(id: string): Promise<void> {
    if (!(await this.repository.archive(id, this.clock.now().toISOString())))
      throw PipelineError.notFound();
  }

  public async clone(id: string, name: string): Promise<Pipeline> {
    const source = await this.get(id);
    return this.create({
      name,
      // A clone stays in the database its original was filed under; the copy is
      // there to be edited beside it, not to start somewhere else.
      ...(source.databaseName === undefined ? {} : { databaseName: source.databaseName }),
      ...(source.description === undefined ? {} : { description: source.description }),
      graph: source.graph,
    });
  }

  public validateGraph(graph: PipelineGraph): Promise<PipelineValidationResult> {
    return this.validator.validate(graph);
  }
  public async validateSaved(id: string): Promise<PipelineValidationResult> {
    return this.validator.validate((await this.get(id)).graph);
  }
  public validateEdge(
    graph: PipelineGraph,
    edge: PipelineEdge,
  ): Promise<Pick<PipelineValidationResult, 'valid' | 'errors'>> {
    return this.validator.validateEdge(graph, edge);
  }

  private async assertGraphValid(graph: PipelineGraph): Promise<void> {
    const validation = await this.validator.validate(graph);
    const first = validation.errors[0];
    if (first !== undefined) {
      throw PipelineError.validation(`${first.code}: ${first.message}`);
    }
  }

  private async assertSourcesLinked(
    databaseName: string | undefined,
    graph: PipelineGraph,
  ): Promise<void> {
    if (databaseName === undefined) return;
    const sourceConnectionIds = summarizePipelineGraph(graph).sourceConnectionIds
      .slice()
      .sort((left, right) => left.localeCompare(right));
    const missing = await this.sourceMemberships.lockAndListMissing(
      databaseName,
      sourceConnectionIds,
    );
    if (missing.length > 0) {
      throw PipelineError.validation(
        'SOURCE_DATASOURCE_NOT_LINKED: Every source datasource must be linked to the pipeline database.',
      );
    }
  }

  public async preview(
    id: string,
    nodeId: string,
    pipelineVersion: number,
    limit: number,
  ): Promise<NodePreviewResult> {
    const pipeline = await this.get(id);
    if (pipeline.version !== pipelineVersion) throw PipelineError.versionConflict();
    const node = pipeline.graph.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined)
      throw PipelineError.validation('The preview node does not exist in the pipeline.');
    return this.previewer.preview(pipeline, node, limit);
  }
}

function cleanName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || name.length > 160)
    throw PipelineError.validation('Pipeline name must contain between 1 and 160 characters.');
  return name;
}
function cleanOptional(value?: string): string | undefined {
  const cleaned = value?.trim();
  return cleaned === undefined || cleaned === '' ? undefined : cleaned;
}
