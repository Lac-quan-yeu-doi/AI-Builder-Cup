type Branded<Value, Brand extends string> = Value & { readonly __brand: Brand };

export type SessionId = Branded<string, "SessionId">;
export type RunId = Branded<string, "RunId">;
export type RoomId = Branded<string, "RoomId">;
export type AgentId = Branded<string, "AgentId">;
export type CallerId = Branded<string, "CallerId">;
export type SkillName = Branded<string, "SkillName">;
export type WorkspacePath = Branded<string, "WorkspacePath">;

export const sessionId = (value: string): SessionId => value as SessionId;
export const runId = (value: string): RunId => value as RunId;
export const roomId = (value: string): RoomId => value as RoomId;
export const agentId = (value: string): AgentId => value as AgentId;
export const callerId = (value: string): CallerId => value as CallerId;
export const skillName = (value: string): SkillName => value as SkillName;
export const workspacePath = (value: string): WorkspacePath =>
  value as WorkspacePath;
