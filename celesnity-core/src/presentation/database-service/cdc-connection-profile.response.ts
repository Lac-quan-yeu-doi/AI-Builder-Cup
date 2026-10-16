import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { CdcConnectionProfileView } from '@application/database-service/read-models/cdc-connection-profile';
import {
  CDC_CONNECTION_ISSUE_CODES,
  CdcConnectionSetupMode,
  CdcConnectionVerificationStatus,
} from '@domain/database-service/value-objects/cdc-connection-profile';

export class CdcConnectionProfileResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly databaseServiceId!: string;
  @ApiProperty({ enum: ['POSTGRESQL', 'MYSQL'] }) public readonly connectorType!: string;
  @ApiProperty() public readonly endpointSummary!: string;
  @ApiProperty({ enum: CdcConnectionSetupMode })
  public readonly setupMode!: CdcConnectionSetupMode;
  @ApiPropertyOptional() public readonly publicationName?: string;
  @ApiPropertyOptional() public readonly slotName?: string;
  @ApiProperty({ enum: CdcConnectionVerificationStatus })
  public readonly verificationStatus!: CdcConnectionVerificationStatus;
  @ApiPropertyOptional({ enum: CDC_CONNECTION_ISSUE_CODES })
  public readonly verificationIssueCode?: string;
  @ApiPropertyOptional() public readonly verificationMessage?: string;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly lastTestedAt?: string;
  @ApiProperty() public readonly revision!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(view: CdcConnectionProfileView): CdcConnectionProfileResponseDto {
    return Object.assign(new CdcConnectionProfileResponseDto(), view);
  }
}
