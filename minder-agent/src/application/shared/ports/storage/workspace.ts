import type { RoomId, WorkspacePath } from "@domain/index.js";
export interface WorkspaceTreeRequest {
  readonly roomId: RoomId;
  readonly path?: string;
}
export interface WorkspaceTree {
  readonly path: string;
  readonly entries: readonly {
    readonly path: string;
    readonly kind: "file" | "directory";
    readonly size?: number;
  }[];
}
export interface WorkspaceContentRequest {
  readonly roomId: RoomId;
  readonly path: string;
}
export interface WorkspaceContent {
  readonly path: string;
  readonly content: Uint8Array;
  readonly contentType?: string;
}
export interface WorkspacePort {
  ensure(roomId: RoomId): Promise<WorkspacePath>;
  tree(input: WorkspaceTreeRequest): Promise<WorkspaceTree>;
  read(input: WorkspaceContentRequest): Promise<WorkspaceContent>;
  sync(path: WorkspacePath): Promise<void>;
}
