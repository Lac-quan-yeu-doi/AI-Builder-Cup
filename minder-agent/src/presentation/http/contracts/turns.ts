export interface StartedTurnDto {
  readonly run_id: string;
  readonly session_id?: string;
  readonly events_url: string;
}
export type AdmissionDto =
  | StartedTurnDto
  | { readonly error: "session_busy"; readonly active_run_id: string }
  | { readonly status: "duplicate_delivery" };
export type AdmissionInput =
  | {
      readonly kind: "started";
      readonly runId: string;
      readonly sessionId?: string;
    }
  | { readonly kind: "rejected"; readonly activeRunId: string }
  | { readonly kind: "duplicate_delivery" };
export const toAdmissionDto = (input: AdmissionInput): AdmissionDto => {
  if (input.kind === "duplicate_delivery")
    return { status: "duplicate_delivery" };
  if (input.kind === "rejected")
    return { error: "session_busy", active_run_id: input.activeRunId };
  return {
    run_id: input.runId,
    ...(input.sessionId === undefined ? {} : { session_id: input.sessionId }),
    events_url: `/runs/${input.runId}/events`,
  };
};
