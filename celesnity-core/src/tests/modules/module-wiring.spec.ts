import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AGENT_WORKSPACE_TREE_CLIENT } from '@application/automation-workflow/tokens';
import { RoomOwnershipResolver } from '@infrastructure/automation-workflow/room-ownership-resolver';
import { DatabaseServiceUseCases } from '@application/database-service/database-service.use-cases';
import { DatabaseServiceMembershipUseCases } from '@application/database-service/database-service-membership.use-cases';
import { CdcConnectionProfileUseCases } from '@application/database-service/cdc-connection-profile.use-cases';
import type { IConnectionExecutionProfileProvider } from '@application/database-service/interfaces/i-connection-execution-profile-provider';
import type { IConnectionReferenceProvider } from '@application/database-service/interfaces/i-connection-reference-provider';
import {
  CONNECTION_EXECUTION_PROFILE_PROVIDER,
  CONNECTION_REFERENCE_PROVIDER,
  CREDENTIAL_VAULT,
  DATABASE_SERVICE_READER,
  DATABASE_SERVICE_REPOSITORY,
  DATABASE_SERVICE_MEMBERSHIP_REPOSITORY,
  DATABASE_CATALOG_READER,
  DATABASE_SOURCE_USAGE_READER,
  DESTINATION_POLICY,
  DATABASE_SERVICE_CONNECTOR_REGISTRY,
  DATABASE_SERVICE_RUNTIME_PROVIDER,
  CDC_CONNECTION_PREFLIGHT,
  CDC_CONNECTION_PROFILE_REPOSITORY,
  CDC_CONNECTION_USAGE_READER,
  CDC_CONNECTION_RUNTIME_PROVIDER,
} from '@application/database-service/tokens';
import {
  DATABASE_METADATA_SOURCE_REGISTRY,
  SOURCE_METADATA_CATALOG_READER,
} from '@application/metadata-crawler/tokens';
import type { IDatabaseMetadataSourceRegistry } from '@application/metadata-crawler/interfaces/i-database-metadata-source-registry';
import { MetadataCrawlerModule } from '@modules/metadata-crawler.module';
import { MetadataCrawlerWorkerModule } from '@modules/metadata-crawler-worker.module';
import { MetadataCrawlerInfrastructureModule } from '@modules/metadata-crawler-infrastructure.module';
import { MetadataCrawlerUseCases } from '@application/metadata-crawler/metadata-crawler.use-cases';
import { SourceMetadataQueryUseCases } from '@application/metadata-crawler/source-metadata-query.use-cases';
import { MetadataCrawlerWorkerService } from '@application/metadata-crawler/metadata-crawler-worker.service';
import type { IPublishedScriptProvider } from '@application/script-authoring/interfaces/i-published-script-provider';
import { PUBLISHED_SCRIPT_PROVIDER } from '@application/script-authoring/tokens';
import { ScriptAuthoringUseCases } from '@application/script-authoring/script-authoring.use-cases';
import { UNIT_OF_WORK } from '@application/shared/tokens';
import { DatabaseModule } from '@modules/database.module';
import { AutomationWorkflowModule } from '@modules/automation-workflow.module';
import { DataWorkflowModule } from '@modules/data-workflow.module';
import { DataWorkflowController } from '@presentation/data-workflow/data-workflow.controller';
import { DataWorkflowRunController } from '@presentation/data-workflow/data-workflow-run.controller';
import { WorkspaceTreeController } from '@presentation/automation-workflow/workspace-tree.controller';
import { SkillModule } from '@modules/skill.module';
import { SkillMcpController } from '@presentation/skill/skill-mcp.controller';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { ScriptAuthoringModule } from '@modules/script-authoring.module';
import { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import { NODE_DEFINITION_READER } from '@application/node-catalog/tokens';
import { NodeCatalogModule } from '@modules/node-catalog.module';
import { PipelineAuthoringUseCases } from '@application/pipeline-authoring/pipeline-authoring.use-cases';
import { PipelineGraphValidator } from '@application/pipeline-authoring/pipeline-graph.validator';
import {
  PIPELINE_NODE_PREVIEWER,
  PIPELINE_REPOSITORY,
} from '@application/pipeline-authoring/tokens';
import { PipelineAuthoringModule } from '@modules/pipeline-authoring.module';
import type { IDatabaseServiceConnectorRegistry } from '@application/database-service/interfaces/i-database-service-connector-registry';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { ChartModule } from '@modules/chart.module';
import { ChartUseCases } from '@application/chart/chart.use-cases';
import { CHART_REPOSITORY } from '@application/chart/tokens';
import { CHART_ACTIONS } from '@application/chart/chart.actions';
import { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import { ActionsModule } from '@modules/actions.module';
import { ACTION_RESOLVER } from '@application/actions/tokens';
import type { IActionResolver } from '@application/actions/interfaces/i-action-resolver';
import { DocumentModule } from '@modules/document.module';
import { DocumentUseCases } from '@application/document/document.use-cases';
import { DOCUMENT_REPOSITORY } from '@application/document/tokens';
import { DOCUMENT_ACTIONS } from '@application/document/document.actions';
import { ApiAppModule } from '@bootstrap/api-app.module';
import { TrinoMcpModule } from '@modules/trino-mcp.module';
import { PlantModelModule } from '@modules/plant-model.module';
import { CitationModule } from '@modules/citation.module';
import { CitationUseCases } from '@application/citation/citation.use-cases';
import { SecurityModule } from '@modules/security.module';
import { AdministrationModule } from '@modules/administration.module';
import { AdministrationUseCases } from '@application/administration/administration.use-cases';
import { IDENTITY_ACCESS_REPOSITORY } from '@application/administration/identity-access.repository';
import { IDENTITY_TOKEN_VERIFIER } from '@application/administration/identity-token.verifier';
import { AUDIT_WRITER } from '@application/administration/audit-writer';
import { RateLimitModule } from '@modules/rate-limit.module';
import { AgentWriteThrottlerGuard } from '@presentation/http/agent-write-throttler.guard';
import { ArchiveDashboardUseCase } from '@application/dashboard/archive-dashboard.use-case';
import { CopyDashboardUseCase } from '@application/dashboard/copy-dashboard.use-case';
import { CreateDashboardUseCase } from '@application/dashboard/create-dashboard.use-case';
import { GetDashboardUseCase } from '@application/dashboard/get-dashboard.use-case';
import { ListDashboardsUseCase } from '@application/dashboard/list-dashboards.use-case';
import { SaveDashboardUseCase } from '@application/dashboard/save-dashboard.use-case';
import {
  DASHBOARD_CHART_READER,
  DASHBOARD_COLLECTION_AUTHORIZATION,
  DASHBOARD_REPOSITORY,
} from '@application/dashboard/tokens';
import { DashboardModule } from '@modules/dashboard.module';
import { DashboardController } from '@presentation/dashboard/dashboard.controller';
import { QueryWorkbenchModule } from '@modules/query-workbench.module';
import { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';
import { CATALOG_PROFILE_CACHE } from '@application/catalog-exploration/tokens';
import { CloudFileUseCases } from '@application/cloud-file/cloud-file.use-cases';
import type { ICloudFileSourceRegistry } from '@application/cloud-file/interfaces/i-cloud-file-source-registry';
import { CLOUD_FILE_SOURCE_REGISTRY } from '@application/cloud-file/tokens';
import { GoogleDriveConnectorService } from '@application/google-drive-connector/google-drive-connector.service';
import { SpreadsheetUseCases } from '@application/spreadsheet/spreadsheet.use-cases';
import { GoogleDriveConnectorModule } from '@modules/google-drive-connector.module';
import { CloudFileMcpController } from '@presentation/cloud-file/cloud-file-mcp.controller';

jest.mock('@infrastructure/identity/firebase-identity-administration.service', () => ({
  FirebaseIdentityAdministrationService: class FirebaseIdentityAdministrationService {},
}));

// This suite proves Nest wiring, not the Firebase SDK. Keeping the adapter at
// the module boundary also avoids loading Firebase's ESM-only transitive
// dependencies into the CommonJS Jest runtime.
jest.mock('@infrastructure/identity/firebase-identity-token.verifier', () => ({
  FirebaseIdentityTokenVerifier: class FirebaseIdentityTokenVerifier {},
}));

/**
 * Confirms the container still satisfies every port after Task 6 moved two
 * adapters out of the application layer and introduced the published-script
 * adapter.
 *
 * These are wiring assertions, not behavioural ones: they prove each token
 * resolves to an object exposing the port's methods, and that the modules other
 * contexts import still export what those contexts need. `PrismaService` is
 * stubbed because resolving it for real would open a database connection.
 */

/**
 * The configuration the adapters under test read. Only the keys the two modules
 * actually reach for are listed; a missing one surfaces as a clear
 * "Configuration key ... does not exist" failure rather than a silent default.
 */
type ConfigValue = string | number | boolean;

const CONFIG_VALUES: Readonly<Record<string, ConfigValue>> = {
  AGENT_WRITE_RATE_LIMIT: 120,
  AGENT_WRITE_RATE_WINDOW_MS: 60_000,
  PENDING_ACTION_TTL_MS: 86_400_000,
  IDENTITY_PLATFORM_PROJECT_ID: 'celesnity-local',
  DEFAULT_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000001',
  AUDIT_HASH_KEY: 'test-audit-pseudonymization-key',
  CATALOG_PREVIEW_MAX_ROWS: 100,
  CONNECTION_ALLOWED_HOSTS: 'db.internal',
  CONNECTION_ALLOW_PRIVATE_DESTINATIONS: true,
  CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION: 'v1',
  CONNECTION_CREDENTIAL_KEYS: `v1:${Buffer.alloc(32, 7).toString('base64')}`,
  CONNECTION_TEST_TIMEOUT_MS: 5_000,
  // The publication lock builds a pg Pool eagerly. A pool is lazy about
  // connecting, so an unreachable URL is enough to construct it.
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
  MINIO_ACCESS_KEY: 'minio',
  MINIO_ARTIFACTS_BUCKET: 'celesnity-artifacts',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_SECRET_KEY: 'minio-secret',
  SCRIPT_SOURCE_MAX_BYTES: 1_048_576,
  SPARK_DRIVER_MEMORY: '1g',
  SPARK_EXECUTOR_MEMORY: '1g',
  SPARK_EXECUTOR_CORES: 1,
  SPARK_MAX_CORES: 1,
  SQL_QUERY_TIMEOUT_MS: 60_000,
  SQL_MAX_RESULT_ROWS: 1_000,
  TRINO_CATALOG: 'iceberg',
  TRINO_PASSWORD: '',
  TRINO_URL: 'http://127.0.0.1:1',
  TRINO_USER: 'celesnity',
  METADATA_CRAWLER_SCHEDULE_INTERVAL_MS: 15_000,
  METADATA_CRAWLER_RECOVERY_INTERVAL_MS: 60_000,
  METADATA_CRAWLER_CLAIM_BATCH_SIZE: 2,
  METADATA_CRAWLER_LEASE_MS: 60_000,
  METADATA_CRAWLER_HEARTBEAT_MS: 15_000,
  METADATA_CRAWLER_MAX_ATTEMPTS: 3,
  METADATA_CRAWLER_RELATION_CONCURRENCY: 4,
  AGENT_ACTIONS_POLICY_PATH: 'config/agent-actions.yaml',
  MINDER_AGENT_URL: 'http://minder-agent.internal',
  MINDER_ASSERTION_PRIVATE_KEY_PEM:
    '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIKMp5Zlb0rjzZVEDTZPbbmmCywcRAaprZyKU6L8cOAim\n-----END PRIVATE KEY-----',
  MINDER_ASSERTION_KEY_ID: 'module-test-2026',
  MINDER_ASSERTION_TTL_SECONDS: 60,
  AGENT_SERVICE_AUDIENCE: 'http://celesnity-core.celesnity.svc.cluster.local:3001',
  AGENT_SERVICE_ACCOUNT_EMAIL: 'local-agent@localhost',
  REDPANDA_TLS_ENABLED: false,
  WEB_ORIGIN: 'http://localhost:3000',
};

/**
 * DatabaseModule is `@Global`, so importing it here makes PrismaService and the
 * shared ports visible to the module under test exactly as they are in the real
 * composition root. `overrideProvider` can only replace a provider that is
 * already registered, which is why the module is imported rather than the
 * service being supplied directly.
 *
 * ConfigModule is loaded with fixed values instead of the environment so the
 * assertions do not depend on a developer's .env.
 */
async function compile(module: unknown): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [(): Record<string, ConfigValue> => ({ ...CONFIG_VALUES })],
      }),
      DatabaseModule,
      module as never,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
}

describe('DatabaseServiceModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(DatabaseServiceModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it.each([
    ['DATABASE_SERVICE_REPOSITORY', DATABASE_SERVICE_REPOSITORY],
    ['DATABASE_SERVICE_READER', DATABASE_SERVICE_READER],
    ['DATABASE_SERVICE_MEMBERSHIP_REPOSITORY', DATABASE_SERVICE_MEMBERSHIP_REPOSITORY],
    ['DATABASE_CATALOG_READER', DATABASE_CATALOG_READER],
    ['DATABASE_SOURCE_USAGE_READER', DATABASE_SOURCE_USAGE_READER],
    ['CREDENTIAL_VAULT', CREDENTIAL_VAULT],
    ['DESTINATION_POLICY', DESTINATION_POLICY],
    ['DATABASE_SERVICE_CONNECTOR_REGISTRY', DATABASE_SERVICE_CONNECTOR_REGISTRY],
    ['CONNECTION_REFERENCE_PROVIDER', CONNECTION_REFERENCE_PROVIDER],
    ['CONNECTION_EXECUTION_PROFILE_PROVIDER', CONNECTION_EXECUTION_PROFILE_PROVIDER],
    ['CDC_CONNECTION_PROFILE_REPOSITORY', CDC_CONNECTION_PROFILE_REPOSITORY],
    ['CDC_CONNECTION_PREFLIGHT', CDC_CONNECTION_PREFLIGHT],
    ['CDC_CONNECTION_USAGE_READER', CDC_CONNECTION_USAGE_READER],
    ['CDC_CONNECTION_RUNTIME_PROVIDER', CDC_CONNECTION_RUNTIME_PROVIDER],
  ])('resolves %s', (_label, token) => {
    expect(moduleRef.get(token, { strict: false })).toBeDefined();
  });

  it('resolves the use case', () => {
    expect(moduleRef.get(DatabaseServiceUseCases)).toBeInstanceOf(DatabaseServiceUseCases);
    expect(moduleRef.get(DatabaseServiceMembershipUseCases)).toBeInstanceOf(
      DatabaseServiceMembershipUseCases,
    );
    expect(moduleRef.get(CdcConnectionProfileUseCases)).toBeInstanceOf(
      CdcConnectionProfileUseCases,
    );
  });

  it('registers both production DBMS plugins and leaves MariaDB unsupported', () => {
    const registry = moduleRef.get<IDatabaseServiceConnectorRegistry>(
      DATABASE_SERVICE_CONNECTOR_REGISTRY,
      { strict: false },
    );

    expect(registry.require(ConnectorType.create('POSTGRESQL')).connectorType.value).toBe(
      'POSTGRESQL',
    );
    expect(registry.require(ConnectorType.create('MYSQL')).connectorType.value).toBe('MYSQL');
    expect(() => registry.require(ConnectorType.create('MARIADB'))).toThrow(
      'Database type MARIADB is not supported.',
    );
  });

  describe('the two adapters moved out of the application layer', () => {
    it('binds CONNECTION_REFERENCE_PROVIDER to something satisfying the port', () => {
      const provider = moduleRef.get<IConnectionReferenceProvider>(CONNECTION_REFERENCE_PROVIDER, {
        strict: false,
      });

      expect(typeof provider.requireActive).toBe('function');
    });

    it('binds CONNECTION_EXECUTION_PROFILE_PROVIDER to something satisfying the port', () => {
      const provider = moduleRef.get<IConnectionExecutionProfileProvider>(
        CONNECTION_EXECUTION_PROFILE_PROVIDER,
        { strict: false },
      );

      expect(typeof provider.resolveExecutionProfile).toBe('function');
    });

    it('injects their collaborators, so they are constructed not merely registered', () => {
      // A missing @Inject would have failed compilation of the module above, but
      // assert the instances exist rather than relying on that alone.
      expect(moduleRef.get(CONNECTION_REFERENCE_PROVIDER, { strict: false })).not.toBeUndefined();
      expect(
        moduleRef.get(CONNECTION_EXECUTION_PROFILE_PROVIDER, { strict: false }),
      ).not.toBeUndefined();
    });
  });
});

describe('ScriptAuthoringModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(ScriptAuthoringModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the use case', () => {
    expect(moduleRef.get(ScriptAuthoringUseCases, { strict: false })).toBeInstanceOf(
      ScriptAuthoringUseCases,
    );
  });

  it('resolves PUBLISHED_SCRIPT_PROVIDER', () => {
    const provider = moduleRef.get<IPublishedScriptProvider>(PUBLISHED_SCRIPT_PROVIDER, {
      strict: false,
    });

    expect(typeof provider.resolvePublishedVersion).toBe('function');
  });

  it('no longer binds PUBLISHED_SCRIPT_PROVIDER to the use case itself', () => {
    const provider = moduleRef.get<IPublishedScriptProvider>(PUBLISHED_SCRIPT_PROVIDER, {
      strict: false,
    });
    const useCases = moduleRef.get<ScriptAuthoringUseCases>(ScriptAuthoringUseCases, {
      strict: false,
    });

    expect(provider).not.toBe(useCases);
  });

  it('still re-exports the connection ports its consumers rely on', () => {
    expect(moduleRef.get(CONNECTION_REFERENCE_PROVIDER, { strict: false })).toBeDefined();
  });

  it('resolves the globally provided shared ports', () => {
    expect(moduleRef.get(UNIT_OF_WORK, { strict: false })).toBeDefined();
  });
});

describe('NodeCatalogModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(NodeCatalogModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the code-backed definition reader and use case', () => {
    expect(moduleRef.get(NODE_DEFINITION_READER, { strict: false })).toBeDefined();
    expect(moduleRef.get(NodeCatalogUseCases, { strict: false })).toBeInstanceOf(
      NodeCatalogUseCases,
    );
  });
});

describe('PipelineAuthoringModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(PipelineAuthoringModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves persistence, preview boundary, validator, and use cases', () => {
    expect(moduleRef.get(PIPELINE_REPOSITORY, { strict: false })).toBeDefined();
    expect(moduleRef.get(PIPELINE_NODE_PREVIEWER, { strict: false })).toBeDefined();
    expect(moduleRef.get(PipelineAuthoringUseCases, { strict: false })).toBeInstanceOf(
      PipelineAuthoringUseCases,
    );
    expect(moduleRef.get(PipelineGraphValidator, { strict: false })).toBeInstanceOf(
      PipelineGraphValidator,
    );
  });

  it('injects the node catalog into graph validation', () => {
    const validator = moduleRef.get(PipelineGraphValidator, { strict: false });
    expect(validator['nodeCatalog']).toBeInstanceOf(NodeCatalogUseCases);
  });
});

describe('ChartModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(ChartModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the repository and the use case', () => {
    expect(moduleRef.get(CHART_REPOSITORY, { strict: false })).toBeDefined();
    expect(moduleRef.get(ChartUseCases, { strict: false })).toBeInstanceOf(ChartUseCases);
  });

  it('resolves the MCP action catalog', () => {
    expect(moduleRef.get(CHART_ACTIONS, { strict: false })).toBeDefined();
  });

  it('resolves the pending-action use cases', () => {
    expect(moduleRef.get(PendingActionUseCases, { strict: false })).toBeInstanceOf(
      PendingActionUseCases,
    );
  });
});

describe('DashboardModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(DashboardModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves every Dashboard port, use case, and controller', () => {
    expect(moduleRef.get(DASHBOARD_REPOSITORY, { strict: false })).toBeDefined();
    expect(moduleRef.get(DASHBOARD_COLLECTION_AUTHORIZATION, { strict: false })).toBeDefined();
    expect(moduleRef.get(DASHBOARD_CHART_READER, { strict: false })).toBeDefined();
    expect(moduleRef.get(CreateDashboardUseCase, { strict: false })).toBeInstanceOf(
      CreateDashboardUseCase,
    );
    expect(moduleRef.get(GetDashboardUseCase, { strict: false })).toBeInstanceOf(
      GetDashboardUseCase,
    );
    expect(moduleRef.get(ListDashboardsUseCase, { strict: false })).toBeInstanceOf(
      ListDashboardsUseCase,
    );
    expect(moduleRef.get(SaveDashboardUseCase, { strict: false })).toBeInstanceOf(
      SaveDashboardUseCase,
    );
    expect(moduleRef.get(CopyDashboardUseCase, { strict: false })).toBeInstanceOf(
      CopyDashboardUseCase,
    );
    expect(moduleRef.get(ArchiveDashboardUseCase, { strict: false })).toBeInstanceOf(
      ArchiveDashboardUseCase,
    );
    expect(moduleRef.get(DashboardController, { strict: false })).toBeInstanceOf(
      DashboardController,
    );
  });
});

describe('DocumentModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(DocumentModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the repository and the use case', () => {
    expect(moduleRef.get(DOCUMENT_REPOSITORY, { strict: false })).toBeDefined();
    expect(moduleRef.get(DocumentUseCases, { strict: false })).toBeInstanceOf(DocumentUseCases);
  });

  it('resolves the MCP action catalog', () => {
    expect(moduleRef.get(DOCUMENT_ACTIONS, { strict: false })).toBeDefined();
  });
});

describe('CitationModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(CitationModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the chart-only citation use case', () => {
    expect(moduleRef.get(CitationUseCases, { strict: false })).toBeInstanceOf(CitationUseCases);
  });
});

describe('SecurityModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(SecurityModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the identity ports', () => {
    expect(moduleRef.get(IDENTITY_ACCESS_REPOSITORY, { strict: false })).toBeDefined();
    expect(moduleRef.get(IDENTITY_TOKEN_VERIFIER, { strict: false })).toBeDefined();
    expect(moduleRef.get(AUDIT_WRITER, { strict: false })).toBeDefined();
  });
});

describe('AdministrationModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(AdministrationModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the use case', () => {
    expect(moduleRef.get(AdministrationUseCases, { strict: false })).toBeInstanceOf(
      AdministrationUseCases,
    );
  });
});

describe('QueryWorkbenchModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(QueryWorkbenchModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the use case', () => {
    expect(moduleRef.get(QueryWorkbenchUseCases, { strict: false })).toBeInstanceOf(
      QueryWorkbenchUseCases,
    );
  });

  it("shares CatalogExplorationModule's column profile cache, not a second instance", () => {
    // If CatalogExplorationModule stopped exporting CATALOG_PROFILE_CACHE, this
    // module would fail to compile at all rather than silently fall back to
    // the use case's own EMPTY_COLUMN_PROFILE_CACHE default — but assert the
    // instance identity too, since a second real cache would compile fine and
    // still silently break "already profiled this session" sharing.
    const useCases = moduleRef.get(QueryWorkbenchUseCases, { strict: false });
    const cache = moduleRef.get(CATALOG_PROFILE_CACHE, { strict: false });
    expect(useCases['columnProfileCache']).toBe(cache);
  });
});

describe('RateLimitModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(RateLimitModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('registers the agent-aware throttler guard as an APP_GUARD', () => {
    expect(moduleRef.get(AgentWriteThrottlerGuard, { strict: false })).toBeInstanceOf(
      AgentWriteThrottlerGuard,
    );
  });
});

describe('ActionsModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(ActionsModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the pending-action use cases and the composite action resolver', () => {
    expect(moduleRef.get(PendingActionUseCases, { strict: false })).toBeInstanceOf(
      PendingActionUseCases,
    );
    expect(moduleRef.get(ACTION_RESOLVER, { strict: false })).toBeDefined();
  });

  it('the composite resolver resolves both a chart action and an automation-workflow action', () => {
    const resolver = moduleRef.get<IActionResolver>(ACTION_RESOLVER, { strict: false });

    expect(resolver.resolve('chart.delete')).toBeDefined();
    expect(resolver.resolve('automation-workflow.create')).toBeDefined();
  });
});

/**
 * A module can be perfectly wired and still be unreachable — see
 * `ChartModule`, which shipped fully tested but was never added to
 * `ApiAppModule.imports`, so none of its routes existed on the running
 * server. This doesn't instantiate the app (that needs every module's real
 * config); it just asserts the composition root actually lists the module,
 * which is the cheap, specific check that bug needed.
 */
describe('ApiAppModule composition', () => {
  it('registers retained modules and excludes retired public capabilities', () => {
    const imports = Reflect.getMetadata('imports', ApiAppModule) as readonly unknown[];

    expect(imports).toContain(ChartModule);
    expect(imports).not.toContain(DocumentModule);
    expect(imports).toContain(CitationModule);
    expect(imports).toContain(SecurityModule);
    expect(imports).toContain(AdministrationModule);
    expect(imports).toContain(RateLimitModule);
    expect(imports).toContain(DashboardModule);
    expect(imports).not.toContain(DataWorkflowModule);
    expect(imports).not.toContain(GoogleDriveConnectorModule);
  });
});

describe('DataWorkflowModule', () => {
  it('resolves the separate data workflow controllers without the automation module', async () => {
    const moduleRef = await compile(DataWorkflowModule);
    try {
      expect(moduleRef.get(DataWorkflowController, { strict: false })).toBeInstanceOf(
        DataWorkflowController,
      );
      expect(moduleRef.get(DataWorkflowRunController, { strict: false })).toBeInstanceOf(
        DataWorkflowRunController,
      );
    } finally {
      await moduleRef.close();
    }
  });

  it.each([TrinoMcpModule, PlantModelModule])(
    '%p imports the security providers required by its MCP controller',
    (mcpModule) => {
      const imports = Reflect.getMetadata('imports', mcpModule) as readonly unknown[];
      expect(imports).toContain(SecurityModule);
    },
  );
});

describe('MetadataCrawler composition', () => {
  it('registers both DBMS metadata source adapters in the shared registry', async () => {
    const moduleRef = await compile(MetadataCrawlerInfrastructureModule);
    try {
      const registry = moduleRef.get<IDatabaseMetadataSourceRegistry>(
        DATABASE_METADATA_SOURCE_REGISTRY,
        { strict: false },
      );
      expect(registry.list().map((factory) => factory.connectorType)).toEqual([
        'MYSQL',
        'POSTGRESQL',
      ]);
      expect(moduleRef.get(DATABASE_SERVICE_RUNTIME_PROVIDER, { strict: false })).toBeDefined();
      expect(moduleRef.get(SOURCE_METADATA_CATALOG_READER, { strict: false })).toBeDefined();
    } finally {
      await moduleRef.close();
    }
  });

  it('constructs the API and worker application services from the same infrastructure', async () => {
    const api = await compile(MetadataCrawlerModule);
    const worker = await compile(MetadataCrawlerWorkerModule);
    try {
      expect(api.get(MetadataCrawlerUseCases, { strict: false })).toBeInstanceOf(
        MetadataCrawlerUseCases,
      );
      expect(api.get(SourceMetadataQueryUseCases, { strict: false })).toBeInstanceOf(
        SourceMetadataQueryUseCases,
      );
      expect(worker.get(MetadataCrawlerWorkerService, { strict: false })).toBeInstanceOf(
        MetadataCrawlerWorkerService,
      );
    } finally {
      await api.close();
      await worker.close();
    }
  });
});

describe('AutomationWorkflowModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(AutomationWorkflowModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the workspace tree controller and room ownership resolver', () => {
    expect(moduleRef.get(WorkspaceTreeController, { strict: false })).toBeInstanceOf(
      WorkspaceTreeController,
    );
    expect(moduleRef.get(RoomOwnershipResolver, { strict: false })).toBeInstanceOf(
      RoomOwnershipResolver,
    );
    expect(moduleRef.get(AGENT_WORKSPACE_TREE_CLIENT, { strict: false })).toBeDefined();
  });
});

describe('SkillModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(SkillModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the agent-facing skill MCP controller', () => {
    expect(moduleRef.get(SkillMcpController, { strict: false })).toBeInstanceOf(SkillMcpController);
  });
});

describe('GoogleDriveConnectorModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await compile(GoogleDriveConnectorModule);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('wires the connector service, cloud file tools, and the Drive source', () => {
    expect(moduleRef.get(GoogleDriveConnectorService)).toBeInstanceOf(GoogleDriveConnectorService);
    expect(moduleRef.get(CloudFileMcpController)).toBeInstanceOf(CloudFileMcpController);
    expect(moduleRef.get(CloudFileUseCases)).toBeInstanceOf(CloudFileUseCases);
    expect(moduleRef.get(SpreadsheetUseCases)).toBeInstanceOf(SpreadsheetUseCases);
    const registry = moduleRef.get<ICloudFileSourceRegistry>(CLOUD_FILE_SOURCE_REGISTRY);
    expect(registry.providers()).toEqual(['google-drive']);
  });
});
