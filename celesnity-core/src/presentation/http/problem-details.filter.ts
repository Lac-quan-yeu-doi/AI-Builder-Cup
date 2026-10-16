import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { secretRedactor } from '@application/shared/secret-redactor';
import { ServiceIdentityAdminDeniedError } from '@application/administration/administration.use-cases';

const INTERNAL_SERVER_ERROR = 500;

interface ExceptionBody {
  readonly code?: string;
  readonly details?: unknown;
  readonly error?: string;
  readonly message?: string | string[];
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const status =
      exception instanceof ServiceIdentityAdminDeniedError
        ? 403
        : exception instanceof HttpException
          ? exception.getStatus()
          : INTERNAL_SERVER_ERROR;
    const exceptionBody =
      exception instanceof ServiceIdentityAdminDeniedError
        ? {
            code: 'SERVICE_IDENTITY_ADMIN_DENIED',
            message: 'Organization owner or admin with required MFA is needed.',
          }
        : exception instanceof HttpException
          ? exception.getResponse()
          : undefined;
    const body = this.asExceptionBody(exceptionBody);

    const message = this.detailFor(status, body, exceptionBody);
    const code = body?.code ?? this.defaultCode(status);
    const requestId = response.getHeader('X-Request-Id');
    const normalizedRequestId = typeof requestId === 'string' ? requestId : '';
    const timestamp = new Date().toISOString();

    const logEntry = JSON.stringify({
      event: 'http_exception',
      error: secretRedactor.safeErrorMessage(exception),
      method: request.method,
      path: secretRedactor.redact(request.originalUrl.split('?', 1)[0] ?? request.path),
      requestId: typeof requestId === 'string' ? requestId : undefined,
      status,
    });
    if (status >= INTERNAL_SERVER_ERROR) {
      this.logger.error(logEntry, this.safeStack(exception));
    } else {
      this.logger.warn(logEntry);
    }

    response
      .status(status)
      .type('application/json')
      .json({
        success: false,
        error: {
          code,
          message: secretRedactor.redact(message),
          details: body?.details ?? null,
        },
        meta: { requestId: normalizedRequestId, timestamp },
      });
  }

  private safeStack(exception: unknown): string | undefined {
    return exception instanceof Error && exception.stack !== undefined
      ? secretRedactor.redact(exception.stack)
      : undefined;
  }

  private asExceptionBody(value: unknown): ExceptionBody | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code : undefined;
    const details = record.details;
    const error = typeof record.error === 'string' ? record.error : undefined;
    const message = this.asMessage(record.message);

    return { code, details, error, message };
  }

  private asMessage(value: unknown): string | string[] | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value;
    }

    return undefined;
  }

  private detailFor(status: number, body: ExceptionBody | undefined, rawBody: unknown): string {
    if (status === INTERNAL_SERVER_ERROR) {
      return 'An unexpected error occurred.';
    }

    if (Array.isArray(body?.message)) {
      return body.message.join('; ');
    }

    if (typeof body?.message === 'string') {
      return body.message;
    }

    if (typeof rawBody === 'string') {
      return rawBody;
    }

    return 'The request could not be completed.';
  }

  private defaultCode(status: number): string {
    const codes: Readonly<Record<number, string>> = {
      400: 'INVALID_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'PERMISSION_DENIED',
      404: 'RESOURCE_NOT_FOUND',
      409: 'RESOURCE_ALREADY_EXISTS',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_ERROR',
      502: 'UPSTREAM_ERROR',
      503: 'SERVICE_UNAVAILABLE',
      504: 'UPSTREAM_TIMEOUT',
    };
    return codes[status] ?? 'REQUEST_FAILED';
  }
}
