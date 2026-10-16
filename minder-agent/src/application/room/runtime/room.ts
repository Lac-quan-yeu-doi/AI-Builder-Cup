import type { JsonObject, Room, RunId } from "@domain/index.js";
export interface RoomRun {
  readonly runId: RunId;
  readonly room: Room;
  readonly agent?: string;
  readonly input?: string;
  readonly dataScope?: {
    readonly catalog?: string;
    readonly schema: string;
  };
  readonly context?: JsonObject;
  readonly parentRunId?: RunId;
  readonly depth: number;
}
