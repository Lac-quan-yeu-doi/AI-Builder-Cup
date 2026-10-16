import { expect, expectTypeOf, test } from 'vitest';

import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';
import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';
import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';
import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';
import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';
import type {
  ExecutionProgressObserver,
  ExecutionProgressService,
  ExecutionProgressSubscription,
} from '@/src/application/services/execution-progress.service.interface';
import type {
  QueryProgressObserver,
  QueryProgressService,
  QueryProgressSubscription,
} from '@/src/application/services/query-progress.service.interface';
import type {
  ScheduledTask,
  SchedulerService,
} from '@/src/application/services/scheduler.service.interface';
import type {
  Catalog,
  CatalogNamespaceScope,
  Namespace,
  TableMetadata,
  TablePreview,
  TablePreviewRequest,
  TableRef,
  TableSnapshot,
  TableSummary,
} from '@/src/entities/models/catalog';
import type {
  ConnectionDetailsInput,
  ConnectionVerificationResult,
  DataConnection,
  DataConnectionInput,
} from '@/src/entities/models/connection';
import type {
  ExecutionDetail,
  ExecutionLog,
  ExecutionProgress,
  ExecutionSummary,
  RerunOutcome,
} from '@/src/entities/models/execution';
import type {
  QueryEditorSession,
  SqlCatalog,
  SqlExecutionAccepted,
  SqlExecutionEvent,
  SqlExecutionResult,
  SqlExecutionSummary,
  SqlNamespace,
} from '@/src/entities/models/query';
import type {
  ActiveConnectionOption,
  PublishedScriptSource,
  RunScriptResult,
  Script,
  ScriptMetadata,
  ScriptVersion,
} from '@/src/entities/models/script';

const notImplemented = (): never => {
  throw new Error('Contract fake is not executable.');
};

const connectionRepository = {
  list: async () => [],
  get: async () => notImplemented(),
  testUnsaved: async () => notImplemented(),
  testSaved: async () => notImplemented(),
  create: async () => notImplemented(),
  update: async () => notImplemented(),
  archive: async () => undefined,
} satisfies ConnectionRepository;

const scriptRepository = {
  listScripts: async () => [],
  getScript: async () => notImplemented(),
  createScript: async () => notImplemented(),
  updateScriptMetadata: async () => notImplemented(),
  publishVersion: async () => notImplemented(),
  listVersions: async () => [],
  loadVersionSource: async () => notImplemented(),
  listActiveConnections: async () => [],
  runVersion: async () => notImplemented(),
} satisfies ScriptRepository;

const executionRepository = {
  list: async () => [],
  get: async () => notImplemented(),
  cancel: async () => notImplemented(),
  fetchLogs: async () => undefined,
  rerun: async () => notImplemented(),
} satisfies ExecutionRepository;

const catalogRepository = {
  listCatalogs: async () => [],
  createNamespace: async () => notImplemented(),
  updateNamespaceDescription: async () => notImplemented(),
  listNamespaces: async () => [],
  listTables: async () => [],
  getTableMetadata: async () => notImplemented(),
  listSnapshots: async () => [],
  previewTable: async () => notImplemented(),
} satisfies CatalogRepository;

const queryRepository = {
  listCatalogs: async () => [],
  listNamespaces: async () => [],
  listHistory: async () => [],
  submit: async () => notImplemented(),
  get: async () => notImplemented(),
  cancel: async () => notImplemented(),
} satisfies QueryRepository;

const scheduledTask: ScheduledTask = {
  cancel: () => undefined,
};

const schedulerService = {
  every: () => scheduledTask,
} satisfies SchedulerService;

const executionProgressSubscription: ExecutionProgressSubscription = {
  close: () => undefined,
};

const executionProgressObserver = {
  onProgress: (progress: ExecutionProgress) => void progress,
  onError: (error: unknown) => void error,
} satisfies ExecutionProgressObserver;

const executionProgressService = {
  subscribe: (id: string, observer: ExecutionProgressObserver): ExecutionProgressSubscription => {
    void id;
    void observer;
    return executionProgressSubscription;
  },
} satisfies ExecutionProgressService;

const queryProgressSubscription: QueryProgressSubscription = {
  close: () => undefined,
};

const queryProgressObserver = {
  onEvent: (event: SqlExecutionEvent) => void event,
  onError: (error: unknown) => void error,
} satisfies QueryProgressObserver;

const queryProgressService = {
  subscribe: (id: string, observer: QueryProgressObserver): QueryProgressSubscription => {
    void id;
    void observer;
    return queryProgressSubscription;
  },
} satisfies QueryProgressService;

test('application port modules form explicit loadable boundaries', async () => {
  const modules = await Promise.all([
    import('@/src/application/repositories/catalog.repository.interface'),
    import('@/src/application/repositories/connection.repository.interface'),
    import('@/src/application/repositories/execution.repository.interface'),
    import('@/src/application/repositories/query.repository.interface'),
    import('@/src/application/repositories/script.repository.interface'),
    import('@/src/application/services/execution-progress.service.interface'),
    import('@/src/application/services/query-progress.service.interface'),
    import('@/src/application/services/scheduler.service.interface'),
  ]);

  expect(modules).toHaveLength(8);
});

test('connection repository preserves every method signature', () => {
  expectTypeOf<ConnectionRepository['list']>().toEqualTypeOf<
    () => Promise<readonly DataConnection[]>
  >();
  expectTypeOf<ConnectionRepository['get']>().toEqualTypeOf<
    (id: string) => Promise<DataConnection>
  >();
  expectTypeOf<ConnectionRepository['testUnsaved']>().toEqualTypeOf<
    (details: ConnectionDetailsInput) => Promise<ConnectionVerificationResult>
  >();
  expectTypeOf<ConnectionRepository['testSaved']>().toEqualTypeOf<
    (id: string) => Promise<ConnectionVerificationResult>
  >();
  expectTypeOf<ConnectionRepository['create']>().toEqualTypeOf<
    (input: DataConnectionInput) => Promise<DataConnection>
  >();
  expectTypeOf<ConnectionRepository['update']>().toEqualTypeOf<
    (id: string, input: DataConnectionInput) => Promise<DataConnection>
  >();
  expectTypeOf<ConnectionRepository['archive']>().toEqualTypeOf<(id: string) => Promise<void>>();
});

test('script repository preserves every method signature', () => {
  expectTypeOf<ScriptRepository['listScripts']>().toEqualTypeOf<() => Promise<readonly Script[]>>();
  expectTypeOf<ScriptRepository['getScript']>().toEqualTypeOf<(id: string) => Promise<Script>>();
  expectTypeOf<ScriptRepository['createScript']>().toEqualTypeOf<
    (metadata: ScriptMetadata) => Promise<Script>
  >();
  expectTypeOf<ScriptRepository['updateScriptMetadata']>().toEqualTypeOf<
    (id: string, metadata: ScriptMetadata) => Promise<Script>
  >();
  expectTypeOf<ScriptRepository['publishVersion']>().toEqualTypeOf<
    (scriptId: string, source: string) => Promise<ScriptVersion>
  >();
  expectTypeOf<ScriptRepository['listVersions']>().toEqualTypeOf<
    (scriptId: string) => Promise<readonly ScriptVersion[]>
  >();
  expectTypeOf<ScriptRepository['loadVersionSource']>().toEqualTypeOf<
    (scriptId: string, versionNumber: number) => Promise<PublishedScriptSource>
  >();
  expectTypeOf<ScriptRepository['listActiveConnections']>().toEqualTypeOf<
    () => Promise<readonly ActiveConnectionOption[]>
  >();
  expectTypeOf<ScriptRepository['runVersion']>().toEqualTypeOf<
    (scriptId: string, versionNumber: number) => Promise<RunScriptResult>
  >();
});

test('execution repository preserves every method signature', () => {
  expectTypeOf<ExecutionRepository['list']>().toEqualTypeOf<
    () => Promise<readonly ExecutionSummary[]>
  >();
  expectTypeOf<ExecutionRepository['get']>().toEqualTypeOf<
    (id: string) => Promise<ExecutionDetail>
  >();
  expectTypeOf<ExecutionRepository['cancel']>().toEqualTypeOf<
    (id: string) => Promise<ExecutionDetail>
  >();
  expectTypeOf<ExecutionRepository['fetchLogs']>().toEqualTypeOf<
    (id: string) => Promise<ExecutionLog | undefined>
  >();
  expectTypeOf<ExecutionRepository['rerun']>().toEqualTypeOf<
    (scriptId: string, scriptVersionId: string) => Promise<RerunOutcome>
  >();
});

test('catalog repository preserves every method signature', () => {
  expectTypeOf<CatalogRepository['listCatalogs']>().toEqualTypeOf<
    () => Promise<readonly Catalog[]>
  >();
  expectTypeOf<CatalogRepository['listNamespaces']>().toEqualTypeOf<
    (catalog: string, scope?: CatalogNamespaceScope) => Promise<readonly Namespace[]>
  >();
  expectTypeOf<CatalogRepository['listTables']>().toEqualTypeOf<
    (catalog: string, schema: string) => Promise<readonly TableSummary[]>
  >();
  expectTypeOf<CatalogRepository['getTableMetadata']>().toEqualTypeOf<
    (ref: TableRef) => Promise<TableMetadata>
  >();
  expectTypeOf<CatalogRepository['listSnapshots']>().toEqualTypeOf<
    (ref: TableRef) => Promise<readonly TableSnapshot[]>
  >();
  expectTypeOf<CatalogRepository['previewTable']>().toEqualTypeOf<
    (request: TablePreviewRequest) => Promise<TablePreview>
  >();
});

test('query repository preserves every method signature', () => {
  expectTypeOf<QueryRepository['listCatalogs']>().toEqualTypeOf<
    () => Promise<readonly SqlCatalog[]>
  >();
  expectTypeOf<QueryRepository['listNamespaces']>().toEqualTypeOf<
    (catalog: string) => Promise<readonly SqlNamespace[]>
  >();
  expectTypeOf<QueryRepository['listHistory']>().toEqualTypeOf<
    () => Promise<readonly SqlExecutionSummary[]>
  >();
  expectTypeOf<QueryRepository['submit']>().toEqualTypeOf<
    (session: QueryEditorSession) => Promise<SqlExecutionAccepted>
  >();
  expectTypeOf<QueryRepository['get']>().toEqualTypeOf<
    (id: string) => Promise<SqlExecutionResult>
  >();
  expectTypeOf<QueryRepository['cancel']>().toEqualTypeOf<
    (id: string) => Promise<SqlExecutionResult>
  >();
});

test('scheduler service preserves every method signature', () => {
  expectTypeOf<ScheduledTask['cancel']>().toEqualTypeOf<() => void>();
  expectTypeOf<SchedulerService['every']>().toEqualTypeOf<
    (intervalMs: number, task: () => void) => ScheduledTask
  >();
});

test('execution progress service preserves every method signature', () => {
  expectTypeOf<ExecutionProgressObserver['onProgress']>().toEqualTypeOf<
    (progress: ExecutionProgress) => void
  >();
  expectTypeOf<ExecutionProgressObserver['onError']>().toEqualTypeOf<(error: unknown) => void>();
  expectTypeOf<ExecutionProgressSubscription['close']>().toEqualTypeOf<() => void>();
  expectTypeOf<ExecutionProgressService['subscribe']>().toEqualTypeOf<
    (id: string, observer: ExecutionProgressObserver) => ExecutionProgressSubscription
  >();
});

test('query progress service preserves every method signature', () => {
  expectTypeOf<QueryProgressObserver['onEvent']>().toEqualTypeOf<
    (event: SqlExecutionEvent) => void
  >();
  expectTypeOf<QueryProgressObserver['onError']>().toEqualTypeOf<(error: unknown) => void>();
  expectTypeOf<QueryProgressSubscription['close']>().toEqualTypeOf<() => void>();
  expectTypeOf<QueryProgressService['subscribe']>().toEqualTypeOf<
    (id: string, observer: QueryProgressObserver) => QueryProgressSubscription
  >();
});

test('application ports are independently implementable', () => {
  expectTypeOf(connectionRepository).toMatchTypeOf<ConnectionRepository>();
  expectTypeOf(scriptRepository).toMatchTypeOf<ScriptRepository>();
  expectTypeOf(executionRepository).toMatchTypeOf<ExecutionRepository>();
  expectTypeOf(catalogRepository).toMatchTypeOf<CatalogRepository>();
  expectTypeOf(queryRepository).toMatchTypeOf<QueryRepository>();
  expectTypeOf(schedulerService).toMatchTypeOf<SchedulerService>();
  expectTypeOf(executionProgressObserver).toMatchTypeOf<ExecutionProgressObserver>();
  expectTypeOf(executionProgressService).toMatchTypeOf<ExecutionProgressService>();
  expectTypeOf(queryProgressObserver).toMatchTypeOf<QueryProgressObserver>();
  expectTypeOf(queryProgressService).toMatchTypeOf<QueryProgressService>();
});
