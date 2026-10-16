import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  IssuedMqttCredential,
  MqttStreamAdapter,
  MqttStreamAdapterRegistration,
} from '@domain/streaming/models/mqtt-stream-adapter';

export class MqttStreamAdapterResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly adapterKey!: string;
  @ApiProperty() public readonly tenantId!: string;
  @ApiProperty() public readonly tenantStorageKey!: string;
  @ApiProperty() public readonly tenantDisplayName!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly brokerUrl!: string;
  @ApiProperty() public readonly topicFilter!: string;
  @ApiProperty({ enum: [0, 1, 2] }) public readonly qos!: number;
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] }) public readonly desiredState!: string;
  @ApiProperty({ enum: ['PROVISIONING', 'ACTIVE', 'DEGRADED', 'PAUSED', 'FAILED'] })
  public readonly status!: string;
  @ApiProperty({ enum: ['SHARED', 'DEDICATED'] }) public readonly placementKind!: string;
  @ApiProperty() public readonly deploymentId!: string;
  @ApiProperty() public readonly generation!: number;
  @ApiProperty() public readonly observedGeneration!: number;
  @ApiProperty() public readonly bronzeObjectPrefix!: string;
  @ApiPropertyOptional() public readonly lastError?: string;
  @ApiPropertyOptional() public readonly lastReconciledAt?: string;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(adapter: MqttStreamAdapter): MqttStreamAdapterResponseDto {
    return {
      id: adapter.id,
      adapterKey: adapter.publicKey,
      tenantId: adapter.tenantId,
      tenantStorageKey: adapter.tenantStorageKey,
      tenantDisplayName: adapter.tenantDisplayName,
      name: adapter.name,
      brokerUrl: adapter.brokerUrl,
      topicFilter: adapter.topicFilter,
      qos: adapter.qos,
      desiredState: adapter.desiredState,
      status: adapter.status,
      placementKind: adapter.placementKind,
      deploymentId: adapter.deploymentId,
      generation: adapter.generation,
      observedGeneration: adapter.observedGeneration,
      bronzeObjectPrefix: `${adapter.tenantStorageKey}/bronze/mqtt_events/`,
      ...(adapter.lastError === undefined ? {} : { lastError: adapter.lastError }),
      ...(adapter.lastReconciledAt === undefined
        ? {}
        : { lastReconciledAt: adapter.lastReconciledAt }),
      createdAt: adapter.createdAt,
      updatedAt: adapter.updatedAt,
    };
  }
}

export class IssuedMqttCredentialResponseDto {
  @ApiProperty() public readonly username!: string;
  @ApiProperty({ writeOnly: true }) public readonly password!: string;

  public static from(credential: IssuedMqttCredential): IssuedMqttCredentialResponseDto {
    return { ...credential };
  }
}

export class MqttStreamAdapterRegistrationResponseDto {
  @ApiProperty({ type: MqttStreamAdapterResponseDto })
  public readonly adapter!: MqttStreamAdapterResponseDto;

  @ApiProperty({ type: IssuedMqttCredentialResponseDto })
  public readonly credential!: IssuedMqttCredentialResponseDto;

  public static from(
    registration: MqttStreamAdapterRegistration,
  ): MqttStreamAdapterRegistrationResponseDto {
    return {
      adapter: MqttStreamAdapterResponseDto.from(registration.adapter),
      credential: IssuedMqttCredentialResponseDto.from(registration.credential),
    };
  }
}
