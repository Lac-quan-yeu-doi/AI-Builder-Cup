import "reflect-metadata";
import { pathToFileURL } from "node:url";
import {
  BadRequestException,
  ValidationPipe,
  VersioningType,
  type DynamicModule,
  type INestApplication,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import {
  parseListenAddress,
  redactStartupError,
} from "@presentation/http/adapter.js";
import { RequestContextMiddleware } from "@presentation/http/common/request/request-context.middleware.js";
import { createOpenApiDocument } from "@presentation/http/openapi/document.js";

export async function createHttpApplication(
  module: typeof AppModule | DynamicModule = AppModule.register({
    environment: process.env,
    factories: {},
  }),
) {
  const app = await NestFactory.create(module, {
    rawBody: true,
    logger: ["error"],
  });
  return configureHttpApplication(app);
}

export function configureHttpApplication<T extends INestApplication>(
  app: T,
): T {
  app.enableShutdownHooks();
  const requestContextMiddleware = new RequestContextMiddleware();
  app.use(requestContextMiddleware.use.bind(requestContextMiddleware));
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors) => {
        const properties = new Set(errors.map((error) => error.property));
        if (properties.has("wait_ms"))
          return new BadRequestException({ error: "invalid_blocking_wait" });
        if (properties.has("tool_call_id"))
          return new BadRequestException({
            error: "invalid_client_tool_result",
          });
        if (properties.has("session_key") || properties.has("input"))
          return new BadRequestException({ error: "invalid_turn" });
        return new BadRequestException({ error: "request_validation_failed" });
      },
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableCors({
    origin: "*",
    methods: "GET, POST, PATCH, OPTIONS",
    allowedHeaders: [
      "content-type",
      "authorization",
      "x-caller-id",
      "last-event-id",
      "x-request-id",
    ],
    exposedHeaders: ["x-request-id"],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.setGlobalPrefix("api", {
    exclude: [
      "healthz",
      "livez",
      "readyz",
      "metrics",
      "stats",
      "api/v1/healthz",
      "api/v2/healthz",
      "api/v1/livez",
      "api/v1/readyz",
      "api/v1/metrics",
      "api/v1/stats",
    ],
  });
  SwaggerModule.setup("docs", app, () => createOpenApiDocument(app), {
    useGlobalPrefix: true,
    jsonDocumentUrl: "docs/openapi.json",
  });
  return app;
}

export async function bootstrapHttp(): Promise<void> {
  const address = parseListenAddress(process.env.MINDER_SERVE_ADDR);
  const app = await createHttpApplication();
  await app.listen(address.port, address.host);
  const boundPort = Number(new URL(await app.getUrl()).port) || address.port;
  process.stderr.write(
    `minder-serve listening on ${address.host}:${boundPort}\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  void bootstrapHttp().catch((error) => {
    process.stderr.write(
      `minder-serve failed to start: ${redactStartupError(error)}\n`,
    );
    process.exitCode = 1;
  });
}
