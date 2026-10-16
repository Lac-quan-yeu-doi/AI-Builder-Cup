import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { secretRedactor } from '@application/shared/secret-redactor';
import { DeviceManagementWorkerAppModule } from './device-management-worker-app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DeviceManagementWorkerAppModule, {
    bufferLogs: false,
  });
  const logger = new Logger('DeviceManagementWorkerBootstrap');
  app.enableShutdownHooks();
  logger.log('Celesnity device-management worker is ready');
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await app.close();
}

bootstrap().catch((error: unknown) => {
  Logger.error(
    secretRedactor.safeErrorMessage(error),
    'Device-management worker failed to start',
    'DeviceManagementWorkerBootstrap',
  );
  process.exitCode = 1;
});
