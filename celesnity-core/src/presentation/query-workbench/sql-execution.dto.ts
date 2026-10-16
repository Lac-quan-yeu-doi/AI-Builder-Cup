import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

const MAX_SQL_LENGTH = 1_000_000;
const MAX_IDENTIFIER_LENGTH = 255;

export class SubmitSqlExecutionRequestDto {
  @ApiProperty({
    description: 'A single read-only SQL statement (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, ...).',
    example: 'SELECT * FROM iceberg.analytics.orders LIMIT 100',
    maxLength: MAX_SQL_LENGTH,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SQL_LENGTH)
  public readonly sql!: string;

  @ApiPropertyOptional({
    description: 'Target catalog. Defaults to the configured Trino catalog when omitted.',
    example: 'iceberg',
    maxLength: MAX_IDENTIFIER_LENGTH,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_IDENTIFIER_LENGTH)
  public readonly catalog?: string;

  @ApiPropertyOptional({
    description: 'Optional default namespace/schema applied to unqualified identifiers.',
    example: 'analytics',
    maxLength: MAX_IDENTIFIER_LENGTH,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(MAX_IDENTIFIER_LENGTH)
  public readonly namespace?: string;
}
