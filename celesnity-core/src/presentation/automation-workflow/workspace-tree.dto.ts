import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkspaceEntryResponseDto {
  @ApiProperty() public path!: string;
  @ApiProperty() public isDir!: boolean;
  @ApiPropertyOptional() public sizeBytes?: number;
  @ApiProperty({ format: 'date-time' }) public modifiedAt!: string;
}

export class WorkspaceTreeResponseDto {
  @ApiProperty({ type: WorkspaceEntryResponseDto, isArray: true })
  public entries!: WorkspaceEntryResponseDto[];
  @ApiProperty() public truncated!: boolean;
}
