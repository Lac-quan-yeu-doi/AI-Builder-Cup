import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsEnum, IsIn, IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';

/**
 * DBMS-specific input accepted only at the HTTP boundary.
 *
 * The selected plugin validates and normalizes this object. It may contain
 * credentials, so it is write-only by design and is never reflected in a
 * connection response.
 */
export class DatabaseServiceDetailsRequestDto {
  @ApiProperty({
    example: 'POSTGRESQL',
    maxLength: 50,
    description: 'Registered DBMS plugin identifier. Current values: POSTGRESQL, MYSQL.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  public readonly connectorType!: string;

  @ApiProperty({
    additionalProperties: true,
    description: 'DBMS-specific connection input. It can contain credentials and is write-only.',
    type: 'object',
  })
  @IsObject()
  public readonly details!: Record<string, unknown>;
}

export class CreateDatabaseServiceRequestDto extends DatabaseServiceDetailsRequestDto {
  @ApiProperty({ example: 'Analytics database' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly name!: string;

  @ApiPropertyOptional({
    example: 'nhamay_saigonfood',
    description: 'Iceberg database this source is filed under.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly databaseName?: string;

  @ApiPropertyOptional({
    example: 'nhamay_saigonfood',
    description: 'Preferred catalog database membership for this new datasource.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly initialDatabaseName?: string;
}

export class UpdateDatabaseServiceRequestDto {
  @ApiPropertyOptional({ example: 'Analytics database' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly name?: string;

  @ApiPropertyOptional({
    additionalProperties: true,
    description:
      'DBMS-specific replacement input. Omitted fields are merged according to the selected DBMS plugin.',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  public readonly details?: Record<string, unknown>;
}

/** @deprecated OpenAPI compatibility model for the pre-DatabaseService Web adapter. */
export class ConnectionDetailsRequestDto {
  @ApiProperty({ example: 'POSTGRESQL', maxLength: 50 })
  public readonly dbmsType!: string;

  @ApiProperty({ additionalProperties: true, type: 'object' })
  public readonly details!: Record<string, unknown>;
}

/** @deprecated OpenAPI compatibility model for the pre-DatabaseService Web adapter. */
export class CreateConnectionRequestDto extends ConnectionDetailsRequestDto {
  @ApiProperty({ example: 'Analytics database' })
  public readonly name!: string;
}

/** @deprecated OpenAPI compatibility model for the pre-DatabaseService Web adapter. */
export class UpdateConnectionRequestDto {
  @ApiPropertyOptional({ example: 'Analytics database' })
  public readonly name?: string;

  @ApiPropertyOptional({ additionalProperties: true, type: 'object' })
  public readonly details?: Record<string, unknown>;
}

export class DatabaseServiceListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly search?: string;

  @ApiPropertyOptional({
    example: 'nhamay_saigonfood',
    description: 'Return only the sources filed under this Iceberg database.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly databaseName?: string;

  @ApiPropertyOptional({ example: 'MYSQL' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  public readonly connectorType?: string;

  @ApiPropertyOptional({ enum: VerificationStatusValue })
  @IsOptional()
  @IsEnum(VerificationStatusValue)
  public readonly verificationStatus?: VerificationStatusValue;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public readonly page: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public readonly pageSize: number = 50;

  @ApiPropertyOptional({ enum: ['name', 'createdAt', 'updatedAt'], default: 'name' })
  @IsOptional()
  @IsIn(['name', 'createdAt', 'updatedAt'])
  public readonly sortBy: 'name' | 'createdAt' | 'updatedAt' = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  public readonly sortDirection: 'asc' | 'desc' = 'asc';
}
