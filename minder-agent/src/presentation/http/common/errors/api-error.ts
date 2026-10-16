import { HttpException } from "@nestjs/common";

export type ApiErrorCode =
  | "agent_configuration_invalid"
  | "agent_manifest_forbidden"
  | "agent_manifest_invalid"
  | "agent_manifest_not_found"
  | "agent_name_conflict"
  | "agent_not_found"
  | "agent_required"
  | "agent_revision_invalid"
  | "agent_revision_not_found"
  | "agent_store_not_configured"
  | "approval_decision_invalid"
  | "approval_not_found"
  | "approval_store_not_configured"
  | "automation_run_id_not_allowed"
  | "evidence_not_configured"
  | "file_access_not_configured"
  | "file_not_found"
  | "file_too_large"
  | "invalid_blocking_wait"
  | "invalid_client_tool_result"
  | "invalid_cursor"
  | "invalid_file_path"
  | "invalid_json"
  | "invalid_pagination"
  | "invalid_room_context"
  | "invalid_room_member"
  | "invalid_room_run"
  | "invalid_room_webhook"
  | "invalid_run_id"
  | "invalid_session"
  | "invalid_turn"
  | "invalid_webhook_signature"
  | "invalid_workspace_path"
  | "manifest_store_not_configured"
  | "mcp_manager_not_configured"
  | "mcp_server_not_found"
  | "mcp_server_unavailable"
  | "mcp_target_resolver_not_configured"
  | "missing_caller_id"
  | "permission_denied"
  | "plan_decision_invalid"
  | "plan_not_found"
  | "plan_resume_not_configured"
  | "plan_resume_rejected"
  | "payload_too_large"
  | "request_validation_failed"
  | "room_busy"
  | "room_closed"
  | "room_not_found"
  | "room_store_not_configured"
  | "room_webhook_not_configured"
  | "room_webhook_not_found"
  | "room_webhook_store_not_configured"
  | "run_manifest_not_found"
  | "run_not_found"
  | "run_report_not_found"
  | "runtime_not_configured"
  | "session_busy"
  | "session_key_mismatch"
  | "session_mode_conflict"
  | "session_not_found"
  | "skill_invalid"
  | "skill_name_conflict"
  | "skill_name_mismatch"
  | "skill_not_found"
  | "skill_store_not_configured"
  | "verified_automation_run_required"
  | "workspace_file_not_found"
  | "workspace_not_configured"
  | "internal_error";

export interface ApiErrorBody {
  readonly error: ApiErrorCode;
  readonly detail?: string;
}

export function v2ErrorBody(
  body: unknown,
  requestId: string,
): {
  readonly error: string;
  readonly request_id: string;
  readonly active_run_id?: string;
} {
  const value =
    typeof body === "object" && body !== null && "error" in body
      ? body.error
      : undefined;
  const activeRunId =
    typeof body === "object" && body !== null && "active_run_id" in body
      ? body.active_run_id
      : undefined;
  return {
    error:
      typeof value === "string" && /^[a-z]+(?:_[a-z]+)*$/u.test(value)
        ? value
        : "internal_error",
    request_id: requestId,
    ...(typeof activeRunId === "string" ? { active_run_id: activeRunId } : {}),
  };
}

export class ApiError extends HttpException {
  constructor(status: number, body: ApiErrorBody) {
    super(body, status);
  }
}
