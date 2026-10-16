import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  MINDER_PRINCIPAL_ASSERTION_ISSUER,
  type MinderPrincipalAssertionIssuer,
} from '@application/administration/minder-principal-assertion';
import { createMinderAgentRequestHeaders } from '@infrastructure/http/automation/minder-agent-request-auth';

import type {
  IWorkspaceTreeClient,
  WorkspaceFileContent,
  WorkspaceTreeResult,
} from '@application/automation-workflow/interfaces/i-workspace-tree-client';

interface WorkspaceTreeEntryResponse {
  readonly path: string;
  readonly is_dir: boolean;
  readonly size_bytes?: number;
  readonly modified_at: string;
}

interface WorkspaceTreeResponseBody {
  readonly entries: ReadonlyArray<WorkspaceTreeEntryResponse>;
  readonly truncated?: boolean;
}

function isWorkspaceTreeEntry(value: unknown): value is WorkspaceTreeEntryResponse {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.path === 'string' &&
    typeof entry.is_dir === 'boolean' &&
    (entry.size_bytes === undefined || typeof entry.size_bytes === 'number') &&
    typeof entry.modified_at === 'string'
  );
}

function isWorkspaceTreeEntries(
  value: unknown,
): value is ReadonlyArray<WorkspaceTreeEntryResponse> {
  return Array.isArray(value) && value.every(isWorkspaceTreeEntry);
}

function isWorkspaceTreeResponseBody(value: unknown): value is WorkspaceTreeResponseBody {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    isWorkspaceTreeEntries(body.entries) &&
    (body.truncated === undefined || typeof body.truncated === 'boolean')
  );
}

@Injectable()
export class AgentWorkspaceTreeClient implements IWorkspaceTreeClient {
  private readonly logger = new Logger(AgentWorkspaceTreeClient.name);
  private readonly baseUrl: string;

  public constructor(
    config: ConfigService,
    @Optional() private readonly contexts?: AuthenticatedContextStore,
    @Optional()
    @Inject(MINDER_PRINCIPAL_ASSERTION_ISSUER)
    private readonly assertionIssuer?: MinderPrincipalAssertionIssuer,
  ) {
    this.baseUrl = config.getOrThrow('MINDER_AGENT_URL');
  }

  public async listTree(roomId: string, callerId: string): Promise<WorkspaceTreeResult> {
    const empty: WorkspaceTreeResult = { entries: [], truncated: false };
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/rooms/${encodeURIComponent(roomId)}/workspace/tree`, {
        headers: createMinderAgentRequestHeaders(this.contexts, this.assertionIssuer, callerId),
      });
    } catch (error) {
      // Degrade to an empty tree rather than a 5xx: an agent outage shows as
      // an empty workspace to the caller. Logged so it is distinguishable from
      // a genuinely empty workspace in observability.
      this.logger.warn(
        `workspace tree request to minder-agent failed for room ${roomId}: ${describeError(error)}`,
      );
      return empty;
    }
    if (!response.ok) {
      this.logger.warn(
        `minder-agent returned ${response.status} for workspace tree of room ${roomId}; serving empty tree`,
      );
      return empty;
    }
    const body = (await response.json().catch(() => null)) as unknown;
    if (!isWorkspaceTreeResponseBody(body)) {
      this.logger.warn(
        `minder-agent returned a malformed workspace tree body for room ${roomId}; serving empty tree`,
      );
      return empty;
    }
    return {
      entries: body.entries.map((entry) => ({
        path: entry.path,
        isDir: entry.is_dir,
        sizeBytes: entry.size_bytes,
        modifiedAt: entry.modified_at,
      })),
      truncated: body.truncated ?? false,
    };
  }

  public async getContent(
    roomId: string,
    path: string,
    download: boolean,
    callerId: string,
  ): Promise<WorkspaceFileContent | undefined> {
    const url = `${this.baseUrl}/rooms/${encodeURIComponent(roomId)}/workspace/content?path=${encodeURIComponent(path)}&download=${download ? 1 : 0}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: createMinderAgentRequestHeaders(this.contexts, this.assertionIssuer, callerId),
      });
    } catch (error) {
      this.logger.warn(
        `workspace content request to minder-agent failed for room ${roomId}: ${describeError(error)}`,
      );
      return undefined;
    }
    if (!response.ok) {
      this.logger.warn(
        `minder-agent returned ${response.status} for workspace content of room ${roomId}; content unavailable`,
      );
      return undefined;
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const lengthHeader = response.headers.get('content-length');
    return {
      body: response.body,
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      contentLength: lengthHeader ? Number(lengthHeader) : undefined,
      fileName: match?.[1] ?? (path.split('/').pop() || 'download'),
    };
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
