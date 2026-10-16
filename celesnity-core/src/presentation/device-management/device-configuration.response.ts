import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  DeviceConfiguration,
  DeviceConfigurationTemplate,
  DeviceConfigurationTemplateDeployment,
} from '@domain/device-management/models/device-configuration';

export class DeviceConfigurationResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly deviceId!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ enum: ['QUEUED', 'DISPATCHED', 'APPLIED', 'FAILED', 'ROLLED_BACK'] })
  public readonly status!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly parameters!: Readonly<Record<string, unknown>>;
  @ApiProperty() public readonly restoreFactoryDefaults!: boolean;
  @ApiProperty() public readonly previousAppliedVersion!: number;
  @ApiProperty() public readonly requestedBy!: string;
  @ApiProperty() public readonly requestedAt!: string;
  @ApiPropertyOptional() public readonly dispatchedAt?: string;
  @ApiPropertyOptional() public readonly appliedAt?: string;
  @ApiPropertyOptional() public readonly confirmedAt?: string;
  @ApiPropertyOptional() public readonly finishedAt?: string;
  @ApiPropertyOptional() public readonly error?: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(configuration: DeviceConfiguration): DeviceConfigurationResponseDto {
    return {
      id: configuration.id,
      deviceId: configuration.deviceId,
      version: configuration.version,
      status: configuration.status,
      parameters: { ...configuration.parameters },
      restoreFactoryDefaults: configuration.restoreFactoryDefaults,
      previousAppliedVersion: configuration.previousAppliedVersion,
      requestedBy: configuration.requestedBy,
      requestedAt: configuration.requestedAt,
      ...(configuration.dispatchedAt === undefined
        ? {}
        : { dispatchedAt: configuration.dispatchedAt }),
      ...(configuration.appliedAt === undefined ? {} : { appliedAt: configuration.appliedAt }),
      ...(configuration.confirmedAt === undefined
        ? {}
        : { confirmedAt: configuration.confirmedAt }),
      ...(configuration.finishedAt === undefined ? {} : { finishedAt: configuration.finishedAt }),
      ...(configuration.error === undefined ? {} : { error: configuration.error }),
      updatedAt: configuration.updatedAt,
    };
  }
}

export class DeviceConfigurationTemplateResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly parameters!: Readonly<Record<string, unknown>>;
  @ApiProperty() public readonly createdBy!: string;
  @ApiProperty() public readonly createdAt!: string;

  public static from(
    template: DeviceConfigurationTemplate,
  ): DeviceConfigurationTemplateResponseDto {
    return {
      id: template.id,
      name: template.name,
      version: template.version,
      parameters: { ...template.parameters },
      createdBy: template.createdBy,
      createdAt: template.createdAt,
    };
  }
}

export class DeviceConfigurationDeploymentFailureResponseDto {
  @ApiProperty() public readonly deviceId!: string;
  @ApiProperty() public readonly deviceName!: string;
  @ApiProperty() public readonly error!: string;
}

export class DeviceConfigurationTemplateDeploymentResponseDto {
  @ApiProperty({ type: DeviceConfigurationTemplateResponseDto })
  public readonly template!: DeviceConfigurationTemplateResponseDto;
  @ApiProperty() public readonly targetCount!: number;
  @ApiProperty({ type: DeviceConfigurationResponseDto, isArray: true })
  public readonly configurations!: readonly DeviceConfigurationResponseDto[];
  @ApiProperty({ type: DeviceConfigurationDeploymentFailureResponseDto, isArray: true })
  public readonly failures!: readonly DeviceConfigurationDeploymentFailureResponseDto[];

  public static from(
    deployment: DeviceConfigurationTemplateDeployment,
  ): DeviceConfigurationTemplateDeploymentResponseDto {
    return {
      template: DeviceConfigurationTemplateResponseDto.from(deployment.template),
      targetCount: deployment.targetCount,
      configurations: deployment.configurations.map((configuration) =>
        DeviceConfigurationResponseDto.from(configuration),
      ),
      failures: deployment.failures.map((failure) => ({ ...failure })),
    };
  }
}
