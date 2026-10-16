import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from '@infrastructure/configuration/environment';
import { DatabaseModule } from '@modules/database.module';
import { DeviceManagementWorkerModule } from '@modules/device-management-worker.module';
import { StreamingWorkerModule } from '@modules/streaming-worker.module';

@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    StreamingWorkerModule,
    DeviceManagementWorkerModule,
  ],
})
export class DeviceManagementWorkerAppModule {}
