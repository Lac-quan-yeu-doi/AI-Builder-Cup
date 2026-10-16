export interface DoomLoopPolicy {
  readonly maxRepeatedToolCalls: number;
}
export interface ToolSelectionPolicy {
  readonly allowParallelReadOnly: boolean;
}
export interface ReminderPolicy {
  readonly enabled: boolean;
}
export interface ContextCompactionPolicy {
  readonly enabled: boolean;
  readonly tokenThreshold: number;
}
export interface AgentLoopPolicy {
  readonly maxIterations: number;
  readonly doomLoop: DoomLoopPolicy;
  readonly toolSelection: ToolSelectionPolicy;
  readonly reminders: ReminderPolicy;
  readonly compaction: ContextCompactionPolicy;
}
