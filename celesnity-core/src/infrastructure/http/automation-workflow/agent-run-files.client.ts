import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  MINDER_PRINCIPAL_ASSERTION_ISSUER,
  type MinderPrincipalAssertionIssuer,
} from '@application/administration/minder-principal-assertion';
import { createMinderAgentRequestHeaders } from '@infrastructure/http/automation/minder-agent-request-auth';

import type {
  IAgentRunFilesClient,
  RunFileContent,
  RunFileEntryDto,
} from '@application/automation-workflow/interfaces/i-agent-run-files-client';

const CALLER_ID = 'celesnity-core/run-files-proxy';

interface RunFilesResponseBody {
  readonly files?: ReadonlyArray<{
    path: string;
    access_type: 'read' | 'created' | 'modified';
    tool_name: string;
    accessed_at: string;
    available: boolean;
    size_bytes?: number;
    mime_type?: string;
  }>;
}

@Injectable()
export class AgentRunFilesClient implements IAgentRunFilesClient {
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

  public async listFiles(runId: string): Promise<RunFileEntryDto[]> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/runs/${encodeURIComponent(runId)}/files`, {
        headers: createMinderAgentRequestHeaders(this.contexts, this.assertionIssuer, CALLER_ID),
      });
    } catch {
      return [];
    }
    if (!response.ok) return [];
    const body = (await response.json().catch(() => null)) as RunFilesResponseBody | null;
    if (!body?.files) return [];
    return body.files.map((f) => ({
      path: f.path,
      accessType: f.access_type,
      toolName: f.tool_name,
      accessedAt: f.accessed_at,
      available: f.available,
      sizeBytes: f.size_bytes,
      mimeType: f.mime_type,
    }));
  }

  public async getFileContent(
    runId: string,
    path: string,
    download: boolean,
  ): Promise<RunFileContent | undefined> {
    const url = `${this.baseUrl}/runs/${encodeURIComponent(runId)}/files/content?path=${encodeURIComponent(path)}&download=${download ? 1 : 0}`;
    let response: Response;
    try {
      const fetchFile = async (): Promise<Response> =>
        fetch(url, {
          headers: createMinderAgentRequestHeaders(this.contexts, this.assertionIssuer, CALLER_ID),
        });
      const context = this.contexts?.current();
      response =
        context?.automationRunId !== undefined
          ? await this.contexts!.runBackground(
              context.organizationId,
              fetchFile,
              'AUTOMATIONS',
            )
          : await fetchFile();
    } catch {
      return undefined;
    }
    if (!response.ok) return undefined;
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const lengthHeader = response.headers.get('content-length');
    return {
      body: response.body,
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      contentLength: lengthHeader ? Number(lengthHeader) : undefined,
      fileName: match?.[1] ?? path.split('/').pop() ?? 'download',
    };
  }
}
