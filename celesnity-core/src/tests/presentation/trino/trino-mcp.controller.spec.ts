import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import type { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import type { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import type { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';
import { TrinoMcpController } from '@presentation/trino/trino-mcp.controller';

class TestableTrinoMcpController extends TrinoMcpController {
  public run(
    meta: RequestMeta | undefined,
    call: () => Promise<CallToolResult>,
  ): Promise<CallToolResult> {
    return this.runToolCall(meta, call);
  }
}

describe('TrinoMcpController room delegation', () => {
  const callResult: CallToolResult = { content: [{ type: 'text', text: 'ok' }] };

  it('delegates a tool call using room and caller metadata', async () => {
    const runForFeature = jest.fn(
      async (
        _roomId: string,
        _subject: string,
        _feature: string,
        call: () => Promise<CallToolResult>,
      ): Promise<CallToolResult> => call(),
    );
    const delegation = { runForFeature } as unknown as AgentRoomDelegationService;
    const controller = new TestableTrinoMcpController(
      {} as QueryWorkbenchUseCases,
      {} as CatalogExplorationUseCases,
      delegation,
    );
    const call = jest.fn().mockResolvedValue(callResult);

    await expect(
      controller.run(
        {
          'com.celesnity/room-id': 'room-a',
          'com.celesnity/caller-subject': 'subject-a',
          'com.minder/agent': 'chat-assistant',
          'com.celesnity/authorization-run-id': '40000000-0000-4000-8000-000000000001',
        },
        call,
      ),
    ).resolves.toEqual(callResult);
    expect(runForFeature).toHaveBeenCalledWith(
      'room-a',
      'subject-a',
      'QUERY',
      call,
      'workspace:read',
      'chat-assistant',
      '40000000-0000-4000-8000-000000000001',
      undefined,
      undefined,
    );
  });

  it('rejects calls without complete trusted metadata', async () => {
    const delegation = { runForFeature: jest.fn() } as unknown as AgentRoomDelegationService;
    const controller = new TestableTrinoMcpController(
      {} as QueryWorkbenchUseCases,
      {} as CatalogExplorationUseCases,
      delegation,
    );

    await expect(
      controller.run({ 'com.celesnity/room-id': 'room-a' }, async () => callResult),
    ).rejects.toThrow('Trusted MCP room delegation metadata is required.');
    expect(delegation.runForFeature).not.toHaveBeenCalled();
  });
});
