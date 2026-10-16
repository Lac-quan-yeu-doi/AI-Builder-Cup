import type { Request } from 'express';

import type { ChartRuntimeUseCases } from '@application/chart/chart-runtime.use-cases';
import type { ChartAuthoringUseCases } from '@application/chart/chart-authoring.use-cases';
import type { ChatChartCreationUseCases } from '@application/chart/chat-chart-creation.use-cases';
import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { CanonicalChartController } from '@presentation/chart/canonical-chart.controller';
import type { AuthenticatedContext } from '@application/administration/authenticated-context';

const visualQueryDto = {
  schemaVersion: 1,
  mode: 'VISUAL' as const,
  context: { catalog: 'iceberg', schema: 'kasadata' },
  parameters: [],
  source: {
    table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
    alias: 'source',
  },
  joins: [],
  projections: [],
  customExpressions: [],
  filters: [],
  aggregations: [],
  breakouts: [],
  postAggregationFilters: [],
  orderBy: [],
};

const authenticatedPrincipal: AuthenticatedContext = {
  identityId: 'identity-1',
  subject: 'subject-1',
  identityTenantId: 'tenant-1',
  organizationId: 'org-1',
  organizationStatus: 'ACTIVE',
  mfaRequired: false,
  membershipId: 'membership-1',
  role: 'ANALYST',
  authenticationTime: 1_756_000_000,
  mfaVerified: true,
};

function buildController() {
  const authoringMock = {
    listRevisions: jest.fn(),
    restoreChartRevision: jest.fn(),
  };
  const runtimeMock = {
    compileQuery: jest.fn(),
  };
  const chatCreationMock = {
    create: jest.fn(),
  };
  const authoring = authoringMock as unknown as ChartAuthoringUseCases;
  const runtime = runtimeMock as unknown as ChartRuntimeUseCases;
  const request = {} as Request;
  setAuthenticatedPrincipal(request, authenticatedPrincipal);
  const controller = new CanonicalChartController(
    authoring,
    runtime,
    chatCreationMock as unknown as ChatChartCreationUseCases,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    controller,
    authoring: authoringMock,
    runtime: runtimeMock,
    chatCreation: chatCreationMock,
    request,
  };
}

describe('CanonicalChartController.createChat', () => {
  it('forwards the browser-selected collection and authenticated actor', async () => {
    const { controller, chatCreation, request } = buildController();
    chatCreation.create.mockResolvedValue({
      chart: {
        id: 'chart-1',
        organizationId: 'org-1',
        collectionId: 'collection-1',
        ownerIdentityId: 'identity-1',
        title: 'Revenue by region',
        description: null,
        provenance: 'CHAT',
        currentRevisionNumber: 1,
        createdAt: '2026-09-12T00:00:00.000Z',
        updatedAt: '2026-09-12T00:00:00.000Z',
      },
      revision: {
        queryDefinition: visualQueryDto,
        visualizationDefinition: {
          schemaVersion: 1,
          type: 'TABLE',
          roles: { columns: ['region'] },
          display: {},
        },
        outputSchema: [{ name: 'region', type: 'varchar', family: 'STRING' }],
      },
    });

    await controller.createChat(
      {
        title: 'Revenue by region',
        collection_id: 'collection-1',
        query_definition: visualQueryDto,
        visualization_definition: {
          schemaVersion: 1,
          type: 'TABLE',
          roles: { columns: ['region'] },
          display: {},
        },
        parameter_values: {},
      },
      request,
    );

    expect(chatCreation.create).toHaveBeenCalledWith({
      actor: {
        organizationId: 'org-1',
        identityId: 'identity-1',
        isOrganizationAdmin: false,
      },
      collectionId: 'collection-1',
      title: 'Revenue by region',
      description: undefined,
      queryDefinition: visualQueryDto,
      visualizationDefinition: {
        schemaVersion: 1,
        type: 'TABLE',
        roles: { columns: ['region'] },
        display: {},
      },
      parameterValues: {},
    });
  });
});

describe('CanonicalChartController.compileQuery', () => {
  it('returns Core-compiled SQL without starting an execution', async () => {
    const { controller, runtime, request } = buildController();
    runtime.compileQuery.mockResolvedValue({
      sql: 'SELECT * FROM "iceberg"."kasadata"."orders"',
      context: { catalog: 'iceberg', schema: 'kasadata' },
      queryHash: 'hash',
      relations: [],
      outputAliases: [],
    });

    await expect(
      controller.compileQuery({ query_definition: visualQueryDto, parameter_values: {} }, request),
    ).resolves.toEqual({
      mode: 'VISUAL',
      context: { catalog: 'iceberg', schema: 'kasadata' },
      sql: 'SELECT * FROM "iceberg"."kasadata"."orders"',
    });
    expect(runtime.compileQuery).toHaveBeenCalledWith({
      actor: {
        organizationId: 'org-1',
        identityId: 'identity-1',
        isOrganizationAdmin: false,
      },
      queryDefinition: visualQueryDto,
      parameterValues: {},
    });
  });
});

describe('CanonicalChartController revision history', () => {
  it('returns the public snake-case revision contract', async () => {
    const { controller, authoring, request } = buildController();
    authoring.listRevisions.mockResolvedValue([
      {
        id: 'revision-2',
        chartId: 'chart-1',
        revisionNumber: 2,
        queryDefinition: visualQueryDto,
        visualizationDefinition: { schemaVersion: 1, type: 'TABLE', roles: {}, display: {} },
        outputSchema: [{ name: 'id', type: 'bigint', family: 'NUMBER' }],
        queryHash: 'hash-2',
        createdByIdentityId: 'identity-1',
        createdAt: '2026-09-10T03:30:00.000Z',
        restoredFromRevisionNumber: 1,
      },
    ]);

    await expect(controller.revisions('chart-1', request)).resolves.toEqual([
      {
        chart_id: 'chart-1',
        revision_number: 2,
        query_definition: visualQueryDto,
        visualization_definition: { schemaVersion: 1, type: 'TABLE', roles: {}, display: {} },
        output_schema: [{ name: 'id', type: 'bigint', family: 'NUMBER' }],
        created_at: '2026-09-10T03:30:00.000Z',
        restored_from_revision_number: 1,
      },
    ]);
    expect(authoring.listRevisions).toHaveBeenCalledWith('org-1', 'chart-1', {
      organizationId: 'org-1',
      identityId: 'identity-1',
      isOrganizationAdmin: false,
    });
  });
});
