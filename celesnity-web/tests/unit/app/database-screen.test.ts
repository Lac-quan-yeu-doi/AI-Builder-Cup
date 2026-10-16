// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import {
  DatabaseScreen,
  type DatabaseScreenControllers,
} from '@/app/(workspace)/databases/[database]/_components/database-screen';
import type { PipelinePageViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';

// `useUrlTab` reads the tab out of the URL, and the router here does not write
// one back, so a test that needs a tab other than the default says so up front.
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => '/databases/nhamay_saigonfood',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => search,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: Record<string, unknown> & { children?: unknown }) =>
    createElement('a', { href, ...rest }, children as never),
}));

const pipelinePage: PipelinePageViewModel = {
  items: [
    {
      id: 'pipeline-1',
      name: 'San luong theo ca',
      status: 'DRAFT',
      version: 3,
      targetDatabase: 'nhamay_saigonfood',
      sourceConnectionIds: ['service-mes'],
      createdBy: 'System',
      updatedAt: '2026-08-24T00:00:00.000Z',
    },
    {
      id: 'pipeline-2',
      name: 'Ton kho',
      status: 'DRAFT',
      version: 1,
      targetDatabase: 'kho_nguyenlieu',
      sourceConnectionIds: ['service-wms'],
      createdBy: 'System',
      updatedAt: '2026-08-24T00:00:00.000Z',
    },
    {
      id: 'pipeline-3',
      name: 'Untargeted draft',
      status: 'DRAFT',
      version: 1,
      sourceConnectionIds: ['service-mes'],
      createdBy: 'System',
      updatedAt: '2026-08-24T00:00:00.000Z',
    },
    {
      id: 'pipeline-4',
      name: 'Draft filed here',
      status: 'DRAFT',
      version: 1,
      databaseName: 'nhamay_saigonfood',
      sourceConnectionIds: [],
      createdBy: 'System',
      updatedAt: '2026-08-24T00:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 200,
  totalItems: 4,
  totalPages: 1,
};

function service(id: string, name: string) {
  return {
    id,
    name,
    connectorType: 'POSTGRESQL',
    configSchemaVersion: 1,
    config: {},
    summary: [],
    verification: { status: 'succeeded' as const, testedAt: '2026-08-24T00:00:00.000Z' },
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}

function controllers(
  overrides: Partial<Record<keyof DatabaseScreenControllers, unknown>> = {},
): DatabaseScreenControllers {
  return Object.freeze({
    listCatalogs: vi
      .fn()
      .mockResolvedValue([{ name: 'iceberg', jdbcCatalogIdentity: 'celesnity' }]),
    listTables: vi.fn().mockResolvedValue([
      {
        catalog: 'iceberg',
        schema: 'nhamay_saigonfood',
        name: 'san_luong_theo_ca',
        tableType: 'BASE TABLE',
      },
      {
        catalog: 'iceberg',
        schema: 'nhamay_saigonfood',
        name: 'phe_pham_theo_ca',
        tableType: 'BASE TABLE',
      },
    ]),
    listPipelines: vi.fn().mockResolvedValue(pipelinePage),
    metadataCrawler: {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'crawler-1',
            databaseServiceId: 'service-mes',
            name: 'mes scan',
            state: 'IDLE',
            enabled: true,
            schedule: { kind: 'cron', expression: '0 */6 * * *', timezone: 'UTC' },
            nextRunAt: '2026-08-24T06:00:00.000Z',
            timeoutSeconds: 3600,
            revision: 1,
            databaseService: {
              id: 'service-mes',
              name: 'mes_saigonfood',
              connectorType: 'POSTGRESQL',
            },
            snapshotSummary: {
              hasSnapshot: true,
              databaseCount: 1,
              schemaCount: 4,
              relationCount: 41,
              columnCount: 300,
              constraintCount: 12,
            },
            lastRun: { status: 'SUCCEEDED' },
            discoveryConfig: {},
          },
          {
            id: 'crawler-2',
            databaseServiceId: 'service-wms',
            name: 'wms scan',
            state: 'IDLE',
            enabled: true,
            schedule: { kind: 'cron', expression: '0 */6 * * *', timezone: 'UTC' },
            nextRunAt: '2026-08-24T06:00:00.000Z',
            timeoutSeconds: 3600,
            revision: 1,
            databaseService: { id: 'service-wms', name: 'wms_kho', connectorType: 'POSTGRESQL' },
            snapshotSummary: {
              hasSnapshot: true,
              databaseCount: 1,
              schemaCount: 2,
              relationCount: 9,
              columnCount: 60,
              constraintCount: 3,
            },
            discoveryConfig: {},
          },
        ],
        total: 2,
      }),
    },
    loadTableMetadata: vi.fn().mockResolvedValue({
      catalog: 'iceberg',
      schema: 'nhamay_saigonfood',
      name: 'san_luong_theo_ca',
      columns: [
        { name: 'ngay', dataType: 'date', nullable: false, ordinalPosition: 1 },
        { name: 'san_luong', dataType: 'bigint', nullable: false, ordinalPosition: 2 },
      ],
    }),
    listTableSnapshots: vi.fn().mockResolvedValue([
      {
        snapshotId: '5173256429585668938',
        committedAt: '2026-08-24T00:00:00.000Z',
        operation: 'append',
        summary: {
          'app-name': 'pipeline-pipeline-1-v3',
          'total-records': '4210',
        },
      },
    ]),
    listExecutions: vi.fn().mockResolvedValue([
      {
        id: 'run-1',
        workloadKind: 'PIPELINE',
        versionNumber: 3,
        pipelineId: 'pipeline-1',
        status: 'succeeded',
        queuedAt: '2026-08-24T00:00:00.000Z',
        startedAt: '2026-08-24T00:00:01.000Z',
        finishedAt: '2026-08-24T00:00:20.000Z',
        updatedAt: '2026-08-24T00:00:20.000Z',
      },
    ]),
    previewTable: vi.fn().mockResolvedValue({ columns: [], rows: [] }),
    listScripts: vi.fn().mockResolvedValue([
      {
        id: 'script-1',
        name: 'backfill_sanluong',
        connectionId: 'service-mes',
        status: 'active',
        currentVersion: {
          id: 'v1',
          scriptId: 'script-1',
          versionNumber: 5,
          artifactBucket: 'scripts',
          objectKey: 'k',
          contentSha256: 'sha',
          contentSize: 10,
          publishedAt: '2026-08-24T00:00:00.000Z',
        },
        createdAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
      },
      {
        id: 'script-2',
        name: 'wms_only',
        connectionId: 'service-wms',
        status: 'active',
        createdAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
      },
    ]),
    listDatabaseServices: vi.fn().mockResolvedValue({
      items: [
        service('service-mes', 'mes_saigonfood'),
        service('service-wms', 'wms_kho'),
        { ...service('service-new', 'ncc_giaohang'), databaseName: 'nhamay_saigonfood' },
      ],
      page: 1,
      pageSize: 200,
      total: 2,
    }),
    ...overrides,
  }) as DatabaseScreenControllers;
}

afterEach(() => {
  cleanup();
  search = new URLSearchParams();
});

describe('DatabaseScreen', () => {
  it('lists the tables the database holds', async () => {
    render(
      createElement(DatabaseScreen, {
        controllers: controllers(),
        database: 'nhamay_saigonfood',
      }),
    );

    // The overview lists what the database holds, so the names are on the
    // landing tab rather than one click in.
    expect(await screen.findByText('san_luong_theo_ca')).toBeTruthy();
    expect(screen.getByText('phe_pham_theo_ca')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Tables\s+2/u })).toBeTruthy();
  });

  it('counts a pipeline this database holds, whether or not it writes here yet', async () => {
    render(
      createElement(DatabaseScreen, {
        controllers: controllers(),
        database: 'nhamay_saigonfood',
      }),
    );

    // Two ways in: a target node that writes here, and a draft filed here when
    // it was created. A pipeline targeting another database, and a draft filed
    // nowhere, both stay out.
    expect(await screen.findByRole('tab', { name: /Pipelines\s+2/u })).toBeTruthy();
  });

  it('reports a failure instead of rendering an empty database', async () => {
    render(
      createElement(DatabaseScreen, {
        controllers: controllers({
          listTables: vi.fn().mockRejectedValue(new Error('Trino is unreachable')),
        }),
        database: 'nhamay_saigonfood',
      }),
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByRole('tab', { name: /Tables/ })).toBeNull();
  });

  it('opens a table and shows its columns', async () => {
    search = new URLSearchParams('tab=tables');
    render(
      createElement(DatabaseScreen, {
        controllers: controllers(),
        database: 'nhamay_saigonfood',
      }),
    );

    fireEvent.click((await screen.findAllByRole('button', { name: 'san_luong_theo_ca' }))[0]!);

    // Listing a table name alone answered nothing; the point of opening a
    // database is seeing what is inside its tables.
    expect(await screen.findByText('ngay')).toBeTruthy();
    expect(screen.getByText('san_luong')).toBeTruthy();
  });
  it('names connecting a source as the first step of an empty database', async () => {
    render(
      createElement(DatabaseScreen, {
        controllers: controllers({
          listTables: vi.fn().mockResolvedValue([]),
          listPipelines: vi.fn().mockResolvedValue({ ...pipelinePage, items: [] }),
          listDatabaseServices: vi
            .fn()
            .mockResolvedValue({ items: [], page: 1, pageSize: 1, total: 0 }),
        }),
        database: 'nhamay_saigonfood',
      }),
    );

    // The first unmet stage, not the last: offering "build a pipeline" to a
    // database with no source is an action that cannot succeed.
    expect(await screen.findByText('Step 1 of 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Connect a source/u })).toBeTruthy();
  });

  it('moves on to the pipeline once a source is connected', async () => {
    render(
      createElement(DatabaseScreen, {
        controllers: controllers({
          listTables: vi.fn().mockResolvedValue([]),
          listPipelines: vi.fn().mockResolvedValue({ ...pipelinePage, items: [] }),
        }),
        database: 'nhamay_saigonfood',
      }),
    );

    expect(await screen.findByText('Step 2 of 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Build a pipeline/u })).toBeTruthy();
  });

  it('leaves the guidance out once the database holds tables', async () => {
    render(
      createElement(DatabaseScreen, {
        controllers: controllers(),
        database: 'nhamay_saigonfood',
      }),
    );

    await screen.findByText('san_luong_theo_ca');
    // A database that produces is working, whatever its derived source and
    // pipeline counts happen to say.
    expect(screen.queryByText(/Step \d of 3/u)).toBeNull();
  });

  it('opens the first table instead of an empty panel', async () => {
    search = new URLSearchParams('tab=tables');
    render(
      createElement(DatabaseScreen, {
        controllers: controllers(),
        database: 'nhamay_saigonfood',
      }),
    );

    // Landing on "Select a table" wasted the one moment a visitor is looking
    // for what the database holds.
    expect(await screen.findByText('ngay')).toBeTruthy();
    expect(screen.queryByText('Select a table')).toBeNull();
  });
});
