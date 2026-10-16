import { Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { UNIT_OF_WORK } from '@application/shared/tokens';
import { type IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { SqlExecutionController } from '@presentation/query-workbench/sql-execution.controller';
import { InMemoryQueryResultStore } from '@infrastructure/memory/query-workbench/in-memory-query-result.store';
import { PrismaSqlExecutionReader } from '@infrastructure/prisma/query-workbench/prisma-sql-execution.reader';
import { SqlExecutionMapper } from '@infrastructure/prisma/query-workbench/sql-execution.mapper';
import { SqlExecutionViewMapper } from '@infrastructure/prisma/query-workbench/sql-execution-view.mapper';
import { PrismaSqlExecutionRepository } from '@infrastructure/prisma/query-workbench/prisma-sql-execution.repository';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { TrinoSqlQueryGateway } from '@infrastructure/trino/query-workbench/trino-sql-query.gateway';
import { QueryExecutionRunner } from '@application/query-workbench/query-execution.runner';
import { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';
import { CLOCK } from '@application/shared/tokens';
import { type IClock } from '@application/shared/interfaces/i-clock';
import { ID_GENERATOR } from '@application/shared/tokens';
import { type IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { QUERY_RESULT_STORE } from '@application/query-workbench/tokens';
import { type IQueryResultStore } from '@application/query-workbench/interfaces/i-query-result-store';
import { SQL_EXECUTION_READER } from '@application/query-workbench/tokens';
import { type ISqlExecutionReader } from '@application/query-workbench/interfaces/i-sql-execution-reader';
import { SQL_EXECUTION_REPOSITORY } from '@application/query-workbench/tokens';
import { type ISqlExecutionRepository } from '@application/query-workbench/interfaces/i-sql-execution-repository';
import { SQL_QUERY_GATEWAY } from '@application/query-workbench/tokens';
import { type ISqlQueryGateway } from '@application/query-workbench/interfaces/i-sql-query-gateway';
import { QueryLimit } from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import { AdministrationModule } from '@modules/administration.module';
import { AdministrationUseCases } from '@application/administration/administration.use-cases';
import { TrinoQueryTargetResolver } from '@infrastructure/trino/query-workbench/trino-query-target.resolver';
import { TrinoQueryTargetMetadata } from '@infrastructure/trino/query-workbench/trino-query-target.metadata';
import { CatalogExplorationModule } from '@modules/catalog-exploration.module';
import { CATALOG_PROFILE_CACHE } from '@application/catalog-exploration/tokens';
import type { IColumnProfileCache } from '@application/catalog-exploration/interfaces/i-column-profile-cache';

/**
 * Composition root for the Query Workbench context.
 *
 * API-only: the whole lifecycle (submission, asynchronous paging, cancellation,
 * timeout, result caching) runs inside the API process. There is no separate
 * worker. The background {@link QueryExecutionRunner} is instantiated here and
 * driven on demand by the submit use case; it tears down in-flight queries on
 * application shutdown.
 */
@Module({
  imports: [AdministrationModule, CatalogExplorationModule],
  controllers: [SqlExecutionController],
  providers: [
    SqlExecutionMapper,
    SqlExecutionViewMapper,
    PrismaSqlExecutionRepository,
    PrismaSqlExecutionReader,
    TrinoSqlQueryGateway,
    TrinoQueryTargetResolver,
    TrinoQueryTargetMetadata,
    InMemoryQueryResultStore,
    SystemClock,
    RandomUuidGenerator,
    { provide: SQL_EXECUTION_REPOSITORY, useExisting: PrismaSqlExecutionRepository },
    { provide: SQL_EXECUTION_READER, useExisting: PrismaSqlExecutionReader },
    { provide: SQL_QUERY_GATEWAY, useExisting: TrinoSqlQueryGateway },
    { provide: QUERY_RESULT_STORE, useExisting: InMemoryQueryResultStore },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: QueryExecutionRunner,
      inject: [
        SQL_EXECUTION_REPOSITORY,
        SQL_QUERY_GATEWAY,
        QUERY_RESULT_STORE,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        repository: ISqlExecutionRepository,
        gateway: ISqlQueryGateway,
        resultStore: IQueryResultStore,
        clock: IClock,
        config: ConfigService,
      ): QueryExecutionRunner =>
        new QueryExecutionRunner(
          repository,
          gateway,
          resultStore,
          clock,
          positiveConfig(config.get<number | string>('SQL_QUERY_TIMEOUT_MS'), 60_000),
          QueryLimit.create(
            positiveConfig(config.get<number | string>('SQL_MAX_RESULT_ROWS'), 1_000),
          ).maxRows,
          new Logger(QueryExecutionRunner.name),
        ),
    },
    {
      provide: QueryWorkbenchUseCases,
      inject: [
        SQL_EXECUTION_REPOSITORY,
        SQL_EXECUTION_READER,
        QUERY_RESULT_STORE,
        QueryExecutionRunner,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        ConfigService,
        AdministrationUseCases,
        TrinoQueryTargetResolver,
        TrinoQueryTargetMetadata,
        CATALOG_PROFILE_CACHE,
      ],
      useFactory: (
        repository: ISqlExecutionRepository,
        reader: ISqlExecutionReader,
        resultStore: IQueryResultStore,
        runner: QueryExecutionRunner,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        idGenerator: IIdGenerator,
        config: ConfigService,
        authorizer: AdministrationUseCases,
        targets: TrinoQueryTargetResolver,
        metadata: TrinoQueryTargetMetadata,
        columnProfileCache: IColumnProfileCache,
      ): QueryWorkbenchUseCases =>
        new QueryWorkbenchUseCases(
          repository,
          reader,
          resultStore,
          runner,
          unitOfWork,
          clock,
          idGenerator,
          config.getOrThrow<string>('TRINO_CATALOG'),
          authorizer,
          targets,
          metadata,
          columnProfileCache,
        ),
    },
  ],
  exports: [
    QueryWorkbenchUseCases,
    SQL_QUERY_GATEWAY,
    TrinoSqlQueryGateway,
    TrinoQueryTargetResolver,
  ],
})
export class QueryWorkbenchModule implements OnApplicationShutdown {
  public constructor(private readonly runner: QueryExecutionRunner) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.runner.shutdown();
  }
}

function positiveConfig(value: number | string | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
