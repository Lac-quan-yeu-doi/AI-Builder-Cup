import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import type { IMqttStreamAdapterRepository } from '@application/streaming/interfaces/i-mqtt-stream-adapter.repository';
import type { IStreamingCredentialVault } from '@application/streaming/interfaces/i-streaming-credential-vault';
import type { IStreamingProvisioner } from '@application/streaming/interfaces/i-streaming-provisioner';
import type { IStreamingSecretGenerator } from '@application/streaming/interfaces/i-streaming-secret-generator';
import { StreamingAdapterUseCases } from '@application/streaming/streaming-adapter.use-cases';
import { StreamingReconcilerService } from '@application/streaming/streaming-reconciler.service';
import {
  MQTT_STREAM_ADAPTER_REPOSITORY,
  STREAMING_CREDENTIAL_VAULT,
  STREAMING_PROVISIONER,
  STREAMING_SECRET_GENERATOR,
} from '@application/streaming/tokens';
import { PrismaMqttStreamAdapterRepository } from '@infrastructure/prisma/streaming/prisma-mqtt-stream-adapter.repository';
import { PrismaCatalogNamespaceMetadataRepository } from '@infrastructure/prisma/catalog-exploration/prisma-catalog-namespace-metadata.repository';
import type { ICatalogNamespaceMetadataRepository } from '@application/catalog-exploration/interfaces/i-catalog-namespace-metadata.repository';
import { AesStreamingCredentialVault } from '@infrastructure/security/streaming/aes-streaming-credential-vault';
import { EmqxMqttPrincipalProvisioner } from '@infrastructure/streaming/emqx-mqtt-principal.provisioner';
import { RandomStreamingSecretGenerator } from '@infrastructure/system/random-streaming-secret-generator';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { StreamingController } from '@presentation/streaming/streaming.controller';

@Module({
  controllers: [StreamingController],
  providers: [
    PrismaMqttStreamAdapterRepository,
    PrismaCatalogNamespaceMetadataRepository,
    AesStreamingCredentialVault,
    EmqxMqttPrincipalProvisioner,
    RandomStreamingSecretGenerator,
    SystemClock,
    RandomUuidGenerator,
    { provide: MQTT_STREAM_ADAPTER_REPOSITORY, useExisting: PrismaMqttStreamAdapterRepository },
    { provide: STREAMING_CREDENTIAL_VAULT, useExisting: AesStreamingCredentialVault },
    { provide: STREAMING_PROVISIONER, useExisting: EmqxMqttPrincipalProvisioner },
    { provide: STREAMING_SECRET_GENERATOR, useExisting: RandomStreamingSecretGenerator },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: StreamingAdapterUseCases,
      inject: [
        MQTT_STREAM_ADAPTER_REPOSITORY,
        STREAMING_CREDENTIAL_VAULT,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        STREAMING_SECRET_GENERATOR,
        PrismaCatalogNamespaceMetadataRepository,
        ConfigService,
      ],
      useFactory: (
        repository: IMqttStreamAdapterRepository,
        credentials: IStreamingCredentialVault,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        ids: IIdGenerator,
        secrets: IStreamingSecretGenerator,
        namespaceMetadata: ICatalogNamespaceMetadataRepository,
        config: ConfigService,
      ): StreamingAdapterUseCases =>
        new StreamingAdapterUseCases(
          repository,
          credentials,
          unitOfWork,
          clock,
          ids,
          secrets,
          config.getOrThrow<string>('MQTT_PUBLIC_ENDPOINT'),
          namespaceMetadata,
          config.getOrThrow<string>('TRINO_CATALOG'),
        ),
    },
    {
      provide: StreamingReconcilerService,
      inject: [
        MQTT_STREAM_ADAPTER_REPOSITORY,
        STREAMING_CREDENTIAL_VAULT,
        STREAMING_PROVISIONER,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        repository: IMqttStreamAdapterRepository,
        credentials: IStreamingCredentialVault,
        provisioner: IStreamingProvisioner,
        clock: IClock,
        config: ConfigService,
      ): StreamingReconcilerService => {
        const logger = new Logger(StreamingReconcilerService.name);
        return new StreamingReconcilerService(
          repository,
          credentials,
          provisioner,
          clock,
          {
            info: (message, context): void => logger.log({ message, ...context }),
            error: (message, context): void => logger.error({ message, ...context }),
          },
          config.getOrThrow<number>('STREAMING_RECONCILE_BATCH_SIZE'),
        );
      },
    },
  ],
  exports: [StreamingReconcilerService],
})
export class StreamingModule {}
