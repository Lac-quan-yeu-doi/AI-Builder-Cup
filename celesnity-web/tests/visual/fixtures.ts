/**
 * Deterministic Core API payloads for the visual suite. Shapes follow
 * `src/infrastructure/api/generated/schema.d.ts`; timestamps are fixed so
 * screenshots never differ between runs.
 */

const CONNECTION_A = '11111111-1111-4111-8111-111111111111';
const CONNECTION_B = '22222222-2222-4222-8222-222222222222';
const SCRIPT_A = '33333333-3333-4333-8333-333333333333';
const SCRIPT_B = '44444444-4444-4444-8444-444444444444';
const VERSION_A = '55555555-5555-4555-8555-555555555555';
const EXECUTION_RUNNING = '66666666-6666-4666-8666-666666666666';
const EXECUTION_SUCCEEDED = '77777777-7777-4777-8777-777777777777';
const EXECUTION_FAILED = '88888888-8888-4888-8888-888888888888';
const QUERY_SUCCEEDED = '99999999-9999-4999-8999-999999999999';
const QUERY_FAILED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export const ids = {
  connectionA: CONNECTION_A,
  executionRunning: EXECUTION_RUNNING,
  querySucceeded: QUERY_SUCCEEDED,
  scriptA: SCRIPT_A,
  versionA: VERSION_A,
};

export const plantSite = {
  id: 'b0000000-0000-4000-8000-000000000001',
  name: 'Binh Duong · Line 2',
  code: 'BINH_DUONG_LINE_2',
  timezone: 'Asia/Ho_Chi_Minh',
  revision: 3,
  latestPublishedVersion: 2,
  publishedRevision: 2,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  draft: {
    nodeTypes: [
      {
        id: 'type-work',
        name: 'Work center',
        properties: [
          {
            id: 'code',
            key: 'code',
            name: 'Code',
            type: 'text',
            required: false,
            order: 0,
            showOnCard: true,
          },
          {
            id: 'allowed-statuses',
            key: 'allowed_statuses',
            name: 'Allowed statuses',
            type: 'catalog-multi-select',
            required: false,
            order: 1,
            catalogBinding: {
              mode: 'choices',
              catalog: 'iceberg',
              schema: 'demo',
              table: 'plant_statuses',
              valueColumn: 'status',
              labelColumn: 'label',
              filters: [],
              limit: 100,
            },
          },
          {
            id: 'primary-equipment',
            key: 'primary_equipment',
            name: 'Primary equipment',
            type: 'node-reference',
            required: false,
            order: 2,
            showOnCard: true,
          },
        ],
      },
    ],
    nodes: [
      {
        id: 'node-cut',
        name: 'Cutting 1',
        nodeTypeId: 'type-work',
        routingRole: 'source',
        position: { x: 40, y: 160 },
        values: {
          code: 'CUT_1',
          'allowed-statuses': ['running', 'maintenance'],
          'primary-equipment': 'node-sew',
        },
        localProperties: [],
      },
      {
        id: 'node-sew',
        name: 'Sewing 1',
        nodeTypeId: 'type-work',
        routingRole: 'intermediate',
        position: { x: 240, y: 160 },
        values: { code: 'SEW_1' },
        localProperties: [],
      },
      {
        id: 'node-qc',
        name: 'QC gate A',
        nodeTypeId: 'type-work',
        routingRole: 'sink',
        position: { x: 440, y: 160 },
        values: { code: 'QC_A' },
        localProperties: [],
      },
    ],
    relationships: [
      { id: 'route-1', kind: 'routes-to', sourceNodeId: 'node-cut', targetNodeId: 'node-sew' },
      { id: 'route-2', kind: 'routes-to', sourceNodeId: 'node-sew', targetNodeId: 'node-qc' },
    ],
  },
};

export const connections = [
  {
    id: CONNECTION_A,
    name: 'analytics-primary',
    connectorType: 'POSTGRESQL',
    configSchemaVersion: 1,
    config: {
      host: 'postgres.internal',
      port: 5432,
      databaseName: 'analytics',
      username: 'celesnity_app',
      sslMode: 'require',
      options: { applicationName: 'celesnity-web' },
    },
    verificationStatus: 'SUCCEEDED',
    lastTestedAt: '2026-02-01T09:15:00.000Z',
    createdAt: '2026-01-04T08:00:00.000Z',
    updatedAt: '2026-02-01T09:15:00.000Z',
  },
  {
    id: CONNECTION_B,
    name: 'legacy-reporting',
    connectorType: 'POSTGRESQL',
    configSchemaVersion: 1,
    config: {
      host: 'reporting.legacy.internal',
      port: 5433,
      databaseName: 'reporting',
      username: 'reader',
      sslMode: 'prefer',
      options: {},
    },
    verificationStatus: 'FAILED',
    lastTestedAt: '2026-01-28T22:40:00.000Z',
    lastTestError: 'password authentication failed for user "reader"',
    createdAt: '2025-11-20T10:30:00.000Z',
    updatedAt: '2026-01-28T22:40:00.000Z',
  },
];

export const databaseServices = {
  items: connections,
  page: 1,
  pageSize: 50,
  total: connections.length,
};

export const databaseServiceConnectors = [
  {
    connectorType: 'POSTGRESQL',
    label: 'PostgreSQL',
    configSchemaVersion: 1,
    formSchema: {
      fields: [
        { key: 'connectionUrl', label: 'Connection URL', type: 'url', mode: 'url' },
        { key: 'host', label: 'Host', type: 'text', required: true, mode: 'structured' },
        { key: 'port', label: 'Port', type: 'number', required: true, mode: 'structured' },
        {
          key: 'databaseName',
          label: 'Database name',
          type: 'text',
          required: true,
          mode: 'structured',
        },
        {
          key: 'username',
          label: 'Username',
          type: 'text',
          required: true,
          mode: 'structured',
        },
        {
          key: 'password',
          label: 'Password',
          type: 'password',
          required: true,
          secret: true,
          mode: 'structured',
        },
      ],
    },
  },
];

export const verification = {
  status: 'SUCCEEDED',
  message: 'Connected to analytics on postgres.internal:5432.',
  checkedAt: '2026-02-01T09:15:00.000Z',
};

const scriptVersion = {
  id: VERSION_A,
  scriptId: SCRIPT_A,
  versionNumber: 4,
  artifactBucket: 'celesnity-scripts',
  objectKey: `scripts/${SCRIPT_A}/v4.py`,
  contentSha256: 'a2f9c1d4e6b8079135bd2c4e6f8a0b1c2d3e4f5061728394a5b6c7d8e9f00112',
  contentSize: 2048,
  publishedAt: '2026-01-30T14:05:00.000Z',
};

export const scripts = [
  {
    id: SCRIPT_A,
    name: 'daily-order-rollup',
    description: 'Aggregates orders into the daily rollup table.',
    connectionId: CONNECTION_A,
    status: 'ACTIVE',
    currentVersion: scriptVersion,
    createdAt: '2025-12-02T07:45:00.000Z',
    updatedAt: '2026-01-30T14:05:00.000Z',
  },
  {
    id: SCRIPT_B,
    name: 'customer-dimension-refresh',
    connectionId: CONNECTION_B,
    status: 'ACTIVE',
    createdAt: '2026-01-11T11:20:00.000Z',
    updatedAt: '2026-01-11T11:20:00.000Z',
  },
];

export const scriptVersions = [scriptVersion];

export const scriptSource = {
  ...scriptVersion,
  source: [
    'from pyspark.sql import SparkSession',
    '',
    'spark = SparkSession.builder.appName("daily-order-rollup").getOrCreate()',
    'orders = spark.read.table("iceberg.analytics.orders")',
    'orders.groupBy("order_date").count().writeTo("iceberg.analytics.daily_orders").append()',
  ].join('\n'),
};

const resourceProfile = {
  driverMemory: '2g',
  executorMemory: '4g',
  executorCores: 2,
  maxCores: 8,
};

export const executions = [
  {
    id: EXECUTION_RUNNING,
    scriptId: SCRIPT_A,
    scriptVersionId: VERSION_A,
    connectionId: CONNECTION_A,
    status: 'RUNNING',
    sparkApplicationId: 'spark-9f21c4b7d3',
    resourceProfile,
    queuedAt: '2026-02-01T10:00:00.000Z',
    startedAt: '2026-02-01T10:00:12.000Z',
    updatedAt: '2026-02-01T10:02:30.000Z',
  },
  {
    id: EXECUTION_SUCCEEDED,
    scriptId: SCRIPT_A,
    scriptVersionId: VERSION_A,
    connectionId: CONNECTION_A,
    status: 'SUCCEEDED',
    sparkApplicationId: 'spark-4c18ba90ef',
    resourceProfile,
    exitCode: 0,
    queuedAt: '2026-01-31T22:00:00.000Z',
    startedAt: '2026-01-31T22:00:09.000Z',
    finishedAt: '2026-01-31T22:04:41.000Z',
    updatedAt: '2026-01-31T22:04:41.000Z',
  },
  {
    id: EXECUTION_FAILED,
    scriptId: SCRIPT_B,
    scriptVersionId: VERSION_A,
    connectionId: CONNECTION_B,
    status: 'FAILED',
    sparkApplicationId: 'spark-77aa10cc52',
    resourceProfile,
    exitCode: 1,
    errorSummary: 'AnalysisException: table iceberg.analytics.customers not found',
    queuedAt: '2026-01-30T18:12:00.000Z',
    startedAt: '2026-01-30T18:12:07.000Z',
    finishedAt: '2026-01-30T18:13:02.000Z',
    updatedAt: '2026-01-30T18:13:02.000Z',
  },
];

export const executionLog = {
  executionId: EXECUTION_SUCCEEDED,
  status: 'SUCCEEDED',
  bucket: 'celesnity-logs',
  objectKey: `executions/${EXECUTION_SUCCEEDED}/driver.log`,
  content: [
    '26/01/31 22:00:10 INFO SparkContext: Running Spark version 3.5.1',
    '26/01/31 22:00:14 INFO IcebergSource: Reading iceberg.analytics.orders',
    '26/01/31 22:04:38 INFO DAGScheduler: Job 3 finished, took 264.512 s',
    '26/01/31 22:04:41 INFO SparkContext: Successfully stopped SparkContext',
  ].join('\n'),
  byteSize: 412,
};

// Keep enough catalog entries to exercise the bounded picker body. The chart
// flow still starts in the real `iceberg` catalog; the remaining names model
// other catalog connections without changing the selected source contract.
export const catalogs = [
  { name: 'iceberg', jdbcCatalogIdentity: 'celesnity' },
  ...Array.from({ length: 12 }, (_, index) => ({
    name: `catalog-${String(index + 1).padStart(2, '0')}`,
    jdbcCatalogIdentity: `celesnity-${index + 1}`,
  })),
];

export const namespaces = [
  { catalog: 'iceberg', name: 'analytics', description: 'Curated metrics and reporting data.' },
  { catalog: 'iceberg', name: 'raw', description: 'Landing zone for source-system data.' },
];

export const tables = [
  { catalog: 'iceberg', schema: 'analytics', name: 'orders', tableType: 'BASE TABLE' },
  { catalog: 'iceberg', schema: 'analytics', name: 'daily_orders', tableType: 'BASE TABLE' },
];

export const tableMetadata = {
  catalog: 'iceberg',
  schema: 'analytics',
  name: 'orders',
  columns: [
    { name: 'order_id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
    { name: 'customer_id', dataType: 'bigint', nullable: false, ordinalPosition: 2 },
    {
      name: 'order_date',
      dataType: 'date',
      nullable: true,
      ordinalPosition: 3,
      comment: 'Business date in UTC',
    },
    { name: 'total_amount', dataType: 'decimal(18,2)', nullable: true, ordinalPosition: 4 },
  ],
};

export const tableSnapshots = [
  {
    snapshotId: '3821550127947089008',
    committedAt: '2026-02-01 09:00:00.000 UTC',
    operation: 'append',
    manifestList: 's3://celesnity/iceberg/analytics/orders/metadata/snap-3821550127947089008.avro',
    // The Spark runtime stamps every commit with the pipeline and version that
    // made it. The overview reads provenance out of this, and flags the table
    // as behind because `Daily order load` is on v4.
    summary: {
      'app-name': 'pipeline-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-v3',
      'total-records': '128400',
      'engine-name': 'spark',
    },
  },
  {
    snapshotId: '1902334455667788990',
    parentId: '3821550127947089008',
    committedAt: '2026-01-31 09:00:00.000 UTC',
    operation: 'overwrite',
  },
];

export const tablePreview = {
  columns: [
    { name: 'order_id', type: 'bigint' },
    { name: 'customer_id', type: 'bigint' },
    { name: 'order_date', type: 'date' },
    { name: 'total_amount', type: 'decimal(18,2)' },
  ],
  rows: [
    [1001, 501, '2026-01-31', '148.50'],
    [1002, 502, '2026-01-31', '2310.00'],
    [1003, 503, '2026-02-01', '76.25'],
  ],
  rowCount: 3,
};

/** Canonical chart-authoring responses used by the manual builder flow. */
export const chartPreview = {
  run_id: 'chart-preview-run-1',
  columns: [
    { name: 'order_date', type: 'date', family: 'DATE' },
    { name: 'order_count', type: 'bigint', family: 'NUMBER' },
  ],
  rows: [
    ['2026-02-01', 128],
    ['2026-01-31', 341],
    ['2026-01-30', 297],
  ],
  row_count: 3,
  byte_count: 96,
  truncated: false,
};

export const chartQueryCompilation = {
  mode: 'VISUAL',
  context: { catalog: 'iceberg', schema: 'analytics' },
  sql: 'SELECT "orders"."order_date" AS "order_date", count(*) AS "order_count"\nFROM "iceberg"."analytics"."orders"\nGROUP BY "orders"."order_date"\nORDER BY "orders"."order_date" ASC',
};

export const chartCreated = {
  id: 'chart-manual-1',
  title: 'Untitled chart',
  description: null,
  organization_id: 'visual-test-organization',
  collection_id: 'collection-1',
  owner_identity_id: 'visual-test-user',
  provenance: 'MANUAL',
  current_revision_number: 1,
  query_definition: {
    schemaVersion: 1,
    mode: 'VISUAL',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    source: {
      table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
      alias: 'orders',
    },
    joins: [],
    projections: [],
    customExpressions: [],
    filters: [],
    aggregations: [],
    breakouts: [],
    postAggregationFilters: [],
    orderBy: [],
  },
  visualization_definition: {
    schemaVersion: 1,
    type: 'TABLE',
    roles: { columns: [] },
    display: { rowDensity: 'DEFAULT', enableSearch: true, pageSize: 50 },
  },
  output_schema: chartPreview.columns,
  created_at: '2026-02-01T10:10:00.000Z',
  updated_at: '2026-02-01T10:10:00.000Z',
};

export const plantDashboardId = 'd0000000-0000-4000-8000-000000000001';
export const chartCollections = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    organization_id: 'visual-test-organization',
    parent_id: null,
    name: 'Your analytics',
    description: null,
    type: 'PERSONAL',
    access: 'CURATE',
    chart_count: 1,
    archived_at: null,
    children: [],
  },
];
export const plantDashboardSummary = {
  id: plantDashboardId,
  collection_id: chartCollections[0]!.id,
  name: 'Shift operations',
  description: 'Production performance and quality overview.',
  expected_revision: 1,
  updated_at: '2026-09-13T02:00:00.000Z',
};
export const plantDashboard = {
  ...plantDashboardSummary,
  organization_id: 'visual-test-organization',
  tabs: [{ id: 'dashboard-tab-1', name: 'Overview', order: 0 }],
  cards: [
    {
      id: 'dashboard-card-1',
      tab_id: 'dashboard-tab-1',
      kind: 'CHART',
      chart_id: chartCreated.id,
      chart_revision_number: 1,
      visualization_overrides: {},
      geometry: { x: 0, y: 0, width: 12, height: 6 },
    },
    {
      id: 'dashboard-card-2',
      tab_id: 'dashboard-tab-1',
      kind: 'CHART',
      chart_id: chartCreated.id,
      chart_revision_number: 1,
      visualization_overrides: {},
      geometry: { x: 12, y: 0, width: 12, height: 6 },
    },
  ],
  filters: [],
  mappings: [],
  created_by_identity_id: 'visual-test-user',
  archived_at: null,
  created_at: '2026-09-13T02:00:00.000Z',
};
export const plantDashboardAssociation = {
  siteId: 'b0000000-0000-4000-8000-000000000001',
  dashboardId: plantDashboardId,
  role: 'overview',
  displayOrder: 0,
  isDefault: true,
  createdAt: '2026-09-13T02:00:00.000Z',
  updatedAt: '2026-09-13T02:00:00.000Z',
};

const statistics = {
  state: 'FINISHED',
  queued: false,
  progressPercentage: 100,
  elapsedTimeMillis: 1840,
  queuedTimeMillis: 120,
  cpuTimeMillis: 2400,
  processedRows: 15234,
  processedBytes: 1048576,
  peakMemoryBytes: 8388608,
  totalSplits: 12,
  completedSplits: 12,
};

export const queryHistory = [
  {
    id: QUERY_SUCCEEDED,
    status: 'SUCCEEDED',
    catalog: 'iceberg',
    namespace: 'analytics',
    statementPreview: 'SELECT order_date, count(*) FROM orders GROUP BY order_date',
    trinoQueryId: '20260201_100500_00012_ab3cd',
    rowCount: 3,
    queuedAt: '2026-02-01T10:05:00.000Z',
    startedAt: '2026-02-01T10:05:00.400Z',
    finishedAt: '2026-02-01T10:05:02.240Z',
    updatedAt: '2026-02-01T10:05:02.240Z',
  },
  {
    id: QUERY_FAILED,
    status: 'FAILED',
    catalog: 'iceberg',
    namespace: 'raw',
    statementPreview: 'SELECT * FROM missing_table',
    errorCode: 'TABLE_NOT_FOUND',
    queuedAt: '2026-02-01T09:40:00.000Z',
    startedAt: '2026-02-01T09:40:00.300Z',
    finishedAt: '2026-02-01T09:40:00.900Z',
    updatedAt: '2026-02-01T09:40:00.900Z',
  },
];

export const querySucceededDetail = {
  id: QUERY_SUCCEEDED,
  status: 'SUCCEEDED',
  catalog: 'iceberg',
  namespace: 'analytics',
  sql: 'SELECT order_date, count(*) AS orders\nFROM orders\nGROUP BY order_date\nORDER BY order_date DESC',
  trinoQueryId: '20260201_100500_00012_ab3cd',
  columns: [
    { name: 'order_date', type: 'date' },
    { name: 'orders', type: 'bigint' },
  ],
  rows: [
    ['2026-02-01', 128],
    ['2026-01-31', 341],
    ['2026-01-30', 297],
  ],
  rowCount: 3,
  truncated: false,
  resultsAvailable: true,
  statistics,
  queuedAt: '2026-02-01T10:05:00.000Z',
  startedAt: '2026-02-01T10:05:00.400Z',
  finishedAt: '2026-02-01T10:05:02.240Z',
  updatedAt: '2026-02-01T10:05:02.240Z',
};

const PIPELINE_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PIPELINE_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

export const responseMeta = {
  requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  timestamp: '2026-02-01T10:00:00.000Z',
};

const pipelineAuthor = { id: 'system', displayName: 'System' };

export const pipelineCollection = {
  success: true,
  data: [
    {
      id: PIPELINE_A,
      name: 'Daily order load',
      description: 'Reads orders from analytics-primary and writes the curated Iceberg table.',
      status: 'DRAFT',
      version: 4,
      lastRunStatus: null,
      lastRunAt: null,
      databaseName: 'analytics',
      targetDatabase: 'analytics',
      sourceConnectionIds: [],
      createdBy: pipelineAuthor,
      updatedAt: '2026-02-01T09:15:00.000Z',
    },
    {
      id: PIPELINE_B,
      name: 'Customer deduplication',
      status: 'DRAFT',
      version: 1,
      lastRunStatus: null,
      lastRunAt: null,
      databaseName: 'analytics',
      targetDatabase: 'analytics',
      sourceConnectionIds: [],
      createdBy: pipelineAuthor,
      updatedAt: '2026-01-31T16:40:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: 2,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  },
  meta: responseMeta,
};

const sourcePorts = {
  inputPorts: [],
  outputPorts: [
    { id: 'output', label: 'Output', dataType: 'DATASET', required: false, maxConnections: null },
  ],
};

export const nodeCategories = {
  success: true,
  data: [
    { type: 'SOURCE', label: 'Sources', order: 1 },
    { type: 'TRANSFORM', label: 'Transforms', order: 2 },
    { type: 'TARGET', label: 'Targets', order: 3 },
  ],
  meta: responseMeta,
};

const sourceDefinition = {
  resourceId: `connection:${CONNECTION_A}`,
  type: 'POSTGRES_SOURCE',
  category: 'SOURCE',
  label: 'analytics-primary',
  description: 'Read data through the saved POSTGRESQL connection.',
  iconKey: 'postgresql',
  enabled: true,
  runtimeKind: 'SPARK_JDBC_SOURCE',
  ...sourcePorts,
  source: {
    connectionId: CONNECTION_A,
    connectionName: 'analytics-primary',
    dbmsType: 'POSTGRESQL',
    configSchemaVersion: 1,
    config: {},
    verificationStatus: 'SUCCEEDED',
    lastTestedAt: '2026-02-01T08:00:00.000Z',
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-02-01T08:00:00.000Z',
  },
};

const filterDefinition = {
  resourceId: 'definition:FILTER',
  type: 'FILTER',
  category: 'TRANSFORM',
  label: 'Filter',
  description: 'Route rows according to a Spark SQL-compatible boolean condition.',
  iconKey: 'filter',
  enabled: true,
  runtimeKind: 'SPARK_DATAFRAME',
  inputPorts: [
    { id: 'input', label: 'Input', dataType: 'DATASET', required: true, maxConnections: 1 },
  ],
  outputPorts: [
    { id: 'matched', label: 'Matched', dataType: 'DATASET', required: false, maxConnections: null },
    {
      id: 'rejected',
      label: 'Rejected',
      dataType: 'DATASET',
      required: false,
      maxConnections: null,
    },
  ],
};

const targetDefinition = {
  resourceId: 'iceberg:iceberg',
  type: 'ICEBERG_TARGET',
  category: 'TARGET',
  label: 'Iceberg table',
  description: 'Choose a managed database and table for the transformed dataset.',
  iconKey: 'iceberg',
  enabled: true,
  runtimeKind: 'SPARK_ICEBERG_TARGET',
  inputPorts: [
    { id: 'input', label: 'Input', dataType: 'DATASET', required: true, maxConnections: 1 },
  ],
  outputPorts: [],
};

export const targetDefinitionDetail = {
  ...targetDefinition,
  propertyPanel: {
    sections: [
      {
        id: 'target',
        title: 'Iceberg destination',
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
            description: 'Use letters, numbers, and underscores only.',
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

const definitionsByCategory: Readonly<Record<string, readonly unknown[]>> = {
  SOURCE: [sourceDefinition],
  TRANSFORM: [filterDefinition],
  TARGET: [targetDefinition],
};

export function nodeDefinitions(category?: string) {
  const data = category
    ? (definitionsByCategory[category] ?? [])
    : Object.values(definitionsByCategory).flat();
  return {
    success: true,
    data,
    pagination: {
      page: 1,
      pageSize: 100,
      totalItems: data.length,
      totalPages: data.length === 0 ? 0 : 1,
      hasNext: false,
      hasPrevious: false,
    },
    meta: responseMeta,
  };
}

export const pipelineDetail = {
  success: true,
  data: {
    id: PIPELINE_A,
    name: 'Daily order load',
    description: 'Reads orders from analytics-primary and writes the curated Iceberg table.',
    status: 'DRAFT',
    version: 4,
    graph: {
      nodes: [
        {
          id: 'node-source',
          definitionType: 'POSTGRES_SOURCE',
          resourceId: `connection:${CONNECTION_A}`,
          position: { x: 40, y: 60 },
          config: { schemaName: 'public', tableName: 'orders' },
        },
        {
          id: 'node-filter',
          definitionType: 'FILTER',
          resourceId: 'definition:FILTER',
          position: { x: 330, y: 60 },
          config: { condition: "status = 'ACTIVE'" },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'node-source',
          sourcePortId: 'output',
          targetNodeId: 'node-filter',
          targetPortId: 'input',
        },
      ],
    },
    createdBy: pipelineAuthor,
    createdAt: '2026-01-20T09:00:00.000Z',
    updatedAt: '2026-02-01T09:15:00.000Z',
  },
  meta: responseMeta,
};

export const mqttStreamAdapters = [
  {
    id: 'b891f398-c92b-44ca-b31d-c7edc0cd5121',
    adapterKey: 'adp_b891f398c92b44cab31dc7edc0cd5121',
    tenantId: 'e1b350c6-f335-46c0-8dbd-823fc72ff11d',
    tenantStorageKey: 'tnt_7f3a2c19d8e4',
    tenantDisplayName: 'Factory 7',
    name: 'Line A sensors',
    brokerUrl: 'mqtts://mqtt.celesnity.io:8883',
    topicFilter:
      'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/+/telemetry',
    qos: 1,
    desiredState: 'ACTIVE',
    status: 'ACTIVE',
    placementKind: 'SHARED',
    deploymentId: 'shared-0',
    generation: 1,
    observedGeneration: 1,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'ONLINE',
    contactDeadlineAt: '2026-08-24T02:33:00.000Z',
    bronzeObjectPrefix: 'tnt_7f3a2c19d8e4/bronze/mqtt_events/',
    lastReconciledAt: '2026-08-12T08:00:00.000Z',
    createdAt: '2026-08-12T07:59:00.000Z',
    updatedAt: '2026-08-12T08:00:00.000Z',
  },
];

const ADMIN_IDENTITY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ANALYST_IDENTITY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORGANIZATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GROUP_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

export const administrationSession = {
  identityId: ADMIN_IDENTITY,
  email: 'owner@acme.example',
  identityTenantId: 'acme-tenant',
  mfaVerified: true,
  visibleFeatures: null,
  organization: {
    organizationId: ORGANIZATION_ID,
    mfaRequired: false,
    organizationName: 'Acme Manufacturing',
    homeRegion: 'europe-west1',
    role: 'ORG_OWNER',
  },
};

export const organizationMembers = [
  {
    id: '11111111-aaaa-4111-8111-111111111111',
    identityId: ADMIN_IDENTITY,
    role: 'ORG_OWNER',
    status: 'ACTIVE',
    createdAt: '2026-08-01T08:00:00.000Z',
    identity: {
      id: ADMIN_IDENTITY,
      email: 'owner@acme.example',
      displayName: 'Avery Owner',
      status: 'ACTIVE',
    },
  },
  {
    id: '22222222-aaaa-4222-8222-222222222222',
    identityId: ANALYST_IDENTITY,
    role: 'ANALYST',
    status: 'ACTIVE',
    createdAt: '2026-08-10T08:00:00.000Z',
    identity: {
      id: ANALYST_IDENTITY,
      email: 'analyst@acme.example',
      displayName: 'Morgan Analyst',
      status: 'ACTIVE',
    },
  },
];

export const authorizationGroups = [
  {
    id: GROUP_ID,
    name: 'Finance analysts',
    description: 'Read access to curated finance data.',
    featureVisibilityConfigured: true,
    visibleFeatures: ['HOME', 'QUERY', 'ANALYTICS', 'DOCUMENTS'],
    members: [
      {
        identityId: ANALYST_IDENTITY,
        identity: {
          id: ANALYST_IDENTITY,
          email: 'analyst@acme.example',
          displayName: 'Morgan Analyst',
        },
      },
    ],
  },
];

export const catalogAccessGrants = [
  {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    groupId: GROUP_ID,
    group: { id: GROUP_ID, name: 'Finance analysts' },
    resourceType: 'SCHEMA',
    resourceId: 'iceberg.finance',
    permissions: ['DISCOVER', 'DESCRIBE', 'SELECT'],
    effect: 'ALLOW',
    includeDescendants: true,
    grantOption: false,
    createdAt: '2026-08-20T08:00:00.000Z',
  },
];

export const devices = [
  {
    id: 'c891f398-c92b-44ca-b31d-c7edc0cd5122',
    deviceKey: 'dev_c891f398c92b44cab31dc7edc0cd5122',
    adapterId: mqttStreamAdapters[0]!.id,
    adapterKey: mqttStreamAdapters[0]!.adapterKey,
    tenantStorageKey: mqttStreamAdapters[0]!.tenantStorageKey,
    externalDeviceId: 'gateway-01',
    deviceType: 'GATEWAY',
    name: 'Factory 1 gateway',
    model: 'CEL-GW100',
    hardwareRevision: 'rev-b',
    currentFirmwareVersion: '1.4.2',
    deploymentSite: 'Factory 1',
    physicalLocation: 'Control room',
    lifecycleState: 'COMMISSIONED',
    brokerUrl: mqttStreamAdapters[0]!.brokerUrl,
    topics: {
      telemetry:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/temperature-01/telemetry',
      firmwareEvents:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/temperature-01/events/firmware',
      firmwareCommands:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/temperature-01/commands/firmware',
    },
    qos: 1,
    desiredState: 'ACTIVE',
    status: 'ACTIVE',
    generation: 1,
    observedGeneration: 1,
    desiredConfigurationVersion: 3,
    appliedConfigurationVersion: 2,
    reportedConfigurationVersion: 2,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'ONLINE',
    contactDeadlineAt: '2026-08-24T02:33:00.000Z',
    lastSeenAt: '2026-08-24T02:30:00.000Z',
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-24T02:30:00.000Z',
  },
  {
    id: 'd891f398-c92b-44ca-b31d-c7edc0cd5123',
    deviceKey: 'dev_d891f398c92b44cab31dc7edc0cd5123',
    adapterId: mqttStreamAdapters[0]!.id,
    adapterKey: mqttStreamAdapters[0]!.adapterKey,
    tenantStorageKey: mqttStreamAdapters[0]!.tenantStorageKey,
    externalDeviceId: 'temperature-01',
    deviceType: 'SENSOR',
    name: 'Temperature sensor 01',
    model: 'CEL-T100',
    hardwareRevision: 'rev-b',
    currentFirmwareVersion: '1.4.2',
    deploymentSite: 'Factory 1',
    physicalLocation: 'Packaging line A',
    lifecycleState: 'COMMISSIONED',
    gatewayId: 'c891f398-c92b-44ca-b31d-c7edc0cd5122',
    gatewayName: 'Factory 1 gateway',
    measurementPointId: 'e891f398-c92b-44ca-b31d-c7edc0cd5124',
    measurementPointKey: 'packaging-line-a-temperature',
    brokerUrl: mqttStreamAdapters[0]!.brokerUrl,
    topics: {
      telemetry:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/d891f398-c92b-44ca-b31d-c7edc0cd5123/telemetry',
      firmwareEvents:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/d891f398-c92b-44ca-b31d-c7edc0cd5123/events/firmware',
      firmwareCommands:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/d891f398-c92b-44ca-b31d-c7edc0cd5123/commands/firmware',
    },
    qos: 1,
    desiredState: 'ACTIVE',
    status: 'ACTIVE',
    generation: 1,
    observedGeneration: 1,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'LOST_CONTACT',
    desiredConfigurationVersion: 2,
    appliedConfigurationVersion: 2,
    reportedConfigurationVersion: 2,
    contactDeadlineAt: '2026-08-24T02:34:00.000Z',
    contactLostAt: '2026-08-24T02:35:00.000Z',
    lastSeenAt: '2026-08-24T02:31:00.000Z',
    createdAt: '2026-08-20T08:05:00.000Z',
    updatedAt: '2026-08-24T02:31:00.000Z',
  },
  {
    id: 'f891f398-c92b-44ca-b31d-c7edc0cd5125',
    deviceKey: 'dev_f891f398c92b44cab31dc7edc0cd5125',
    adapterId: mqttStreamAdapters[0]!.id,
    adapterKey: mqttStreamAdapters[0]!.adapterKey,
    tenantStorageKey: mqttStreamAdapters[0]!.tenantStorageKey,
    externalDeviceId: 'vibration-02',
    deviceType: 'SENSOR',
    name: 'Vibration sensor 02',
    model: 'CEL-V200',
    hardwareRevision: 'rev-a',
    currentFirmwareVersion: '1.2.0',
    deploymentSite: 'Factory 1',
    physicalLocation: 'Motor station 2',
    lifecycleState: 'COMMISSIONED',
    gatewayId: 'c891f398-c92b-44ca-b31d-c7edc0cd5122',
    gatewayName: 'Factory 1 gateway',
    measurementPointId: 'a891f398-c92b-44ca-b31d-c7edc0cd5126',
    measurementPointKey: 'motor-2-vibration',
    brokerUrl: mqttStreamAdapters[0]!.brokerUrl,
    topics: {
      telemetry:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/f891f398-c92b-44ca-b31d-c7edc0cd5125/telemetry',
      firmwareEvents:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/f891f398-c92b-44ca-b31d-c7edc0cd5125/events/firmware',
      firmwareCommands:
        'tenants/tnt_7f3a2c19d8e4/adapters/adp_b891f398c92b44cab31dc7edc0cd5121/devices/f891f398-c92b-44ca-b31d-c7edc0cd5125/commands/firmware',
    },
    qos: 1,
    desiredState: 'ACTIVE',
    status: 'DEGRADED',
    generation: 2,
    observedGeneration: 2,
    desiredConfigurationVersion: 1,
    appliedConfigurationVersion: 0,
    reportedConfigurationVersion: 0,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'NEVER_SEEN',
    createdAt: '2026-08-20T08:10:00.000Z',
    updatedAt: '2026-08-24T01:00:00.000Z',
  },
];

export const deviceAlerts = [
  {
    id: 'b891f398-c92b-44ca-b31d-c7edc0cd5189',
    deviceId: devices[1]!.id,
    deviceName: devices[1]!.name,
    type: 'LOSS_OF_CONTACT',
    severity: 'CRITICAL',
    status: 'RAISED',
    snapshot: {
      lastSeenAt: devices[1]!.lastSeenAt,
      contactDeadlineAt: devices[1]!.contactDeadlineAt,
      expectedCheckInIntervalSeconds: 60,
      missedCheckInThreshold: 3,
    },
    raisedAt: '2026-08-24T02:35:00.000Z',
    updatedAt: '2026-08-24T02:35:00.000Z',
  },
] as const;

export const deviceLogs = [
  {
    id: 'b891f398-c92b-44ca-b31d-c7edc0cd5198',
    deviceId: devices[0]!.id,
    deviceName: devices[0]!.name,
    sourceEventId: 'b891f398-c92b-44ca-b31d-c7edc0cd5199',
    level: 'WARNING',
    kind: 'OPERATIONAL',
    message: 'LTE reconnect required',
    context: { retry: 2 },
    observedAt: '2026-08-24T02:29:30.000Z',
    receivedAt: '2026-08-24T02:30:05.000Z',
  },
  {
    id: 'b891f398-c92b-44ca-b31d-c7edc0cd5200',
    deviceId: devices[0]!.id,
    deviceName: devices[0]!.name,
    sourceEventId: 'b891f398-c92b-44ca-b31d-c7edc0cd5201',
    level: 'ERROR',
    kind: 'FAULT',
    message: 'Device restarted after watchdog reset',
    context: { resetReason: 'WATCHDOG', programCounter: '0x400d1234' },
    observedAt: '2026-08-24T02:28:00.000Z',
    receivedAt: '2026-08-24T02:30:06.000Z',
  },
] as const;

export const firmwareReleases = [
  {
    id: 'b891f398-c92b-44ca-b31d-c7edc0cd5190',
    version: '1.5.0',
    deviceModel: 'CEL-GW100',
    hardwareRevision: 'rev-b',
    artifactStorageProvider: 'MINIO',
    artifactFileName: 'CEL-GW100-1.5.0.bin',
    artifactContentType: 'application/octet-stream',
    artifactSizeBytes: 1_572_864,
    sha256: 'a'.repeat(64),
    signature: `${'A'.repeat(86)}==`,
    signingKeyId: 'release-primary',
    signatureVerifiedAt: '2026-09-05T08:00:00.000Z',
    releaseNotes: 'Improved connection recovery and OTA health confirmation.',
    createdBy: 'local-owner',
    createdAt: '2026-09-05T07:00:00.000Z',
  },
] as const;

export const firmwareDeployments = [
  {
    id: 'b891f398-c92b-44ca-b31d-c7edc0cd5191',
    deviceId: devices[0]!.id,
    releaseId: firmwareReleases[0]!.id,
    releaseVersion: firmwareReleases[0]!.version,
    status: 'DOWNLOADING',
    progressPercent: 42,
    previousVersion: '1.4.2',
    requestedBy: 'local-owner',
    requestedAt: '2026-09-05T07:30:00.000Z',
    startedAt: '2026-09-05T07:30:01.000Z',
    updatedAt: '2026-09-05T07:30:08.000Z',
  },
] as const;

export const firmwareCampaigns = [
  {
    id: 'b891f398-c92b-44ca-b31d-c7edc0cd5192',
    name: 'Gateway 1.5.0 canary rollout',
    releaseId: firmwareReleases[0]!.id,
    releaseVersion: firmwareReleases[0]!.version,
    status: 'RUNNING',
    canarySize: 1,
    batchSize: 10,
    currentBatch: 0,
    requestedBy: 'local-owner',
    createdAt: '2026-09-05T07:20:00.000Z',
    updatedAt: '2026-09-05T07:30:08.000Z',
    targets: [
      {
        id: 'b891f398-c92b-44ca-b31d-c7edc0cd5193',
        deviceId: devices[0]!.id,
        deviceName: devices[0]!.name,
        batchNumber: 0,
        deploymentId: firmwareDeployments[0]!.id,
        status: firmwareDeployments[0]!.status,
        progressPercent: firmwareDeployments[0]!.progressPercent,
        updatedAt: firmwareDeployments[0]!.updatedAt,
      },
      {
        id: 'b891f398-c92b-44ca-b31d-c7edc0cd5194',
        deviceId: devices[2]!.id,
        deviceName: devices[2]!.name,
        batchNumber: 1,
        status: 'PENDING',
        progressPercent: 0,
        updatedAt: '2026-09-05T07:20:00.000Z',
      },
    ],
  },
] as const;

export const deviceConfigurations = [
  {
    id: 'c891f398-c92b-44ca-b31d-c7edc0cd5190',
    deviceId: devices[0]!.id,
    version: 3,
    status: 'DISPATCHED',
    parameters: {
      samplingRateHz: 2,
      reportingIntervalSeconds: 30,
      channels: { temperature: true },
      gatewayUplinkMode: 'MQTT',
      diagnosticLogging: ['BATTERY_PERCENT', 'RSSI_SNR', 'UPTIME'],
      alertThresholds: { batteryPercentLow: 10 },
    },
    restoreFactoryDefaults: false,
    previousAppliedVersion: 2,
    requestedBy: 'local-owner',
    requestedAt: '2026-08-24T02:32:00.000Z',
    dispatchedAt: '2026-08-24T02:32:00.000Z',
    updatedAt: '2026-08-24T02:32:00.000Z',
  },
  {
    id: 'c891f398-c92b-44ca-b31d-c7edc0cd5191',
    deviceId: devices[0]!.id,
    version: 2,
    status: 'APPLIED',
    parameters: { samplingRateHz: 1, reportingIntervalSeconds: 60 },
    restoreFactoryDefaults: false,
    previousAppliedVersion: 1,
    requestedBy: 'local-owner',
    requestedAt: '2026-08-20T08:00:00.000Z',
    dispatchedAt: '2026-08-20T08:00:00.000Z',
    appliedAt: '2026-08-20T08:00:04.000Z',
    finishedAt: '2026-08-20T08:00:04.000Z',
    updatedAt: '2026-08-20T08:00:04.000Z',
  },
] as const;

export const deviceConfigurationTemplates = [
  {
    id: 'b891f398-c92b-44ca-b31d-c7edc0cd5202',
    name: 'Factory sensors',
    version: 2,
    parameters: {
      samplingRateHz: 2,
      reportingIntervalSeconds: 60,
      logLevel: 'WARNING',
    },
    createdBy: 'local-owner',
    createdAt: '2026-09-06T03:00:00.000Z',
  },
] as const;

/**
 * The skills library.
 *
 * Shaped to exercise what the redesign added: two sources, two namespaces
 * inside the project source, an unnamespaced bucket, and one skill with no
 * description at all — the case the agent cannot route to.
 */
export const dataWorkflows = {
  data: [
    {
      id: 'workflow-daily-import',
      name: 'Daily plant import',
      revision: 3,
      publishedVersion: 2,
      paused: false,
      draft: {
        name: 'Daily plant import',
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER',
              config: {
                type: 'CALENDAR',
                timeOfDay: '07:00',
                weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
                timezone: 'Asia/Ho_Chi_Minh',
              },
            },
          ],
          edges: [],
        },
      },
      schedule: {
        kind: 'CALENDAR',
        lifecycle: 'ENABLED',
        enabled: true,
        paused: false,
        nextDueAt: '2026-09-21T00:00:00.000Z',
        occurrenceCoverage: { coalescedCount: 0 },
      },
      lastRunStatus: 'SUCCEEDED',
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 20,
  totalItems: 1,
} as const;

export const skills = [
  {
    name: 'daily-yield-report',
    description:
      'Use when the user asks for shift yield. Compiles the report from press telemetry and posts it to the ops channel.',
    namespace: 'reporting',
    source: 'project',
  },
  {
    name: 'anomaly-triage',
    description:
      'Use when a temperature anomaly is reported. Pulls the run, the table and the last three snapshots.',
    namespace: 'reporting',
    source: 'project',
  },
  {
    name: 'schema-drift-check',
    description:
      'Use when a source schema may have changed. Compares it against the Iceberg table and lists incompatible columns.',
    namespace: 'data-quality',
    source: 'project',
  },
  {
    name: 'null-audit',
    description: 'Use when auditing a table for null density by column.',
    namespace: 'data-quality',
    source: 'project',
  },
  { name: 'pipeline-postmortem', description: '', namespace: '', source: 'project' },
  {
    name: 'code-review',
    description: 'Use when reviewing a diff for correctness bugs and reuse cleanups.',
    namespace: '',
    source: 'global',
  },
  {
    name: 'commit-message',
    description: 'Use when writing a commit message in the house style from the staged diff.',
    namespace: '',
    source: 'global',
  },
  {
    name: 'release-notes',
    description: 'Use when drafting release notes from a range of commits.',
    namespace: '',
    source: 'global',
  },
] as const;

export const skillBody = [
  '# Daily yield report',
  '',
  'Run this at the end of every shift.',
  '',
  '## Steps',
  '',
  '1. Query `factory_silver.press_telemetry` for the shift window.',
  '2. Group by machine and compute yield against the target.',
  '3. Compare against the previous shift.',
  '4. Post the summary to the ops channel.',
  '',
  '## Notes',
  '',
  'If a machine reports zero rows, say so by name rather than omitting it.',
  '',
].join('\n');

/** Guided tutorial responses used by the six tutorial-surface visual baselines. */
export const tutorialIds = {
  connections: 'tutorial-connections-basics',
  query: 'tutorial-query-first-result',
} as const;

const tutorialConnectionsMetadata = {
  title: 'Create your first data connection',
  summary: 'Connect a trusted PostgreSQL source and verify that the workspace can reach it.',
  category: 'Getting started',
  learningOutcomes: ['Choose an authorized connection source', 'Verify connectivity before saving'],
  estimatedMinutes: 8,
  stepCount: 2,
};

const tutorialQueryMetadata = {
  title: 'Run and inspect a SQL query',
  summary: 'Execute a query and understand the result status, timing, and returned columns.',
  category: 'Querying data',
  learningOutcomes: ['Run SQL in the query workspace', 'Read query result details'],
  estimatedMinutes: 6,
  stepCount: 1,
};

export const tutorialDefinitions = [
  {
    id: tutorialIds.connections,
    metadata: tutorialConnectionsMetadata,
    steps: [
      {
        id: 'connection-step-open',
        order: 1,
        title: 'Open the connection editor',
        instructionalContent:
          'Choose New connection in the workspace. Keep this guide open while you select the source you want to use.',
        destinationFeature: 'CONNECTIONS',
        destinationHref: '/connections',
        targetControl: {
          id: 'new-connection-control',
          accessibleName: 'New connection',
          selector: 'main button',
        },
      },
      {
        id: 'connection-step-review',
        order: 2,
        title: 'Review the connection checklist',
        instructionalContent:
          'Confirm the host, database, and authentication details before you finish this tutorial.',
        destinationFeature: 'CONNECTIONS',
        destinationHref: '/connections',
      },
    ],
    requiredFeatures: ['CONNECTIONS'],
    prerequisites: [],
    contextRequirements: [],
  },
  {
    id: tutorialIds.query,
    metadata: tutorialQueryMetadata,
    steps: [
      {
        id: 'query-step-run',
        order: 1,
        title: 'Run a query',
        instructionalContent: 'Enter a query and run it to inspect the returned columns.',
        destinationFeature: 'QUERY',
        destinationHref: '/sql',
      },
    ],
    requiredFeatures: ['QUERY'],
    prerequisites: [],
    contextRequirements: [],
  },
] as const;

export const tutorialCatalog = tutorialDefinitions.map(({ id, metadata }) => ({ id, metadata }));

export const tutorialProgress = [
  {
    tutorialId: tutorialIds.query,
    memberId: 'visual-test-user',
    organizationId: 'visual-test-organization',
    status: 'PAUSED',
    currentStepId: 'query-step-run',
    completedStepIds: [],
    contextSelections: [],
    updatedAt: '2026-09-15T08:30:00.000Z',
  },
] as const;

export const tutorialContextResources = {
  items: [
    {
      id: ids.connectionA,
      name: 'analytics-primary',
      resourceType: 'DATABASE_SERVICE',
    },
  ],
};

export const tutorialCompletion = {
  runId: 'tutorial-run-visual',
  completedAt: '2026-09-15T09:45:00.000Z',
};
