import { writeRuntimeLog } from "./runtime-log.js";

export type DebugLog = (entry: string) => void;

export interface AgentRunDebugSummary {
  readonly runId: string;
  readonly mode: string;
  readonly trigger: string;
  readonly manifestName?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly status: string;
  readonly sawDone: boolean;
  readonly responseChars: number;
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly requestId?: string;
  readonly sessionId?: string;
  readonly roomId?: string;
  readonly durationMs?: number;
  readonly failureStage?: string;
  readonly errorCode?: string;
  readonly errorCategory?: string;
  readonly providerStatus?: number;
}

export function writeAgentRunDebug(
  debugLog: DebugLog | undefined,
  summary: AgentRunDebugSummary,
  secrets: readonly string[] = [],
): void {
  writeRuntimeLog(
    debugLog,
    "agent_run_summary",
    { ...summary },
    summary.status === "failed" ? "error" : "info",
    secrets,
  );
}
