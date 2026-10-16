import { Module } from '@nestjs/common';

import { CANONICAL_CHART_REPOSITORY } from '@application/chart/tokens';
import type { ICanonicalChartRepository } from '@application/chart/interfaces/i-chart.repository';
import { CollectionAuthorizationService } from '@application/chart-collection/collection-authorization.service';
import { ArchiveDashboardUseCase } from '@application/dashboard/archive-dashboard.use-case';
import { CopyDashboardUseCase } from '@application/dashboard/copy-dashboard.use-case';
import { CreateDashboardUseCase } from '@application/dashboard/create-dashboard.use-case';
import { GetDashboardUseCase } from '@application/dashboard/get-dashboard.use-case';
import type { IDashboardCollectionAuthorizationReader } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardChartReader } from '@application/dashboard/interfaces/i-dashboard-chart.reader';
import type { IDashboardRepository } from '@application/dashboard/interfaces/i-dashboard.repository';
import { ListDashboardsUseCase } from '@application/dashboard/list-dashboards.use-case';
import { SaveDashboardUseCase } from '@application/dashboard/save-dashboard.use-case';
import { ExecuteDashboardUseCase } from '@application/dashboard/execute-dashboard.use-case';
import { ListDashboardFilterTargetsUseCase } from '@application/dashboard/list-dashboard-filter-targets.use-case';
import type { IDashboardCardExecutor } from '@application/dashboard/interfaces/i-dashboard-card-executor';
import type { IDashboardFilterTargetReader } from '@application/dashboard/interfaces/i-dashboard-filter-target.reader';
import {
  DASHBOARD_CHART_READER,
  DASHBOARD_COLLECTION_AUTHORIZATION,
  DASHBOARD_REPOSITORY,
  DASHBOARD_CARD_EXECUTOR,
  DASHBOARD_FILTER_TARGET_READER,
} from '@application/dashboard/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { DashboardChartReader } from '@infrastructure/dashboard/dashboard-chart.reader';
import { CanonicalChartDashboardCardExecutor } from '@infrastructure/dashboard/canonical-chart-dashboard-card.executor';
import { CanonicalChartFilterTargetReader } from '@infrastructure/dashboard/canonical-chart-filter-target.reader';
import { ChartRuntimeUseCases } from '@application/chart/chart-runtime.use-cases';
import { DashboardCollectionAuthorizationAdapter } from '@infrastructure/dashboard/dashboard-collection-authorization.adapter';
import { PrismaDashboardRepository } from '@infrastructure/prisma/dashboard/prisma-dashboard.repository';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { DashboardController } from '@presentation/dashboard/dashboard.controller';
import { ChartModule } from './chart.module';

@Module({
  imports: [ChartModule],
  controllers: [DashboardController],
  providers: [
    PrismaDashboardRepository,
    SystemClock,
    RandomUuidGenerator,
    { provide: DASHBOARD_REPOSITORY, useExisting: PrismaDashboardRepository },
    {
      provide: DASHBOARD_COLLECTION_AUTHORIZATION,
      inject: [CollectionAuthorizationService],
      useFactory: (
        authorization: CollectionAuthorizationService,
      ): DashboardCollectionAuthorizationAdapter =>
        new DashboardCollectionAuthorizationAdapter(authorization),
    },
    {
      provide: DASHBOARD_CHART_READER,
      inject: [CANONICAL_CHART_REPOSITORY, DASHBOARD_COLLECTION_AUTHORIZATION],
      useFactory: (
        charts: ICanonicalChartRepository,
        collections: IDashboardCollectionAuthorizationReader,
      ): DashboardChartReader => new DashboardChartReader(charts, collections),
    },
    {
      provide: DASHBOARD_CARD_EXECUTOR,
      inject: [
        CANONICAL_CHART_REPOSITORY,
        ChartRuntimeUseCases,
        DASHBOARD_COLLECTION_AUTHORIZATION,
      ],
      useFactory: (
        charts: ICanonicalChartRepository,
        runtime: ChartRuntimeUseCases,
        collections: IDashboardCollectionAuthorizationReader,
      ): CanonicalChartDashboardCardExecutor =>
        new CanonicalChartDashboardCardExecutor(charts, runtime, collections),
    },
    {
      provide: DASHBOARD_FILTER_TARGET_READER,
      inject: [CANONICAL_CHART_REPOSITORY, DASHBOARD_COLLECTION_AUTHORIZATION],
      useFactory: (
        charts: ICanonicalChartRepository,
        collections: IDashboardCollectionAuthorizationReader,
      ): CanonicalChartFilterTargetReader =>
        new CanonicalChartFilterTargetReader(charts, collections),
    },
    {
      provide: CreateDashboardUseCase,
      inject: [
        DASHBOARD_REPOSITORY,
        DASHBOARD_COLLECTION_AUTHORIZATION,
        RandomUuidGenerator,
        SystemClock,
      ],
      useFactory: (
        repository: IDashboardRepository,
        collections: IDashboardCollectionAuthorizationReader,
        ids: IIdGenerator,
        clock: IClock,
      ): CreateDashboardUseCase => new CreateDashboardUseCase(repository, collections, ids, clock),
    },
    {
      provide: GetDashboardUseCase,
      inject: [DASHBOARD_REPOSITORY, DASHBOARD_COLLECTION_AUTHORIZATION],
      useFactory: (
        repository: IDashboardRepository,
        collections: IDashboardCollectionAuthorizationReader,
      ): GetDashboardUseCase => new GetDashboardUseCase(repository, collections),
    },
    {
      provide: ListDashboardsUseCase,
      inject: [DASHBOARD_REPOSITORY, DASHBOARD_COLLECTION_AUTHORIZATION],
      useFactory: (
        repository: IDashboardRepository,
        collections: IDashboardCollectionAuthorizationReader,
      ): ListDashboardsUseCase => new ListDashboardsUseCase(repository, collections),
    },
    {
      provide: SaveDashboardUseCase,
      inject: [
        DASHBOARD_REPOSITORY,
        DASHBOARD_COLLECTION_AUTHORIZATION,
        DASHBOARD_CHART_READER,
        SystemClock,
      ],
      useFactory: (
        repository: IDashboardRepository,
        collections: IDashboardCollectionAuthorizationReader,
        charts: IDashboardChartReader,
        clock: IClock,
      ): SaveDashboardUseCase => new SaveDashboardUseCase(repository, collections, charts, clock),
    },
    {
      provide: CopyDashboardUseCase,
      inject: [
        DASHBOARD_REPOSITORY,
        DASHBOARD_COLLECTION_AUTHORIZATION,
        DASHBOARD_CHART_READER,
        RandomUuidGenerator,
        SystemClock,
      ],
      useFactory: (
        repository: IDashboardRepository,
        collections: IDashboardCollectionAuthorizationReader,
        charts: IDashboardChartReader,
        ids: IIdGenerator,
        clock: IClock,
      ): CopyDashboardUseCase =>
        new CopyDashboardUseCase(repository, collections, charts, ids, clock),
    },
    {
      provide: ArchiveDashboardUseCase,
      inject: [DASHBOARD_REPOSITORY, DASHBOARD_COLLECTION_AUTHORIZATION, SystemClock],
      useFactory: (
        repository: IDashboardRepository,
        collections: IDashboardCollectionAuthorizationReader,
        clock: IClock,
      ): ArchiveDashboardUseCase => new ArchiveDashboardUseCase(repository, collections, clock),
    },
    {
      provide: ExecuteDashboardUseCase,
      inject: [DASHBOARD_REPOSITORY, DASHBOARD_COLLECTION_AUTHORIZATION, DASHBOARD_CARD_EXECUTOR],
      useFactory: (
        repository: IDashboardRepository,
        collections: IDashboardCollectionAuthorizationReader,
        executor: IDashboardCardExecutor,
      ): ExecuteDashboardUseCase => new ExecuteDashboardUseCase(repository, collections, executor),
    },
    {
      provide: ListDashboardFilterTargetsUseCase,
      inject: [
        DASHBOARD_REPOSITORY,
        DASHBOARD_COLLECTION_AUTHORIZATION,
        DASHBOARD_FILTER_TARGET_READER,
      ],
      useFactory: (
        repository: IDashboardRepository,
        collections: IDashboardCollectionAuthorizationReader,
        reader: IDashboardFilterTargetReader,
      ): ListDashboardFilterTargetsUseCase =>
        new ListDashboardFilterTargetsUseCase(repository, collections, reader),
    },
  ],
})
export class DashboardModule {}
