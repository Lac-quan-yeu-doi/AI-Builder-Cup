import type { ActionActor, ActionDefinition } from '@application/actions/action.types';
import { buildMcpCatalog } from '@application/actions/mcp-catalog';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import type { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import type { DocumentActions } from '@application/document/document.actions';
import { approvalOverrideFromRawHeader } from '@presentation/http/action-approval-override';
import { runAction, unwrapCompleted } from '@presentation/http/run-action';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { toInputSchema, toolError, toolResult } from '@presentation/mcp/mcp-tool-server';
import { DocumentResponse, DocumentTextResponse } from './document.response';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { AutomationChartPreviewStore } from '@application/chart/automation-chart-preview.store';

/** Everything one open MCP session needs to dispatch a document tool call. */
export interface DocumentMcpContext {
  readonly actions: DocumentActions;
  readonly auditLog: IActionAuditLog;
  readonly pendingActions: PendingActionUseCases;
  readonly approvalOverridesHeader: string | undefined;
  readonly authenticatedContexts: AuthenticatedContextStore;
  readonly chartPreviews?: AutomationChartPreviewStore;
}

/**
 * MCP tool handlers wrapping `DocumentActions` — mostly a direct in-process
 * port of `mcp-document`'s Rust `ServerHandler` (thin, mechanical arg
 * parsing), except `create_document`: unlike the read-only tools (which call
 * `actions.x.run()` directly, same as `DocumentController` does for reads),
 * writing a new document goes through `runAction` so it lands in the audit
 * log, mirroring `automation-workflow-mcp-tools.ts`'s write handlers.
 */
export function buildDocumentMcpTools(ctx: DocumentMcpContext): readonly McpToolHandler[] {
  const catalog = buildMcpCatalog(
    ctx.actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
  );
  const toolByAction = new Map(catalog.map((entry) => [entry.action_name, entry]));

  const createEntry = toolByAction.get('document.create');
  const getTextEntry = toolByAction.get('document.getText');
  const listEntry = toolByAction.get('document.list');
  if (createEntry === undefined || getTextEntry === undefined || listEntry === undefined) {
    throw new Error('document MCP catalog is missing an expected tool — actions/catalog drifted.');
  }

  return [
    {
      tool: {
        name: createEntry.tool_name,
        description: createEntry.description,
        inputSchema: toInputSchema(createEntry.input_schema),
      },
      call: async (args): Promise<CallToolResult> => {
        const content = requireString(args, 'content');
        const path = requireString(args, 'path');
        if ((content === undefined) === (path === undefined)) {
          return toolError('Provide exactly one of content or path.');
        }
        const filename = optionalString(args, 'filename');
        const mimeType = optionalString(args, 'mime_type');
        if (content !== undefined && filename?.trim().toLowerCase().endsWith('.pdf')) {
          return toolError('Use path to publish a generated PDF file.');
        }
        const suppliedChartPreviews = optionalChartPreviews(args['chart_previews']);
        if (suppliedChartPreviews === undefined)
          return toolError('chart_previews must be an array.');
        if (path !== undefined && mimeType !== undefined) {
          return toolError('mime_type applies only when creating a content document.');
        }
        if (path === undefined && filename === undefined) {
          return toolError('Missing required argument: filename for content documents.');
        }
        const automationRunId = ctx.authenticatedContexts.current()?.automationRunId;
        const chartPreviews = mergeChartPreviews(
          suppliedChartPreviews,
          ctx.chartPreviews?.forRun(automationRunId) ?? [],
        );

        const sourceRunId =
          ctx.authenticatedContexts.current()?.agentRunId ??
          ctx.authenticatedContexts.current()?.automationRunId;
        const input =
          path !== undefined
            ? { path, filename }
            : {
                filename: filename!,
                text: content!,
                mimeType,
                chartPreviews,
                sourceRunId: automationRunId,
              };
        const result = await runAction(
          ctx.actions.create,
          input,
          path !== undefined
            ? { source: 'agent', runId: sourceRunId ?? null, identityId: null }
            : agentActorFrom(args),
          ctx.auditLog,
          ctx.pendingActions,
          undefined,
          approvalOverrideFor(ctx, 'document.create'),
        );
        if (result.kind === 'pending_approval') {
          return toolResult(
            JSON.stringify(
              { status: 'pending_approval', pending_action_id: result.pendingActionId },
              null,
              2,
            ),
          );
        }

        const response = DocumentResponse.from(unwrapCompleted(result));
        return documentToolResult(response);
      },
    },
    {
      tool: {
        name: getTextEntry.tool_name,
        description: getTextEntry.description,
        inputSchema: toInputSchema(getTextEntry.input_schema),
      },
      call: async (args): Promise<CallToolResult> => {
        const documentId = requireString(args, 'document_id');
        if (documentId === undefined) return toolError('Missing required argument: document_id');
        const startPage = optionalInteger(args, 'start_page');
        const endPage = optionalInteger(args, 'end_page');
        const actor = agentActorFrom(args);

        const { document, text } = await ctx.actions.getText.run(
          { documentId, startPage, endPage },
          actor,
        );
        const response = toolResult(
          JSON.stringify(new DocumentTextResponse(document, text), null, 2),
        );
        const content = await ctx.actions.getContent.run({ documentId }, actor);
        return {
          ...response,
          content: [
            ...response.content,
            {
              type: 'resource',
              resource: {
                uri: `celesnity://documents/${encodeURIComponent(documentId)}`,
                mimeType: content.document.mimeType,
                blob: Buffer.from(content.bytes).toString('base64'),
              },
            },
          ],
        };
      },
    },
    {
      tool: {
        name: listEntry.tool_name,
        description: listEntry.description,
        inputSchema: toInputSchema(listEntry.input_schema),
      },
      call: async (args): Promise<CallToolResult> => {
        const cursor = optionalString(args, 'cursor');
        const limit = optionalInteger(args, 'limit');
        const actor = agentActorFrom(args);

        const documents = await ctx.actions.list.run({ cursor, limit }, actor);
        return toolResult(JSON.stringify(DocumentResponse.fromList(documents), null, 2));
      },
    },
  ];
}

function documentToolResult(response: DocumentResponse): CallToolResult {
  return {
    ...toolResult(JSON.stringify(response, null, 2)),
    _meta: {
      message_block: {
        type: 'document',
        version: 1,
        payload: {
          document_id: response.id,
          filename: response.filename,
          mime_type: response.mime_type,
          chart_previews: response.chart_previews,
        },
        fallback_text: `${response.filename} document`,
      },
    },
  };
}

function agentActorFrom(args: Record<string, unknown>): ActionActor {
  return { source: 'agent', runId: optionalString(args, 'run_id') ?? null, identityId: null };
}

function approvalOverrideFor(ctx: DocumentMcpContext, actionName: string): boolean | undefined {
  return approvalOverrideFromRawHeader(ctx.approvalOverridesHeader, actionName);
}

function requireString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  return requireString(args, key);
}

function optionalInteger(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' ? value : undefined;
}

function optionalChartPreviews(
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  return value.every(isJsonObject) ? value : undefined;
}

function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeChartPreviews(
  supplied: readonly Readonly<Record<string, unknown>>[],
  remembered: readonly Readonly<Record<string, unknown>>[],
): readonly Readonly<Record<string, unknown>>[] {
  const completeByTitle = new Map(
    remembered
      .filter(
        (preview) => Array.isArray(preview['rows']) && Array.isArray(preview['output_schema']),
      )
      .map((preview) => [preview['title'], preview]),
  );
  const merged = supplied.map((preview) => {
    const rememberedPreview = completeByTitle.get(preview['title']);
    return rememberedPreview === undefined ? preview : rememberedPreview;
  });
  const suppliedTitles = new Set(merged.map((preview) => preview['title']));
  return [...merged, ...remembered.filter((preview) => !suppliedTitles.has(preview['title']))];
}
