// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentManifestsPanel } from '@/app/(workspace)/administration/_components/agent-manifests-panel';
import { renderUi } from '@/tests/support/render-ui';
import type { AgentManifest } from '@/src/entities/models/agent-manifest';
import type { DeleteAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/delete-agent-manifest.controller';
import type { GetAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/get-agent-manifest.controller';
import type { ListAgentManifestsController } from '@/src/interface-adapters/controllers/agent-manifests/list-agent-manifests.controller';
import type { SaveAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/save-agent-manifest.controller';
import type { ValidateAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/validate-agent-manifest.controller';

const manifest: AgentManifest = {
  contentHash: 'abc123',
  description: 'Writes reports.',
  name: 'writer',
  skills: ['reports'],
  sourcePath: 'agents/writer.yaml',
  yaml: 'name: writer\ndescription: Writes reports.\n',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPanel(
  overrides: Partial<{
    listAgentManifests: ListAgentManifestsController;
    getAgentManifest: GetAgentManifestController;
    saveAgentManifest: SaveAgentManifestController;
    validateAgentManifest: ValidateAgentManifestController;
    deleteAgentManifest: DeleteAgentManifestController;
  }> = {},
) {
  const controllers = {
    listAgentManifests: vi.fn(async () => [manifest]) as unknown as ListAgentManifestsController,
    getAgentManifest: vi.fn(async () => manifest) as unknown as GetAgentManifestController,
    saveAgentManifest: vi.fn(async () => manifest) as unknown as SaveAgentManifestController,
    validateAgentManifest: vi.fn(
      async () => manifest,
    ) as unknown as ValidateAgentManifestController,
    deleteAgentManifest: vi.fn(async () => undefined) as unknown as DeleteAgentManifestController,
    ...overrides,
  };
  renderUi(createElement(AgentManifestsPanel, controllers));
  return controllers;
}

describe('AgentManifestsPanel', () => {
  it('keeps catalog grant management out of the agent manifest editor', async () => {
    renderPanel();
    await screen.findByLabelText('Manifest YAML');
    expect(screen.queryByRole('table', { name: 'Data catalog access' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create grant' })).toBeNull();
  });
  it('loads the selected manifest YAML into the editor and validates it', async () => {
    const controllers = renderPanel();

    const yamlInput = await screen.findByLabelText('Manifest YAML');
    expect((yamlInput as HTMLTextAreaElement).value).toBe(manifest.yaml);
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));

    await waitFor(() =>
      expect(controllers.validateAgentManifest).toHaveBeenCalledWith(manifest.yaml),
    );
    expect(await screen.findByText('Manifest is valid.')).toBeDefined();
  });

  it('edits the tenant-scoped auto-approval actions together with the manifest', async () => {
    const governed = {
      ...manifest,
      yaml: `name: writer
governance:
  action_approvals: {}
  auto_approvals:
    - mcp.trino.list_catalogs
  autonomy: manual
`,
    };
    const controllers = renderPanel({
      getAgentManifest: vi.fn(async () => governed) as unknown as GetAgentManifestController,
      saveAgentManifest: vi.fn(async () => governed) as unknown as SaveAgentManifestController,
    });
    const autoApprovals = await screen.findByLabelText('Auto-approved actions');
    expect((autoApprovals as HTMLTextAreaElement).value).toBe('mcp.trino.list_catalogs');
    fireEvent.change(autoApprovals, { target: { value: 'mcp.trino.list_catalogs\nWrite' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save manifest' }));

    await waitFor(() =>
      expect(controllers.saveAgentManifest).toHaveBeenCalledWith({
        name: 'writer',
        yaml: expect.stringContaining('    - Write'),
      }),
    );
  });

  it('creates a new manifest through the S3 manifest controller', async () => {
    const saved = { ...manifest, name: 'analyst', yaml: 'name: analyst\n' };
    const controllers = renderPanel({
      saveAgentManifest: vi.fn(async () => saved) as unknown as SaveAgentManifestController,
    });
    fireEvent.click(screen.getByRole('button', { name: 'New agent' }));
    const nameInput = screen.getByLabelText('Agent name');
    const yamlInput = screen.getByLabelText('Manifest YAML');
    fireEvent.change(nameInput, { target: { value: 'analyst' } });
    fireEvent.change(yamlInput, { target: { value: saved.yaml } });
    fireEvent.click(screen.getByRole('button', { name: 'Save manifest' }));

    await waitFor(() =>
      expect(controllers.saveAgentManifest).toHaveBeenCalledWith({
        name: 'analyst',
        yaml: saved.yaml,
      }),
    );
  });

  it('prefills a complete paste-ready template for a new manifest', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'New agent' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Agent name') as HTMLInputElement).value).toBe('new-agent'),
    );
    const yaml = screen.getByLabelText('Manifest YAML') as HTMLTextAreaElement;
    expect(yaml.value).toContain('model:');
    expect(yaml.value).toContain('mcp_servers: {}');
    expect(yaml.value).toContain('client_tools: []');
    expect(yaml.value).toContain('governance:');
    expect(yaml.value).toContain('skills: []');
  });

  it('copies the selected manifest YAML for reuse as a new agent', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Copy YAML' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(manifest.yaml));
  });

  it('deletes the selected manifest after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const controllers = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(controllers.deleteAgentManifest).toHaveBeenCalledWith('writer'));
  });

  it('shows an empty state when no manifests are loaded', async () => {
    renderPanel({
      listAgentManifests: vi.fn(async () => []) as unknown as ListAgentManifestsController,
    });

    expect(await screen.findByText('No agents are configured.')).toBeDefined();
  });

  it('filters the agent list by name or description', async () => {
    const second: AgentManifest = {
      ...manifest,
      name: 'analyst',
      description: 'Builds data summaries.',
    };
    renderPanel({
      listAgentManifests: vi.fn(async () => [
        manifest,
        second,
      ]) as unknown as ListAgentManifestsController,
    });

    const search = await screen.findByRole('searchbox', { name: 'Search agents' });
    expect(screen.getByRole('button', { name: /writer/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /analyst/ })).toBeDefined();

    fireEvent.change(search, { target: { value: 'summaries' } });

    expect(screen.queryByRole('button', { name: /writer/ })).toBeNull();
    expect(screen.getByRole('button', { name: /analyst/ })).toBeDefined();
  });
});
