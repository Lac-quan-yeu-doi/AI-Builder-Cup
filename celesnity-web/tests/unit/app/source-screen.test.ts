// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import {
  SourceScreen,
  type SourceScreenControllers,
} from '@/app/(workspace)/databases/[database]/sources/[sourceId]/_components/source-screen';
import type { DatabaseServiceViewModel } from '@/src/interface-adapters/presenters/database-service.presenter';
import type { MetadataCrawler } from '@/src/entities/models/metadata-crawler';
import { NotFoundError } from '@/src/entities/errors/application-errors';

const routing = vi.hoisted(() => ({
  search: 'tab=scan',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/databases/factory_silver/sources/service-mes',
  useRouter: () => ({ replace: routing.replace }),
  useSearchParams: () => new URLSearchParams(routing.search),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: Record<string, unknown> & { children?: unknown }) =>
    createElement('a', { href, ...rest }, children as never),
}));

const sourceId = 'service-mes';

const service: DatabaseServiceViewModel = {
  id: sourceId,
  name: 'MES Postgres',
  databaseNames: ['factory_silver'],
  databaseName: 'factory_silver',
  connectorType: 'POSTGRESQL',
  configSchemaVersion: 1,
  config: {},
  summary: [{ key: 'host', label: 'Host', value: 'postgres' }],
  verification: { status: 'untested' },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const crawler = {
  id: 'crawler-1',
  databaseServiceId: sourceId,
  name: 'MES crawler',
  state: 'ACTIVE' as const,
  enabled: true,
  schedule: {
    cadence: 'DAILY' as const,
    timeOfDay: '01:00',
    timezone: 'UTC',
    editable: true as const,
  },
  nextRunAt: '2026-09-16T01:00:00.000Z',
  timeoutSeconds: 3600,
  revision: 1,
  databaseService: { id: sourceId, name: 'MES Postgres', connectorType: 'POSTGRESQL' },
  snapshotSummary: {
    hasSnapshot: true,
    databaseCount: 1,
    schemaCount: 1,
    relationCount: 7,
    columnCount: 42,
    constraintCount: 0,
  },
  discoveryConfig: {
    includeViews: true,
    includeMaterializedViews: true,
    includeDdl: false,
    databaseIncludes: [],
    databaseExcludes: [],
    schemaIncludes: [],
    schemaExcludes: [],
    relationIncludes: [],
    relationExcludes: [],
  },
} as unknown as MetadataCrawler;

function controllers(assigned: readonly MetadataCrawler[]): SourceScreenControllers {
  return {
    getDatabaseService: vi.fn().mockResolvedValue(service),
    testDatabaseService: vi.fn().mockResolvedValue(undefined),
    cdcConnection: {
      get: vi.fn().mockRejectedValue(new NotFoundError('missing')),
      save: vi.fn(),
      validate: vi.fn(),
      remove: vi.fn(),
    },
    metadataCrawler: {
      list: vi.fn().mockResolvedValue({ items: assigned, total: assigned.length }),
      listRuns: vi.fn().mockResolvedValue([]),
      runNow: vi.fn().mockResolvedValue(undefined),
      assign: vi.fn().mockResolvedValue(crawler),
      update: vi.fn().mockResolvedValue(crawler),
      archive: vi.fn().mockResolvedValue(undefined),
    },
    sourceMetadata: {},
  } as unknown as SourceScreenControllers;
}

/** Opens the scan card's overflow menu and returns the item asked for. */
async function scanMenuItem(name: string): Promise<HTMLElement> {
  fireEvent.keyDown(await screen.findByRole('button', { name: 'More scan actions' }), {
    key: 'Enter',
  });
  return screen.findByRole('menuitem', { name });
}

function renderScan(assigned: readonly MetadataCrawler[]) {
  return render(
    createElement(SourceScreen, {
      controllers: controllers(assigned),
      databaseName: 'factory_silver',
      sourceId,
    }),
  );
}

afterEach(() => {
  cleanup();
  routing.search = 'tab=scan';
  routing.replace.mockClear();
});

describe('SourceScreen scan tab', () => {
  it('exposes and runs the saved-source connection test before crawler assignment', async () => {
    const injected = controllers([]);
    render(
      createElement(SourceScreen, {
        controllers: injected,
        databaseName: 'factory_silver',
        sourceId,
      }),
    );

    const testConnection = await screen.findByRole('button', { name: 'Test connection' });
    expect(testConnection.getAttribute('data-tutorial-target')).toBe('test-saved-database-source');
    fireEvent.click(testConnection);

    await waitFor(() => expect(injected.testDatabaseService).toHaveBeenCalledWith(sourceId));
  });

  it('restores the crawler assignment dialog from the resumable tutorial URL', async () => {
    routing.search = 'tab=scan&assignCrawler=true';
    renderScan([]);

    expect(await screen.findByRole('button', { name: 'Assign crawler' })).toBeTruthy();
  });

  it('changes the schedule here rather than linking out to the crawler list', async () => {
    // The tab used to show the schedule and offer one link, "Configure
    // crawler", to the workspace list — a screen that could state a scan's
    // state and change nothing about it.
    const injected = controllers([crawler]);
    render(
      createElement(SourceScreen, {
        controllers: injected,
        databaseName: 'factory_silver',
        sourceId,
      }),
    );

    expect(screen.queryByRole('link', { name: 'Configure crawler' })).toBeNull();
    fireEvent.click(await scanMenuItem('Edit schedule'));

    const time = await screen.findByLabelText('Daily time');
    expect((time as HTMLInputElement).value).toBe('01:00');
    fireEvent.submit(time.closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(injected.metadataCrawler.update).toHaveBeenCalledWith(
        'crawler-1',
        expect.objectContaining({
          schedule: expect.objectContaining({ cadence: 'DAILY', timeOfDay: '01:00' }),
        }),
      ),
    );
  });

  it('pauses the schedule without leaving the source', async () => {
    const injected = controllers([crawler]);
    render(
      createElement(SourceScreen, {
        controllers: injected,
        databaseName: 'factory_silver',
        sourceId,
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));

    // `enabled` is what Core takes; `state` is what it reports back. Sending
    // the state would pause nothing.
    await waitFor(() =>
      expect(injected.metadataCrawler.update).toHaveBeenCalledWith('crawler-1', {
        enabled: false,
      }),
    );
  });

  it('asks before removing the scan', async () => {
    const injected = controllers([crawler]);
    render(
      createElement(SourceScreen, {
        controllers: injected,
        databaseName: 'factory_silver',
        sourceId,
      }),
    );

    fireEvent.click(await scanMenuItem('Remove scan'));
    expect(injected.metadataCrawler.archive).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Remove scan' }));
    await waitFor(() => expect(injected.metadataCrawler.archive).toHaveBeenCalledWith('crawler-1'));
  });

  it('names why a scan stopped delivering instead of only badging it', async () => {
    // The old row showed FAILED and kept the reason in the run log, one screen
    // and one dialog away from the person asking why nothing arrived.
    renderScan([
      {
        ...crawler,
        lastRun: {
          id: 'run-1',
          status: 'FAILED',
          queuedAt: '2026-09-15T01:00:00.000Z',
          failure: { category: 'CONNECTION', summary: 'Connection refused by postgres:5432.' },
          counters: { relationCount: 0 },
        },
      } as unknown as MetadataCrawler,
    ]);

    const reason = await screen.findByText('Connection refused by postgres:5432.');
    expect(reason.closest('[role="status"]')?.textContent).toContain('The last scan failed');
  });

  it('states what a pause did, instead of reporting zero tables', async () => {
    // Core reports `hasSnapshot: false` and every count at zero for a disabled
    // crawler, and hides the Discovered tables with them. Printing that as
    // "0 tables discovered" contradicts the scan history two lines below it.
    renderScan([
      {
        ...crawler,
        state: 'PAUSED',
        enabled: false,
        snapshotSummary: { ...crawler.snapshotSummary, hasSnapshot: false, relationCount: 0 },
      } as unknown as MetadataCrawler,
    ]);

    await screen.findByRole('button', { name: 'Resume' });
    expect(screen.queryByText(/0 tables discovered/u)).toBeNull();
    expect(screen.getByText(/stay hidden until it resumes/u)).toBeTruthy();
  });

  it('offers a way to correct the source it is showing', async () => {
    // The detail screen could look at a source but never change it: a wrong
    // host meant walking back to the list. The editor still lives with the
    // list, so this opens it there rather than growing a second form.
    renderScan([crawler]);

    const edit = await screen.findByRole('link', { name: 'Edit' });
    expect(edit.getAttribute('href')).toBe(
      '/databases/factory_silver?tab=sources&edit=service-mes',
    );
  });

  it('keeps Scan now on the scan, not in the source header', async () => {
    // In the header it appeared only once a crawler existed, so the source's
    // own action bar grew and shrank with another object's lifecycle.
    renderScan([crawler]);

    const scanNow = await screen.findByRole('button', { name: 'Scan now' });
    expect(scanNow.closest('header')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Test connection' }).closest('header'),
    ).not.toBeNull();
  });

  it('assigns a scan without leaving the source', async () => {
    // The assign action used to be a link to the workspace crawler list, which
    // then asked which source was meant — the one the visitor had just left.
    const injected = controllers([]);
    render(
      createElement(SourceScreen, {
        controllers: injected,
        databaseName: 'factory_silver',
        sourceId,
      }),
    );

    const open = await screen.findByRole('button', { name: 'Assign a scan' });
    expect(screen.queryByRole('button', { name: 'Scan now' })).toBeNull();
    fireEvent.click(open);

    const time = await screen.findByLabelText('Daily time');
    fireEvent.submit(time.closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(injected.metadataCrawler.assign).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseServiceId: sourceId,
          schedule: expect.objectContaining({ cadence: 'DAILY', timeOfDay: '01:00' }),
        }),
      ),
    );
  });
});
