import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { firstValueFrom, Observable } from 'rxjs';

import {
  AuthenticatedContextStore,
  type AuthenticatedContext,
} from '@application/administration/authenticated-context';
import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { AuditInterceptor } from '@presentation/http/audit.interceptor';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';

const principals: AuthenticatedContext[] = [
  {
    identityId: '10000000-0000-4000-8000-000000000001',
    subject: 'subject-1',
    identityTenantId: 'tenant-apple',
    mfaRequired: true,
    organizationId: '20000000-0000-4000-8000-000000000001',
    organizationStatus: 'ACTIVE',
    membershipId: '30000000-0000-4000-8000-000000000001',
    role: 'VIEWER',
    authenticationTime: 1,
    mfaVerified: true,
  },
  {
    identityId: '10000000-0000-4000-8000-000000000002',
    subject: 'subject-2',
    identityTenantId: 'tenant-microsoft',
    mfaRequired: true,
    organizationId: '20000000-0000-4000-8000-000000000002',
    organizationStatus: 'ACTIVE',
    membershipId: '30000000-0000-4000-8000-000000000002',
    role: 'VIEWER',
    authenticationTime: 1,
    mfaVerified: true,
  },
];

function execution(principal: AuthenticatedContext, requestId?: string): ExecutionContext {
  const request = {
    method: 'GET',
    path: '/api/v1/database-services',
    ip: '127.0.0.1',
    get: (header: string) => (header === 'X-Request-Id' ? requestId : undefined),
  } as unknown as Request;
  setAuthenticatedPrincipal(request, principal);
  return {
    getHandler: () => execution,
    switchToHttp: () => ({ getRequest: () => request }),
    getClass: () => class DatabaseServicesController {},
  } as unknown as ExecutionContext;
}

describe('AuditInterceptor authenticated request scope', () => {
  it('propagates the HTTP request ID into resource authorization context', async () => {
    const contexts = new AuthenticatedContextStore();
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new AuditInterceptor(
      contexts,
      audit,
      new ConfigService({ AUDIT_HASH_KEY: 'test-audit-key' }),
    );
    const handler: CallHandler = {
      handle: () =>
        new Observable<string>((subscriber) => {
          subscriber.next(contexts.require().requestId ?? 'missing');
          subscriber.complete();
        }),
    };

    await expect(
      firstValueFrom(interceptor.intercept(execution(principals[0]!, 'request-44'), handler)),
    ).resolves.toBe('request-44');
  });

  it('keeps concurrent organization contexts isolated through async controller work', async () => {
    const contexts = new AuthenticatedContextStore();
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const config = new ConfigService({
      AUDIT_HASH_KEY: 'test-audit-key',
      DEFAULT_ORGANIZATION_ID: '20000000-0000-4000-8000-000000000001',
    });
    const interceptor = new AuditInterceptor(contexts, audit, config);

    const invoke = async (principal: AuthenticatedContext, delay: number): Promise<string> => {
      const handler: CallHandler = {
        handle: () =>
          new Observable<string>((subscriber) => {
            setTimeout(() => {
              subscriber.next(contexts.require().organizationId);
              subscriber.complete();
            }, delay);
          }),
      };
      return (await firstValueFrom(interceptor.intercept(execution(principal), handler))) as string;
    };

    await expect(
      Promise.all([invoke(principals[0]!, 10), invoke(principals[1]!, 1)]),
    ).resolves.toEqual([principals[0]!.organizationId, principals[1]!.organizationId]);
  });

  it('passes the call through without auditing when no principal is set (dev-bypass/machine callers)', async () => {
    const contexts = new AuthenticatedContextStore();
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const config = new ConfigService({
      AUDIT_HASH_KEY: 'test-audit-key',
      DEFAULT_ORGANIZATION_ID: '20000000-0000-4000-8000-000000000001',
    });
    const interceptor = new AuditInterceptor(contexts, audit, config);

    const request = {
      method: 'GET',
      path: '/api/v1/charts',
      ip: '127.0.0.1',
      get: () => undefined,
    } as unknown as Request;
    const noPrincipalExecution = {
      getHandler: () => noPrincipalExecution,
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => class ChartController {},
    } as unknown as ExecutionContext;
    const handler: CallHandler = {
      handle: () => new Observable((s) => (s.next('ok'), s.complete())),
    };

    await expect(
      firstValueFrom(interceptor.intercept(noPrincipalExecution, handler)),
    ).resolves.toBe('ok');
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('does not invent an organization or service actor for an unbound machine route', async () => {
    const contexts = new AuthenticatedContextStore();
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const config = new ConfigService({
      AUDIT_HASH_KEY: 'test-audit-key',
      DEFAULT_ORGANIZATION_ID: '20000000-0000-4000-8000-000000000009',
    });
    const interceptor = new AuditInterceptor(contexts, audit, config);

    class MachineOnlyController {
      @MachineAuthenticated()
      public handle(): void {
        /* no-op: only the decorator metadata on this method matters */
      }
    }
    const request = {
      method: 'POST',
      path: '/trino-mcp/messages',
      ip: '127.0.0.1',
      get: () => undefined,
    } as unknown as Request;
    const execution = {
      getHandler: () => MachineOnlyController.prototype.handle,
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => MachineOnlyController,
    } as unknown as ExecutionContext;

    let seenOrganizationId: string | undefined;
    let seenRole: string | undefined;
    const handler: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          const current = contexts.current();
          seenOrganizationId = current?.organizationId;
          seenRole = current?.role;
          subscriber.next('ok');
          subscriber.complete();
        }),
    };

    await expect(firstValueFrom(interceptor.intercept(execution, handler))).resolves.toBe('ok');
    expect(seenOrganizationId).toBeUndefined();
    expect(seenRole).toBeUndefined();
    expect(audit.write).not.toHaveBeenCalled();
  });
});
