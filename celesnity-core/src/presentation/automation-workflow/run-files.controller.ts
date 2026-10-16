import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';

import {
  AGENT_RUN_FILES_CLIENT,
  RUN_OWNERSHIP_RESOLVER,
} from '@application/automation-workflow/tokens';
import type { IRunOwnershipResolver } from '@application/automation-workflow/interfaces/i-run-ownership-resolver';
import type { IAgentRunFilesClient } from '@application/automation-workflow/interfaces/i-agent-run-files-client';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RunFileListResponseDto } from '@presentation/automation-workflow/run-files.dto';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

/**
 * Human/UI-facing proxy over minder-agent's run-file endpoints (B1's
 * AgentRunFilesClient). Unlike the agent, these routes carry a human
 * principal, so every call is org-scoped through B2's RunOwnershipResolver:
 * a cross-org run yields 403 before any agent call is made. Path traversal is
 * rejected here as defense-in-depth (the agent does the authoritative check).
 *
 * Top-level `runs` controller — distinct from AutomationWorkflowController's
 * `automation-workflows`, so no route collision.
 */
@ApiTags('runs')
@Controller('runs')
@RequireWorkspaceFeature('HOME', 'EXECUTIONS')
export class RunFilesController {
  public constructor(
    @Inject(AGENT_RUN_FILES_CLIENT) private readonly client: IAgentRunFilesClient,
    @Inject(RUN_OWNERSHIP_RESOLVER) private readonly ownership: IRunOwnershipResolver,
  ) {}

  @Get(':runId/files')
  @ApiOperation({ summary: 'List files a run read, created, or modified' })
  @ApiOkResponse({ type: RunFileListResponseDto })
  public async listFiles(
    @Param('runId') runId: string,
    @Req() req: Request,
  ): Promise<RunFileListResponseDto> {
    const principal = requireAuthenticatedPrincipal(req);
    await this.assertOwned(runId, principal.organizationId);
    const files = await this.client.listFiles(runId);
    return {
      files: files.map((file) => ({
        path: file.path,
        accessType: file.accessType,
        toolName: file.toolName,
        accessedAt: file.accessedAt,
        available: file.available,
        sizeBytes: file.sizeBytes,
        mimeType: file.mimeType,
      })),
    };
  }

  @Get(':runId/files/content')
  @ApiOperation({ summary: 'Stream a run file for view or download' })
  public async getContent(
    @Param('runId') runId: string,
    @Query('path') path: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    this.assertSafePath(path);
    const principal = requireAuthenticatedPrincipal(req);
    await this.assertOwned(runId, principal.organizationId);

    const isDownload = download === '1';
    const content = await this.client.getFileContent(runId, path, isDownload);
    if (content === undefined || content.body === null) {
      throw new BadRequestException('file unavailable');
    }

    res.setHeader('Content-Type', content.contentType);
    if (content.contentLength !== undefined) {
      res.setHeader('Content-Length', content.contentLength);
    }
    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${content.fileName}"`);
    }

    // Readable.fromWeb narrows to the DOM ReadableStream type, which fights the
    // undici/web ReadableStream<Uint8Array> that fetch().body yields under this
    // TS lib config; the runtime stream is identical, so cast the single arg.
    return new StreamableFile(
      Readable.fromWeb(content.body as Parameters<typeof Readable.fromWeb>[0]),
    );
  }

  private async assertOwned(runId: string, organizationId: string): Promise<void> {
    const owned = await this.ownership.ownsRun(runId, organizationId);
    if (!owned) {
      throw new ForbiddenException('run not accessible');
    }
  }

  private assertSafePath(path: string): void {
    if (!path || path.startsWith('/') || path.split('/').includes('..')) {
      throw new BadRequestException('invalid path');
    }
  }
}
