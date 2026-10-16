// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdministrationScreen } from '@/app/(workspace)/administration/_components/administration-screen';
import { createLoadAdministrationGovernanceUseCase } from '@/src/application/use-cases/administration/load-administration-governance.use-case';
import type { AdministrationGovernance } from '@/src/entities/models/administration';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const data: AdministrationGovernance = {
  serviceIdentities: [],
  session: {
    identityId: 'owner',
    identityTenantId: 'audit-tenant',
    email: 'owner@example.test',
    mfaVerified: true,
    visibleFeatures: null,
    organization: {
      mfaRequired: true,
      organizationId: 'audit-org',
      organizationName: 'Audit organization',
      homeRegion: 'local',
      role: 'ORG_OWNER',
    },
  },
  members: [],
  groups: [],
  grants: [],
};

function setup() {
  return {
    load: vi.fn().mockResolvedValue(data),
    enableMfa: vi.fn(),
    invite: vi.fn().mockResolvedValue({}),
    updateMember: vi.fn(),
    removeAccount: vi.fn(),
    createGroup: vi.fn(),
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
    updateGroupFeatures: vi.fn(),
    createGrant: vi.fn(),
    deleteGrant: vi.fn(),
    listServiceIdentities: vi.fn().mockResolvedValue([]),
    updateAgentServiceIdentity: vi.fn(),
    listAgentManifests: vi.fn().mockResolvedValue([]),
    getAgentManifest: vi.fn(),
    saveAgentManifest: vi.fn(),
    validateAgentManifest: vi.fn(),
    deleteAgentManifest: vi.fn(),
  };
}

async function openSection(name: string) {
  fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0, ctrlKey: false });
}

// These are desired-behavior regression checks, not snapshots of current bugs.
// Keep the desired failure-path behavior covered after the audit repairs.
describe('Organization audit: failure paths', () => {
  it('retains the invitation email when the server rejects the invitation', async () => {
    const controllers = setup();
    controllers.invite.mockRejectedValue(new Error('Invitation unavailable'));
    renderUi(createElement(AdministrationScreen, { controllers }));
    await openSection('Members');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
    await screen.findByText('The administration change could not be completed.');
    await waitFor(() =>
      expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('new@example.test'),
    );
  });

  it('retains group name and description when group creation fails', async () => {
    const controllers = setup();
    controllers.createGroup.mockRejectedValue(new Error('Group unavailable'));
    renderUi(createElement(AdministrationScreen, { controllers }));
    await openSection('Groups');
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Analysts' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reporting team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await screen.findByText('The administration change could not be completed.');
    await waitFor(() =>
      expect((screen.getByLabelText('Group name') as HTMLInputElement).value).toBe('Analysts'),
    );
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Reporting team');
  });

  it('does not show an unqualified success notice when post-mutation refresh fails', async () => {
    const controllers = setup();
    controllers.load
      .mockResolvedValueOnce(data)
      .mockRejectedValue(new Error('Refresh unavailable'));
    renderUi(createElement(AdministrationScreen, { controllers }));
    await openSection('Members');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
    await screen.findByText('Administration data could not be loaded.');
    expect(screen.queryByText('The member invitation was created.')).toBeNull();
    expect(
      screen.getByText(/Your change was saved, but the displayed data could not be refreshed/),
    ).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'another@example.test' } });
    expect(
      (screen.getByRole('button', { name: 'Invite member' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    controllers.load.mockResolvedValue(data);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByText(/Your change was saved, but/)).toBeNull());
    expect(
      (screen.getByRole('button', { name: 'Invite member' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(controllers.invite).toHaveBeenCalledTimes(1);
  });

  it.each(['VIEWER', 'ANALYST', 'DATA_ENGINEER', 'AUDITOR'])(
    'loads a read-only organization overview for %s without requiring management-only endpoints',
    async (role) => {
      const controllers = setup();
      const load = createLoadAdministrationGovernanceUseCase({
        loadSession: vi.fn().mockResolvedValue({
          ...data.session,
          organization: { ...data.session.organization, role },
        }),
        // Matches the real Core controller/guard: these routes require organization:manage.
        listMembers: vi
          .fn()
          .mockRejectedValue(new Error('Permission organization:manage is required')),
        listGroups: vi
          .fn()
          .mockRejectedValue(new Error('Permission organization:manage is required')),
        listCatalogGrants: vi
          .fn()
          .mockRejectedValue(new Error('Permission organization:manage is required')),
        inviteMember: controllers.invite,
        enableMfa: controllers.enableMfa,
        updateMember: controllers.updateMember,
        removeAccount: controllers.removeAccount,
        createGroup: controllers.createGroup,
        addGroupMember: controllers.addGroupMember,
        removeGroupMember: controllers.removeGroupMember,
        updateGroupFeatures: controllers.updateGroupFeatures,
        createCatalogGrant: controllers.createGrant,
        deleteCatalogGrant: controllers.deleteGrant,
        listServiceIdentities: controllers.listServiceIdentities,
        updateAgentServiceIdentity: controllers.updateAgentServiceIdentity,
      });
      renderUi(createElement(AdministrationScreen, { controllers: { ...controllers, load } }));
      expect(await screen.findByRole('tab', { name: 'Overview' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Invite member' })).toBeNull();
    },
  );
});
