import { createHmac } from 'node:crypto';

import {
  Injectable,
  Inject,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Observable, catchError, concatMap, from, map, throwError } from 'rxjs';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { AUDIT_WRITER, type AuditWriter } from '@application/administration/audit-writer';
import { tryAuthenticatedPrincipal } from './authenticated-request';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly hashKey: string;

  public constructor(
    private readonly contexts: AuthenticatedContextStore,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    config: ConfigService,
  ) {
    this.hashKey = config.getOrThrow<string>('AUDIT_HASH_KEY');
  }

  public intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = execution.switchToHttp().getRequest<Request>();
    if (request.path === '/health' || request.path.startsWith('/api/v1/health/'))
      return next.handle();
    const principal = tryAuthenticatedPrincipal(request);
    if (principal === undefined) {
      // A workload token alone has no organization. Delegated tools install a
      // persisted human/service context after validating their room or run;
      // never attach a default-organization synthetic actor here.
      return next.handle();
    }
    const startedAt = Date.now();
    const record = (outcome: 'SUCCEEDED' | 'FAILED'): Promise<void> =>
      this.audit.write({
        organizationId: principal.organizationId,
        actorIdentityId: principal.identityId,
        sessionId: principal.sessionId,
        requestId: request.get('X-Request-Id'),
        eventType: request.method === 'GET' ? 'DATA_ACCESS' : 'CONFIGURATION_CHANGE',
        action: `${request.method} ${request.path}`.slice(0, 160),
        resourceType: execution.getClass().name,
        outcome,
        ipAddressHash:
          request.ip === undefined
            ? undefined
            : createHmac('sha256', this.hashKey).update(request.ip).digest('hex'),
        userAgent: request.get('user-agent')?.slice(0, 512),
        metadata: { durationMs: Date.now() - startedAt },
      });
    return new Observable((subscriber) =>
      this.contexts.run({ ...principal, requestId: request.get('X-Request-Id') }, () =>
        next
          .handle()
          .pipe(
            concatMap((value: unknown) => from(record('SUCCEEDED')).pipe(map(() => value))),
            catchError((error: unknown) => {
              return from(record('FAILED')).pipe(concatMap(() => throwError(() => error)));
            }),
          )
          .subscribe(subscriber),
      ),
    );
  }
}
