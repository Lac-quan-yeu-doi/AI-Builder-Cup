import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AdministrationUseCases } from '@application/administration/administration.use-cases';
import { ADMINISTRATION_REPOSITORY } from '@application/administration/administration.repository';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { PrismaAdministrationRepository } from '@infrastructure/prisma/administration/prisma-administration.repository';
import { AdministrationController } from '@presentation/administration/administration.controller';
import { IDENTITY_ADMINISTRATION_SERVICE } from '@application/administration/identity-administration.service';
import { FirebaseIdentityAdministrationService } from '@infrastructure/identity/firebase-identity-administration.service';
import {
  AGENT_ROOM_DELEGATION_REPOSITORY,
  type AgentRoomDelegationRepository,
} from '@application/administration/agent-room-delegation.repository';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { PrismaAgentRoomDelegationRepository } from '@infrastructure/prisma/administration/prisma-agent-room-delegation.repository';
import {
  Ed25519MinderPrincipalAssertionIssuer,
  MINDER_PRINCIPAL_ASSERTION_ISSUER,
} from '@application/administration/minder-principal-assertion';
import { CLOCK } from '@application/shared/tokens';
import { SystemClock } from '@infrastructure/system/system-clock';
import { MinderPrincipalAssertionController } from '@presentation/administration/minder-principal-assertion.controller';
import { AgentRunScopeController } from '@presentation/administration/agent-run-scope.controller';
import { AUDIT_WRITER, type AuditWriter } from '@application/administration/audit-writer';
import { SecurityModule } from './security.module';
import { AgentManifestOrganizationInventory } from '@application/administration/agent-manifest-organizations';
import { PrismaAgentManifestOrganizationsRepository } from '@infrastructure/prisma/administration/prisma-agent-manifest-organizations.repository';
import { AgentManifestOrganizationsController } from '@presentation/administration/agent-manifest-organizations.controller';

@Module({
  imports: [SecurityModule],
  providers: [
    PrismaAgentManifestOrganizationsRepository,
    {
      provide: AgentManifestOrganizationInventory,
      inject: [PrismaAgentManifestOrganizationsRepository, AUDIT_WRITER],
      useFactory: (repository: PrismaAgentManifestOrganizationsRepository, audit: AuditWriter): AgentManifestOrganizationInventory => new AgentManifestOrganizationInventory(repository, audit),
    },
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
    {
      provide: MINDER_PRINCIPAL_ASSERTION_ISSUER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Ed25519MinderPrincipalAssertionIssuer =>
        new Ed25519MinderPrincipalAssertionIssuer(
          config.getOrThrow<string>('MINDER_ASSERTION_PRIVATE_KEY_PEM'),
          config.getOrThrow<string>('MINDER_ASSERTION_KEY_ID'),
          config.getOrThrow<number>('MINDER_ASSERTION_TTL_SECONDS'),
        ),
    },
    { provide: ADMINISTRATION_REPOSITORY, useClass: PrismaAdministrationRepository },
    PrismaAgentRoomDelegationRepository,
    {
      provide: AGENT_ROOM_DELEGATION_REPOSITORY,
      useExisting: PrismaAgentRoomDelegationRepository,
    },
    {
      provide: AgentRoomDelegationService,
      inject: [AGENT_ROOM_DELEGATION_REPOSITORY, AuthenticatedContextStore, AUDIT_WRITER, ConfigService],
      useFactory: (
        repository: AgentRoomDelegationRepository,
        contexts: AuthenticatedContextStore,
        audit: AuditWriter,
        config: ConfigService,
      ): AgentRoomDelegationService => new AgentRoomDelegationService(repository, contexts, audit, config.getOrThrow<string>('TRINO_CATALOG')),
    },
    {
      provide: IDENTITY_ADMINISTRATION_SERVICE,
      useClass: FirebaseIdentityAdministrationService,
    },
    {
      provide: AdministrationUseCases,
      inject: [
        ADMINISTRATION_REPOSITORY,
        AuthenticatedContextStore,
        IDENTITY_ADMINISTRATION_SERVICE,
        AUDIT_WRITER,
      ],
      useFactory: (
        repository: PrismaAdministrationRepository,
        contexts: AuthenticatedContextStore,
        identities: FirebaseIdentityAdministrationService,
        audit: AuditWriter,
      ): AdministrationUseCases => new AdministrationUseCases(repository, contexts, identities, audit),
    },
  ],
  controllers: [AdministrationController, MinderPrincipalAssertionController, AgentRunScopeController, AgentManifestOrganizationsController],
  exports: [
    AdministrationUseCases,
    AgentRoomDelegationService,
    MINDER_PRINCIPAL_ASSERTION_ISSUER,
  ],
})
export class AdministrationModule {}
