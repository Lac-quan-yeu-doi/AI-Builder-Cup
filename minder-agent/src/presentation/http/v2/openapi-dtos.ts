import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";
import type { ApiErrorCode } from "../common/errors/api-error.js";

export class CreateRunRequest {
  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  readonly run_id?: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly session_key!: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly input!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  readonly agent?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  readonly data_scope?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  readonly automation_context?: Record<string, unknown>;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  readonly system_prompt?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly wait_ms?: number;
}

export class SubmitToolResultRequest {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  readonly session_key?: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly tool_call_id!: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly content!: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  readonly is_error?: boolean;
}

export class StartedRunResponse {
  @ApiProperty({ type: String })
  @IsString()
  readonly request_id!: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly run_id!: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly session_id!: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly events_url!: string;
}

export class CompletedRunResponse {
  @ApiProperty({ type: String })
  @IsString()
  readonly request_id!: string;

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  readonly error!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  readonly response_text!: string | null;

  @ApiProperty({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  readonly data_scope!: Record<string, unknown> | null;

  @ApiProperty({ type: String })
  @IsString()
  readonly run_id!: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly session_id!: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly status!: string;
}

export class DuplicateDeliveryResponse {
  @ApiProperty({ type: String })
  @IsString()
  readonly request_id!: string;

  @ApiProperty({ type: String, enum: ["duplicate_delivery"] })
  @IsString()
  readonly status!: "duplicate_delivery";
}

export class ApiErrorV2Response {
  @ApiProperty({ type: String, example: "invalid_turn" })
  @IsString()
  readonly error!: ApiErrorCode;

  @ApiProperty({ type: String })
  @IsString()
  readonly request_id!: string;

  @ApiPropertyOptional({
    type: String,
    description: "Active run ID for conflict responses.",
  })
  @IsOptional()
  @IsString()
  readonly active_run_id?: string;
}

export class StreamOpenedEvent {
  @ApiProperty({ type: String })
  @IsString()
  readonly request_id!: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly run_id!: string;

  @ApiProperty({ type: String })
  @IsString()
  readonly cursor!: string;
}

export class SessionV2Response {
  @ApiProperty({ type: String })
  readonly id!: string;

  @ApiPropertyOptional({ type: String })
  readonly key?: string;

  @ApiProperty({ type: String })
  readonly mode!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  readonly turns!: number;

  @ApiProperty({ type: Object, nullable: true })
  readonly pending_question!: object | null;

  @ApiProperty({ type: Object, nullable: true })
  readonly pending_client_tool!: object | null;

  @ApiProperty({ type: Object, nullable: true })
  readonly pending_plan!: object | null;

  @ApiProperty({ type: Object, nullable: true })
  readonly pending_approval!: object | null;
}

export class GovernanceValidationV2Response {
  @ApiProperty({ type: Boolean, enum: [true] })
  readonly valid!: true;

  @ApiProperty({ type: String })
  readonly policy_revision!: string;

  @ApiProperty({ type: String, format: "date-time" })
  readonly admitted_at!: string;

  @ApiProperty({ type: Object })
  readonly policy!: object;
}

export class AgentV2Response {
  @ApiProperty({ type: String })
  readonly id!: string;

  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiPropertyOptional({ type: String })
  readonly display_name?: string;

  @ApiPropertyOptional({ type: String })
  readonly system_prompt?: string;

  @ApiPropertyOptional({ type: String })
  readonly model?: string;

  @ApiProperty({ type: [String] })
  readonly tool_allowlist!: readonly string[];

  @ApiProperty({ type: [String] })
  readonly skills!: readonly string[];

  @ApiPropertyOptional({ type: Number })
  readonly max_steps?: number;

  @ApiProperty({ type: String, enum: ["react"] })
  readonly execution_strategy!: "react";

  @ApiPropertyOptional({ type: String, format: "date-time" })
  readonly archived_at?: string;

  @ApiProperty({ type: Number })
  readonly version!: number;
}

export class AgentV2DiffResponse {
  @ApiProperty({ type: String })
  readonly path!: string;

  @ApiPropertyOptional({
    type: Object,
    oneOf: [
      { type: "string" },
      { type: "number" },
      { type: "array", items: { type: "string" } },
    ],
  })
  readonly from?: unknown;

  @ApiPropertyOptional({
    type: Object,
    oneOf: [
      { type: "string" },
      { type: "number" },
      { type: "array", items: { type: "string" } },
    ],
  })
  readonly to?: unknown;
}

export class SkillSummaryResponse {
  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiProperty({ type: String })
  readonly namespace!: string;

  @ApiPropertyOptional({ type: String })
  readonly description?: string;

  @ApiProperty({ type: Boolean })
  readonly read_only!: boolean;

  @ApiProperty({ type: String, enum: ["global", "project"] })
  readonly source!: "global" | "project";
}

export class SkillResponse extends SkillSummaryResponse {
  @ApiProperty({ type: String })
  readonly body!: string;

  @ApiProperty({ type: String })
  readonly hash!: string;

  @ApiProperty({ type: String, format: "date-time" })
  readonly created_at!: string;

  @ApiProperty({ type: String, format: "date-time" })
  readonly updated_at!: string;
}
