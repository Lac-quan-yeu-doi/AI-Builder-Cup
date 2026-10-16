import { describe, expect, it, vi } from 'vitest';

import type { NodeCatalogRepository } from '@/src/application/repositories/node-catalog.repository.interface';
import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import { createLoadNodePaletteUseCase } from '@/src/application/use-cases/node-catalog/load-node-palette.use-case';
import { createArchivePipelineUseCase } from '@/src/application/use-cases/pipelines/archive-pipeline.use-case';
import { createClonePipelineUseCase } from '@/src/application/use-cases/pipelines/clone-pipeline.use-case';
import { createCreatePipelineUseCase } from '@/src/application/use-cases/pipelines/create-pipeline.use-case';
import { createGetPipelineUseCase } from '@/src/application/use-cases/pipelines/get-pipeline.use-case';
import { createGetOrCompilePipelineScriptUseCase } from '@/src/application/use-cases/pipelines/get-or-compile-pipeline-script.use-case';
import { createListPipelinesUseCase } from '@/src/application/use-cases/pipelines/list-pipelines.use-case';
import { createPreviewPipelineNodeUseCase } from '@/src/application/use-cases/pipelines/preview-pipeline-node.use-case';
import { createSavePipelineUseCase } from '@/src/application/use-cases/pipelines/save-pipeline.use-case';
import { createValidatePipelineEdgeUseCase } from '@/src/application/use-cases/pipelines/validate-pipeline-edge.use-case';
import { createValidatePipelineGraphUseCase } from '@/src/application/use-cases/pipelines/validate-pipeline-graph.use-case';
import { emptyGraph } from '@/src/entities/models/pipeline-graph';
import { NotFoundError } from '@/src/entities/errors/application-errors';

function pipelineRepository(): PipelineRepository {
  return {
    list: vi.fn().mockResolvedValue('page'),
    get: vi.fn().mockResolvedValue('pipeline'),
    create: vi.fn().mockResolvedValue('created'),
    save: vi.fn().mockResolvedValue('saved'),
    clone: vi.fn().mockResolvedValue('cloned'),
    archive: vi.fn().mockResolvedValue(undefined),
    validateGraph: vi.fn().mockResolvedValue('graph-result'),
    validateEdge: vi.fn().mockResolvedValue('edge-result'),
    previewNode: vi.fn().mockResolvedValue('preview'),
    compile: vi.fn().mockResolvedValue('compilation'),
    generatedScript: vi.fn().mockResolvedValue('generated-script'),
  } as unknown as PipelineRepository;
}

const edge = {
  id: 'edge-1',
  sourceNodeId: 'a',
  sourcePortId: 'output',
  targetNodeId: 'b',
  targetPortId: 'input',
};

describe('pipeline use cases', () => {
  it('delegates every operation to the repository', async () => {
    const repository = pipelineRepository();

    await expect(createListPipelinesUseCase(repository)({ page: 2 })).resolves.toBe('page');
    await expect(createGetPipelineUseCase(repository)('pipeline-1')).resolves.toBe('pipeline');
    await expect(
      createCreatePipelineUseCase(repository)({ name: 'New', graph: emptyGraph }),
    ).resolves.toBe('created');
    await expect(
      createSavePipelineUseCase(repository)('pipeline-1', {
        name: 'New',
        graph: emptyGraph,
        version: 1,
      }),
    ).resolves.toBe('saved');
    await expect(createClonePipelineUseCase(repository)('pipeline-1', 'Copy')).resolves.toBe(
      'cloned',
    );
    await createArchivePipelineUseCase(repository)('pipeline-1');
    await expect(createValidatePipelineGraphUseCase(repository)(emptyGraph)).resolves.toBe(
      'graph-result',
    );
    await expect(createValidatePipelineEdgeUseCase(repository)(emptyGraph, edge)).resolves.toBe(
      'edge-result',
    );
    await expect(
      createPreviewPipelineNodeUseCase(repository)('pipeline-1', 'node-1', {
        pipelineVersion: 1,
        limit: 100,
      }),
    ).resolves.toBe('preview');

    expect(repository.list).toHaveBeenCalledWith({ page: 2 });
    expect(repository.archive).toHaveBeenCalledWith('pipeline-1');
  });
});

describe('generated pipeline script use case', () => {
  it('returns an existing immutable artifact without recompiling', async () => {
    const repository = pipelineRepository();

    await expect(
      createGetOrCompilePipelineScriptUseCase(repository)('pipeline-1', 3),
    ).resolves.toBe('generated-script');
    expect(repository.generatedScript).toHaveBeenCalledWith('pipeline-1', 3);
    expect(repository.compile).not.toHaveBeenCalled();
  });

  it('compiles a missing version once and then loads its generated source', async () => {
    const repository = pipelineRepository();
    vi.mocked(repository.generatedScript)
      .mockRejectedValueOnce(new NotFoundError('Not compiled'))
      .mockResolvedValueOnce('generated-script' as never);

    await expect(
      createGetOrCompilePipelineScriptUseCase(repository)('pipeline-1', 3),
    ).resolves.toBe('generated-script');
    expect(repository.compile).toHaveBeenCalledWith('pipeline-1', 3);
    expect(repository.generatedScript).toHaveBeenCalledTimes(2);
  });
});

describe('node palette composition', () => {
  function catalogRepository(): NodeCatalogRepository {
    return {
      listCategories: vi.fn().mockResolvedValue([
        { type: 'TARGET', label: 'Targets', order: 3 },
        { type: 'SOURCE', label: 'Sources', order: 1 },
        { type: 'TRANSFORM', label: 'Transforms', order: 2 },
      ]),
      listDefinitions: vi
        .fn()
        .mockImplementation(async ({ category }: { category: string }) => [
          { type: `${category}_ONE` },
        ]),
      getDefinition: vi.fn(),
    } as unknown as NodeCatalogRepository;
  }

  it('orders groups the way the Core API declares them', async () => {
    const repository = catalogRepository();

    const palette = await createLoadNodePaletteUseCase(repository)();

    expect(palette.map((group) => group.category.type)).toEqual(['SOURCE', 'TRANSFORM', 'TARGET']);
    expect(repository.listDefinitions).toHaveBeenCalledWith({
      category: 'SOURCE',
      pageSize: 100,
    });
  });

  it('forwards a keyword to every category', async () => {
    const repository = catalogRepository();

    await createLoadNodePaletteUseCase(repository)('filter');

    expect(repository.listDefinitions).toHaveBeenCalledWith({
      category: 'TRANSFORM',
      pageSize: 100,
      keyword: 'filter',
    });
  });

  it('keeps an empty category so the canvas can explain why it is empty', async () => {
    const repository = {
      listCategories: vi.fn().mockResolvedValue([{ type: 'SOURCE', label: 'Sources', order: 1 }]),
      listDefinitions: vi.fn().mockResolvedValue([]),
      getDefinition: vi.fn(),
    } as unknown as NodeCatalogRepository;

    const palette = await createLoadNodePaletteUseCase(repository)();

    expect(palette).toEqual([
      { category: { type: 'SOURCE', label: 'Sources', order: 1 }, definitions: [] },
    ]);
  });
});
