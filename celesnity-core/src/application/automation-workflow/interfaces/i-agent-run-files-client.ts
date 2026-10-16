export interface RunFileEntryDto {
  readonly path: string;
  readonly accessType: 'read' | 'created' | 'modified';
  readonly toolName: string;
  readonly accessedAt: string;
  readonly available: boolean;
  readonly sizeBytes?: number;
  readonly mimeType?: string;
}

export interface RunFileContent {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly contentType: string;
  readonly contentLength?: number;
  readonly fileName: string;
}

export interface IAgentRunFilesClient {
  listFiles(runId: string): Promise<RunFileEntryDto[]>;
  getFileContent(
    runId: string,
    path: string,
    download: boolean,
  ): Promise<RunFileContent | undefined>;
}
