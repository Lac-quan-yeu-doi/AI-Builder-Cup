import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMqttStreamAdapterRequestDto {
  @ApiProperty({ example: 'tnt_7f3a2c19d8e4' })
  @IsString()
  @Matches(/^tnt_[a-z0-9]{12,48}$/u)
  public readonly tenantStorageKey!: string;

  @ApiProperty({ example: 'Factory 7' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly tenantDisplayName!: string;

  @ApiProperty({ example: 'Line A sensors' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly name!: string;

  @ApiProperty({ enum: [0, 1, 2], default: 1 })
  @IsInt()
  @Min(0)
  @Max(2)
  public readonly qos!: 0 | 1 | 2;

  @ApiPropertyOptional({ enum: ['SHARED', 'DEDICATED'], default: 'SHARED' })
  @IsOptional()
  @IsIn(['SHARED', 'DEDICATED'])
  public readonly placementKind?: 'SHARED' | 'DEDICATED';
}
