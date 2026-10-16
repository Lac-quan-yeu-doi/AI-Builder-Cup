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

import { type IWorkspaceTreeClient } from '@application/automation-workflow/interfaces/i-workspace-tree-client';
import type { IRoomOwnershipResolver } from '@application/automation-workflow/interfaces/i-room-ownership-resolver';
import {
  AGENT_WORKSPACE_TREE_CLIENT,
  ROOM_OWNERSHIP_RESOLVER,
} from '@application/automation-workflow/tokens';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { WorkspaceTreeResponseDto } from '@presentation/automation-workflow/workspace-tree.dto';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('rooms')
@Controller('rooms')
@RequireWorkspaceFeature('AUTOMATIONS')
export class WorkspaceTreeController {
  public constructor(
    @Inject(AGENT_WORKSPACE_TREE_CLIENT) private readonly client: IWorkspaceTreeClient,
    @Inject(ROOM_OWNERSHIP_RESOLVER) private readonly ownership: IRoomOwnershipResolver,
  ) {}

  @Get(':roomId/workspace/tree')
  @ApiOperation({ summary: 'List a room workspace tree' })
  @ApiOkResponse({ type: WorkspaceTreeResponseDto })
  public async listTree(
    @Param('roomId') roomId: string,
    @Req() req: Request,
  ): Promise<WorkspaceTreeResponseDto> {
    const principal = requireAuthenticatedPrincipal(req);
    await this.assertOwned(roomId, principal.organizationId);
    const tree = await this.client.listTree(roomId, principal.subject);
    return {
      entries: tree.entries.map((entry) => ({
        path: entry.path,
        isDir: entry.isDir,
        sizeBytes: entry.sizeBytes,
        modifiedAt: entry.modifiedAt,
      })),
      truncated: tree.truncated,
    };
  }

  @Get(':roomId/workspace/content')
  @ApiOperation({ summary: 'Stream a room workspace file' })
  public async getContent(
    @Param('roomId') roomId: string,
    @Query('path') path: string,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    this.assertSafePath(path);
    const principal = requireAuthenticatedPrincipal(req);
    await this.assertOwned(roomId, principal.organizationId);

    const isDownload = download === '1';
    const content = await this.client.getContent(roomId, path, isDownload, principal.subject);
    if (content === undefined || content.body === null) {
      throw new BadRequestException('file unavailable');
    }

    res.setHeader('Content-Type', content.contentType);
    if (content.contentLength !== undefined) {
      res.setHeader('Content-Length', content.contentLength);
    }
    if (isDownload) {
      const safeFileName = sanitizeContentDispositionFilename(content.fileName);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    }

    // Readable.fromWeb narrows to the DOM ReadableStream type, which fights the
    // undici/web ReadableStream<Uint8Array> that fetch().body yields under this
    // TS lib config; the runtime stream is identical, so cast the single arg.
    return new StreamableFile(
      Readable.fromWeb(content.body as Parameters<typeof Readable.fromWeb>[0]),
    );
  }

  private async assertOwned(roomId: string, organizationId: string): Promise<void> {
    const owned = await this.ownership.ownsRoom(roomId, organizationId);
    if (!owned) {
      throw new ForbiddenException('room not accessible');
    }
  }

  private assertSafePath(path: string): void {
    if (!path || path.startsWith('/') || path.split('/').includes('..')) {
      throw new BadRequestException('invalid path');
    }
  }
}

/**
 * Strips characters that would break out of the quoted `filename="..."`
 * parameter of a `Content-Disposition` header — double quotes, backslashes,
 * and control characters including CR/LF (header injection). The filename
 * originates from the agent's own disposition header or the request path's
 * last segment; the agent already sanitizes it, so this is defense-in-depth.
 * Falls back to a generic name if nothing usable remains.
 */
function sanitizeContentDispositionFilename(fileName: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally stripping control chars for header safety
  const cleaned = fileName.replace(/["\\\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.length > 0 ? cleaned : 'download';
}
