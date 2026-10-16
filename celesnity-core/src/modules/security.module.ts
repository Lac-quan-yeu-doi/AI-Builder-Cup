import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import {
  IDENTITY_TOKEN_VERIFIER,
  type IdentityTokenVerifier,
} from '@application/administration/identity-token.verifier';
import { IDENTITY_ACCESS_REPOSITORY } from '@application/administration/identity-access.repository';
import { AUDIT_WRITER } from '@application/administration/audit-writer';
import { FirebaseIdentityTokenVerifier } from '@infrastructure/identity/firebase-identity-token.verifier';
import { LocalDevelopmentIdentityTokenVerifier } from '@infrastructure/identity/local-development-identity-token.verifier';
import { PrismaIdentityAccessRepository } from '@infrastructure/prisma/administration/prisma-identity-access.repository';
import { AuthorizationGuard } from '@presentation/http/authorization.guard';
import { BearerAuthenticationGuard } from '@presentation/http/bearer-authentication.guard';
import { AuditInterceptor } from '@presentation/http/audit.interceptor';
import { PrismaAuditWriter } from '@infrastructure/prisma/administration/prisma-audit.writer';
import { McpSharedSecretGuard } from '@presentation/mcp/mcp-shared-secret.guard';
import { McpAuthenticationGuard } from '@presentation/mcp/mcp-authentication.guard';
import { AgentWorkloadIdentityVerifier } from '@presentation/http/agent-workload-identity.verifier';

@Module({
  providers: [
    { provide: IDENTITY_ACCESS_REPOSITORY, useClass: PrismaIdentityAccessRepository },
    { provide: AUDIT_WRITER, useClass: PrismaAuditWriter },
    {
      provide: IDENTITY_TOKEN_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IdentityTokenVerifier =>
        config.getOrThrow<string>('CELESNITY_AUTH_MODE') === 'local-development'
          ? new LocalDevelopmentIdentityTokenVerifier(config)
          : new FirebaseIdentityTokenVerifier(config),
    },
    // Registered as normal providers (not just via the APP_GUARD multi-token
    // below) so a route that opts out of the global guards with
    // `@MachineAuthenticated()` — because it's shared between human and
    // agent callers and needs to re-run human auth itself for the human
    // case — can inject and reuse the exact same guard instances. See
    // `ChartAgentAuthGuard`.
    BearerAuthenticationGuard,
    AuthorizationGuard,
    McpSharedSecretGuard,
    McpAuthenticationGuard,
    AgentWorkloadIdentityVerifier,
    { provide: APP_GUARD, useExisting: BearerAuthenticationGuard },
    { provide: APP_GUARD, useExisting: AuthorizationGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [
    AUDIT_WRITER,
    AgentWorkloadIdentityVerifier,
    BearerAuthenticationGuard,
    AuthorizationGuard,
    McpSharedSecretGuard,
    McpAuthenticationGuard,
  ],
})
export class SecurityModule {}
