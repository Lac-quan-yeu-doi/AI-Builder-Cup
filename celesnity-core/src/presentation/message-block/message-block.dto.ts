import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class PublishMessageBlockDto {
  @IsString()
  @IsNotEmpty()
  block_type!: string;

  @IsInt()
  @Min(1)
  @Max(1)
  @IsOptional()
  version?: number;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  fallback_text!: string;

  @IsString()
  @IsOptional()
  run_id?: string;
}
