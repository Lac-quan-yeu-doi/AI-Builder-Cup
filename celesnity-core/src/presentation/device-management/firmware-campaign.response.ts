import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  FirmwareCampaign,
  FirmwareCampaignTarget,
} from '@domain/device-management/models/firmware';

export class FirmwareCampaignTargetResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly deviceId!: string;
  @ApiProperty() public readonly deviceName!: string;
  @ApiProperty() public readonly batchNumber!: number;
  @ApiPropertyOptional() public readonly deploymentId?: string;
  @ApiProperty() public readonly status!: string;
  @ApiProperty() public readonly progressPercent!: number;
  @ApiPropertyOptional() public readonly error?: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(target: FirmwareCampaignTarget): FirmwareCampaignTargetResponseDto {
    return {
      id: target.id,
      deviceId: target.deviceId,
      deviceName: target.deviceName,
      batchNumber: target.batchNumber,
      ...(target.deploymentId === undefined ? {} : { deploymentId: target.deploymentId }),
      status: target.status,
      progressPercent: target.progressPercent,
      ...(target.error === undefined ? {} : { error: target.error }),
      updatedAt: target.updatedAt,
    };
  }
}

export class FirmwareCampaignResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly releaseId!: string;
  @ApiProperty() public readonly releaseVersion!: string;
  @ApiProperty({ enum: ['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'ABORTED'] })
  public readonly status!: string;
  @ApiProperty() public readonly canarySize!: number;
  @ApiProperty() public readonly batchSize!: number;
  @ApiPropertyOptional() public readonly currentBatch?: number;
  @ApiProperty() public readonly requestedBy!: string;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiPropertyOptional() public readonly error?: string;
  @ApiProperty({ type: FirmwareCampaignTargetResponseDto, isArray: true })
  public readonly targets!: readonly FirmwareCampaignTargetResponseDto[];

  public static from(campaign: FirmwareCampaign): FirmwareCampaignResponseDto {
    return {
      id: campaign.id,
      name: campaign.name,
      releaseId: campaign.releaseId,
      releaseVersion: campaign.releaseVersion,
      status: campaign.status,
      canarySize: campaign.canarySize,
      batchSize: campaign.batchSize,
      ...(campaign.currentBatch === undefined ? {} : { currentBatch: campaign.currentBatch }),
      requestedBy: campaign.requestedBy,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      ...(campaign.error === undefined ? {} : { error: campaign.error }),
      targets: campaign.targets.map((target) => FirmwareCampaignTargetResponseDto.from(target)),
    };
  }
}
