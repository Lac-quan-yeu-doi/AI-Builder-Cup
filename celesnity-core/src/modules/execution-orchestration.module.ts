import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CONNECTION_REFERENCE_PROVIDER } from '@application/database-service/tokens';
import { type IConnectionReferenceProvider } from '@application/database-service/interfaces/i-connection-reference-provider';
import { ExecutionOrchestrationUseCases } from '@application/execution-orchestration/execution-orchestration.use-cases';
import { ExecutableWorkloadProvider } from '@application/execution-orchestration/executable-workload.provider';
import { PreparedExecutionRequestService } from '@application/execution-orchestration/prepared-execution-request.service';
import type { IExecutableWorkloadProvider } from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import { type IExecutionLogStore } from '@application/execution-orchestration/interfaces/i-execution-log-store';
import { type IExecutionReader } from '@application/execution-orchestration/interfaces/i-execution-reader';
import { type IExecutionRepository } from '@application/execution-orchestration/interfaces/i-execution-repository';
import {
  EXECUTION_LOG_STORE,
  EXECUTION_READER,
  EXECUTION_REPOSITORY,
  EXECUTABLE_WORKLOAD_PROVIDER,
} from '@application/execution-orchestration/tokens';
import { COMPILED_PIPELINE_PROVIDER } from '@application/pipeline-compilation/tokens';
import type { ICompiledPipelineProvider } from '@application/pipeline-compilation/interfaces/i-compiled-pipeline-provider';
import { PUBLISHED_SCRIPT_PROVIDER } from '@application/script-authoring/tokens';
import { type IPublishedScriptProvider } from '@application/script-authoring/interfaces/i-published-script-provider';
import { type IClock } from '@application/shared/interfaces/i-clock';
import { type IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { type IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { ScriptAuthoringModule } from '@modules/script-authoring.module';
import { PipelineCompilationModule } from '@modules/pipeline-compilation.module';
import { ExecutionController } from '@presentation/execution-orchestration/execution.controller';
import { ScriptExecutionController } from '@presentation/execution-orchestration/script-execution.controller';
import { PipelineExecutionController } from '@presentation/execution-orchestration/pipeline-execution.controller';
import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { MinioExecutionLogStore } from '@infrastructure/minio/execution-orchestration/minio-execution-log.store';
import { PrismaExecutionReader } from '@infrastructure/prisma/execution-orchestration/prisma-execution.reader';
import { ExecutionMapper } from '@infrastructure/prisma/execution-orchestration/execution.mapper';
import { PrismaExecutionRepository } from '@infrastructure/prisma/execution-orchestration/prisma-execution.repository';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';

@Module({
  imports: [ScriptAuthoringModule, PipelineCompilationModule, DatabaseServiceModule],
  controllers: [ScriptExecutionController, PipelineExecutionController, ExecutionController],
  providers: [
    ExecutionMapper,
    PrismaExecutionRepository,
    PrismaExecutionReader,
    MinioClientFactory,
    MinioExecutionLogStore,
    SystemClock,
    RandomUuidGenerator,
    { provide: EXECUTION_REPOSITORY, useExisting: PrismaExecutionRepository },
    { provide: EXECUTION_READER, useExisting: PrismaExecutionReader },
    { provide: EXECUTION_LOG_STORE, useExisting: MinioExecutionLogStore },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: EXECUTABLE_WORKLOAD_PROVIDER,
      inject: [PUBLISHED_SCRIPT_PROVIDER, COMPILED_PIPELINE_PROVIDER],
      useFactory: (
        scripts: IPublishedScriptProvider,
        pipelines: ICompiledPipelineProvider,
      ): IExecutableWorkloadProvider => new ExecutableWorkloadProvider(scripts, pipelines),
    },
    {
      provide: PreparedExecutionRequestService,
      inject: [
        EXECUTION_REPOSITORY,
        CONNECTION_REFERENCE_PROVIDER,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        ConfigService,
      ],
      useFactory: (
        repository: IExecutionRepository,
        connectionReferences: IConnectionReferenceProvider,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        idGenerator: IIdGenerator,
        config: ConfigService,
      ): PreparedExecutionRequestService =>
        new PreparedExecutionRequestService(
          repository,
          connectionReferences,
          unitOfWork,
          clock,
          idGenerator,
          config.getOrThrow<string>('MINIO_ARTIFACTS_BUCKET'),
          {
            driverMemory: config.getOrThrow<string>('SPARK_DRIVER_MEMORY'),
            executorMemory: config.getOrThrow<string>('SPARK_EXECUTOR_MEMORY'),
            executorCores: config.getOrThrow<number>('SPARK_EXECUTOR_CORES'),
            maxCores: config.getOrThrow<number>('SPARK_MAX_CORES'),
          },
        ),
    },
    {
      provide: ExecutionOrchestrationUseCases,
      inject: [
        EXECUTION_REPOSITORY,
        EXECUTION_READER,
        EXECUTION_LOG_STORE,
        EXECUTABLE_WORKLOAD_PROVIDER,
        PreparedExecutionRequestService,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        ConfigService,
      ],
      useFactory: (
        repository: IExecutionRepository,
        reader: IExecutionReader,
        logStore: IExecutionLogStore,
        workloads: IExecutableWorkloadProvider,
        requests: PreparedExecutionRequestService,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        idGenerator: IIdGenerator,
        config: ConfigService,
      ): ExecutionOrchestrationUseCases =>
        new ExecutionOrchestrationUseCases(
          repository,
          reader,
          logStore,
          workloads,
          requests,
          unitOfWork,
          clock,
          idGenerator,
          config.getOrThrow<string>('MINIO_ARTIFACTS_BUCKET'),
        ),
    },
  ],
  exports: [PreparedExecutionRequestService],
})
export class ExecutionOrchestrationModule {}
