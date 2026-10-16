import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IPlantModelRepository } from '@application/plant-model/interfaces/i-plant-model.repository';
import { PlantModelUseCases } from '@application/plant-model/plant-model.use-cases';
import { PlantCatalogLookupUseCases } from '@application/plant-model/plant-catalog-lookup.use-cases';
import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import { PLANT_MODEL_REPOSITORY } from '@application/plant-model/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import { PrismaPlantModelRepository } from '@infrastructure/prisma/plant-model/prisma-plant-model.repository';
import { SystemClock } from '@infrastructure/system/system-clock';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { PlantModelController } from '@presentation/plant-model/plant-model.controller';
import { CatalogExplorationModule } from '@modules/catalog-exploration.module';
import { PlantModelMcpController } from '@presentation/plant-model/plant-model-mcp.controller';
import {
  AGENT_ROOM_DELEGATION_REPOSITORY,
  type AgentRoomDelegationRepository,
} from '@application/administration/agent-room-delegation.repository';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { PrismaAgentRoomDelegationRepository } from '@infrastructure/prisma/administration/prisma-agent-room-delegation.repository';
import { SecurityModule } from '@modules/security.module';
import { AUDIT_WRITER, type AuditWriter } from '@application/administration/audit-writer';

@Module({
  imports: [SecurityModule, CatalogExplorationModule],
  controllers: [PlantModelController, PlantModelMcpController],
  providers: [
    PrismaPlantModelRepository,
    SystemClock,
    RandomUuidGenerator,
    { provide: PLANT_MODEL_REPOSITORY, useExisting: PrismaPlantModelRepository },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
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
      provide: PlantModelUseCases,
      inject: [
        PLANT_MODEL_REPOSITORY,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        AuthenticatedContextStore,
        PlantCatalogLookupUseCases,
      ],
      useFactory: (
        repository: IPlantModelRepository,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        ids: IIdGenerator,
        contexts: AuthenticatedContextStore,
        catalogLookups: PlantCatalogLookupUseCases,
      ): PlantModelUseCases =>
        new PlantModelUseCases(repository, unitOfWork, clock, ids, contexts, catalogLookups),
    },
    {
      provide: PlantCatalogLookupUseCases,
      inject: [CatalogExplorationUseCases, CLOCK],
      useFactory: (
        catalogs: CatalogExplorationUseCases,
        clock: IClock,
      ): PlantCatalogLookupUseCases => new PlantCatalogLookupUseCases(catalogs, clock),
    },
  ],
})
export class PlantModelModule {}
