import 'reflect-metadata';

import { rm, writeFile } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { secretRedactor } from '@application/shared/secret-redactor';
import { WorkerAppModule } from './worker-app.module';

const WORKER_READY_FILE = '/tmp/celesnity-worker-ready';

async function bootstrap(): Promise<void> {
  await rm(WORKER_READY_FILE, { force: true });
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    bufferLogs: false,
  });
  const logger = new Logger('WorkerBootstrap');

  app.enableShutdownHooks();
  await writeFile(WORKER_READY_FILE, 'ready\n', { mode: 0o600 });
  logger.log('Celesnity execution worker is ready for bounded-context adapters');

  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });

  await rm(WORKER_READY_FILE, { force: true });
  await app.close();
}

bootstrap().catch((error: unknown) => {
  Logger.error(
    secretRedactor.safeErrorMessage(error),
    'Celesnity worker failed to start',
    'WorkerBootstrap',
  );
  process.exit(1);
});
