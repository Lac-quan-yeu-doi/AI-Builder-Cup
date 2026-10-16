import { buildDocumentActions } from '@application/document/document.actions';
import { buildMcpCatalog } from '@application/actions/mcp-catalog';
import type { ActionDefinition } from '@application/actions/action.types';
import type { DocumentUseCases } from '@application/document/document.use-cases';

describe('buildDocumentActions MCP catalog', () => {
  it('exposes exactly the three agent-facing tools, by name', () => {
    const actions = buildDocumentActions({} as DocumentUseCases);
    const catalog = buildMcpCatalog(
      actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
    );
    const toolNames = catalog.map((entry) => entry.tool_name).sort();

    expect(toolNames).toEqual(['create_document', 'get_document_text', 'list_documents'].sort());
  });

  it('does not expose upload or findById as MCP tools', () => {
    const actions = buildDocumentActions({} as DocumentUseCases);

    expect(actions.upload.mcpTool).toBeUndefined();
    expect(actions.findById.mcpTool).toBeUndefined();
  });

  it('create_document accepts text or a workspace path, and is audited unlike the read tools', () => {
    const actions = buildDocumentActions({} as DocumentUseCases);
    const catalog = buildMcpCatalog(
      actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
    );

    const create = catalog.find((entry) => entry.tool_name === 'create_document');
    const schema = create?.input_schema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };

    expect(schema.required ?? []).toEqual([]);
    expect(schema.properties).toEqual(
      expect.objectContaining({ content: expect.anything(), path: expect.anything() }),
    );
    expect(create?.audit_required).toBe(true);
    expect(create?.approval_required).toBe(false);
  });

  it('create runs createFromText with the mapped input', async () => {
    const createFromText = jest.fn(async () => ({ id: 'doc-1' }));
    const actions = buildDocumentActions({ createFromText } as unknown as DocumentUseCases);

    await actions.create.run(
      { filename: 'report.md', text: 'hello', mimeType: 'text/markdown' },
      { source: 'agent', runId: null, identityId: null },
    );

    expect(createFromText).toHaveBeenCalledWith({
      filename: 'report.md',
      text: 'hello',
      mimeType: 'text/markdown',
    });
  });

  it('get_document_text requires document_id but not the page range', () => {
    const actions = buildDocumentActions({} as DocumentUseCases);
    const catalog = buildMcpCatalog(
      actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
    );

    const getText = catalog.find((entry) => entry.tool_name === 'get_document_text');
    const required = (getText?.input_schema as { required?: string[] }).required ?? [];

    expect(required).toEqual(['document_id']);
  });
});
