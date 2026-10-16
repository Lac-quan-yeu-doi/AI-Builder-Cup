// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdministrationScreen } from '@/app/(workspace)/administration/_components/administration-screen';
import type { AdministrationGovernance } from '@/src/entities/models/administration';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);
const replace = vi.hoisted(() => vi.fn());
beforeEach(() => replace.mockClear());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const governance: AdministrationGovernance = {
  serviceIdentities: [],
  session: {
    identityId: 'owner-1',
    email: 'owner@example.test',
    identityTenantId: 'tenant-1',
    mfaVerified: true,
    visibleFeatures: null,
    organization: {
      mfaRequired: false,
      organizationId: 'org-1',
      organizationName: 'Example organization',
      homeRegion: 'europe-west1',
      role: 'ORG_OWNER',
    },
  },
  members: [
    {
      id: 'membership-1',
      identityId: 'owner-1',
      role: 'ORG_OWNER',
      status: 'ACTIVE',
      createdAt: '2026-08-01T00:00:00Z',
      identity: { id: 'owner-1', displayName: 'Example Owner', status: 'ACTIVE' },
    },
  ],
  groups: [
    {
      id: 'group-1',
      name: 'Analysts',
      members: [],
      featureVisibilityConfigured: false,
      visibleFeatures: [],
    },
  ],
  grants: [
    {
      id: 'grant-1',
      groupId: 'group-1',
      group: { id: 'group-1', name: 'Analysts' },
      resourceType: 'SCHEMA',
      resourceId: 'iceberg.analytics',
      permissions: ['SELECT'],
      effect: 'ALLOW',
      includeDescendants: true,
      grantOption: false,
      createdAt: '2026-08-01T00:00:00Z',
    },
  ],
};

function controllers(data = governance) {
  return {
    load: vi.fn().mockResolvedValue(data),
    enableMfa: vi.fn().mockResolvedValue(undefined),
    invite: vi.fn().mockResolvedValue({ membership: data.members[0] }),
    updateMember: vi.fn().mockResolvedValue(data.members[0]),
    removeAccount: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn().mockResolvedValue(data.groups[0]),
    addGroupMember: vi.fn().mockResolvedValue(undefined),
    removeGroupMember: vi.fn().mockResolvedValue(undefined),
    updateGroupFeatures: vi.fn().mockResolvedValue(data.groups[0]),
    createGrant: vi.fn().mockResolvedValue(data.grants[0]),
    deleteGrant: vi.fn().mockResolvedValue(undefined),
    listServiceIdentities: vi.fn().mockResolvedValue([]),
    updateAgentServiceIdentity: vi.fn(),
    listAgentManifests: vi.fn().mockResolvedValue([]),
    getAgentManifest: vi.fn(),
    saveAgentManifest: vi.fn(),
    validateAgentManifest: vi.fn(),
    deleteAgentManifest: vi.fn(),
  };
}

function chooseTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
}

describe('Administration workspace', () => {
  it('keeps internal service identities out of administration while retaining catalog access', async () => {
    const injected = controllers();
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Overview' });
    expect(screen.queryByRole('tab', { name: 'Service identities' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Catalog access' })).toBeTruthy();
    expect(injected.listServiceIdentities).not.toHaveBeenCalled();
    expect(injected.updateAgentServiceIdentity).not.toHaveBeenCalled();
  });

  it('creates and revokes a background executor grant while keeping it out of Members', async () => {
    const injected = controllers({
      ...governance,
      members: [
        ...governance.members,
        {
          id: 'service-membership',
          identityId: 'worker-1',
          role: 'SERVICE_ACCOUNT',
          status: 'ACTIVE',
          createdAt: '2026-10-01T00:00:00Z',
          identity: { id: 'worker-1', displayName: 'Internal worker', status: 'ACTIVE' },
        },
      ],
      serviceIdentities: [
        {
          identityId: 'worker-1',
          purpose: 'BACKGROUND',
          enabled: true,
          permissions: ['workspace:read', 'workspace:write'],
          features: ['EXECUTIONS'],
          updatedAt: '2026-10-01T00:00:00Z',
          identity: { status: 'ACTIVE' },
        },
      ],
      grants: [
        {
          resourceType: 'SCHEMA',
          resourceId: 'iceberg.analytics',
          permissions: ['SELECT'],
          effect: 'ALLOW',
          includeDescendants: true,
          grantOption: false,
          createdAt: '2026-10-01T00:00:00Z',
          id: 'worker-grant',
          groupId: undefined,
          group: undefined,
          identityId: 'worker-1',
        },
      ],
    });
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Catalog access' });
    chooseTab('Catalog access');
    expect(screen.getByRole('row', { name: /Background executor/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Principal type'), {
      target: { value: 'SERVICE_IDENTITY' },
    });
    expect(screen.getByRole('option', { name: /Background executor.*Enabled/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Principal', { exact: true }), {
      target: { value: 'worker-1' },
    });
    fireEvent.change(screen.getByLabelText('Resource name'), { target: { value: 'iceberg' } });
    fireEvent.click(screen.getByLabelText('DESCRIBE'));
    fireEvent.click(screen.getByRole('button', { name: 'Create grant' }));
    await waitFor(() =>
      expect(injected.createGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          principalType: 'SERVICE_IDENTITY',
          principalId: 'worker-1',
          permissions: ['DESCRIBE'],
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(injected.deleteGrant).toHaveBeenCalledWith('worker-grant'));
  });

  it('shows disabled service status without enabling it when granting access', async () => {
    const injected = controllers({
      ...governance,
      serviceIdentities: [
        {
          identityId: 'agent-service',
          purpose: 'AGENT',
          enabled: false,
          permissions: [],
          features: [],
          updatedAt: '2026-10-01T00:00:00Z',
          identity: { status: 'ACTIVE' },
        },
      ],
    });
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Catalog access' });
    chooseTab('Catalog access');
    fireEvent.change(screen.getByLabelText('Principal type'), {
      target: { value: 'SERVICE_IDENTITY' },
    });
    expect(screen.getByRole('option', { name: /Agent service identity.*Disabled/ })).toBeTruthy();
    expect(screen.getByText(/they do not enable a disabled service/)).toBeTruthy();
    expect(injected.updateAgentServiceIdentity).not.toHaveBeenCalled();
  });

  it('explains when Core does not supply grantable service identities', async () => {
    renderUi(createElement(AdministrationScreen, { controllers: controllers() }));
    await screen.findByRole('tab', { name: 'Catalog access' });
    chooseTab('Catalog access');
    fireEvent.change(screen.getByLabelText('Principal type'), {
      target: { value: 'SERVICE_IDENTITY' },
    });
    expect(screen.getByText(/No grantable service identities/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Create grant' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('confirms MFA opt-in and redirects without reloading the now-protected session', async () => {
    const injected = controllers();
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enable MFA' }));
    expect(injected.enableMfa).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable MFA and sign in' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(injected.enableMfa).toHaveBeenCalledTimes(1);
    expect(injected.load).toHaveBeenCalledTimes(1);
  });

  it('shows an error and allows retry when enabling MFA fails', async () => {
    const injected = controllers();
    injected.enableMfa.mockRejectedValue(new Error('Provider unavailable'));
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enable MFA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable MFA and sign in' }));
    await screen.findByText('The administration change could not be completed.');
    expect(replace).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Enable MFA' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('does not offer to disable MFA once enabled', async () => {
    const enabled = {
      ...governance,
      session: {
        ...governance.session,
        organization: { ...governance.session.organization, mfaRequired: true },
      },
    };
    renderUi(createElement(AdministrationScreen, { controllers: controllers(enabled) }));
    expect(await screen.findByText('Required for all members')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Enable MFA/ })).toBeNull();
  });
  it('starts with an organization overview and separates management into tabs', async () => {
    renderUi(createElement(AdministrationScreen, { controllers: controllers() }));
    expect(await screen.findByRole('tab', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Agents' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByText('Example organization')).toBeTruthy();
    expect(screen.getByText('europe-west1')).toBeTruthy();
    expect(screen.getByText('MFA verified')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Manage members' }));
    expect(screen.getByRole('table', { name: 'Organization members' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Data catalog access' })).toBeNull();
  });

  it('preserves an invitation draft while switching sections and still submits the same contract', async () => {
    const injected = controllers();
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Members' });
    chooseTab('Members');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    chooseTab('Groups');
    expect(screen.getByRole('heading', { name: 'Access groups' })).toBeTruthy();
    chooseTab('Members');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('new@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
    await waitFor(() =>
      expect(injected.invite).toHaveBeenCalledWith({
        email: 'new@example.test',
        role: 'VIEWER',
        expiresInHours: 72,
      }),
    );
    expect(await screen.findByText('The member invitation was created.')).toBeTruthy();
  });

  it('keeps catalog actions in their own section', async () => {
    const injected = controllers();
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Catalog access' });
    chooseTab('Agents');
    expect(screen.queryByRole('table', { name: 'Data catalog access' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create grant' })).toBeNull();
    chooseTab('Catalog access');
    const table = screen.getByRole('table', { name: 'Data catalog access' });
    expect(within(table).getByText('SCHEMA: iceberg.analytics')).toBeTruthy();
    fireEvent.click(within(table).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(injected.deleteGrant).toHaveBeenCalledWith('grant-1'));
  });

  it('preserves read-only access for non-administrators', async () => {
    const data = {
      ...governance,
      session: {
        ...governance.session,
        organization: { ...governance.session.organization, role: 'VIEWER' },
      },
    };
    renderUi(createElement(AdministrationScreen, { controllers: controllers(data) }));
    await screen.findByRole('tab', { name: 'Overview' });
    // Management lists are forbidden by Core for this role, not empty lists.
    expect(screen.queryByRole('tab', { name: 'Members' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Organization members' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invite member' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Catalog access' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create grant' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enable MFA' })).toBeNull();
  });

  it('preserves group creation and membership actions', async () => {
    const injected = controllers();
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Groups' });
    chooseTab('Groups');
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Reporting' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reporting team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() =>
      expect(injected.createGroup).toHaveBeenCalledWith({
        name: 'Reporting',
        description: 'Reporting team',
      }),
    );
    await screen.findByText('The access group was created.');
    fireEvent.change(screen.getByLabelText('Group', { exact: true }), {
      target: { value: 'group-1' },
    });
    fireEvent.change(screen.getByLabelText('Member', { exact: true }), {
      target: { value: 'owner-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to group' }));
    await waitFor(() =>
      expect(injected.addGroupMember).toHaveBeenCalledWith({
        groupId: 'group-1',
        identityId: 'owner-1',
      }),
    );
    await screen.findByText('The member was added to the group.');
    fireEvent.click(screen.getByRole('button', { name: 'Remove from group' }));
    await waitFor(() =>
      expect(injected.removeGroupMember).toHaveBeenCalledWith({
        groupId: 'group-1',
        identityId: 'owner-1',
      }),
    );
  });

  it('saves an explicitly selected feature policy for a group', async () => {
    const injected = controllers();
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Groups' });
    chooseTab('Groups');
    fireEvent.click(screen.getByLabelText('Home'));
    fireEvent.click(screen.getByLabelText('Devices'));
    fireEvent.click(screen.getByRole('button', { name: 'Save feature visibility' }));
    await waitFor(() =>
      expect(injected.updateGroupFeatures).toHaveBeenCalledWith({
        groupId: 'group-1',
        visibleFeatures: ['HOME', 'DEVICES'],
      }),
    );
  });

  it('preserves member updates and grant creation payloads', async () => {
    const injected = controllers();
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Members' });
    chooseTab('Members');
    const table = screen.getByRole('table', { name: 'Organization members' });
    fireEvent.keyDown(within(table).getByRole('combobox', { name: 'Role' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Analyst' }));
    fireEvent.click(within(table).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(injected.updateMember).toHaveBeenCalledWith({
        membershipId: 'membership-1',
        role: 'ANALYST',
        status: 'ACTIVE',
      }),
    );
    await screen.findByText('The member access was updated.');
    chooseTab('Catalog access');
    fireEvent.change(screen.getByLabelText('Principal', { exact: true }), {
      target: { value: 'group-1' },
    });
    fireEvent.change(screen.getByLabelText('Resource name'), { target: { value: 'iceberg' } });
    fireEvent.click(screen.getByLabelText('SELECT', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Create grant' }));
    await waitFor(() =>
      expect(injected.createGrant).toHaveBeenCalledWith({
        principalType: 'GROUP',
        principalId: 'group-1',
        resourceType: 'CATALOG',
        resourceId: 'iceberg',
        permissions: ['SELECT'],
        effect: 'ALLOW',
        includeDescendants: false,
        grantOption: false,
      }),
    );
  });

  it('lets an organization owner grant a named agent a scoped catalog resource', async () => {
    const injected = controllers();
    injected.listAgentManifests.mockResolvedValue([
      {
        name: 'chat-assistant',
        description: '',
        skills: [],
        sourcePath: '',
        contentHash: '',
        yaml: '',
      },
    ]);
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Catalog access' });
    chooseTab('Catalog access');
    await waitFor(() => expect(injected.listAgentManifests).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Principal type'), { target: { value: 'AGENT' } });
    fireEvent.change(screen.getByLabelText('Principal', { exact: true }), {
      target: { value: 'chat-assistant' },
    });
    fireEvent.change(screen.getByLabelText('Resource name'), {
      target: { value: 'iceberg.sales' },
    });
    fireEvent.click(screen.getByLabelText('SELECT', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Create grant' }));
    await waitFor(() =>
      expect(injected.createGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          principalType: 'AGENT',
          principalId: 'chat-assistant',
          resourceId: 'iceberg.sales',
        }),
      ),
    );
  });

  it('requires confirmation before permanently removing an account', async () => {
    const injected = controllers();
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Members' });
    chooseTab('Members');
    fireEvent.click(screen.getByRole('button', { name: 'Remove account' }));
    expect(injected.removeAccount).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove account permanently' }));
    await waitFor(() => expect(injected.removeAccount).toHaveBeenCalledWith('membership-1'));
  });

  it('provides retry after an initial load failure', async () => {
    const injected = controllers();
    injected.load.mockRejectedValueOnce(new Error('Unavailable'));
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('tab', { name: 'Overview' })).toBeTruthy();
    expect(injected.load).toHaveBeenCalledTimes(2);
  });

  it('shows only people in member and grant management, without changing the Core response', async () => {
    const injected = controllers();
    injected.load.mockResolvedValue({
      ...governance,
      members: [
        ...governance.members,
        {
          ...governance.members[0],
          id: 'worker-1',
          identityId: 'worker-1',
          role: 'SERVICE_ACCOUNT',
          identity: { id: 'worker-1', displayName: 'Execution worker', status: 'ACTIVE' },
        },
      ],
      groups: [
        {
          ...governance.groups[0],
          members: [
            {
              identityId: 'worker-1',
              identity: { id: 'worker-1', displayName: 'Execution worker' },
            },
          ],
        },
      ],
    });
    renderUi(createElement(AdministrationScreen, { controllers: injected }));
    await screen.findByRole('tab', { name: 'Members' });
    chooseTab('Members');
    expect(screen.queryByRole('row', { name: /Execution worker/ })).toBeNull();
    const owner = screen.getByRole('row', { name: /Example Owner/ });
    expect(within(owner).getByRole('combobox', { name: 'Role' }).textContent).toContain(
      'Organization owner',
    );
    expect(
      (within(owner).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByText('ORG_OWNER')).toBeNull();
    chooseTab('Groups');
    expect(screen.queryByText('Execution worker')).toBeNull();
    chooseTab('Catalog access');
    expect(screen.queryByText('Execution worker')).toBeNull();
    expect(screen.getByText('SCHEMA: iceberg.analytics')).toBeTruthy();
  });
});
