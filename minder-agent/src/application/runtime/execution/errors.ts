export type RuntimeStoreErrorCode =
  | "session_not_found"
  | "run_not_found"
  | "mode_conflict"
  | "invalid_transition";

export class RuntimeStoreError extends Error {
  constructor(
    readonly code: RuntimeStoreErrorCode,
    detail: string,
  ) {
    super(detail);
    this.name = "RuntimeStoreError";
  }
}
