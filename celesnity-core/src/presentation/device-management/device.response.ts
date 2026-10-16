import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  Device,
  DeviceAlert,
  DeviceLifecycleTransition,
  DeviceRegistration,
  IssuedDeviceCredential,
} from '@domain/device-management/models/device';

export class DeviceTopicsResponseDto {
  @ApiProperty() public readonly telemetry!: string;
  @ApiProperty() public readonly firmwareEvents!: string;
  @ApiProperty() public readonly firmwareCommands!: string;
}

export class DeviceResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly deviceKey!: string;
  @ApiProperty() public readonly adapterId!: string;
  @ApiProperty() public readonly adapterKey!: string;
  @ApiProperty() public readonly tenantId!: string;
  @ApiProperty() public readonly tenantStorageKey!: string;
  @ApiProperty() public readonly externalDeviceId!: string;
  @ApiProperty({ enum: ['GATEWAY', 'SENSOR'] }) public readonly deviceType!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly model!: string;
  @ApiPropertyOptional() public readonly hardwareRevision?: string;
  @ApiPropertyOptional() public readonly currentFirmwareVersion?: string;
  @ApiPropertyOptional() public readonly deploymentSite?: string;
  @ApiPropertyOptional() public readonly physicalLocation?: string;
  @ApiPropertyOptional() public readonly commissionedAt?: string;
  @ApiPropertyOptional() public readonly provisioningConfirmedAt?: string;
  @ApiProperty({
    enum: ['MANUFACTURED', 'PROVISIONED', 'COMMISSIONED', 'DECOMMISSIONED'],
  })
  public readonly lifecycleState!: string;
  @ApiPropertyOptional() public readonly gatewayId?: string;
  @ApiPropertyOptional() public readonly gatewayName?: string;
  @ApiPropertyOptional() public readonly measurementPointId?: string;
  @ApiPropertyOptional() public readonly measurementPointKey?: string;
  @ApiProperty() public readonly brokerUrl!: string;
  @ApiProperty({ type: DeviceTopicsResponseDto }) public readonly topics!: DeviceTopicsResponseDto;
  @ApiProperty({ enum: [0, 1, 2] }) public readonly qos!: number;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'RETIRED'] })
  public readonly desiredState!: string;
  @ApiProperty({
    enum: ['PROVISIONING', 'ACTIVE', 'DEGRADED', 'SUSPENDED', 'FAILED', 'RETIRED'],
  })
  public readonly status!: string;
  @ApiProperty() public readonly generation!: number;
  @ApiProperty() public readonly observedGeneration!: number;
  @ApiProperty() public readonly desiredConfigurationVersion!: number;
  @ApiProperty() public readonly appliedConfigurationVersion!: number;
  @ApiProperty() public readonly reportedConfigurationVersion!: number;
  @ApiProperty() public readonly expectedCheckInIntervalSeconds!: number;
  @ApiProperty() public readonly missedCheckInThreshold!: number;
  @ApiProperty({ enum: ['NEVER_SEEN', 'ONLINE', 'LOST_CONTACT'] })
  public readonly contactStatus!: string;
  @ApiPropertyOptional() public readonly contactDeadlineAt?: string;
  @ApiPropertyOptional() public readonly contactLostAt?: string;
  @ApiPropertyOptional() public readonly lastSeenAt?: string;
  @ApiPropertyOptional() public readonly lastError?: string;
  @ApiPropertyOptional() public readonly lastReconciledAt?: string;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(device: Device): DeviceResponseDto {
    return {
      id: device.id,
      deviceKey: device.publicKey,
      adapterId: device.adapterId,
      adapterKey: device.adapterKey,
      tenantId: device.tenantId,
      tenantStorageKey: device.tenantStorageKey,
      externalDeviceId: device.externalDeviceId,
      deviceType: device.deviceType,
      name: device.name,
      model: device.model,
      ...(device.hardwareRevision === undefined
        ? {}
        : { hardwareRevision: device.hardwareRevision }),
      ...(device.currentFirmwareVersion === undefined
        ? {}
        : { currentFirmwareVersion: device.currentFirmwareVersion }),
      ...(device.deploymentSite === undefined ? {} : { deploymentSite: device.deploymentSite }),
      ...(device.physicalLocation === undefined
        ? {}
        : { physicalLocation: device.physicalLocation }),
      ...(device.commissionedAt === undefined ? {} : { commissionedAt: device.commissionedAt }),
      ...(device.provisioningConfirmedAt === undefined
        ? {}
        : { provisioningConfirmedAt: device.provisioningConfirmedAt }),
      lifecycleState: device.lifecycleState,
      ...(device.gatewayId === undefined ? {} : { gatewayId: device.gatewayId }),
      ...(device.gatewayName === undefined ? {} : { gatewayName: device.gatewayName }),
      ...(device.measurementPointId === undefined
        ? {}
        : { measurementPointId: device.measurementPointId }),
      ...(device.measurementPointKey === undefined
        ? {}
        : { measurementPointKey: device.measurementPointKey }),
      brokerUrl: device.brokerUrl,
      topics: { ...device.topics },
      qos: device.qos,
      desiredState: device.desiredState,
      status: device.status,
      generation: device.generation,
      observedGeneration: device.observedGeneration,
      desiredConfigurationVersion: device.desiredConfigurationVersion,
      appliedConfigurationVersion: device.appliedConfigurationVersion,
      reportedConfigurationVersion: device.reportedConfigurationVersion,
      expectedCheckInIntervalSeconds: device.expectedCheckInIntervalSeconds,
      missedCheckInThreshold: device.missedCheckInThreshold,
      contactStatus: device.contactStatus,
      ...(device.contactDeadlineAt === undefined
        ? {}
        : { contactDeadlineAt: device.contactDeadlineAt }),
      ...(device.contactLostAt === undefined ? {} : { contactLostAt: device.contactLostAt }),
      ...(device.lastSeenAt === undefined ? {} : { lastSeenAt: device.lastSeenAt }),
      ...(device.lastError === undefined ? {} : { lastError: device.lastError }),
      ...(device.lastReconciledAt === undefined
        ? {}
        : { lastReconciledAt: device.lastReconciledAt }),
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }
}

export class DeviceAlertResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly deviceId!: string;
  @ApiProperty() public readonly deviceName!: string;
  @ApiPropertyOptional() public readonly sourceEventId?: string;
  @ApiProperty({
    enum: [
      'LOSS_OF_CONTACT',
      'STORAGE_ALMOST_FULL',
      'SIM_DATA_LIMIT',
      'BATTERY_LOW',
      'TAMPER',
      'SHOCK',
      'MOVED',
      'SENSOR_FAULT',
      'UNEXPECTED_REBOOT',
      'RADIO_DEGRADED',
      'LTE_MODEM_FAILURE',
    ],
  })
  public readonly type!: string;
  @ApiProperty({ enum: ['INFO', 'WARNING', 'CRITICAL'] }) public readonly severity!: string;
  @ApiProperty({ enum: ['RAISED', 'ACKNOWLEDGED', 'CLEARED'] }) public readonly status!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly snapshot!: Readonly<Record<string, unknown>>;
  @ApiProperty() public readonly raisedAt!: string;
  @ApiPropertyOptional() public readonly acknowledgedAt?: string;
  @ApiPropertyOptional() public readonly acknowledgedBy?: string;
  @ApiPropertyOptional() public readonly clearedAt?: string;
  @ApiPropertyOptional() public readonly clearedBy?: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(alert: DeviceAlert): DeviceAlertResponseDto {
    return {
      id: alert.id,
      deviceId: alert.deviceId,
      deviceName: alert.deviceName,
      ...(alert.sourceEventId === undefined ? {} : { sourceEventId: alert.sourceEventId }),
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      snapshot: { ...alert.snapshot },
      raisedAt: alert.raisedAt,
      ...(alert.acknowledgedAt === undefined ? {} : { acknowledgedAt: alert.acknowledgedAt }),
      ...(alert.acknowledgedBy === undefined ? {} : { acknowledgedBy: alert.acknowledgedBy }),
      ...(alert.clearedAt === undefined ? {} : { clearedAt: alert.clearedAt }),
      ...(alert.clearedBy === undefined ? {} : { clearedBy: alert.clearedBy }),
      updatedAt: alert.updatedAt,
    };
  }
}

export class DeviceLifecycleTransitionResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly deviceId!: string;
  @ApiPropertyOptional() public readonly fromState?: string;
  @ApiProperty() public readonly toState!: string;
  @ApiProperty() public readonly operatorId!: string;
  @ApiPropertyOptional() public readonly reason?: string;
  @ApiProperty() public readonly transitionedAt!: string;

  public static from(transition: DeviceLifecycleTransition): DeviceLifecycleTransitionResponseDto {
    return {
      id: transition.id,
      deviceId: transition.deviceId,
      ...(transition.fromState === undefined ? {} : { fromState: transition.fromState }),
      toState: transition.toState,
      operatorId: transition.operatorId,
      ...(transition.reason === undefined ? {} : { reason: transition.reason }),
      transitionedAt: transition.transitionedAt,
    };
  }
}

export class IssuedDeviceCredentialResponseDto {
  @ApiProperty() public readonly username!: string;
  @ApiProperty({ writeOnly: true }) public readonly password!: string;

  public static from(credential: IssuedDeviceCredential): IssuedDeviceCredentialResponseDto {
    return { ...credential };
  }
}

export class DeviceRegistrationResponseDto {
  @ApiProperty({ type: DeviceResponseDto }) public readonly device!: DeviceResponseDto;
  @ApiProperty({ type: IssuedDeviceCredentialResponseDto })
  public readonly credential!: IssuedDeviceCredentialResponseDto;

  public static from(registration: DeviceRegistration): DeviceRegistrationResponseDto {
    return {
      device: DeviceResponseDto.from(registration.device),
      credential: IssuedDeviceCredentialResponseDto.from(registration.credential),
    };
  }
}
