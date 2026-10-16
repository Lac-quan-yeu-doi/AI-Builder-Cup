import { MessageBlockStreamAdmission } from '@presentation/message-block/message-block-stream.admission';
import { MessageBlockStreamLifecycle } from '@presentation/message-block/message-block-stream.lifecycle';
import { MessageBlockSseTransport } from '@presentation/message-block/message-block-sse.transport';
import { MessageBlockStreamWriter } from '@presentation/message-block/message-block-stream.writer';
import { ObservabilityModule } from './observability.module';
import { OPERATIONAL_METRICS } from '@application/observability/tokens';
import type { IOperationalMetrics } from '@application/observability/interfaces/i-operational-metrics';
import { Module } from '@nestjs/common';

import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { CLOCK, ID_GENERATOR } from '@application/shared/tokens';
import type { IMessageBlockRepository } from '@application/message-block/interfaces/i-message-block.repository';
import { MessageBlockUseCases } from '@application/message-block/message-block.use-cases';
import { MESSAGE_BLOCK_REPOSITORY } from '@application/message-block/tokens';
import { PrismaMessageBlockRepository } from '@infrastructure/prisma/message-block/prisma-message-block.repository';
import { SystemClock } from '@infrastructure/system/system-clock';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { MessageBlockController } from '@presentation/message-block/message-block.controller';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { AGENT_SERVICE_ACCESS_REPOSITORY } from '@application/administration/agent-service-access.repository';
import { PrismaAgentServiceAccessRepository } from '@infrastructure/prisma/administration/prisma-agent-service-access.repository';
import { AgentServiceGuard } from '@presentation/http/agent-service.guard';
import { SecurityModule } from './security.module';

@Module({
  imports: [SecurityModule, ObservabilityModule],
  controllers: [MessageBlockController],
  providers: [
    {
      provide: MessageBlockStreamAdmission,
      inject: [OPERATIONAL_METRICS],
      useFactory: (metrics: IOperationalMetrics): MessageBlockStreamAdmission =>
        new MessageBlockStreamAdmission(metrics),
    },
    MessageBlockSseTransport,
    {
      provide: MessageBlockStreamLifecycle,
      inject: [MessageBlockUseCases, MessageBlockStreamAdmission],
      useFactory: (
        useCases: MessageBlockUseCases,
        admission: MessageBlockStreamAdmission,
      ): MessageBlockStreamLifecycle => new MessageBlockStreamLifecycle(useCases, admission),
    },
    {
      provide: MessageBlockStreamWriter,
      inject: [MessageBlockStreamLifecycle, MessageBlockSseTransport],
      useFactory: (
        lifecycle: MessageBlockStreamLifecycle,
        transport: MessageBlockSseTransport,
      ): MessageBlockStreamWriter => new MessageBlockStreamWriter(lifecycle, transport),
    },
    PrismaMessageBlockRepository,
    SystemClock,
    RandomUuidGenerator,
    AgentServiceGuard,
    PrismaAgentServiceAccessRepository,
    {
      provide: AGENT_SERVICE_ACCESS_REPOSITORY,
      useExisting: PrismaAgentServiceAccessRepository,
    },
    { provide: MESSAGE_BLOCK_REPOSITORY, useExisting: PrismaMessageBlockRepository },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: MessageBlockUseCases,
      inject: [MESSAGE_BLOCK_REPOSITORY, CLOCK, ID_GENERATOR, AuthenticatedContextStore],
      useFactory: (
        repository: IMessageBlockRepository,
        clock: IClock,
        ids: IIdGenerator,
        contexts: AuthenticatedContextStore,
      ): MessageBlockUseCases => new MessageBlockUseCases(repository, clock, ids, contexts),
    },
  ],
})
export class MessageBlockModule {}
