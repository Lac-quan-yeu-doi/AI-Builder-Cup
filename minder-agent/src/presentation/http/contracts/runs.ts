export interface RunStatusDto {
  readonly run_id: string;
  readonly status: string;
  readonly session_id?: string;
  readonly finished_at?: string;
  readonly response_text: string;
  readonly error?: string;
}
