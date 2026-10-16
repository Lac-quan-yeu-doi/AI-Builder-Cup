import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Query,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards,
  BadRequestException,
  Res,
} from "@nestjs/common";
import type { WorkspaceProvider } from "@application/shared/ports/index.js";
import { WORKSPACE_PROVIDER } from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

@UseGuards(OwnerAuthGuard)
@Controller({ path: "rooms/:roomId/workspace", version: ["1", "2"] })
export class WorkspaceNestController {
  constructor(
    @Optional()
    @Inject(WORKSPACE_PROVIDER)
    private readonly workspace: WorkspaceProvider | undefined,
  ) {}

  @Get("tree")
  async tree(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
  ): Promise<object> {
    try {
      const tree = await this.requireWorkspace().tree(owner.owner, roomId);
      return {
        entries: tree.entries.map((entry) => ({
          path: entry.path,
          is_dir: entry.isDir,
          ...(entry.sizeBytes === undefined
            ? {}
            : { size_bytes: entry.sizeBytes }),
          modified_at: entry.modifiedAt,
        })),
        truncated: false,
      };
    } catch (error) {
      throw this.workspaceError(error);
    }
  }

  @Get("content")
  async content(
    @CurrentOwner() owner: OwnerContext,
    @Param("roomId") roomId: string,
    @Query("path") path = "",
    @Res({ passthrough: true }) response: ResponseHeaders,
  ): Promise<StreamableFile> {
    try {
      const content = await this.requireWorkspace().read(
        owner.owner,
        roomId,
        path,
      );
      if (!content)
        throw new NotFoundException({ error: "workspace_file_not_found" });
      response.setHeader(
        "content-disposition",
        `inline; filename="${content.fileName}"`,
      );
      return new StreamableFile(content.content, {
        type: content.contentType,
        length: content.content.byteLength,
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw this.workspaceError(error);
    }
  }

  private requireWorkspace(): WorkspaceProvider {
    if (this.workspace === undefined)
      throw new ServiceUnavailableException({
        error: "workspace_not_configured",
      });
    return this.workspace;
  }

  private workspaceError(error: unknown): Error {
    if (error instanceof ServiceUnavailableException) return error;
    return error instanceof Error && error.message.includes("Workspace")
      ? new BadRequestException({ error: "invalid_workspace_path" })
      : error instanceof Error
        ? error
        : new Error(String(error));
  }
}
