import 'reflect-metadata';

import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { DomainExceptionFilter } from '@presentation/http/domain-exception.filter';
import { createHttpRequestLoggingMiddleware } from '@presentation/http/http-request-logging.middleware';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';
import { requestValidationException } from '@presentation/http/request-validation.exception';
import type { HttpRequestMetrics } from '@application/observability/interfaces/i-operational-metrics';
import { OPERATIONAL_METRICS } from '@application/observability/tokens';
import { secretRedactor } from '@application/shared/secret-redactor';
import { ApiAppModule } from './api-app.module';
import { API_PREFIX } from './api-prefix';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(ApiAppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const sourceMaxBytes = config.getOrThrow<number>('SCRIPT_SOURCE_MAX_BYTES');
  app.useBodyParser('json', { limit: sourceMaxBytes * 6 + 65_536 });
  app.use(
    createHttpRequestLoggingMiddleware(undefined, app.get<HttpRequestMetrics>(OPERATIONAL_METRICS)),
  );

  app.enableShutdownHooks();
  // Every route is versioned except the bare health check, which is served at
  // /health so load balancers and container platforms do not have to encode the API
  // version in their probe configuration — bumping the prefix would otherwise take
  // every backend out of rotation at the same moment.
  //
  // The exclusion matches the path exactly, so /api/v1/health/live and
  // /api/v1/health/ready keep the prefix and stay where they were.
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  app.enableCors({
    origin: config
      .getOrThrow<string>('WEB_ORIGIN')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: requestValidationException,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  // One filter owns the whole error path: translate a domain error to a status,
  // then render it as problem+json.
  app.useGlobalFilters(new DomainExceptionFilter(new ProblemDetailsFilter()));

  const openApiConfig = new DocumentBuilder()
    .setTitle('Celesnity API')
    .setDescription('Control plane for connections, scripts, Spark executions, catalogs, and SQL.')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openApiConfig));

  const port = config.getOrThrow<number>('PORT');
  // Trusted-user PoC: bind to loopback by default (explicit localhost-only mode).
  // Override API_BIND_ADDRESS only in a deployment that adds its own authentication.
  const bindAddress = config.getOrThrow<string>('API_BIND_ADDRESS');
  await app.listen(port, bindAddress);
  Logger.log(`Celesnity API listening on ${bindAddress}:${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(
    secretRedactor.safeErrorMessage(error),
    'Celesnity API failed to start',
    'Bootstrap',
  );
  process.exitCode = 1;
});
