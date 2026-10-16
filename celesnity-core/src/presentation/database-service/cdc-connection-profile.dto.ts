import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { CdcConnectionSetupMode } from '@domain/database-service/value-objects/cdc-connection-profile';

export class PutCdcConnectionProfileRequestDto {
  @ApiProperty({
    additionalProperties: true,
    description: 'DBMS-specific CDC connection details. Credentials are write-only.',
    type: 'object',
  })
  @IsObject()
  public readonly details!: Record<string, unknown>;

  @ApiProperty({ enum: CdcConnectionSetupMode })
  @IsEnum(CdcConnectionSetupMode)
  public readonly setupMode!: CdcConnectionSetupMode;

  @ApiPropertyOptional({ maxLength: 63 })
  @IsOptional()
  @IsString()
  @MaxLength(63)
  public readonly publicationName?: string;

  @ApiPropertyOptional({ maxLength: 63 })
  @IsOptional()
  @IsString()
  @MaxLength(63)
  public readonly slotName?: string;
}
