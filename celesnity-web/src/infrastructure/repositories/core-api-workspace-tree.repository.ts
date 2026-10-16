import type { WorkspaceTreeRepository } from '@/src/application/repositories/workspace-tree.repository.interface';
import type { RunFileContent } from '@/src/entities/models/chat';
import type { WorkspaceEntry, WorkspaceTreeResult } from '@/src/entities/models/workspace-tree';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface WorkspaceEntryResponseDto {
  readonly path: string;
  readonly isDir: boolean;
  readonly sizeBytes?: number;
  readonly modifiedAt: string;
  readonly mimeType?: string;
}

interface WorkspaceTreeResponseDto {
  readonly entries: readonly WorkspaceEntryResponseDto[];
  readonly truncated: boolean;
}

export class CoreApiWorkspaceTreeRepository implements WorkspaceTreeRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listTree(roomId: string): Promise<WorkspaceTreeResult> {
    const response = await this.request<WorkspaceTreeResponseDto>(
      `/rooms/${encodeURIComponent(roomId)}/workspace/tree`,
      { method: 'GET' },
    );

    return {
      entries: response.entries.map(mapWorkspaceEntry),
      truncated: response.truncated,
    };
  }

  public async getFileContent(roomId: string, path: string): Promise<RunFileContent> {
    const response = await this.stream(
      `/rooms/${encodeURIComponent(roomId)}/workspace/content?path=${encodeURIComponent(path)}`,
    );
    const blob = await response.blob();
    const contentDisposition = response.headers.get('content-disposition') ?? '';

    return {
      blob,
      mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
      sizeBytes: blob.size,
      fileName: fileNameFromDisposition(contentDisposition) ?? basename(path),
    };
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  private async stream(path: string): Promise<Response> {
    try {
      // CoreApiClient supplies authenticated cookies and the Core API route is
      // not an agent-gateway route, so no synthetic caller header is added.
      return await this.transport.stream(path);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapWorkspaceEntry(dto: WorkspaceEntryResponseDto): WorkspaceEntry {
  return {
    path: dto.path,
    isDir: dto.isDir,
    ...(dto.sizeBytes === undefined ? {} : { sizeBytes: dto.sizeBytes }),
    modifiedAt: dto.modifiedAt,
    ...(dto.mimeType === undefined ? {} : { mimeType: dto.mimeType }),
  };
}

function fileNameFromDisposition(disposition: string): string | undefined {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/iu.exec(disposition);
  if (match?.[1] === undefined) return undefined;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function basename(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] || 'download';
}
