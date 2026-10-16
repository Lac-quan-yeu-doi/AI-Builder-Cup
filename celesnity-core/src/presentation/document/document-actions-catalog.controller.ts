import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { ActionDefinition } from '@application/actions/action.types';
import { buildMcpCatalog, type McpToolCatalogEntry } from '@application/actions/mcp-catalog';
import type { DocumentActions } from '@application/document/document.actions';
import { DOCUMENT_ACTIONS } from '@application/document/document.actions';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

/**
 * Serves the document action registry's MCP tool catalog — the single
 * source of truth `mcp-document` fetches at startup. See `document.actions.ts`
 * and `application/actions/mcp-catalog.ts`.
 */
@ApiTags('document-actions')
@Controller('document-actions')
@RequireWorkspaceFeature('DOCUMENTS')
export class DocumentActionsCatalogController {
  public constructor(@Inject(DOCUMENT_ACTIONS) private readonly actions: DocumentActions) {}

  @Get('mcp-tools')
  @ApiOperation({ summary: 'List document actions exposed as MCP tools, with their JSON schemas' })
  public mcpTools(): readonly McpToolCatalogEntry[] {
    return buildMcpCatalog(
      this.actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
    );
  }
}
