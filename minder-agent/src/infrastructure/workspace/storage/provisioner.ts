import type { RoomId, WorkspacePath } from "@domain/index.js";
export interface WorkspaceProvisioner {
  provision(roomId: RoomId): Promise<WorkspacePath>;
}
