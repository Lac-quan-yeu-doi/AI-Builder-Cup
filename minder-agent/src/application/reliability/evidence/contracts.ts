import type { JsonValue } from "@domain/index.js";
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}
export interface CircuitBreakerPort {
  canExecute(key: string): Promise<boolean>;
  recordSuccess(key: string): Promise<void>;
  recordFailure(key: string): Promise<void>;
}
export interface SecretRedactor {
  redact(input: string): string;
}
export interface CostTracker {
  record(inputTokens: number, outputTokens: number): Promise<void>;
}
export interface PermissionPolicy {
  allows(action: string, path?: string): boolean;
}
export interface AutonomyPolicy {
  readonly level: "read_only" | "supervised" | "autonomous";
}
export interface SandboxPolicy {
  readonly enabled: boolean;
  readonly allowedCommands: readonly string[];
}
export interface RunManifest {
  readonly contentHash: string;
  readonly values: JsonValue;
}
export interface ValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
