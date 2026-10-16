import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ApiAppModule } from './api-app.module';
import { API_PREFIX } from './api-prefix';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(ApiAppModule, { logger: false });
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  const configuration = new DocumentBuilder()
    .setTitle('Celesnity API')
    .setDescription('Control plane for data engineering and MQTT streaming.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, configuration);
  process.stdout.write(JSON.stringify(document));
  await app.close();
}

void exportOpenApi();
