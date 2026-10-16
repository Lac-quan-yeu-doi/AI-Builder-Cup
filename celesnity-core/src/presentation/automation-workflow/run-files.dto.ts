import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One file a run read, created, or modified — a proxied view of minder-agent's run-file manifest entry. */
export class RunFileEntryResponseDto {
  @ApiProperty() public path!: string;
  @ApiProperty({ enum: ['read', 'created', 'modified'] }) public accessType!:
    'read' | 'created' | 'modified';
  @ApiProperty() public toolName!: string;
  @ApiProperty({ format: 'date-time' }) public accessedAt!: string;
  @ApiProperty() public available!: boolean;
  @ApiPropertyOptional() public sizeBytes?: number;
  @ApiPropertyOptional() public mimeType?: string;
}

export class RunFileListResponseDto {
  @ApiProperty({ type: RunFileEntryResponseDto, isArray: true })
  public files!: RunFileEntryResponseDto[];
}
