import { type ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';

import { toHttpException } from '@presentation/http/error-http.registry';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';

/**
 * The application's only global exception filter.
 *
 * Two collaborators, one concern each: {@link toHttpException} decides the status
 * and message, {@link ProblemDetailsFilter} renders the problem+json body. This
 * filter just connects them, which is why it holds no tables of its own.
 *
 * Catching everything rather than a list of error types is deliberate. It keeps
 * a single filter registered, so there is no dependence on the order Nest
 * resolves global filters in, and unmapped errors follow exactly the same path
 * they did before: through to the renderer, which answers a generic 500.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  public constructor(private readonly problemDetails: ProblemDetailsFilter) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    this.problemDetails.catch(this.asRenderable(exception), host);
  }

  /**
   * Exceptions raised by NestJS itself — including class-validator's 400s from
   * the global ValidationPipe — already carry a status and pass through
   * untouched. Only domain and port errors are translated.
   */
  private asRenderable(exception: unknown): unknown {
    if (exception instanceof HttpException) {
      return exception;
    }
    return toHttpException(exception) ?? exception;
  }
}
