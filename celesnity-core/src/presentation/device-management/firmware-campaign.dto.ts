import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFirmwareCampaignRequestDto {
  @ApiProperty({ example: 'Factory 2 sensor rollout' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly name!: string;

  @ApiProperty()
  @IsUUID()
  public readonly releaseId!: string;

  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  public readonly deviceIds!: string[];

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  @Max(500)
  public readonly canarySize!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 10 })
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly batchSize!: number;
}
