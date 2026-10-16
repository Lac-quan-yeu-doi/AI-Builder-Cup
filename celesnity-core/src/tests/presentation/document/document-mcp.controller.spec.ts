import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';
import type { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import type { DocumentActions } from '@application/document/document.actions';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import type { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import { DocumentMcpController } from '@presentation/document/document-mcp.controller';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';

class TestDocumentController extends DocumentMcpController {
  public run(meta: RequestMeta | undefined, call: () => Promise<CallToolResult>) {
    return this.runToolCall(meta, call);
  }
}

describe('Document MCP delegation boundary', () => {
  function setup() {
    const runForFeature = jest.fn();
    const controller = new TestDocumentController(
      {} as DocumentActions,
      {} as IActionAuditLog,
      {} as PendingActionUseCases,
      { runForFeature } as unknown as AgentRoomDelegationService,
      new AuthenticatedContextStore(),
    );
    return { controller, runForFeature };
  }

  it.each([
    undefined,
    {},
    { 'com.celesnity/room-id': 'room-a' },
    { 'com.celesnity/caller-subject': 'subject-a' },
    { 'com.celesnity/room-id': ' ', 'com.celesnity/caller-subject': 'subject-a' },
  ])('rejects missing or partial delegation before tool execution', async (meta) => {
    const { controller, runForFeature } = setup();
    const call = jest.fn();
    await expect(controller.run(meta, call)).rejects.toThrow(
      'Trusted MCP room delegation metadata is required.',
    );
    expect(call).not.toHaveBeenCalled();
    expect(runForFeature).not.toHaveBeenCalled();
  });

  it('requires the shared delegation service to authorize the DOCUMENTS feature', async () => {
    const { controller, runForFeature } = setup();
    runForFeature.mockRejectedValue(new Error('delegation denied'));
    const call = jest.fn();
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
    ).rejects.toThrow('delegation denied');
    expect(runForFeature).toHaveBeenCalledWith(
      'room-a',
      'subject-a',
      'DOCUMENTS',
      call,
      'workspace:read',
      'chat-assistant',
      '40000000-0000-4000-8000-000000000001',
      undefined,
      undefined,
    );
    expect(call).not.toHaveBeenCalled();
  });
});
