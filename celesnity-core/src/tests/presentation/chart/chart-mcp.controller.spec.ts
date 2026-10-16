import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import type { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { ChatChartCreationUseCases } from '@application/chart/chat-chart-creation.use-cases';
import { ChartMcpController } from '@presentation/chart/chart-mcp.controller';

class TestableChartMcpController extends ChartMcpController {
  public run(
    meta: RequestMeta | undefined,
    call: () => Promise<CallToolResult>,
  ): Promise<CallToolResult> {
    return this.runToolCall(meta, call);
  }
}

describe('ChartMcpController room delegation', () => {
  const callResult: CallToolResult = { content: [{ type: 'text', text: 'ok' }] };

  it('delegates each tool call using trusted room and caller metadata', async () => {
    const runForFeature = jest.fn(
      async (
        _roomId: string,
        _subject: string,
        _feature: string,
        call: () => Promise<CallToolResult>,
      ): Promise<CallToolResult> => call(),
    );
    const controller = new TestableChartMcpController(
      {} as ChatChartCreationUseCases,
      { runForFeature } as unknown as AgentRoomDelegationService,
      {} as AuthenticatedContextStore,
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
      'ANALYTICS',
      call,
      'workspace:read',
      'chat-assistant',
      '40000000-0000-4000-8000-000000000001',
      undefined,
      undefined,
    );
  });

  it('fails closed without both trusted delegation keys', async () => {
    const delegation = { runForFeature: jest.fn() } as unknown as AgentRoomDelegationService;
    const controller = new TestableChartMcpController(
      {} as ChatChartCreationUseCases,
      delegation,
      {} as AuthenticatedContextStore,
    );

    await expect(
      controller.run({ 'com.celesnity/room-id': 'room-a' }, async () => callResult),
    ).rejects.toThrow('Trusted MCP room delegation metadata is required.');
    expect(delegation.runForFeature).not.toHaveBeenCalled();
  });
});
