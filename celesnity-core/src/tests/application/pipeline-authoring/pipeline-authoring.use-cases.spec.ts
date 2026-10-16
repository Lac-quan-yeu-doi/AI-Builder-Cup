import { PipelineAuthoringUseCases } from '@application/pipeline-authoring/pipeline-authoring.use-cases';
import type { PipelineGraphValidator } from '@application/pipeline-authoring/pipeline-graph.validator';
import type { IPipelineSourceMembershipReader } from '@application/pipeline-authoring/interfaces/i-pipeline-source-membership-reader';
import { PipelineErrorCode } from '@domain/pipeline-authoring/errors/pipeline.errors';
import { InMemoryPipelineRepository } from '@tests/support/in-memory-pipeline.repository';
import { FakeUnitOfWork } from '@tests/support/unit-of-work.double';

describe('PipelineAuthoringUseCases', () => {
  const graph = { nodes: [], edges: [] } as const;
  let repository: InMemoryPipelineRepository;
  let useCases: PipelineAuthoringUseCases;
  let validator: { validate: jest.Mock; validateEdge: jest.Mock };
  let sourceMembership: jest.Mocked<IPipelineSourceMembershipReader>;

  beforeEach(() => {
    repository = new InMemoryPipelineRepository();
    let sequence = 0;
    validator = {
      validate: jest.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
      validateEdge: jest.fn(),
    };
    sourceMembership = { lockAndListMissing: jest.fn().mockResolvedValue([]) };
    useCases = new PipelineAuthoringUseCases(
      repository,
      repository,
      validator as unknown as PipelineGraphValidator,
      { preview: jest.fn() },
      new FakeUnitOfWork(),
      { now: (): Date => new Date('2026-08-11T10:00:00.000Z') },
      {
        next: (): string => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      },
      sourceMembership,
    );
  });

  it('creates a persisted draft at version one and lists it', async () => {
    const created = await useCases.create({ name: ' Customer ETL ', graph });
    const page = await useCases.list({
      page: 1,
      pageSize: 20,
      sortBy: 'updatedAt',
      sortDirection: 'DESC',
    });

    expect(created).toMatchObject({ name: 'Customer ETL', status: 'DRAFT', version: 1, graph });
    expect(page).toMatchObject({ totalItems: 1, totalPages: 1 });
    expect(page.items[0]?.id).toBe(created.id);
    expect(await repository.find(created.id, 1)).toMatchObject({ graph, versionNumber: 1 });
  });

  it('increments the version and rejects a stale save', async () => {
    const created = await useCases.create({ name: 'Customer ETL', graph });
    await expect(
      useCases.update(created.id, { version: 1, name: 'Customer ETL v2', graph }),
    ).resolves.toMatchObject({ version: 2 });
    expect(await repository.find(created.id, 2)).toMatchObject({ graph, versionNumber: 2 });
    await expect(
      useCases.update(created.id, { version: 1, name: 'Stale', graph }),
    ).rejects.toMatchObject({ code: PipelineErrorCode.VERSION_CONFLICT });
  });

  it('does not persist a new version when graph validation fails', async () => {
    const created = await useCases.create({ name: 'Customer ETL', graph });
    validator.validate.mockResolvedValueOnce({
      valid: false,
      errors: [
        {
          code: 'TARGET_SCHEMA_MISMATCH',
          message: 'Append output is incompatible with the target.',
          nodeId: 'target',
        },
      ],
      warnings: [],
    });

    await expect(
      useCases.update(created.id, { version: 1, name: 'Invalid update', graph }),
    ).rejects.toMatchObject({ code: PipelineErrorCode.VALIDATION });
    expect(await repository.find(created.id, 2)).toBeUndefined();
    expect((await useCases.get(created.id)).version).toBe(1);
  });

  it('enforces active pipeline name uniqueness when cloning', async () => {
    const created = await useCases.create({ name: 'Customer ETL', graph });
    await expect(useCases.clone(created.id, 'Customer ETL')).rejects.toMatchObject({
      code: PipelineErrorCode.NAME_CONFLICT,
    });
  });

  it('archives a pipeline without deleting its stored record', async () => {
    const created = await useCases.create({ name: 'Customer ETL', graph });
    await useCases.archive(created.id);
    await expect(useCases.get(created.id)).rejects.toMatchObject({
      code: PipelineErrorCode.NOT_FOUND,
    });
    expect(repository.items.get(created.id)?.archivedAt).toBeDefined();
  });

  it('rejects a pipeline when one source datasource is not linked to its database', async () => {
    sourceMembership.lockAndListMissing.mockResolvedValueOnce([
      '22222222-2222-4222-8222-222222222222',
    ]);
    const sourceGraph = {
      nodes: [
        {
          id: 'source-a',
          definitionType: 'POSTGRES_SOURCE',
          resourceId: 'connection:11111111-1111-4111-8111-111111111111',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'source-b',
          definitionType: 'POSTGRES_SOURCE',
          resourceId: 'connection:22222222-2222-4222-8222-222222222222',
          position: { x: 0, y: 100 },
          config: {},
        },
      ],
      edges: [],
    } as const;

    await expect(
      useCases.create({ name: 'Orders', databaseName: 'kasadata', graph: sourceGraph }),
    ).rejects.toMatchObject({ code: PipelineErrorCode.VALIDATION });
    expect(repository.items.size).toBe(0);
    expect(sourceMembership.lockAndListMissing).toHaveBeenCalledWith('kasadata', [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('allows a multi-source pipeline when every datasource is linked', async () => {
    const sourceGraph = {
      nodes: [
        {
          id: 'source-a',
          definitionType: 'POSTGRES_SOURCE',
          resourceId: 'connection:11111111-1111-4111-8111-111111111111',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'source-b',
          definitionType: 'POSTGRES_SOURCE',
          resourceId: 'connection:22222222-2222-4222-8222-222222222222',
          position: { x: 0, y: 100 },
          config: {},
        },
      ],
      edges: [],
    } as const;

    await expect(
      useCases.create({ name: 'Orders', databaseName: 'kasadata', graph: sourceGraph }),
    ).resolves.toMatchObject({ databaseName: 'kasadata' });
    expect(repository.items.size).toBe(1);
  });

  it('checks source membership before persisting an update', async () => {
    const created = await useCases.create({ name: 'Orders', databaseName: 'kasadata', graph });
    sourceMembership.lockAndListMissing.mockResolvedValueOnce([
      '11111111-1111-4111-8111-111111111111',
    ]);
    const sourceGraph = {
      nodes: [
        {
          id: 'source-a',
          definitionType: 'POSTGRES_SOURCE',
          resourceId: 'connection:11111111-1111-4111-8111-111111111111',
          position: { x: 0, y: 0 },
          config: {},
        },
      ],
      edges: [],
    } as const;

    await expect(
      useCases.update(created.id, {
        version: 1,
        name: 'Orders updated',
        databaseName: 'kasadata',
        graph: sourceGraph,
      }),
    ).rejects.toMatchObject({ code: PipelineErrorCode.VALIDATION });
    expect(await repository.find(created.id, 2)).toBeUndefined();
  });
});
