import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from "class-validator";

const IDENTIFIER = /^[a-z0-9][a-z0-9-]*$/u;

export class CreateAgentDto {
  @ApiProperty({ type: String })
  @IsString()
  @Matches(IDENTIFIER)
  id!: string;

  @ApiProperty({ type: String })
  @IsString()
  @Matches(IDENTIFIER)
  name!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  toolAllowlist!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  skills!: string[];

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSteps?: number;

  @ApiProperty({ type: String, enum: ["react"] })
  @IsIn(["react"])
  executionStrategy!: "react";
}

export class UpdateAgentDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @Matches(IDENTIFIER)
  name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolAllowlist?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSteps?: number;

  @ApiPropertyOptional({ type: String, enum: ["react"] })
  @IsOptional()
  @IsIn(["react"])
  executionStrategy?: "react";
}

export class CreateAgentV2Dto {
  @ApiProperty({ type: String })
  @IsString()
  @Matches(IDENTIFIER)
  id!: string;

  @ApiProperty({ type: String })
  @IsString()
  @Matches(IDENTIFIER)
  name!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  system_prompt?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  tool_allowlist!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  skills!: string[];

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_steps?: number;

  @ApiProperty({ type: String, enum: ["react"] })
  @IsIn(["react"])
  execution_strategy!: "react";
}

export class UpdateAgentV2Dto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @Matches(IDENTIFIER)
  name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  system_prompt?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tool_allowlist?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_steps?: number;

  @ApiPropertyOptional({ type: String, enum: ["react"] })
  @IsOptional()
  @IsIn(["react"])
  execution_strategy?: "react";
}

export class RollbackAgentDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  version!: number;
}

export class TurnDto {
  @IsOptional()
  @IsUUID()
  run_id?: string;

  @IsString()
  session_key!: string;

  @IsString()
  input!: string;

  @IsOptional()
  @IsString()
  agent?: string;

  @IsOptional()
  @IsObject()
  data_scope?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  automation_context?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  system_prompt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => Number(value))
  wait_ms?: number;
}

export class ClientToolResultDto {
  @IsString()
  session_key!: string;

  @IsString()
  tool_call_id!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsBoolean()
  is_error?: boolean;
}

export class ApprovalDecisionDto {
  @ApiProperty({ type: String, enum: ["approved", "denied"] })
  @IsIn(["approved", "denied"])
  decision!: "approved" | "denied";
}

export class GovernanceValidationDto {
  @ApiProperty({ type: String })
  @IsString()
  yaml!: string;
}

export class RoomCreateDto {
  @ApiProperty({ type: String })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  max_concurrent_runs!: number;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => Number(value))
  max_queued?: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  members!: string[];
}

export class RoomMemberDto {
  @ApiProperty({ type: String })
  @IsString()
  agent!: string;
}

export class RoomWebhookDto {
  @ApiProperty({ type: String })
  @IsString()
  agent!: string;

  @ApiProperty({ type: String })
  @IsString()
  source!: string;

  @ApiProperty({ type: String })
  @IsString()
  secret_ref!: string;
}

export class RoomRunDto {
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  run_id?: string;
  @ApiProperty({ type: String })
  @IsString()
  agent!: string;

  @ApiProperty({ type: String })
  @IsString()
  input!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  data_scope?: Record<string, unknown>;
}

export class RoomWebhookEventDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  input?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  data_scope?: Record<string, unknown>;
}

export class SkillDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  namespace?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  description?: string;
}
