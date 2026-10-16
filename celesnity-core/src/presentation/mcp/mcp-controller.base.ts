import { randomUUID } from 'node:crypto';
import { Delete, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpToolServer, type McpToolHandler } from './mcp-tool-server';
import { mcpOperationPermission } from '@application/administration/mcp-operation-policy';
import type { Permission } from '@application/administration/authorization-policy';
import type { VerifiedMcpRequest } from './mcp-authentication.guard';

/**
 * Shared Streamable HTTP route handling for every MCP-over-HTTP controller
 * (chart, document, Trino, automation workflow, and future MCP services) — one endpoint handles
 * protocol through stateless POST requests. Each concrete controller
 * supplies only its server name, instructions, and tool handlers
 * (optionally reading the incoming request, the way chart-mcp reads its
 * approval-override header, read independently on each request).
 * `@Get`/`@Post`/`@Delete` on these methods are inherited by subclasses
 * along with their own `@Controller`/`@MachineAuthenticated`/`@UseGuards`
 * decorators — standard NestJS controller inheritance. Tool execution is always delegated to
 * the room's persisted human principal; missing or stale delegation metadata fails closed.
 */
export abstract class McpController {
  protected abstract readonly serverName: string;
  protected abstract readonly instructions: string;
  protected abstract buildTools(req: Request): readonly McpToolHandler[];

  /**
   * Fail-closed default: concrete controllers override this to delegate the
   * tool call to the room's persisted human principal via
   * `AgentRoomDelegationService.runForFeature(...)`. The base refuses to run
   * any tool call itself so a controller that forgets to wire delegation
   * cannot silently execute privileged tools.
   */
  protected runToolCall(
    _meta: RequestMeta | undefined,
    _call: () => Promise<CallToolResult>,
    _permission: Permission = 'workspace:write',
    _requestId?: string,
    _workloadEmail?: string,
  ): Promise<CallToolResult> {
    return Promise.reject(new Error('Trusted MCP room delegation metadata is required.'));
  }

  @Post()
  public async post(@Req() req: VerifiedMcpRequest, @Res() res: Response): Promise<void> {
    const requestId = req.get('X-Request-Id') ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);
    // Every request may land on a different Core replica. Never retain
    // transport/session state or approval overrides between HTTP requests.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = buildMcpToolServer(
      this.serverName,
      this.instructions,
      this.buildTools(req),
      (meta, call, toolName) =>
        this.runToolCall(meta, call, mcpOperationPermission(this.serverName, toolName), requestId,
          req.verifiedAgentWorkload?.email ?? 'local-development'),
    );
    res.once('close', () => {
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      await server.close();
      throw error;
    }
  }

  @Get()
  public get(@Req() req: Request, @Res() res: Response): Promise<void> {
    this.methodNotAllowed(res);
    return Promise.resolve();
  }

  @Delete()
  public delete(@Req() req: Request, @Res() res: Response): Promise<void> {
    this.methodNotAllowed(res);
    return Promise.resolve();
  }

  private methodNotAllowed(res: Response): void {
    res.setHeader('Allow', 'POST');
    res
      .status(405)
      .json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed' } });
  }
}
