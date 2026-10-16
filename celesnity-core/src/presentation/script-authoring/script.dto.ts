import { IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScriptRequestDto {
  @ApiProperty({ example: 'Daily customer export', maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly name!: string;

  @ApiPropertyOptional({ example: 'Transforms active customers for analytics.' })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  public readonly description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly connectionId!: string;
}

export class UpdateScriptRequestDto {
  @ApiPropertyOptional({ example: 'Daily customer export', maxLength: 160 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  public readonly description?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  public readonly connectionId?: string;
}

export class PublishScriptVersionRequestDto {
  @ApiProperty({ description: 'UTF-8 Python source. Byte limit is platform-configured.' })
  @IsString()
  @MinLength(1)
  public readonly source!: string;
}
