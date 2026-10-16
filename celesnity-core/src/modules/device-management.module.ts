import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { DeviceLogUseCases } from '@application/device-management/device-log.use-cases';
import type { IDeviceCredentialVault } from '@application/device-management/interfaces/i-device-credential-vault';
import type { IDeviceLogRepository } from '@application/device-management/interfaces/i-device-log.repository';
import type { IDevicePrincipalProvisioner } from '@application/device-management/interfaces/i-device-principal-provisioner';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IFirmwareCommandPublisher } from '@application/device-management/interfaces/i-firmware-command-publisher';
import type { IFirmwareArtifactStore } from '@application/device-management/interfaces/i-firmware-artifact-store';
import type { IFirmwareSigner } from '@application/device-management/interfaces/i-firmware-signer';
import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import type { IFirmwareCampaignRepository } from '@application/device-management/interfaces/i-firmware-campaign.repository';
import { DeviceReconcilerService } from '@application/device-management/device-reconciler.service';
import { DeviceContactMonitorService } from '@application/device-management/device-contact-monitor.service';
import { DeviceUseCases } from '@application/device-management/device.use-cases';
import { DeviceConfigurationUseCases } from '@application/device-management/device-configuration.use-cases';
import { DeviceConfigurationMonitorService } from '@application/device-management/device-configuration-monitor.service';
import type { IDeviceConfigurationCommandPublisher } from '@application/device-management/interfaces/i-device-configuration-command-publisher';
import type { IDeviceConfigurationRepository } from '@application/device-management/interfaces/i-device-configuration.repository';
import { FirmwareUseCases } from '@application/device-management/firmware.use-cases';
import { FirmwareCampaignUseCases } from '@application/device-management/firmware-campaign.use-cases';
import { FirmwareConfirmationMonitorService } from '@application/device-management/firmware-confirmation-monitor.service';
import {
  DEVICE_CREDENTIAL_VAULT,
  DEVICE_CONFIGURATION_COMMAND_PUBLISHER,
  DEVICE_CONFIGURATION_REPOSITORY,
  DEVICE_LOG_REPOSITORY,
  DEVICE_PRINCIPAL_PROVISIONER,
  DEVICE_REPOSITORY,
  FIRMWARE_COMMAND_PUBLISHER,
  FIRMWARE_CAMPAIGN_REPOSITORY,
  FIRMWARE_ARTIFACT_STORE,
  FIRMWARE_SIGNER,
  FIRMWARE_REPOSITORY,
} from '@application/device-management/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import type { IStreamingSecretGenerator } from '@application/streaming/interfaces/i-streaming-secret-generator';
import { EmqxDevicePrincipalProvisioner } from '@infrastructure/device-management/emqx-device-principal.provisioner';
import { EmqxDeviceConfigurationCommandPublisher } from '@infrastructure/device-management/emqx-device-configuration-command.publisher';
import { EmqxFirmwareCommandPublisher } from '@infrastructure/device-management/emqx-firmware-command.publisher';
import { ObjectStorageFirmwareArtifactStore } from '@infrastructure/device-management/object-storage-firmware-artifact.store';
import { CelesnityFirmwareSigner } from '@infrastructure/device-management/celesnity-firmware.signer';
import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { PrismaDeviceRepository } from '@infrastructure/prisma/device-management/prisma-device.repository';
import { PrismaDeviceLogRepository } from '@infrastructure/prisma/device-management/prisma-device-log.repository';
import { PrismaDeviceConfigurationRepository } from '@infrastructure/prisma/device-management/prisma-device-configuration.repository';
import { PrismaFirmwareRepository } from '@infrastructure/prisma/device-management/prisma-firmware.repository';
import { AesDeviceCredentialVault } from '@infrastructure/security/device-management/aes-device-credential-vault';
import { RandomStreamingSecretGenerator } from '@infrastructure/system/random-streaming-secret-generator';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { DeviceController } from '@presentation/device-management/device.controller';
import { DeviceConfigurationController } from '@presentation/device-management/device-configuration.controller';
import { DeviceConfigurationEventTokenGuard } from '@presentation/device-management/device-configuration-event-token.guard';
import { DeviceHealthController } from '@presentation/device-management/device-health.controller';
import { DeviceLogController } from '@presentation/device-management/device-log.controller';
import { DeviceHeartbeatGuard } from '@presentation/device-management/device-heartbeat.guard';
import { FirmwareController } from '@presentation/device-management/firmware.controller';
import { FirmwareCampaignController } from '@presentation/device-management/firmware-campaign.controller';
import { FirmwareEventTokenGuard } from '@presentation/device-management/firmware-event-token.guard';

const DEVICE_SECRET_GENERATOR = Symbol('DEVICE_SECRET_GENERATOR');

@Module({
  controllers: [
    DeviceController,
    DeviceConfigurationController,
    DeviceHealthController,
    DeviceLogController,
    FirmwareController,
    FirmwareCampaignController,
  ],
  providers: [
    PrismaDeviceRepository,
    PrismaDeviceLogRepository,
    PrismaDeviceConfigurationRepository,
    PrismaFirmwareRepository,
    AesDeviceCredentialVault,
    EmqxDevicePrincipalProvisioner,
    EmqxDeviceConfigurationCommandPublisher,
    EmqxFirmwareCommandPublisher,
    MinioClientFactory,
    ObjectStorageFirmwareArtifactStore,
    CelesnityFirmwareSigner,
    RandomStreamingSecretGenerator,
    SystemClock,
    RandomUuidGenerator,
    FirmwareEventTokenGuard,
    DeviceConfigurationEventTokenGuard,
    {
      provide: FirmwareConfirmationMonitorService,
      inject: [FIRMWARE_REPOSITORY, CLOCK, AuthenticatedContextStore, ConfigService],
      useFactory: (
        repository: IFirmwareRepository,
        clock: IClock,
        contexts: AuthenticatedContextStore,
        config: ConfigService,
      ): FirmwareConfirmationMonitorService => {
        const logger = new Logger(FirmwareConfirmationMonitorService.name);
        return new FirmwareConfirmationMonitorService(
          repository,
          clock,
          contexts,
          {
            info: (message, context): void => logger.log({ message, ...context }),
            error: (message, context): void => logger.error({ message, ...context }),
          },
          config.getOrThrow<number>('FIRMWARE_BOOT_CONFIRMATION_TIMEOUT_SECONDS'),
          config.getOrThrow<number>('FIRMWARE_CONFIRMATION_MONITOR_BATCH_SIZE'),
        );
      },
    },
    {
      provide: DeviceConfigurationMonitorService,
      inject: [
        DEVICE_CONFIGURATION_REPOSITORY,
        DEVICE_REPOSITORY,
        DEVICE_CONFIGURATION_COMMAND_PUBLISHER,
        UNIT_OF_WORK,
        CLOCK,
        AuthenticatedContextStore,
        ConfigService,
      ],
      useFactory: (
        configurations: IDeviceConfigurationRepository,
        devices: IDeviceRepository,
        publisher: IDeviceConfigurationCommandPublisher,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        contexts: AuthenticatedContextStore,
        config: ConfigService,
      ): DeviceConfigurationMonitorService => {
        const logger = new Logger(DeviceConfigurationMonitorService.name);
        return new DeviceConfigurationMonitorService(
          configurations,
          devices,
          publisher,
          unitOfWork,
          clock,
          contexts,
          {
            info: (message, context): void => logger.log({ message, ...context }),
            error: (message, context): void => logger.error({ message, ...context }),
          },
          config.getOrThrow<number>('DEVICE_CONFIGURATION_CONFIRMATION_TIMEOUT_SECONDS'),
          config.getOrThrow<number>('DEVICE_CONFIGURATION_MONITOR_BATCH_SIZE'),
        );
      },
    },
    DeviceHeartbeatGuard,
    { provide: DEVICE_REPOSITORY, useExisting: PrismaDeviceRepository },
    { provide: DEVICE_LOG_REPOSITORY, useExisting: PrismaDeviceLogRepository },
    {
      provide: DEVICE_CONFIGURATION_REPOSITORY,
      useExisting: PrismaDeviceConfigurationRepository,
    },
    {
      provide: DEVICE_CONFIGURATION_COMMAND_PUBLISHER,
      useExisting: EmqxDeviceConfigurationCommandPublisher,
    },
    { provide: FIRMWARE_REPOSITORY, useExisting: PrismaFirmwareRepository },
    { provide: FIRMWARE_CAMPAIGN_REPOSITORY, useExisting: PrismaFirmwareRepository },
    { provide: FIRMWARE_COMMAND_PUBLISHER, useExisting: EmqxFirmwareCommandPublisher },
    { provide: FIRMWARE_ARTIFACT_STORE, useExisting: ObjectStorageFirmwareArtifactStore },
    { provide: FIRMWARE_SIGNER, useExisting: CelesnityFirmwareSigner },
    { provide: DEVICE_CREDENTIAL_VAULT, useExisting: AesDeviceCredentialVault },
    { provide: DEVICE_PRINCIPAL_PROVISIONER, useExisting: EmqxDevicePrincipalProvisioner },
    { provide: DEVICE_SECRET_GENERATOR, useExisting: RandomStreamingSecretGenerator },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: DeviceLogUseCases,
      inject: [
        DEVICE_LOG_REPOSITORY,
        DEVICE_REPOSITORY,
        CLOCK,
        ID_GENERATOR,
        AuthenticatedContextStore,
      ],
      useFactory: (
        logs: IDeviceLogRepository,
        devices: IDeviceRepository,
        clock: IClock,
        ids: IIdGenerator,
        contexts: AuthenticatedContextStore,
      ): DeviceLogUseCases => new DeviceLogUseCases(logs, devices, clock, ids, contexts),
    },
    {
      provide: DeviceUseCases,
      inject: [
        DEVICE_REPOSITORY,
        DEVICE_CREDENTIAL_VAULT,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        DEVICE_SECRET_GENERATOR,
        AuthenticatedContextStore,
        ConfigService,
        FIRMWARE_REPOSITORY,
        DEVICE_CONFIGURATION_REPOSITORY,
      ],
      useFactory: (
        repository: IDeviceRepository,
        credentials: IDeviceCredentialVault,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        ids: IIdGenerator,
        secrets: IStreamingSecretGenerator,
        contexts: AuthenticatedContextStore,
        config: ConfigService,
        firmware: IFirmwareRepository,
        configurations: IDeviceConfigurationRepository,
      ): DeviceUseCases =>
        new DeviceUseCases(
          repository,
          credentials,
          unitOfWork,
          clock,
          ids,
          secrets,
          contexts,
          firmware,
          configurations,
          config.getOrThrow<number>('DEVICE_EXPECTED_CHECK_IN_INTERVAL_SECONDS'),
          config.getOrThrow<number>('DEVICE_MISSED_CHECK_IN_THRESHOLD'),
        ),
    },
    {
      provide: DeviceConfigurationUseCases,
      inject: [
        DEVICE_CONFIGURATION_REPOSITORY,
        DEVICE_REPOSITORY,
        DEVICE_CONFIGURATION_COMMAND_PUBLISHER,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        DEVICE_SECRET_GENERATOR,
        AuthenticatedContextStore,
      ],
      useFactory: (
        repository: IDeviceConfigurationRepository,
        devices: IDeviceRepository,
        publisher: IDeviceConfigurationCommandPublisher,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        ids: IIdGenerator,
        secrets: IStreamingSecretGenerator,
        contexts: AuthenticatedContextStore,
      ): DeviceConfigurationUseCases =>
        new DeviceConfigurationUseCases(
          repository,
          devices,
          publisher,
          unitOfWork,
          clock,
          ids,
          secrets,
          contexts,
        ),
    },
    {
      provide: FirmwareUseCases,
      inject: [
        FIRMWARE_REPOSITORY,
        DEVICE_REPOSITORY,
        FIRMWARE_COMMAND_PUBLISHER,
        FIRMWARE_ARTIFACT_STORE,
        FIRMWARE_SIGNER,
        CLOCK,
        ID_GENERATOR,
        DEVICE_SECRET_GENERATOR,
        AuthenticatedContextStore,
        ConfigService,
      ],
      useFactory: (
        repository: IFirmwareRepository,
        devices: IDeviceRepository,
        publisher: IFirmwareCommandPublisher,
        artifacts: IFirmwareArtifactStore,
        signer: IFirmwareSigner,
        clock: IClock,
        ids: IIdGenerator,
        secrets: IStreamingSecretGenerator,
        contexts: AuthenticatedContextStore,
        config: ConfigService,
      ): FirmwareUseCases =>
        new FirmwareUseCases(
          repository,
          devices,
          publisher,
          artifacts,
          signer,
          clock,
          ids,
          secrets,
          contexts,
          config.getOrThrow<number>('FIRMWARE_BOOT_CONFIRMATION_TIMEOUT_SECONDS'),
        ),
    },
    {
      provide: FirmwareCampaignUseCases,
      inject: [
        FIRMWARE_CAMPAIGN_REPOSITORY,
        FIRMWARE_REPOSITORY,
        DEVICE_REPOSITORY,
        FIRMWARE_COMMAND_PUBLISHER,
        FIRMWARE_ARTIFACT_STORE,
        CLOCK,
        ID_GENERATOR,
        DEVICE_SECRET_GENERATOR,
        AuthenticatedContextStore,
        ConfigService,
      ],
      useFactory: (
        campaigns: IFirmwareCampaignRepository,
        repository: IFirmwareRepository,
        devices: IDeviceRepository,
        publisher: IFirmwareCommandPublisher,
        artifacts: IFirmwareArtifactStore,
        clock: IClock,
        ids: IIdGenerator,
        secrets: IStreamingSecretGenerator,
        contexts: AuthenticatedContextStore,
        config: ConfigService,
      ): FirmwareCampaignUseCases =>
        new FirmwareCampaignUseCases(
          campaigns,
          repository,
          devices,
          publisher,
          artifacts,
          clock,
          ids,
          secrets,
          contexts,
          config.getOrThrow<number>('FIRMWARE_BOOT_CONFIRMATION_TIMEOUT_SECONDS'),
        ),
    },
    {
      provide: DeviceContactMonitorService,
      inject: [
        DEVICE_REPOSITORY,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        AuthenticatedContextStore,
        ConfigService,
      ],
      useFactory: (
        repository: IDeviceRepository,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        ids: IIdGenerator,
        contexts: AuthenticatedContextStore,
        config: ConfigService,
      ): DeviceContactMonitorService => {
        const logger = new Logger(DeviceContactMonitorService.name);
        return new DeviceContactMonitorService(
          repository,
          unitOfWork,
          clock,
          ids,
          contexts,
          {
            info: (message, context): void => logger.log({ message, ...context }),
            error: (message, context): void => logger.error({ message, ...context }),
          },
          config.getOrThrow<number>('DEVICE_CONTACT_MONITOR_BATCH_SIZE'),
        );
      },
    },
    {
      provide: DeviceReconcilerService,
      inject: [
        DEVICE_REPOSITORY,
        DEVICE_CREDENTIAL_VAULT,
        DEVICE_PRINCIPAL_PROVISIONER,
        CLOCK,
        ConfigService,
        AuthenticatedContextStore,
      ],
      useFactory: (
        repository: IDeviceRepository,
        credentials: IDeviceCredentialVault,
        provisioner: IDevicePrincipalProvisioner,
        clock: IClock,
        config: ConfigService,
        contexts: AuthenticatedContextStore,
      ): DeviceReconcilerService => {
        const logger = new Logger(DeviceReconcilerService.name);
        return new DeviceReconcilerService(
          repository,
          credentials,
          provisioner,
          clock,
          {
            info: (message, context): void => logger.log({ message, ...context }),
            error: (message, context): void => logger.error({ message, ...context }),
          },
          config.getOrThrow<number>('STREAMING_RECONCILE_BATCH_SIZE'),
          contexts,
        );
      },
    },
  ],
  exports: [
    DeviceConfigurationMonitorService,
    DeviceContactMonitorService,
    DeviceReconcilerService,
    FirmwareConfirmationMonitorService,
  ],
})
export class DeviceManagementModule {}
