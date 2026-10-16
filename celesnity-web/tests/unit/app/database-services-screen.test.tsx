// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routing = vi.hoisted(() => ({
  search: '',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/databases/saigon_food',
  useRouter: () => ({ replace: routing.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(routing.search),
}));

import { DatabaseServicesScreen } from '@/app/_components/database-service/database-services-screen';
import { renderUi } from '@/tests/support/render-ui';

const POSTGRES = {
  connectorType: 'POSTGRESQL',
  label: 'PostgreSQL',
  configSchemaVersion: 1,
  formSchema: {
    fields: [
      { key: 'host', label: 'Host', type: 'text', required: true, mode: 'structured' },
      { key: 'port', label: 'Port', type: 'number', required: true, mode: 'structured' },
      { key: 'username', label: 'Username', type: 'text', required: true, mode: 'structured' },
      {
        key: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        secret: true,
        mode: 'structured',
      },
      {
        key: 'databaseName',
        label: 'Database name',
        type: 'text',
        required: true,
        mode: 'structured',
      },
    ],
  },
} as const;

function controllers(create: ReturnType<typeof vi.fn>) {
  return {
    list: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
    listAvailable: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 }),
    listConnectors: vi.fn().mockResolvedValue([POSTGRES]),
    get: vi.fn(),
    testUnsaved: vi.fn(),
    testSaved: vi.fn(),
    create,
    update: vi.fn(),
    archive: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    metadataCrawler: {
      listCrawlers: vi.fn().mockResolvedValue([]),
    },
  } as unknown as Parameters<typeof DatabaseServicesScreen>[0]['controllers'];
}

afterEach(() => {
  cleanup();
  routing.search = '';
  routing.replace.mockClear();
});

describe('DatabaseServicesScreen', () => {
  it('restores the create form from the resumable tutorial URL', async () => {
    routing.search = 'tab=sources&create=true';

    renderUi(
      createElement(DatabaseServicesScreen, {
        databaseName: 'saigon_food',
        controllers: controllers(vi.fn()),
      }),
    );

    expect(await screen.findByRole('button', { name: /Save service/i })).toBeTruthy();
  });

  it('exposes every PostgreSQL setup control to the guided tutorial in entry order', async () => {
    routing.search = 'tab=sources&create=true';

    renderUi(
      createElement(DatabaseServicesScreen, {
        databaseName: 'saigon_food',
        controllers: controllers(vi.fn()),
      }),
    );

    const formTargets = [
      ['Service name', 'database-source-service-name'],
      ['Database connector', 'database-source-connector'],
    ] as const;
    for (const [label, target] of formTargets) {
      expect((await screen.findByLabelText(label)).getAttribute('data-tutorial-target')).toBe(
        target,
      );
    }

    fireEvent.change(screen.getByLabelText('Database connector'), {
      target: { value: 'POSTGRESQL' },
    });

    const postgresqlTargets = [
      ['Host', 'database-source-field-host'],
      ['Port', 'database-source-field-port'],
      ['Database name', 'database-source-field-databaseName'],
      ['Username', 'database-source-field-username'],
      ['Password', 'database-source-field-password'],
    ] as const;

    for (const [label, target] of postgresqlTargets) {
      expect((await screen.findByLabelText(label)).getAttribute('data-tutorial-target')).toBe(
        target,
      );
    }
    expect(
      screen.getByRole('button', { name: 'Test connection' }).getAttribute('data-tutorial-target'),
    ).toBe('test-database-source');
    expect(
      screen.getByRole('button', { name: 'Save service' }).getAttribute('data-tutorial-target'),
    ).toBe('save-database-source');
  });

  it('opens one source in the editor when the URL asks for it', async () => {
    // The source's own screen has no editor of its own; Edit there links here
    // with `?edit=<id>`. Without this the detail screen could show a wrong
    // host and offer no way to correct it.
    routing.search = 'tab=sources&edit=svc-1';
    const get = vi.fn().mockResolvedValue({
      id: 'svc-1',
      name: 'Sài Gòn Food POS',
      connectorType: 'POSTGRESQL',
      databaseName: 'saigon_food',
      verification: { status: 'untested' },
      summary: [],
      config: {},
      details: {},
    });
    const screenControllers = controllers(vi.fn());
    (screenControllers as unknown as { get: unknown }).get = get;

    renderUi(
      createElement(DatabaseServicesScreen, {
        databaseName: 'saigon_food',
        controllers: screenControllers,
      }),
    );

    await waitFor(() => expect(get).toHaveBeenCalledWith('svc-1'));
    expect(await screen.findByDisplayValue('Sài Gòn Food POS')).toBeTruthy();
    // The param is spent: closing the editor must not reopen it.
    await waitFor(() =>
      expect(routing.replace).toHaveBeenCalledWith('/databases/saigon_food?tab=sources', {
        scroll: false,
      }),
    );
  });

  it('files a new source under the database it was created from', async () => {
    // Sources are only ever created from inside a database, and the list this
    // form sits in filters on `databaseName`. Leaving it off saved the source
    // with no database, so the very list that created it filtered it out and
    // it vanished on the next load.
    const create = vi.fn().mockResolvedValue({
      id: 'svc-1',
      name: 'Sài Gòn Food POS',
      connectorType: 'POSTGRESQL',
      databaseName: 'saigon_food',
      verification: { status: 'untested' },
      summary: [{ label: 'Host', value: '127.0.0.1' }],
      details: {},
    });

    renderUi(
      createElement(DatabaseServicesScreen, {
        databaseName: 'saigon_food',
        controllers: controllers(create),
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: /Connect a source/i }));

    fireEvent.change(await screen.findByLabelText('Service name'), {
      target: { value: 'Sài Gòn Food POS' },
    });
    fireEvent.change(screen.getByLabelText('Database connector'), {
      target: { value: 'POSTGRESQL' },
    });
    for (const [label, value] of [
      ['Host', '127.0.0.1'],
      ['Port', '15433'],
      ['Username', 'shopdb'],
      ['Password', 'shopdb_password'],
      ['Database name', 'shopdb'],
    ] as const) {
      fireEvent.change(await screen.findByLabelText(label), { target: { value } });
    }

    fireEvent.click(screen.getByRole('button', { name: /Save service/i }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sài Gòn Food POS', initialDatabaseName: 'saigon_food' }),
      ),
    );
  });

  it('says so when a saved source lands outside the database that created it', async () => {
    // Core is the one that decides where a source is filed. When what comes
    // back is filed elsewhere, the row used to be shown here anyway and then
    // disappeared on the next load, which is what testing the connection
    // triggers. The list only shows what the list actually holds now.
    const create = vi.fn().mockResolvedValue({
      id: 'svc-orphan',
      name: 'Kasa Platform',
      connectorType: 'POSTGRESQL',
      verification: { status: 'untested' },
      summary: [],
      details: {},
    });

    renderUi(
      createElement(DatabaseServicesScreen, {
        databaseName: 'kasadev',
        controllers: controllers(create),
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: /Connect a source/i }));
    fireEvent.change(await screen.findByLabelText('Service name'), {
      target: { value: 'Kasa Platform' },
    });
    fireEvent.change(screen.getByLabelText('Database connector'), {
      target: { value: 'POSTGRESQL' },
    });
    for (const [label, value] of [
      ['Host', '127.0.0.1'],
      ['Port', '5432'],
      ['Username', 'kasa'],
      ['Password', 'kasa_password'],
      ['Database name', 'kasa'],
    ] as const) {
      fireEvent.change(await screen.findByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: /Save service/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(
      await screen.findByText(/is filed under another database, so it is not in this list/i),
    ).toBeTruthy();
    // No phantom row: the card for it never goes into the list.
    expect(screen.queryByRole('button', { name: /^Test saved$/ })).toBeNull();
  });

  it('loads and creates connections without a catalog database scope', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'svc-global',
      name: 'Factory ERP',
      connectorType: 'POSTGRESQL',
      verification: { status: 'untested' },
      summary: [],
      details: {},
    });
    const screenControllers = controllers(create);

    renderUi(createElement(DatabaseServicesScreen, { controllers: screenControllers }));
    fireEvent.click(await screen.findByRole('button', { name: /Connect a source/i }));
    fireEvent.change(await screen.findByLabelText('Service name'), {
      target: { value: 'Factory ERP' },
    });
    fireEvent.change(screen.getByLabelText('Database connector'), {
      target: { value: 'POSTGRESQL' },
    });
    for (const [label, value] of [
      ['Host', 'erp.internal'],
      ['Port', '5432'],
      ['Username', 'reader'],
      ['Password', 'test-only'],
      ['Database name', 'erp'],
    ] as const) {
      fireEvent.change(await screen.findByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: /Save service/i }));

    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('databaseName');
    expect(screenControllers.list).toHaveBeenCalledWith({ page: 1 });
  });

  it('adds an existing datasource to the current database explicitly', async () => {
    const source = {
      id: 'svc-shared',
      name: 'Shared Orders source',
      databaseNames: ['analytics'],
      connectorType: 'POSTGRESQL',
      configSchemaVersion: 1,
      config: {},
      summary: [],
      verification: { status: 'succeeded' },
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    };
    const screenControllers = controllers(vi.fn());
    screenControllers.listAvailable = vi.fn().mockResolvedValue({
      items: [source],
      page: 1,
      pageSize: 50,
      total: 1,
    });

    renderUi(
      createElement(DatabaseServicesScreen, {
        databaseName: 'saigon_food',
        embedded: true,
        controllers: screenControllers,
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Add datasource' }));
    fireEvent.click(screen.getByRole('button', { name: /Choose an existing datasource/ }));
    expect(await screen.findByText('Shared Orders source')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));

    await waitFor(() =>
      expect(screenControllers.attach).toHaveBeenCalledWith('svc-shared', 'saigon_food'),
    );
  });
});
