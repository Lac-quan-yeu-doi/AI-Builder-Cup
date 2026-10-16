// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderUi as render } from '@/tests/support/render-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PipelinesScreen } from '@/app/_components/pipeline/pipelines-screen';
import { ConflictError } from '@/src/entities/errors/application-errors';
import type { PipelinePageViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: Record<string, unknown> & { children?: unknown }) =>
    createElement('a', { href, ...rest }, children as never),
}));

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function page(overrides: Partial<PipelinePageViewModel> = {}): PipelinePageViewModel {
  return {
    items: [
      {
        id: 'pipeline-1',
        name: 'Daily order load',
        description: 'Loads orders into Iceberg',
        status: 'DRAFT',
        version: 3,
        targetDatabase: 'nhamay_saigonfood',
        sourceConnectionIds: ['service-1'],
        createdBy: 'System',
        updatedAt: '2026-08-13T00:00:00.000Z',
      },
    ],
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
    ...overrides,
  };
}

function controllers(overrides: Partial<Record<string, unknown>> = {}) {
  return Object.freeze({
    list: vi.fn().mockResolvedValue(page()),
    create: vi.fn(),
    clone: vi.fn(),
    archive: vi.fn(),
    ...overrides,
  }) as unknown as Parameters<typeof PipelinesScreen>[0]['controllers'];
}

const orphan = {
  id: 'pipeline-orphan',
  name: 'kasa3 - pipeline',
  status: 'DRAFT' as const,
  version: 1,
  sourceConnectionIds: [],
  createdBy: 'System',
  updatedAt: '2026-09-15T00:00:00.000Z',
};

describe('pipelines filed under no database', () => {
  it('offers them to the container that can adopt one', async () => {
    // A pipeline filed nowhere is listed by no database while its name stays
    // taken workspace-wide. Before this the only way out was the API.
    render(
      createElement(PipelinesScreen, {
        controllers: controllers({
          list: vi.fn().mockResolvedValue(page({ items: [...page().items, orphan] })),
          get: vi.fn(),
          save: vi.fn(),
        }),
        databaseName: 'nhamay_saigonfood',
        embedded: true,
      }),
    );

    expect(await screen.findByText('1 pipeline is not filed under any database.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'File under nhamay_saigonfood' })).toBeDefined();
  });

  it('files one by saving the draft it reads back', async () => {
    const get = vi.fn().mockResolvedValue({
      id: 'pipeline-orphan',
      name: 'kasa3 - pipeline',
      status: 'DRAFT',
      version: 1,
      graph: { nodes: [], edges: [] },
      createdBy: { id: 'system', displayName: 'System' },
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    });
    const save = vi.fn().mockResolvedValue({ id: 'pipeline-orphan' });

    render(
      createElement(PipelinesScreen, {
        controllers: controllers({
          list: vi.fn().mockResolvedValue(page({ items: [...page().items, orphan] })),
          get,
          save,
        }),
        databaseName: 'nhamay_saigonfood',
        embedded: true,
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'File under nhamay_saigonfood' }));

    await waitFor(() => expect(get).toHaveBeenCalledWith('pipeline-orphan'));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith('pipeline-orphan', {
        name: 'kasa3 - pipeline',
        databaseName: 'nhamay_saigonfood',
        graph: { nodes: [], edges: [] },
        version: 1,
      }),
    );
  });

  it('says nothing when every pipeline has a home', async () => {
    render(
      createElement(PipelinesScreen, {
        controllers: controllers({ get: vi.fn(), save: vi.fn() }),
        databaseName: 'nhamay_saigonfood',
        embedded: true,
      }),
    );

    await screen.findByText('Daily order load');
    expect(screen.queryByText(/not filed under any database/)).toBeNull();
  });
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  push.mockReset();
});

describe('pipeline list screen', () => {
  it('renders each pipeline with a link to its canvas', async () => {
    render(
      createElement(PipelinesScreen, {
        controllers: controllers(),
        databaseName: 'nhamay_saigonfood',
      }),
    );

    // The row name is the link. The card's primary action used to be a button
    // labelled "Flow Canvas" — a noun for the destination, beside the pipeline
    // it opens.
    expect(
      (await screen.findByRole('link', { name: 'Daily order load' })).getAttribute('href'),
    ).toBe('/databases/nhamay_saigonfood/pipelines/pipeline-1');
  });

  it('manages every pipeline from the workspace Data Transformation section', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'pipeline-3', name: 'Inventory load' });
    const listDatabases = vi.fn().mockResolvedValue(['factory_bronze', 'nhamay_saigonfood']);
    const existingPipeline = page().items[0];
    if (!existingPipeline) throw new Error('Expected the pipeline fixture.');
    const workspacePage = page({
      items: [
        existingPipeline,
        {
          ...existingPipeline,
          id: 'pipeline-2',
          name: 'Machine telemetry',
          databaseName: 'factory_bronze',
          targetDatabase: 'factory_bronze',
        },
      ],
      totalItems: 2,
    });

    render(
      createElement(PipelinesScreen, {
        controllers: controllers({
          create,
          list: vi.fn().mockResolvedValue(workspacePage),
          listDatabases,
        }),
      }),
    );

    expect(await screen.findByText('Daily order load')).toBeDefined();
    expect(screen.getByText('Machine telemetry')).toBeDefined();
    expect(listDatabases).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'New pipeline' }));
    fireEvent.change(screen.getByLabelText('Data Catalog database'), {
      target: { value: 'factory_bronze' },
    });
    fireEvent.change(screen.getByLabelText('Pipeline name'), {
      target: { value: ' Inventory load ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: 'Inventory load',
        databaseName: 'factory_bronze',
        graph: { nodes: [], edges: [] },
      }),
    );
    expect(push).toHaveBeenCalledWith('/databases/factory_bronze/pipelines/pipeline-3');
  });

  it('offers no search box above a list short enough to read', async () => {
    // A search field over one row is a control that costs more than it saves.
    render(
      createElement(PipelinesScreen, {
        controllers: controllers(),
        databaseName: 'nhamay_saigonfood',
      }),
    );

    await screen.findByRole('link', { name: 'Daily order load' });
    expect(screen.queryByLabelText('Search pipelines')).toBeNull();
  });

  it('pushes the debounced search term down to the Core API query', async () => {
    // Long enough that the search field is offered: below the threshold it is
    // chrome above a list you can already read.
    const list = vi.fn().mockResolvedValue(page({ totalItems: 40, totalPages: 2 }));
    render(
      createElement(PipelinesScreen, {
        controllers: controllers({ list }),
        databaseName: 'nhamay_saigonfood',
      }),
    );

    await screen.findByRole('link', { name: 'Daily order load' });
    fireEvent.change(screen.getByLabelText('Search pipelines'), { target: { value: 'orders' } });

    // Nothing is requested until the debounce elapses.
    expect(list).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(300);
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 100, keyword: 'orders' }),
    );
  });

  it('creates a pipeline with an empty graph and opens its canvas', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'pipeline-2', name: 'New flow' });
    render(
      createElement(PipelinesScreen, {
        controllers: controllers({ create }),
        databaseName: 'nhamay_saigonfood',
      }),
    );

    await screen.findByText('Daily order load');
    fireEvent.click(screen.getByRole('button', { name: 'New pipeline' }));
    fireEvent.change(screen.getByLabelText('Pipeline name'), { target: { value: ' New flow ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: 'New flow',
        databaseName: 'nhamay_saigonfood',
        graph: { nodes: [], edges: [] },
      }),
    );
    expect(push).toHaveBeenCalledWith('/databases/nhamay_saigonfood/pipelines/pipeline-2');
  });

  it('keeps the dialog open and explains a duplicate name', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new ConflictError('A pipeline with this name already exists.'));
    render(
      createElement(PipelinesScreen, {
        controllers: controllers({ create }),
        databaseName: 'nhamay_saigonfood',
      }),
    );

    await screen.findByText('Daily order load');
    fireEvent.click(screen.getByRole('button', { name: 'New pipeline' }));
    fireEvent.change(screen.getByLabelText('Pipeline name'), { target: { value: 'Taken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('A pipeline with this name already exists.'),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('archives after confirmation and reloads the list', async () => {
    const list = vi.fn().mockResolvedValue(page());
    const archive = vi.fn().mockResolvedValue(undefined);
    render(
      createElement(PipelinesScreen, {
        controllers: controllers({ list, archive }),
        databaseName: 'nhamay_saigonfood',
      }),
    );

    await screen.findByRole('link', { name: 'Daily order load' });
    // Archive moved behind the row's overflow, away from the control that opens
    // the pipeline.
    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for Daily order load' }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith('pipeline-1'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('explains an empty workspace instead of showing a blank grid', async () => {
    const list = vi.fn().mockResolvedValue(page({ items: [], totalItems: 0, totalPages: 0 }));
    render(
      createElement(PipelinesScreen, {
        controllers: controllers({ list }),
        databaseName: 'nhamay_saigonfood',
      }),
    );

    expect(await screen.findByText('No pipelines yet')).toBeDefined();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(page());
    render(
      createElement(PipelinesScreen, {
        controllers: controllers({ list }),
        databaseName: 'nhamay_saigonfood',
      }),
    );

    expect(await screen.findByText('The pipeline list is unavailable.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Daily order load')).toBeDefined();
  });
});
