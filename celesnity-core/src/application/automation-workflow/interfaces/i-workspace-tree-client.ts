export interface WorkspaceEntryDto {
  readonly path: string;
  readonly isDir: boolean;
  readonly sizeBytes?: number;
  readonly modifiedAt: string;
}

export interface WorkspaceTreeResult {
  readonly entries: WorkspaceEntryDto[];
  readonly truncated: boolean;
}

export interface WorkspaceFileContent {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly contentType: string;
  readonly contentLength?: number;
  readonly fileName: string;
}

export interface IWorkspaceTreeClient {
  listTree(roomId: string, callerId: string): Promise<WorkspaceTreeResult>;
  getContent(
    roomId: string,
    path: string,
    download: boolean,
    callerId: string,
  ): Promise<WorkspaceFileContent | undefined>;
}
