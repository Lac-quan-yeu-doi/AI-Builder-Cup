import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SecurityModule } from './security.module';
import { AUDIT_WRITER, type AuditWriter } from '@application/administration/audit-writer';
import { QueryWorkbenchModule } from './query-workbench.module';
import { ActionsModule } from './actions.module';
import { CatalogExplorationModule } from './catalog-exploration.module';

import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { CLOCK, ID_GENERATOR } from '@application/shared/tokens';
import type { IChartRealtimeHub } from '@application/chart/interfaces/i-chart-realtime-hub';
import type {
  ICanonicalChartRepository,
  IChartRepository,
} from '@application/chart/interfaces/i-chart.repository';
import type { ISqlQueryGateway } from '@application/query-workbench/interfaces/i-sql-query-gateway';
import {
  buildChartActions,
  CHART_ACTIONS,
  type ChartActions,
} from '@application/chart/chart.actions';
import { ChartUseCases } from '@application/chart/chart.use-cases';
import {
  CANONICAL_CHART_REPOSITORY,
  CHART_COLLECTION_REPOSITORY,
  CHART_REALTIME_HUB,
  CHART_REPOSITORY,
} from '@application/chart/tokens';
import type { ActionPolicyOverrides } from '@application/actions/action-policy';
import { ACTION_POLICY_OVERRIDES } from '@application/actions/tokens';
import { ChartRealtimeHub } from '@infrastructure/chart/chart-realtime.hub';
import { PrismaChartRepository } from '@infrastructure/prisma/chart/prisma-chart.repository';
import { ChartController } from '@presentation/chart/chart.controller';
import { ChartActionsCatalogController } from '@presentation/actions/chart-actions-catalog.controller';
import { ChartMutationGuard } from '@presentation/http/chart-mutation.guard';
import { ChartAgentAuthGuard } from '@presentation/http/chart-agent-auth.guard';
import { AgentWorkloadIdentityVerifier } from '@presentation/http/agent-workload-identity.verifier';
import { CanonicalChartController } from '@presentation/chart/canonical-chart.controller';
import { ChartAuthoringUseCases } from '@application/chart/chart-authoring.use-cases';
import { ChartRuntimeUseCases } from '@application/chart/chart-runtime.use-cases';
import { ChatChartCreationUseCases } from '@application/chart/chat-chart-creation.use-cases';
import { ChartQueryExecutor } from '@application/chart/chart-query.executor';
import { ChartRunRegistry } from '@application/chart/chart-run.registry';
import { VisualQueryCompiler } from '@application/chart/query/visual-query.compiler';
import { TrinoNativeChartQueryPolicy } from '@infrastructure/trino/chart/trino-native-chart-query.policy';
import { TrinoChartCatalogAdapter } from '@infrastructure/trino/chart/trino-chart-catalog.adapter';
import { PrismaChartCollectionRepository } from '@infrastructure/prisma/chart/prisma-chart-collection.repository';
import { CollectionAuthorizationService } from '@application/chart-collection/collection-authorization.service';
import { ChartCollectionUseCases } from '@application/chart-collection/chart-collection.use-cases';
import { ChartCollectionController } from '@presentation/chart-collection/chart-collection.controller';
import type { IChartCollectionRepository } from '@application/chart-collection/interfaces/i-chart-collection.repository';
import { AdministrationModule } from '@modules/administration.module';
import { AdministrationUseCases } from '@application/administration/administration.use-cases';
import { SQL_QUERY_GATEWAY } from '@application/query-workbench/tokens';
import { TrinoQueryTargetResolver } from '@infrastructure/trino/query-workbench/trino-query-target.resolver';
import { CanonicalChartAgentAuthGuard } from '@presentation/http/canonical-chart-agent-auth.guard';
import { ChartMcpController } from '@presentation/chart/chart-mcp.controller';
import {
  AGENT_ROOM_DELEGATION_REPOSITORY,
  type AgentRoomDelegationRepository,
} from '@application/administration/agent-room-delegation.repository';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { PrismaAgentRoomDelegationRepository } from '@infrastructure/prisma/administration/prisma-agent-room-delegation.repository';
import { CATALOG_READER } from '@application/catalog-exploration/tokens';
import type { ICatalogReader } from '@application/catalog-exploration/interfaces/i-catalog-reader';

@Module({
  imports: [
    SecurityModule,
    AdministrationModule,
    QueryWorkbenchModule,
    CatalogExplorationModule,
    forwardRef(() => ActionsModule),
  ],
  controllers: [
    ChartController,
    CanonicalChartController,
    ChartCollectionController,
    ChartActionsCatalogController,
    ChartMcpController,
  ],
  providers: [
    PrismaChartRepository,
    PrismaChartCollectionRepository,
    PrismaAgentRoomDelegationRepository,
    ChartRunRegistry,
    VisualQueryCompiler,
    TrinoNativeChartQueryPolicy,
    ChartRealtimeHub,
    ChartMutationGuard,
    ChartAgentAuthGuard,
    AgentWorkloadIdentityVerifier,
    CanonicalChartAgentAuthGuard,
    { provide: CHART_REPOSITORY, useExisting: PrismaChartRepository },
    { provide: CANONICAL_CHART_REPOSITORY, useExisting: PrismaChartRepository },
    { provide: CHART_COLLECTION_REPOSITORY, useExisting: PrismaChartCollectionRepository },
    {
      provide: AGENT_ROOM_DELEGATION_REPOSITORY,
      useExisting: PrismaAgentRoomDelegationRepository,
    },
    {
      provide: AgentRoomDelegationService,
      inject: [
        AGENT_ROOM_DELEGATION_REPOSITORY,
        AuthenticatedContextStore,
        AUDIT_WRITER,
        ConfigService,
      ],
      useFactory: (
        repository: AgentRoomDelegationRepository,
        contexts: AuthenticatedContextStore,
        audit: AuditWriter,
        config: ConfigService,
      ): AgentRoomDelegationService =>
        new AgentRoomDelegationService(
          repository,
          contexts,
          audit,
          config.getOrThrow<string>('TRINO_CATALOG'),
        ),
    },
    {
      provide: CollectionAuthorizationService,
      inject: [CHART_COLLECTION_REPOSITORY, AUDIT_WRITER, AuthenticatedContextStore],
      useFactory: (
        repository: IChartCollectionRepository,
        audit: AuditWriter,
        contexts: AuthenticatedContextStore,
      ): CollectionAuthorizationService =>
        new CollectionAuthorizationService(repository, audit, contexts),
    },
    {
      provide: TrinoChartCatalogAdapter,
      inject: [AdministrationUseCases, CATALOG_READER],
      useFactory: (
        authorizer: AdministrationUseCases,
        reader: ICatalogReader,
      ): TrinoChartCatalogAdapter => new TrinoChartCatalogAdapter(authorizer, reader),
    },
    { provide: CHART_REALTIME_HUB, useExisting: ChartRealtimeHub },
    {
      provide: ChartUseCases,
      inject: [CHART_REPOSITORY, CLOCK, ID_GENERATOR, CHART_REALTIME_HUB],
      useFactory: (
        repository: IChartRepository,
        clock: IClock,
        ids: IIdGenerator,
        realtime: IChartRealtimeHub,
      ): ChartUseCases => new ChartUseCases(repository, clock, ids, realtime),
    },
    {
      provide: ChartQueryExecutor,
      inject: [SQL_QUERY_GATEWAY, ConfigService],
      useFactory: (gateway: ISqlQueryGateway, config: ConfigService): ChartQueryExecutor =>
        new ChartQueryExecutor(gateway, config.getOrThrow<number>('CHART_QUERY_TIMEOUT_MS')),
    },
    {
      provide: ChartAuthoringUseCases,
      inject: [CANONICAL_CHART_REPOSITORY, ID_GENERATOR, CLOCK, CollectionAuthorizationService],
      useFactory: (
        repository: ICanonicalChartRepository,
        ids: IIdGenerator,
        clock: IClock,
        collections: CollectionAuthorizationService,
      ): ChartAuthoringUseCases => new ChartAuthoringUseCases(repository, ids, clock, collections),
    },
    {
      provide: ChartRuntimeUseCases,
      inject: [
        CANONICAL_CHART_REPOSITORY,
        VisualQueryCompiler,
        TrinoNativeChartQueryPolicy,
        TrinoQueryTargetResolver,
        TrinoChartCatalogAdapter,
        ChartQueryExecutor,
        ChartRunRegistry,
        ConfigService,
        CollectionAuthorizationService,
      ],
      useFactory: (
        repository: ICanonicalChartRepository,
        visualCompiler: VisualQueryCompiler,
        nativePolicy: TrinoNativeChartQueryPolicy,
        targetResolver: TrinoQueryTargetResolver,
        catalog: TrinoChartCatalogAdapter,
        executor: ChartQueryExecutor,
        registry: ChartRunRegistry,
        config: ConfigService,
        collections: CollectionAuthorizationService,
      ): ChartRuntimeUseCases =>
        new ChartRuntimeUseCases(
          repository,
          visualCompiler,
          nativePolicy,
          targetResolver,
          catalog,
          executor,
          registry,
          {
            maxRows: config.getOrThrow<number>('CHART_PREVIEW_MAX_ROWS'),
            maxBytes: config.getOrThrow<number>('CHART_PREVIEW_MAX_BYTES'),
          },
          {
            maxRows: config.getOrThrow<number>('CHART_RUN_MAX_ROWS'),
            maxBytes: config.getOrThrow<number>('CHART_RUN_MAX_BYTES'),
          },
          collections,
        ),
    },
    {
      provide: ChartCollectionUseCases,
      inject: [CHART_COLLECTION_REPOSITORY, CollectionAuthorizationService],
      useFactory: (
        repository: IChartCollectionRepository,
        authorization: CollectionAuthorizationService,
      ): ChartCollectionUseCases => new ChartCollectionUseCases(repository, authorization),
    },
    {
      provide: ChatChartCreationUseCases,
      inject: [ChartRuntimeUseCases, ChartAuthoringUseCases, ChartCollectionUseCases],
      useFactory: (
        runtime: ChartRuntimeUseCases,
        authoring: ChartAuthoringUseCases,
        collections: ChartCollectionUseCases,
      ): ChatChartCreationUseCases =>
        new ChatChartCreationUseCases(runtime, authoring, collections),
    },
    {
      provide: CHART_ACTIONS,
      inject: [ChartUseCases, ChartAuthoringUseCases, ACTION_POLICY_OVERRIDES],
      useFactory: (
        useCases: ChartUseCases,
        canonicalAuthoring: ChartAuthoringUseCases,
        policy: ActionPolicyOverrides,
      ): ChartActions => buildChartActions(useCases, canonicalAuthoring, policy),
    },
  ],
  exports: [
    ChartUseCases,
    CHART_ACTIONS,
    ChartAuthoringUseCases,
    ChartRuntimeUseCases,
    ChartCollectionUseCases,
    CANONICAL_CHART_REPOSITORY,
    CollectionAuthorizationService,
    TrinoChartCatalogAdapter,
  ],
})
export class ChartModule {}
