import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  buildDocumentMcpTools,
  type DocumentMcpContext,
} from '@presentation/document/document-mcp-tools';
import type { ActionDefinition } from '@application/actions/action.types';
import type { DocumentActions } from '@application/document/document.actions';
import type { Document } from '@domain/document/models/document';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { AutomationChartPreviewStore } from '@application/chart/automation-chart-preview.store';

function document(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    filename: 'daily-report.md',
    mimeType: 'text/markdown',
    storageKey: 'documents/doc-1.md',
    pages: ['# Daily report'],
    pageCount: 1,
    extractionStatus: 'extracted',
    chartPreviews: [],
    createdAt: '2026-09-06T00:00:00.000Z',
    ...overrides,
  };
}

function action<TInput, TOutput>(
  name: string,
  toolName: string,
  approvalRequired: boolean,
  run: (input: TInput) => Promise<TOutput>,
): ActionDefinition<TInput, TOutput> {
  return {
    name,
    permission: 'write',
    auditRequired: true,
    approvalRequired,
    mcpTool: {
      name: toolName,
      description: name,
      inputSchema: { type: 'object', properties: {}, required: ['filename', 'content'] },
    },
    run,
  };
}

function context(overrides: Partial<DocumentActions> = {}): DocumentMcpContext {
  const actions: DocumentActions = {
    upload: {
      name: 'document.upload',
      permission: 'write',
      auditRequired: false,
      approvalRequired: false,
      run: async () => document(),
    },
    create: action('document.create', 'create_document', false, async () => document()),
    getText: {
      name: 'document.getText',
      permission: 'read',
      auditRequired: false,
      approvalRequired: false,
      mcpTool: {
        name: 'get_document_text',
        description: 'get_document_text',
        inputSchema: { type: 'object', properties: {} },
      },
      run: async () => ({ document: document(), text: '# Daily report' }),
    },
    getContent: {
      name: 'document.getContent',
      permission: 'read',
      auditRequired: false,
      approvalRequired: false,
      run: async () => ({ document: document(), bytes: new Uint8Array() }),
    },
    findById: {
      name: 'document.findById',
      permission: 'read',
      auditRequired: false,
      approvalRequired: false,
      run: async () => document(),
    },
    list: {
      name: 'document.list',
      permission: 'read',
      auditRequired: false,
      approvalRequired: false,
      mcpTool: {
        name: 'list_documents',
        description: 'list_documents',
        inputSchema: { type: 'object', properties: {} },
      },
      run: async () => [document()],
    },
    ...overrides,
  };
  return {
    actions,
    auditLog: { record: jest.fn().mockResolvedValue(undefined) },
    pendingActions: { propose: jest.fn() } as unknown as DocumentMcpContext['pendingActions'],
    approvalOverridesHeader: undefined,
    authenticatedContexts: new AuthenticatedContextStore(),
  };
}

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (block === undefined || block.type !== 'text')
    throw new Error('expected a text content block');
  return block.text;
}

function findTool(tools: ReturnType<typeof buildDocumentMcpTools>, name: string) {
  const found = tools.find((tool) => tool.tool.name === name);
  if (found === undefined) throw new Error(`tool ${name} not found`);
  return found;
}

describe('buildDocumentMcpTools', () => {
  it('exposes exactly the expected tool names', () => {
    const tools = buildDocumentMcpTools(context());
    expect(tools.map((tool) => tool.tool.name).sort()).toEqual(
      ['create_document', 'get_document_text', 'list_documents'].sort(),
    );
  });

  it('create_document accepts a workspace file path and returns a document block', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { create: DocumentActions['create'] }).create = action(
      'document.create',
      'create_document',
      false,
      async (input) => {
        received = input;
        return document({ filename: 'report.pdf', mimeType: 'application/pdf' });
      },
    );
    const result = await findTool(buildDocumentMcpTools(ctx), 'create_document').call({
      path: 'reports/report.pdf',
      run_id: 'untrusted-run',
    });
    expect(received).toEqual({ path: 'reports/report.pdf', filename: undefined });
    expect(result._meta?.['message_block']).toMatchObject({
      payload: { mime_type: 'application/pdf' },
    });
    expect(ctx.auditLog.record).toHaveBeenCalled();
  });

  it('create_document rejects a missing filename', async () => {
    const tools = buildDocumentMcpTools(context());
    const result = await findTool(tools, 'create_document').call({ content: 'hello' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('filename');
  });

  it('create_document rejects Markdown content named as a PDF', async () => {
    const ctx = context();
    let called = false;
    (ctx.actions as { create: DocumentActions['create'] }).create = action(
      'document.create',
      'create_document',
      false,
      async () => {
        called = true;
        return document();
      },
    );
    const result = await findTool(buildDocumentMcpTools(ctx), 'create_document').call({
      filename: 'report.pdf',
      content: '# Report',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Use path to publish a generated PDF file.');
    expect(called).toBe(false);
  });

  it('create_document rejects missing content', async () => {
    const tools = buildDocumentMcpTools(context());
    const result = await findTool(tools, 'create_document').call({ filename: 'report.md' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('exactly one of content or path');
  });

  it('create_document forwards filename/content/mime_type and returns the document JSON', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { create: DocumentActions['create'] }).create = action(
      'document.create',
      'create_document',
      false,
      async (input) => {
        received = input;
        return document();
      },
    );
    const tools = buildDocumentMcpTools(ctx);

    const result = await findTool(tools, 'create_document').call({
      filename: 'daily-report.md',
      content: '# Daily report\n\nAll good.',
      mime_type: 'text/markdown',
    });

    expect(received).toEqual({
      filename: 'daily-report.md',
      text: '# Daily report\n\nAll good.',
      mimeType: 'text/markdown',
      chartPreviews: [],
    });
    expect(JSON.parse(textOf(result)).id).toBe('doc-1');
  });

  it('create_document publishes a document message block for the chat artifact', async () => {
    const result = await findTool(toolsFor(context()), 'create_document').call({
      filename: 'daily-report.md',
      content: '# Daily report',
    });

    expect(result._meta?.['message_block']).toEqual({
      type: 'document',
      version: 1,
      payload: {
        document_id: 'doc-1',
        filename: 'daily-report.md',
        mime_type: 'text/markdown',
        chart_previews: [],
      },
      fallback_text: 'daily-report.md document',
    });
  });

  it('create_document forwards chart previews for document rendering', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { create: DocumentActions['create'] }).create = action(
      'document.create',
      'create_document',
      false,
      async (input) => {
        received = input;
        return document();
      },
    );

    await findTool(toolsFor(ctx), 'create_document').call({
      filename: 'orders.md',
      content: '# Orders',
      chart_previews: [{ kind: 'preview', title: 'Monthly orders', rows: [] }],
    });

    expect(received).toMatchObject({
      chartPreviews: [{ kind: 'preview', title: 'Monthly orders' }],
    });
  });

  it('fills an incomplete document chart preview from the same automation run', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { create: DocumentActions['create'] }).create = action(
      'document.create',
      'create_document',
      false,
      async (input) => {
        received = input;
        return document();
      },
    );
    const chartPreviews = new AutomationChartPreviewStore();
    chartPreviews.remember('agent-run-1', {
      kind: 'preview',
      title: 'Monthly orders',
      rows: [['2026-09', 42]],
      output_schema: [{ name: 'month' }, { name: 'orders' }],
    });

    await ctx.authenticatedContexts.run(
      {
        identityId: 'machine',
        subject: 'machine',
        identityTenantId: 'tenant',
        organizationId: 'org-1',
        organizationStatus: 'ACTIVE',
        mfaRequired: false,
        membershipId: 'machine',
        role: 'SERVICE_ACCOUNT',
        authenticationTime: 0,
        mfaVerified: true,
        automationRunId: 'agent-run-1',
      },
      async () => {
        await findTool(buildDocumentMcpTools({ ...ctx, chartPreviews }), 'create_document').call({
          filename: 'orders.md',
          content: '<chart-preview title="Monthly orders" />',
          chart_previews: [{ kind: 'preview', title: 'Monthly orders' }],
        });
      },
    );

    expect(received).toMatchObject({
      chartPreviews: [
        {
          title: 'Monthly orders',
          rows: [['2026-09', 42]],
          output_schema: [{ name: 'month' }, { name: 'orders' }],
        },
      ],
    });
  });

  it('create_document is audited: the run is recorded in the audit log', async () => {
    const ctx = context();
    const tools = buildDocumentMcpTools(ctx);

    await findTool(tools, 'create_document').call({ filename: 'r.md', content: 'x' });

    expect(ctx.auditLog.record).toHaveBeenCalled();
  });

  it('forwards the trusted automation source run from the delegated context', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { create: DocumentActions['create'] }).create = action(
      'document.create',
      'create_document',
      false,
      async (input) => {
        received = input;
        return document();
      },
    );
    await ctx.authenticatedContexts.run(
      {
        identityId: 'machine',
        subject: 'machine',
        identityTenantId: 'tenant',
        organizationId: 'org-1',
        organizationStatus: 'ACTIVE',
        mfaRequired: false,
        membershipId: 'machine',
        role: 'SERVICE_ACCOUNT',
        authenticationTime: 0,
        mfaVerified: true,
        automationRunId: 'agent-run-1',
      },
      async () => {
        await findTool(buildDocumentMcpTools(ctx), 'create_document').call({
          filename: 'r.md',
          content: '# r',
        });
      },
    );

    expect(received).toMatchObject({ sourceRunId: 'agent-run-1' });
  });

  it('get_document_text rejects a missing document_id', async () => {
    const tools = buildDocumentMcpTools(context());
    const result = await findTool(tools, 'get_document_text').call({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('document_id');
  });

  it('get_document_text includes original file bytes and MIME type as an embedded resource', async () => {
    const ctx = context();
    const file = document({ filename: 'report.csv', mimeType: 'text/csv' });
    (ctx.actions as { getText: DocumentActions['getText'] }).getText = {
      ...ctx.actions.getText,
      run: async () => ({ document: file, text: 'month,total' }),
    };
    (ctx.actions as { getContent: DocumentActions['getContent'] }).getContent = {
      ...ctx.actions.getContent,
      run: async () => ({ document: file, bytes: new TextEncoder().encode('month,total') }),
    };

    const result = await findTool(buildDocumentMcpTools(ctx), 'get_document_text').call({
      document_id: 'doc-1',
    });

    expect(result.content[1]).toMatchObject({
      type: 'resource',
      resource: { mimeType: 'text/csv', blob: Buffer.from('month,total').toString('base64') },
    });
  });

  it('list_documents returns the document list as JSON', async () => {
    const tools = buildDocumentMcpTools(context());
    const result = await findTool(tools, 'list_documents').call({});
    expect(JSON.parse(textOf(result))).toHaveLength(1);
  });
});

function toolsFor(ctx: DocumentMcpContext) {
  return buildDocumentMcpTools(ctx);
}
