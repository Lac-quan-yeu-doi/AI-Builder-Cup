import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateNamespaceDto {
  @ApiProperty({ example: 'analytics', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @Matches(/^[A-Za-z0-9_]+$/u, {
    message: 'name may only contain letters, digits, and underscores',
  })
  public readonly name!: string;

  @ApiPropertyOptional({ example: 'Curated sales data for reporting.', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  public readonly description?: string;
}

export class UpdateNamespaceDescriptionDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  public readonly description?: string | null;
}
