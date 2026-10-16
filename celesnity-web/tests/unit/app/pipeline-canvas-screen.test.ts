// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderUi as render } from '@/tests/support/render-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PipelineCanvasScreen } from '@/app/(workspace)/databases/[database]/pipelines/[pipelineId]/_components/pipeline-canvas-screen';
import { ConflictError } from '@/src/entities/errors/application-errors';
import type { NodeDefinitionViewModel } from '@/src/interface-adapters/presenters/node-definition.presenter';
import type { PipelineViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: Record<string, unknown> & { children?: unknown }) =>
    createElement('a', { href, ...rest }, children as never),
}));

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { readonly value: string }) =>
    createElement('pre', { 'aria-label': 'Generated PySpark source code' }, value),
}));

/**
 * The viewport itself belongs to React Flow. The stand-in exposes the callbacks
 * the screen passes down, so the editing wiring around the canvas is testable.
 */
vi.mock(
  '@/app/(workspace)/databases/[database]/pipelines/[pipelineId]/_components/flow-canvas',
  () => ({
    NODE_DRAG_MIME: 'application/x-celesnity-node',
    FlowCanvas: (props: {
      readonly onConnectPorts: (connection: Record<string, string>) => void;
      readonly onSelectNode: (nodeId?: string) => void;
      readonly onRemoveNode: (nodeId: string) => void;
    }) =>
      createElement('div', {}, [
        createElement(
          'button',
          {
            key: 'connect',
            type: 'button',
            onClick: () =>
              props.onConnectPorts({
                source: 'node-1',
                sourceHandle: 'output',
                target: 'node-1',
                targetHandle: 'input',
              }),
          },
          'harness connect',
        ),
        createElement(
          'button',
          { key: 'select', type: 'button', onClick: () => props.onSelectNode('node-1') },
          'harness select',
        ),
        createElement(
          'button',
          { key: 'remove', type: 'button', onClick: () => props.onRemoveNode('node-1') },
          'harness remove',
        ),
      ]),
  }),
);

const pipeline: PipelineViewModel = {
  id: 'pipeline-1',
  name: 'Daily load',
  description: 'Loads orders',
  status: 'DRAFT',
  version: 3,
  graph: {
    nodes: [
      {
        id: 'node-1',
        definitionType: 'POSTGRES_SOURCE',
        resourceId: 'connection:connection-1',
        position: { x: 0, y: 0 },
        config: {},
      },
    ],
    edges: [],
  },
  createdBy: 'System',
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
};

const sourceDefinition: NodeDefinitionViewModel = {
  resourceId: 'connection:connection-1',
  type: 'POSTGRES_SOURCE',
  category: 'SOURCE',
  label: 'analytics-primary',
  description: 'Read data through the saved POSTGRESQL connection.',
  iconKey: 'postgresql',
  enabled: true,
  runtimeKind: 'SPARK_JDBC_SOURCE',
  inputPorts: [],
  outputPorts: [{ id: 'output', label: 'Output', dataType: 'DATASET', required: false }],
  resourceLabel: 'POSTGRESQL · analytics-primary',
  propertyPanel: {
    sections: [
      {
        id: 'source',
        title: 'Source table',
        fields: [
          {
            key: 'catalogNamespaceId',
            label: 'Database schema',
            component: 'SELECT',
            required: true,
          },
          {
            key: 'catalogRelationId',
            label: 'Database table',
            component: 'SELECT',
            required: true,
            dependsOn: ['catalogNamespaceId'],
          },
        ],
      },
    ],
  },
};

const catalogSourceDefinition: NodeDefinitionViewModel = {
  resourceId: 'iceberg-source:iceberg',
  type: 'ICEBERG_SOURCE',
  category: 'SOURCE',
  label: 'Data Catalog',
  description: 'Read an existing managed Iceberg table from the data catalog.',
  iconKey: 'iceberg',
  enabled: true,
  runtimeKind: 'SPARK_ICEBERG_SOURCE',
  inputPorts: [],
  outputPorts: [{ id: 'output', label: 'Output', dataType: 'DATASET', required: false }],
  resourceLabel: 'ICEBERG · iceberg',
  propertyPanel: {
    sections: [
      {
        id: 'source',
        title: 'Catalog table',
        fields: [
          {
            key: 'catalogDatabaseName',
            label: 'Catalog database',
            component: 'SELECT',
            required: true,
          },
          {
            key: 'catalogTableName',
            label: 'Catalog table',
            component: 'SELECT',
            required: true,
            dependsOn: ['catalogDatabaseName'],
          },
        ],
      },
    ],
  },
};

const palette = [
  {
    type: 'SOURCE',
    label: 'Sources',
    definitions: [
      {
        resourceId: sourceDefinition.resourceId,
        type: sourceDefinition.type,
        category: sourceDefinition.category,
        label: sourceDefinition.label,
        description: sourceDefinition.description,
        iconKey: sourceDefinition.iconKey,
        enabled: sourceDefinition.enabled,
        runtimeKind: sourceDefinition.runtimeKind,
        inputPorts: sourceDefinition.inputPorts,
        outputPorts: sourceDefinition.outputPorts,
        resourceLabel: sourceDefinition.resourceLabel,
      },
      {
        resourceId: catalogSourceDefinition.resourceId,
        type: catalogSourceDefinition.type,
        category: catalogSourceDefinition.category,
        label: catalogSourceDefinition.label,
        description: catalogSourceDefinition.description,
        iconKey: catalogSourceDefinition.iconKey,
        enabled: catalogSourceDefinition.enabled,
        runtimeKind: catalogSourceDefinition.runtimeKind,
        inputPorts: catalogSourceDefinition.inputPorts,
        outputPorts: catalogSourceDefinition.outputPorts,
        resourceLabel: catalogSourceDefinition.resourceLabel,
      },
    ],
  },
  { type: 'TARGET', label: 'Targets', definitions: [] },
];

function controllers(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    get: vi.fn().mockResolvedValue(pipeline),
    save: vi.fn().mockResolvedValue({ ...pipeline, version: 4 }),
    validateGraph: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
    validateEdge: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
    preview: vi.fn(),
    getScript: vi.fn().mockResolvedValue({
      pipelineId: 'pipeline-1',
      pipelineVersionId: 'pipeline-version-3',
      versionNumber: 3,
      compilerVersion: '1.0.0',
      semanticGraphSha256: 'a'.repeat(64),
      contentSha256: 'b'.repeat(64),
      contentSize: 2048,
      sourceMap: {},
      compiledAt: '2026-08-16T12:00:00.000Z',
      source: 'from pyspark.sql import SparkSession\n',
    }),
    run: vi.fn().mockResolvedValue({ executionId: 'execution-1', status: 'QUEUED' }),
    loadPalette: vi.fn().mockResolvedValue(palette),
    getDefinition: vi
      .fn()
      .mockImplementation((type: string) =>
        Promise.resolve(type === 'ICEBERG_SOURCE' ? catalogSourceDefinition : sourceDefinition),
      ),
    listNamespaces: vi.fn().mockResolvedValue([]),
    listTables: vi.fn().mockResolvedValue([]),
    metadataCrawler: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
    sourceMetadata: {
      listNamespaces: vi.fn().mockResolvedValue({ items: [] }),
      listRelations: vi.fn().mockResolvedValue({ items: [] }),
    },
    ...overrides,
  }) as unknown as Parameters<typeof PipelineCanvasScreen>[0]['controllers'];
}

function renderScreen(overrides: Record<string, unknown> = {}, databaseName = 'demo') {
  return render(
    createElement(PipelineCanvasScreen, {
      pipelineId: 'pipeline-1',
      databaseName,
      controllers: controllers(overrides),
    }),
  );
}

afterEach(cleanup);

describe('pipeline canvas screen', () => {
  it('loads the pipeline and its palette', async () => {
    renderScreen();

    expect(await screen.findByDisplayValue('Daily load')).toBeDefined();
    expect(await screen.findByText('analytics-primary')).toBeDefined();
    expect(screen.getByText('v3')).toBeDefined();
  });

  it('keeps the failure on the node type that failed, not on the screen', async () => {
    // A graph holds several node types and they fail independently. The error
    // used to be one string for the whole screen, so the type that loaded
    // second cleared the first one's message and its panel sat on two
    // skeletons with nothing to say why.
    const targetDefinition: NodeDefinitionViewModel = {
      resourceId: 'iceberg:iceberg',
      type: 'ICEBERG_TARGET',
      category: 'TARGET',
      label: 'Iceberg table',
      description: 'Writes rows into a managed table.',
      enabled: true,
      runtimeKind: 'BATCH',
      inputPorts: [{ id: 'in', label: 'In' }],
      outputPorts: [],
      propertyPanel: { sections: [] },
    } as unknown as NodeDefinitionViewModel;

    const getDefinition = vi
      .fn()
      .mockImplementation((type: string) =>
        type === 'POSTGRES_SOURCE'
          ? Promise.reject(new Error('The node type is disabled.'))
          : Promise.resolve(targetDefinition),
      );

    renderScreen({ getDefinition });

    await screen.findByDisplayValue('Daily load');
    // Selecting the POSTGRES_SOURCE node from the fixture graph opens its panel.
    fireEvent.click(screen.getByRole('button', { name: 'harness select' }));

    expect(
      await screen.findByText(/The definition for POSTGRES_SOURCE could not be loaded/),
    ).toBeDefined();

    // A later success for another type must not wipe it.
    await getDefinition('ICEBERG_TARGET');
    expect(
      screen.getByText(/The definition for POSTGRES_SOURCE could not be loaded/),
    ).toBeDefined();
  });

  it('loads writable target databases and then base tables for the selected database', async () => {
    const targetDefinition: NodeDefinitionViewModel = {
      resourceId: 'iceberg:iceberg',
      type: 'ICEBERG_TARGET',
      category: 'TARGET',
      label: 'Iceberg table',
      description: 'Write to an existing Iceberg table.',
      iconKey: 'iceberg',
      enabled: true,
      runtimeKind: 'SPARK_ICEBERG_TARGET',
      inputPorts: [{ id: 'input', label: 'Input', dataType: 'DATASET', required: true }],
      outputPorts: [],
      propertyPanel: {
        sections: [
          {
            id: 'target',
            title: 'Target table',
            fields: [
              { key: 'databaseName', label: 'Database', component: 'SELECT', required: true },
              {
                key: 'tableMode',
                label: 'Table option',
                component: 'SELECT',
                required: true,
                defaultValue: 'EXISTING',
                options: [
                  { label: 'Select existing table', value: 'EXISTING' },
                  { label: 'Create new table', value: 'CREATE_NEW' },
                ],
              },
              {
                key: 'tableName',
                label: 'Existing table',
                component: 'SELECT',
                required: true,
                dependsOn: ['databaseName'],
                visibleWhen: { field: 'tableMode', equals: 'EXISTING' },
              },
              {
                key: 'newTableName',
                label: 'New table name',
                component: 'TEXT_INPUT',
                required: true,
                dependsOn: ['databaseName'],
                visibleWhen: { field: 'tableMode', equals: 'CREATE_NEW' },
              },
              {
                key: 'writeMode',
                label: 'Write mode',
                component: 'SELECT',
                required: true,
                defaultValue: 'APPEND',
                visibleWhen: { field: 'tableMode', equals: 'EXISTING' },
                options: [
                  { label: 'Append', value: 'APPEND' },
                  { label: 'Overwrite', value: 'OVERWRITE' },
                ],
              },
            ],
          },
        ],
      },
    };
    const targetPipeline: PipelineViewModel = {
      ...pipeline,
      graph: {
        nodes: [
          {
            id: 'node-1',
            definitionType: 'ICEBERG_TARGET',
            resourceId: 'iceberg:iceberg',
            position: { x: 0, y: 0 },
            config: { writeMode: 'APPEND' },
          },
        ],
        edges: [],
      },
    };
    const listNamespaces = vi.fn().mockResolvedValue([
      { catalog: 'iceberg', name: 'system' },
      { catalog: 'iceberg', name: 'curated_sales' },
    ]);
    const listTables = vi.fn().mockResolvedValue([
      { catalog: 'iceberg', schema: 'curated_sales', name: 'orders', tableType: 'BASE TABLE' },
      { catalog: 'iceberg', schema: 'curated_sales', name: 'orders_view', tableType: 'VIEW' },
    ]);

    renderScreen(
      {
        get: vi.fn().mockResolvedValue(targetPipeline),
        loadPalette: vi.fn().mockResolvedValue([
          { type: 'SOURCE', label: 'Sources', definitions: [] },
          {
            type: 'TARGET',
            label: 'Targets',
            definitions: [targetDefinition],
          },
        ]),
        getDefinition: vi.fn().mockResolvedValue(targetDefinition),
        listNamespaces,
        listTables,
      },
      // The canvas belongs to this database, and a target may only write here.
      'curated_sales',
    );

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'harness select' }));

    await waitFor(() => expect(listNamespaces).toHaveBeenCalledWith('iceberg'));
    const database = await screen.findByLabelText('Database');
    expect(within(database).queryByRole('option', { name: 'system' })).toBeNull();
    fireEvent.change(database, { target: { value: 'curated_sales' } });

    await waitFor(() => expect(listTables).toHaveBeenCalledWith('iceberg', 'curated_sales'));
    const table = await screen.findByLabelText('Existing table');
    expect(within(table).getByRole('option', { name: 'orders' })).toBeDefined();
    expect(within(table).queryByRole('option', { name: 'orders_view' })).toBeNull();
    expect((screen.getByLabelText('Write mode') as HTMLSelectElement).value).toBe('APPEND');

    fireEvent.change(screen.getByLabelText('Table option'), {
      target: { value: 'CREATE_NEW' },
    });
    expect(screen.queryByLabelText('Existing table')).toBeNull();
    expect(screen.queryByLabelText('Write mode')).toBeNull();
    expect(screen.getByLabelText('New table name')).toBeDefined();
  });

  it('projects a same-service crawler relation into immutable physical source fields', async () => {
    const metadataCrawler = {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'crawler-1',
            databaseServiceId: 'connection-1',
            state: 'ACTIVE',
            snapshotSummary: { hasSnapshot: true },
          },
        ],
        total: 1,
      }),
    };
    const sourceMetadata = {
      listNamespaces: vi.fn().mockResolvedValue({
        items: [
          { id: 'database-namespace', name: 'operations', type: 'DATABASE' },
          { id: 'schema-namespace', name: 'public', type: 'SCHEMA' },
        ],
      }),
      listRelations: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'relation-1',
            namespaceId: 'schema-namespace',
            name: 'customers',
            relationType: 'TABLE',
          },
        ],
      }),
    };
    const save = vi.fn().mockResolvedValue({ ...pipeline, version: 4 });
    renderScreen({ metadataCrawler, sourceMetadata, save });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'harness select' }));
    await waitFor(() =>
      expect(metadataCrawler.list).toHaveBeenCalledWith({ includeArchived: true }),
    );
    const namespace = await screen.findByLabelText('Database schema');
    expect(within(namespace).queryByRole('option', { name: 'operations' })).toBeNull();
    fireEvent.change(namespace, { target: { value: 'schema-namespace' } });
    await waitFor(() =>
      expect(sourceMetadata.listRelations).toHaveBeenCalledWith(
        'crawler-1',
        'schema-namespace',
        expect.any(Object),
      ),
    );
    fireEvent.change(await screen.findByLabelText('Database table'), {
      target: { value: 'relation-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    const savedGraph = save.mock.calls[0]?.[1]?.graph as PipelineViewModel['graph'];
    expect(savedGraph.nodes[0]).toMatchObject({
      resourceId: 'connection:connection-1',
      config: {
        sourceMode: 'DIRECT',
        connectionId: 'connection-1',
        catalogNamespaceId: 'schema-namespace',
        catalogRelationId: 'relation-1',
        schemaName: 'public',
        tableName: 'customers',
      },
    });
  });

  it('selects a managed Iceberg database and table as a Data Catalog source', async () => {
    const listNamespaces = vi.fn().mockResolvedValue([
      { catalog: 'iceberg', name: 'system' },
      { catalog: 'iceberg', name: 'curated_sales' },
    ]);
    const listTables = vi.fn().mockResolvedValue([
      { catalog: 'iceberg', schema: 'curated_sales', name: 'orders', tableType: 'BASE TABLE' },
      { catalog: 'iceberg', schema: 'curated_sales', name: 'orders_view', tableType: 'VIEW' },
    ]);
    const save = vi.fn().mockResolvedValue({ ...pipeline, version: 4 });
    renderScreen({
      save,
      listNamespaces,
      listTables,
      loadPalette: vi.fn().mockResolvedValue([
        palette[0],
        {
          type: 'TARGET',
          label: 'Targets',
          definitions: [
            {
              resourceId: 'iceberg:iceberg',
              type: 'ICEBERG_TARGET',
              category: 'TARGET',
              label: 'Iceberg table',
              description: 'Managed target',
              iconKey: 'iceberg',
              enabled: true,
              runtimeKind: 'SPARK_ICEBERG_TARGET',
              inputPorts: [],
              outputPorts: [],
            },
          ],
        },
      ]),
    });

    await screen.findByDisplayValue('Daily load');
    const catalogCard = screen.getByText('Data Catalog').closest('div');
    if (!catalogCard) throw new Error('Data Catalog palette card was not rendered.');
    fireEvent.click(within(catalogCard).getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(listNamespaces).toHaveBeenCalledWith('iceberg'));
    const database = await screen.findByLabelText('Catalog database');
    expect(within(database).queryByRole('option', { name: 'system' })).toBeNull();
    fireEvent.change(database, { target: { value: 'curated_sales' } });
    await waitFor(() => expect(listTables).toHaveBeenCalledWith('iceberg', 'curated_sales'));
    const table = (await screen.findAllByLabelText('Catalog table')).find(
      (element) => element.tagName === 'SELECT',
    );
    if (!table) throw new Error('Catalog table select was not rendered.');
    expect(within(table).getByRole('option', { name: 'orders' })).toBeDefined();
    expect(within(table).queryByRole('option', { name: 'orders_view' })).toBeNull();
    fireEvent.change(table, { target: { value: 'orders' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    const savedGraph = save.mock.calls[0]?.[1]?.graph as PipelineViewModel['graph'];
    expect(savedGraph.nodes[1]).toMatchObject({
      definitionType: 'ICEBERG_SOURCE',
      resourceId: 'iceberg-source:iceberg',
      config: {
        catalogDatabaseName: 'curated_sales',
        catalogTableName: 'orders',
      },
    });
  });

  it('edits a Manual SQL transform with the upstream dataset documented as input', async () => {
    const manualDefinition: NodeDefinitionViewModel = {
      resourceId: 'definition:MANUAL_SQL',
      type: 'MANUAL_SQL',
      category: 'TRANSFORM',
      label: 'Manual SQL',
      description: 'Transform the upstream dataset with a custom Spark SQL query.',
      iconKey: 'manual_sql',
      enabled: true,
      runtimeKind: 'SPARK_DATAFRAME',
      inputPorts: [{ id: 'input', label: 'Input', dataType: 'DATASET', required: true }],
      outputPorts: [{ id: 'output', label: 'Output', dataType: 'DATASET', required: false }],
      propertyPanel: {
        sections: [
          {
            id: 'transformation',
            title: 'Transformation',
            fields: [
              {
                key: 'sql',
                label: 'SQL query',
                component: 'SQL_EDITOR',
                required: true,
                description: 'The upstream dataset is available as the temporary view input.',
              },
            ],
          },
        ],
      },
    };
    const save = vi.fn().mockResolvedValue({ ...pipeline, version: 4 });
    renderScreen({
      save,
      get: vi.fn().mockResolvedValue({
        ...pipeline,
        graph: {
          nodes: [
            {
              id: 'node-1',
              definitionType: 'MANUAL_SQL',
              resourceId: 'definition:MANUAL_SQL',
              position: { x: 0, y: 0 },
              config: { name: 'Manual SQL', sql: '' },
            },
          ],
          edges: [],
        },
      }),
      getDefinition: vi.fn().mockResolvedValue(manualDefinition),
    });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'harness select' }));
    const editor = await screen.findByLabelText('SQL query');
    expect(editor.getAttribute('placeholder')).toBe('SELECT * FROM input');
    fireEvent.change(editor, {
      target: { value: 'SELECT id, amount * 1.2 AS gross_amount FROM input' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    const savedGraph = save.mock.calls[0]?.[1]?.graph as PipelineViewModel['graph'];
    expect(savedGraph.nodes[0]?.config.sql).toBe(
      'SELECT id, amount * 1.2 AS gross_amount FROM input',
    );
  });

  it.each([
    [[], 'No metadata crawler is assigned to this data connection.'],
    [
      [
        {
          id: 'crawler-1',
          databaseServiceId: 'connection-1',
          state: 'ARCHIVED',
          snapshotSummary: { hasSnapshot: true },
        },
      ],
      'The assigned metadata crawler is archived. Restore it first.',
    ],
    [
      [
        {
          id: 'crawler-1',
          databaseServiceId: 'connection-1',
          state: 'ACTIVE',
          snapshotSummary: { hasSnapshot: false },
        },
      ],
      'The assigned metadata crawler has no successful snapshot. Run it first.',
    ],
  ])('explains unavailable catalog source state %#', async (items, message) => {
    renderScreen({
      metadataCrawler: { list: vi.fn().mockResolvedValue({ items, total: items.length }) },
    });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'harness select' }));

    expect(await screen.findByText(message)).toBeDefined();
  });

  it('points an empty source group at the connection registry', async () => {
    const loadPalette = vi
      .fn()
      .mockResolvedValue([{ type: 'SOURCE', label: 'Sources', definitions: [] }]);
    renderScreen({ loadPalette });

    expect(await screen.findByText('Add a connection')).toBeDefined();
  });

  it('keeps Save disabled until something changes, then saves with the current version', async () => {
    const save = vi.fn().mockResolvedValue({ ...pipeline, version: 4 });
    renderScreen({ save });

    const nameInput = await screen.findByDisplayValue('Daily load');
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(nameInput, { target: { value: 'Nightly load' } });
    expect(screen.getByText('Unsaved changes')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith('pipeline-1', {
        name: 'Nightly load',
        description: 'Loads orders',
        graph: pipeline.graph,
        version: 3,
      }),
    );
    expect(
      await screen.findByText('Saved as version 4. Generated PySpark eligibility passed.'),
    ).toBeDefined();
  });

  it('keeps the draft unsaved when authoritative graph validation fails', async () => {
    const save = vi.fn();
    const validateGraph = vi.fn().mockResolvedValue({
      valid: false,
      errors: [
        {
          code: 'TARGET_SCHEMA_MISMATCH',
          message: 'Append output is incompatible with the target.',
          nodeId: 'node-1',
          field: 'tableName',
        },
      ],
      warnings: [],
    });
    renderScreen({ save, validateGraph });

    fireEvent.change(await screen.findByDisplayValue('Daily load'), {
      target: { value: 'Invalid load' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        '1 issue makes the generated script ineligible. Correct it before saving.',
      ),
    ).toBeDefined();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Unsaved changes')).toBeDefined();
  });

  it('validates, compiles, queues the saved version, and opens its execution', async () => {
    const validateGraph = vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] });
    const run = vi.fn().mockResolvedValue({ executionId: 'execution-42', status: 'QUEUED' });
    renderScreen({ validateGraph, run });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(run).toHaveBeenCalledWith('pipeline-1', 3));
    expect(validateGraph).toHaveBeenCalledWith(pipeline.graph);
    expect(push).toHaveBeenCalledWith('/executions?executionId=execution-42');
  });

  it('loads the immutable generated source when the Script tab opens', async () => {
    const getScript = vi.fn().mockResolvedValue({
      pipelineId: 'pipeline-1',
      pipelineVersionId: 'pipeline-version-3',
      versionNumber: 3,
      compilerVersion: '1.0.0',
      semanticGraphSha256: 'a'.repeat(64),
      contentSha256: 'b'.repeat(64),
      contentSize: 2048,
      sourceMap: {},
      compiledAt: '2026-08-16T12:00:00.000Z',
      source: 'from pyspark.sql import SparkSession\n',
    });
    renderScreen({ getScript });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('tab', { name: 'script' }));

    await waitFor(() => expect(getScript).toHaveBeenCalledWith('pipeline-1', 3));
    expect(await screen.findByText('Generated PySpark')).toBeDefined();
    expect(screen.getByLabelText('Generated PySpark source code').textContent).toContain(
      'SparkSession',
    );
    expect(screen.getByText('2.0 KB')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Download .py' })).toBeDefined();
  });

  it('offers a reload when the saved version moved on', async () => {
    const save = vi.fn().mockRejectedValue(new ConflictError('The pipeline version has changed.'));
    const get = vi.fn().mockResolvedValue(pipeline);
    renderScreen({ save, get });

    fireEvent.change(await screen.findByDisplayValue('Daily load'), {
      target: { value: 'Nightly load' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/version has changed/u)).toBeDefined();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reload saved version' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('lists validation issues and lets one be opened on the canvas', async () => {
    const validateGraph = vi.fn().mockResolvedValue({
      valid: false,
      errors: [
        {
          code: 'NODE_CONFIG_REQUIRED',
          message: 'Database schema is required.',
          nodeId: 'node-1',
          field: 'catalogNamespaceId',
        },
        { code: 'GRAPH_TARGET_REQUIRED', message: 'The graph requires at least one target node.' },
      ],
      warnings: [],
    });
    renderScreen({
      validateGraph,
      metadataCrawler: {
        list: vi.fn().mockResolvedValue({
          items: [
            {
              id: 'crawler-1',
              databaseServiceId: 'connection-1',
              state: 'ACTIVE',
              snapshotSummary: { hasSnapshot: true },
            },
          ],
          total: 1,
        }),
      },
      sourceMetadata: {
        listNamespaces: vi.fn().mockResolvedValue({
          items: [{ id: 'schema-public', name: 'public', type: 'SCHEMA' }],
        }),
        listRelations: vi.fn().mockResolvedValue({ items: [] }),
      },
    });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Validation results')).toBeDefined();
    expect(
      screen.getByText('2 issues must be resolved before this pipeline can run.'),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Show node' }));

    // The property panel opens on the offending node with its field flagged.
    const properties = await screen.findByRole('complementary', { name: 'Node properties' });
    expect(within(properties).getByText('POSTGRESQL · analytics-primary')).toBeDefined();
    expect(within(properties).getByText('Database schema is required.')).toBeDefined();
  });

  it('presents runtime-dependent schema warnings as non-blocking checks', async () => {
    const warningMessage =
      'Fields containing only null values are selected from runtime data, so downstream fields cannot be guaranteed.';
    const validateGraph = vi.fn().mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [
        {
          code: 'OUTPUT_SCHEMA_RUNTIME_DEPENDENT',
          message: warningMessage,
          nodeId: 'node-1',
        },
      ],
    });
    renderScreen({ validateGraph });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(
      await screen.findByText(
        'The graph is valid. 1 runtime schema check will be completed by Spark using live data; it does not block Save or Run.',
      ),
    ).toBeDefined();
    expect(screen.getByText('Ready to save and run.', { exact: false })).toBeDefined();
    expect(screen.getByText('Runtime schema check')).toBeDefined();
    expect(screen.getByText(warningMessage)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Show node' }));
    const properties = await screen.findByRole('complementary', { name: 'Node properties' });
    expect(
      within(properties).getByText('Runtime schema check — Save and Run are allowed'),
    ).toBeDefined();
    expect(within(properties).getByText(warningMessage)).toBeDefined();
  });

  it('hides a dependent property until its dependency has a value', async () => {
    const validateGraph = vi.fn().mockResolvedValue({
      valid: false,
      errors: [
        {
          code: 'NODE_CONFIG_REQUIRED',
          message: 'Database schema is required.',
          nodeId: 'node-1',
        },
      ],
      warnings: [],
    });
    renderScreen({
      validateGraph,
      metadataCrawler: {
        list: vi.fn().mockResolvedValue({
          items: [
            {
              id: 'crawler-1',
              databaseServiceId: 'connection-1',
              state: 'ACTIVE',
              snapshotSummary: { hasSnapshot: true },
            },
          ],
          total: 1,
        }),
      },
      sourceMetadata: {
        listNamespaces: vi.fn().mockResolvedValue({
          items: [{ id: 'schema-public', name: 'public', type: 'SCHEMA' }],
        }),
        listRelations: vi.fn().mockResolvedValue({ items: [] }),
      },
    });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show node' }));

    const schema = await screen.findByLabelText('Database schema');
    expect(screen.queryByLabelText('Database table')).toBeNull();

    fireEvent.change(schema, { target: { value: 'schema-public' } });
    expect(await screen.findByLabelText('Database table')).toBeDefined();
  });

  it('refuses an edge the Core API rejects and explains why', async () => {
    const validateEdge = vi.fn().mockResolvedValue({
      valid: false,
      errors: [{ code: 'EDGE_PORT_INVALID', message: 'A node cannot connect to itself.' }],
      warnings: [],
    });
    renderScreen({ validateEdge });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'harness connect' }));

    expect(await screen.findByText('A node cannot connect to itself.')).toBeDefined();
    // A rejected edge leaves the graph untouched, so nothing is unsaved.
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('accepts an edge the Core API allows', async () => {
    renderScreen();

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'harness connect' }));

    expect(await screen.findByText('Unsaved changes')).toBeDefined();
  });

  it('closes the property panel when the selected node is removed', async () => {
    renderScreen();

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'harness select' }));
    const properties = await screen.findByRole('complementary', { name: 'Node properties' });
    await waitFor(() =>
      expect(within(properties).getByText('POSTGRESQL · analytics-primary')).toBeDefined(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'harness remove' }));

    expect(await screen.findByText('Select a node on the canvas to configure it.')).toBeDefined();
  });

  it('withholds preview until the pipeline is saved', async () => {
    const previewController = vi.fn().mockResolvedValue({
      columns: [{ name: 'id', dataType: 'int4', nullable: false }],
      rows: [{ id: 1 }],
      returnedRows: 1,
      truncated: false,
      executionTimeMs: 8,
    });
    renderScreen({ preview: previewController });

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'harness select' }));

    const previewButton = await screen.findByRole('button', { name: 'Preview data' });
    expect(previewButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(previewButton);
    await waitFor(() =>
      expect(previewController).toHaveBeenCalledWith('pipeline-1', 'node-1', {
        pipelineVersion: 3,
        limit: 100,
      }),
    );
    expect(await screen.findByText('1 rows')).toBeDefined();

    fireEvent.change(screen.getByDisplayValue('Daily load'), { target: { value: 'Nightly' } });
    expect(screen.getByRole('button', { name: 'Preview data' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByText('Save the pipeline before previewing this node.')).toBeDefined();
  });

  it('offers only the database the canvas belongs to as a target', async () => {
    const definition: NodeDefinitionViewModel = {
      resourceId: 'iceberg:iceberg',
      type: 'ICEBERG_TARGET',
      category: 'TARGET',
      label: 'Iceberg table',
      description: 'Write to an Iceberg table.',
      iconKey: 'iceberg',
      enabled: true,
      runtimeKind: 'SPARK_ICEBERG_TARGET',
      inputPorts: [{ id: 'input', label: 'Input', dataType: 'DATASET', required: true }],
      outputPorts: [],
      propertyPanel: {
        sections: [
          {
            id: 'target',
            title: 'Target table',
            fields: [
              { key: 'databaseName', label: 'Database', component: 'SELECT', required: true },
            ],
          },
        ],
      },
    };
    const listNamespaces = vi.fn().mockResolvedValue([
      { catalog: 'iceberg', name: 'system' },
      { catalog: 'iceberg', name: 'curated_sales' },
      { catalog: 'iceberg', name: 'other_database' },
    ]);

    renderScreen(
      {
        get: vi.fn().mockResolvedValue({
          ...pipeline,
          graph: {
            nodes: [
              {
                id: 'node-1',
                definitionType: 'ICEBERG_TARGET',
                resourceId: 'iceberg:iceberg',
                position: { x: 0, y: 0 },
                config: { tableMode: 'CREATE_NEW' },
              },
            ],
            edges: [],
          },
        }),
        loadPalette: vi
          .fn()
          .mockResolvedValue([{ type: 'TARGET', label: 'Targets', definitions: [definition] }]),
        getDefinition: vi.fn().mockResolvedValue(definition),
        listNamespaces,
        listTables: vi.fn().mockResolvedValue([]),
      },
      'curated_sales',
    );

    await screen.findByDisplayValue('Daily load');
    fireEvent.click(screen.getByRole('button', { name: 'harness select' }));

    await waitFor(() => expect(listNamespaces).toHaveBeenCalledWith('iceberg'));
    const database = await screen.findByLabelText('Database');

    // A pipeline writes into the database it was opened from. Offering the
    // others invites a graph that files itself here and writes elsewhere.
    expect(within(database).getByRole('option', { name: 'curated_sales' })).toBeDefined();
    expect(within(database).queryByRole('option', { name: 'other_database' })).toBeNull();
    expect(within(database).queryByRole('option', { name: 'system' })).toBeNull();
  });
});
