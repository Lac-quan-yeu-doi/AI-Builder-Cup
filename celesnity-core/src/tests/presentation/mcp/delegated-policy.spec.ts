import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpToolServer } from '@presentation/mcp/mcp-tool-server';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import {
  AuthenticatedContextStore,
  type AuthenticatedContext,
} from '@application/administration/authenticated-context';
import { mcpOperationPermission } from '@application/administration/mcp-operation-policy';

describe('MCP protocol authorization enforcement', () => {
  it('blocks writes before side effects and rechecks the current delegated principal on every call', async () => {
    const principal: AuthenticatedContext = {
      identityId: 'identity-a',
      subject: 'subject-a',
      identityTenantId: 'tenant-a',
      organizationId: 'org-a',
      organizationStatus: 'ACTIVE',
      membershipId: 'membership-a',
      role: 'VIEWER',
      mfaRequired: true,
      mfaVerified: true,
      authenticationTime: 1,
      visibleFeatures: ['DOCUMENTS'],
      agentName: 'chat-assistant',
    };
    const resolve = jest.fn().mockResolvedValue(principal);
    const contexts = new AuthenticatedContextStore();
    contexts.configureAgentResolver(async (organizationId) => ({
      ...principal,
      organizationId,
      identityId: '40000000-0000-4000-8000-000000000002',
      role: 'SERVICE_ACCOUNT',
      mfaRequired: false,
      mfaVerified: false,
      servicePermissions: ['workspace:read'],
    }));
    const delegation = new AgentRoomDelegationService(
      {
        resolve,
        registerRun: jest.fn(),
        resolveRun: jest.fn().mockResolvedValue(null),
        closeRun: jest.fn(),
        automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
      },
      contexts,
      { write: jest.fn().mockResolvedValue(undefined) },
      'iceberg',
    );
    const call = jest.fn(async () => ({
      content: [{ type: 'text' as const, text: contexts.require().organizationId }],
    }));
    const server = buildMcpToolServer(
      'mcp-document',
      'test',
      ['create_document', 'list_documents'].map((name) => ({
        tool: { name, inputSchema: { type: 'object' as const, properties: {} } },
        call,
      })),
      (meta, work, tool) =>
        delegation.runForFeature(
          String(meta?.['com.celesnity/room-id']),
          String(meta?.['com.celesnity/caller-subject']),
          'DOCUMENTS',
          work,
          mcpOperationPermission('mcp-document', tool),
          String(meta?.['com.minder/agent']),
          String(meta?.['com.celesnity/authorization-run-id']),
        ),
    );
    const client = new Client({ name: 'policy-test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const meta = {
      'com.celesnity/room-id': 'room-a',
      'com.celesnity/caller-subject': 'subject-a',
      'com.minder/agent': 'chat-assistant',
      'com.celesnity/authorization-run-id': '40000000-0000-4000-8000-000000000001',
    };
    try {
      expect(
        (await client.callTool({ name: 'create_document', arguments: {}, _meta: meta })).isError,
      ).toBe(true);
      expect(call).not.toHaveBeenCalled();
      expect(
        (await client.callTool({ name: 'list_documents', arguments: {}, _meta: meta })).isError,
      ).not.toBe(true);
      expect(call).toHaveBeenCalledTimes(1);
      resolve.mockResolvedValue(undefined);
      expect(
        (await client.callTool({ name: 'list_documents', arguments: {}, _meta: meta })).isError,
      ).toBe(true);
      expect(call).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledTimes(3);
      expect(contexts.current()).toBeUndefined();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
