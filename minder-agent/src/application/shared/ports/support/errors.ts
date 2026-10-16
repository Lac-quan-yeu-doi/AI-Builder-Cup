export type PortErrorCode =
  | "not_found"
  | "conflict"
  | "forbidden"
  | "unavailable"
  | "validation"
  | "transport";
export class PortError extends Error {
  constructor(
    readonly code: PortErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PortError";
  }
}
