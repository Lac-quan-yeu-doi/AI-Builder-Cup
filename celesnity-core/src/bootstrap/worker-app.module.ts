import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseServiceModule } from '@modules/database-service.module';
import { ExecutionWorkerModule } from '@modules/execution-worker.module';
import { ScriptAuthoringModule } from '@modules/script-authoring.module';
import { validateEnvironment } from '@infrastructure/configuration/environment';
import { DatabaseModule } from '@modules/database.module';
import { StreamingWorkerModule } from '@modules/streaming-worker.module';
import { MetadataCrawlerWorkerModule } from '@modules/metadata-crawler-worker.module';
import { AutomationWorkerModule } from '@modules/automation-worker.module';
import { DeviceManagementWorkerModule } from '@modules/device-management-worker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    DatabaseServiceModule,
    ScriptAuthoringModule,
    ExecutionWorkerModule,
    StreamingWorkerModule,
    MetadataCrawlerWorkerModule,
    AutomationWorkerModule,
    DeviceManagementWorkerModule,
  ],
})
export class WorkerAppModule {}
