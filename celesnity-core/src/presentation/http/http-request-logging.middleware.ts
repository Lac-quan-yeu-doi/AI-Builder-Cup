import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { HttpRequestMetrics } from '@application/observability/interfaces/i-operational-metrics';
import { messageBlockHttpOutcome } from './message-block-http-outcome';

const NOOP_METRICS: HttpRequestMetrics = {
  requestStarted: (): void => undefined,
  requestCompleted: (): void => undefined,
};

const REQUEST_ID_HEADER = 'X-Request-Id';

interface RequestLogger {
  error(message: string): void;
  log(message: string): void;
  warn(message: string): void;
}

interface RequestLogEntry {
  readonly correlationId?: string;
  readonly durationMs?: number;
  readonly occurredAt?: string;
  readonly event: 'http_request_completed' | 'http_request_started';
  readonly method: string;
  readonly origin?: string;
  readonly path: string;
  readonly requestId: string;
  readonly status?: number;
  readonly responseStatus?: number;
  readonly outcome?: string;
}

export function createHttpRequestLoggingMiddleware(
  logger: RequestLogger = new Logger('HttpRequest'),
  metrics: HttpRequestMetrics = NOOP_METRICS,
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (
      request.path === '/health' ||
      request.path === '/metrics' ||
      request.path.startsWith('/api/v1/health/')
    ) {
      next();
      return;
    }

    const requestId = requestIdFrom(request.get(REQUEST_ID_HEADER));
    // Downstream guards, MCP tools and audit writers must use the same
    // normalized server-visible ID that is returned to the caller.
    request.headers['x-request-id'] = requestId;
    const startedAt = process.hrtime.bigint();
    const common = {
      ...(correlationIdFrom(request.get('X-Correlation-Id')) === undefined
        ? {}
        : { correlationId: correlationIdFrom(request.get('X-Correlation-Id')) }),
      method: request.method,
      origin: request.get('origin'),
      path: request.originalUrl.split('?', 1)[0] ?? request.path,
      requestId,
    };

    response.setHeader(REQUEST_ID_HEADER, requestId);
    logger.log(serialize({ event: 'http_request_started', ...common }));

    metrics.requestStarted();

    let completed = false;
    const recordCompletion = (statusCode: number): void => {
      if (completed) return;
      completed = true;

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      metrics.requestCompleted(
        {
          method: request.method,
          route: matchedRoute(request),
          statusCode: String(statusCode),
        },
        durationMs / 1_000,
      );
      const stream = messageBlockHttpOutcome(response);
      const clientDisconnected =
        stream &&
        statusCode === 499 &&
        (stream.reason === undefined || stream.reason === 'disconnect');
      const entry: RequestLogEntry = {
        event: 'http_request_completed',
        ...common,
        occurredAt: new Date().toISOString(),
        durationMs: Math.round(durationMs * 100) / 100,
        status: statusCode,
        ...(stream
          ? {
              responseStatus: response.statusCode,
              outcome:
                clientDisconnected || stream.reason === 'disconnect'
                  ? 'client_disconnected'
                  : (stream.reason ?? 'completed'),
            }
          : {}),
      };
      const message = serialize(entry);
      const streamFailure =
        stream && ['error', 'slow_consumer', 'oversized'].includes(stream.reason ?? '');

      if (statusCode === 499) {
        logger.log(message);
      } else if (statusCode >= 500) {
        logger.error(message);
      } else if (streamFailure || (statusCode >= 400 && !clientDisconnected)) {
        logger.warn(message);
      } else {
        logger.log(message);
      }
    };

    response.once('finish', () => recordCompletion(response.statusCode));
    response.once('close', () =>
      recordCompletion(response.writableEnded ? response.statusCode : 499),
    );

    next();
  };
}

function matchedRoute(request: Request): string {
  const route = request.route as { path?: unknown } | undefined;
  if (typeof route?.path !== 'string') {
    return 'unmatched';
  }

  return `${request.baseUrl}${route.path}`.replace(/\/+/gu, '/');
}

function requestIdFrom(value: string | undefined): string {
  return value !== undefined && /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : randomUUID();
}

function correlationIdFrom(value: string | undefined): string | undefined {
  return value !== undefined && /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : undefined;
}

function serialize(entry: RequestLogEntry): string {
  return JSON.stringify(entry);
}
