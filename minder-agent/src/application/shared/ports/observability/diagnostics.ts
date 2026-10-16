import type { JsonValue } from "@domain/index.js";
export interface DiagnosticPort {
  record(name: string, data: JsonValue): Promise<void>;
}
