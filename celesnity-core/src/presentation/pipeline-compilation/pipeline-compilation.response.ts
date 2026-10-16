import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { PipelineCompilationView } from '@application/pipeline-compilation/pipeline-compilation.service';

export class PipelineCompilationResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly pipelineId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly pipelineVersionId!: string;
  @ApiProperty({ minimum: 1 }) public readonly versionNumber!: number;
  @ApiProperty() public readonly compilerVersion!: string;
  @ApiProperty() public readonly semanticGraphSha256!: string;
  @ApiProperty() public readonly contentSha256!: string;
  @ApiProperty({ minimum: 1 }) public readonly contentSize!: number;
  @ApiProperty({ type: Object }) public readonly sourceMap!: unknown;
  @ApiProperty({ format: 'date-time' }) public readonly compiledAt!: string;
  @ApiPropertyOptional() public readonly source?: string;

  public static from(view: PipelineCompilationView): PipelineCompilationResponseDto {
    return Object.assign(new PipelineCompilationResponseDto(), view);
  }
}
