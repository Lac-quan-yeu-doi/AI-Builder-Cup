import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFirmwareReleaseRequestDto {
  @ApiProperty({ example: '1.2.0' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly version!: string;

  @ApiProperty({ example: 'Celesnity Edge Sensor' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly deviceModel!: string;

  @ApiPropertyOptional({ example: 'rev-b' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  public readonly hardwareRevision?: string;

  @ApiProperty({ example: 'https://firmware.example.com/edge-sensor/1.2.0.bin' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  public readonly artifactUrl!: string;

  @ApiProperty({ description: 'Lowercase SHA-256 digest of the firmware binary.' })
  @Matches(/^[a-fA-F0-9]{64}$/u)
  public readonly sha256!: string;

  @ApiProperty({ description: 'Detached firmware signature encoded as base64.' })
  @Matches(/^[A-Za-z0-9+/]{40,}={0,2}$/u)
  public readonly signature!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  public readonly releaseNotes?: string;
}

export class UploadFirmwareReleaseRequestDto {
  @ApiProperty({ example: '1.2.0' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly version!: string;

  @ApiProperty({ example: 'Celesnity Edge Sensor' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly deviceModel!: string;

  @ApiPropertyOptional({ example: 'rev-b' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  public readonly hardwareRevision?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  public readonly releaseNotes?: string;
}

export class StartFirmwareDeploymentRequestDto {
  @ApiProperty()
  @IsUUID()
  public readonly releaseId!: string;
}

export class FirmwareDeploymentEventRequestDto {
  @ApiProperty({
    enum: [
      'ACCEPTED',
      'DOWNLOADING',
      'VERIFYING',
      'INSTALLING',
      'REBOOTING',
      'FAILED',
      'ROLLED_BACK',
    ],
  })
  @IsIn([
    'ACCEPTED',
    'DOWNLOADING',
    'VERIFYING',
    'INSTALLING',
    'REBOOTING',
    'FAILED',
    'ROLLED_BACK',
  ])
  public readonly status!:
    | 'ACCEPTED'
    | 'DOWNLOADING'
    | 'VERIFYING'
    | 'INSTALLING'
    | 'REBOOTING'
    | 'FAILED'
    | 'ROLLED_BACK';

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  public readonly progressPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  public readonly error?: string;
}
