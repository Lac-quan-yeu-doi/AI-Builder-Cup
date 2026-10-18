'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/app/_components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/_components/ui/tabs';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Spinner } from '@/app/_components/ui/spinner';
import { contextualErrorMessage } from '@/app/_components/shared/error-message';
import { useTranslation } from '@/app/_i18n/use-translation';
import type {
  AdministrationGovernance,
  AuthorizationGroup,
  CatalogAccessGrant,
  ChangeGroupMemberInput,
  CreateCatalogGrantInput,
  CreateGroupInput,
  InviteMemberInput,
  MemberInvitation,
  OrganizationMember,
  UpdateMemberInput,
  UpdateGroupFeaturesInput,
} from '@/src/entities/models/administration';
import { MembersPanel } from './members-panel';
import { GroupsPanel } from './groups-panel';
import { GrantsPanel } from './grants-panel';
import { AdministrationOverview } from './administration-overview';
import { AgentManifestsPanel, type AgentManifestsPanelProps } from './agent-manifests-panel';

interface AdministrationControllers extends AgentManifestsPanelProps {
  readonly load: () => Promise<AdministrationGovernance>;
  readonly enableMfa: () => Promise<void>;
  readonly invite: (input: InviteMemberInput) => Promise<MemberInvitation>;
  readonly updateMember: (input: UpdateMemberInput) => Promise<OrganizationMember>;
  readonly removeAccount: (membershipId: string) => Promise<void>;
  readonly createGroup: (input: CreateGroupInput) => Promise<AuthorizationGroup>;
  readonly addGroupMember: (input: ChangeGroupMemberInput) => Promise<void>;
  readonly removeGroupMember: (input: ChangeGroupMemberInput) => Promise<void>;
  readonly updateGroupFeatures: (input: UpdateGroupFeaturesInput) => Promise<AuthorizationGroup>;
  readonly createGrant: (input: CreateCatalogGrantInput) => Promise<CatalogAccessGrant>;
  readonly deleteGrant: (grantId: string) => Promise<void>;
}

interface AdministrationScreenProps {
  readonly controllers: AdministrationControllers;
}

export function AdministrationScreen({ controllers }: AdministrationScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [data, setData] = useState<AdministrationGovernance>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [refreshFailedAfterSave, setRefreshFailedAfterSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<MemberInvitation>();
  const [section, setSection] = useState(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('tab') === 'catalog-access'
      ? 'catalog-access'
      : 'overview',
  );
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    setError(undefined);
    try {
      setData(await controllers.load());
      setRefreshFailedAfterSave(false);
      return true;
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('administration.loadError')));
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [controllers, t]);

  useEffect(() => {
    let active = true;
    void controllers
      .load()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause: unknown) => {
        if (active) setError(contextualErrorMessage(cause, t('administration.loadError')));
      });
    return () => {
      active = false;
    };
  }, [controllers, t]);

  const mutate = async (operation: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await operation();
      const refreshed = await reload();
      setRefreshFailedAfterSave(!refreshed);
      if (refreshed) setNotice(success);
      return true;
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('administration.mutationError')));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const enableMfa = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await controllers.enableMfa();
      // The current password-only session is no longer authorized. Do not reload
      // protected data before the administrator completes a fresh MFA sign-in.
      router.replace('/login');
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('administration.mutationError')));
      setBusy(false);
    }
  };

  if (data === undefined) {
    return (
      <section className="grid gap-4">
        <PageBar eyebrow={t('nav.administration')} title={t('administration.title')} />
        {error ? (
          <>
            <PageAlert tone="error">{error}</PageAlert>
            <Button
              className="w-fit"
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={() => void reload()}
            >
              {refreshing ? <Spinner /> : null}
              {t('action.retry')}
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Spinner />
            {t('administration.loading')}
          </div>
        )}
      </section>
    );
  }

  const canManage =
    data.session.organization.role === 'ORG_OWNER' ||
    data.session.organization.role === 'ORG_ADMIN';
  // Core includes internal workload principals in its membership response. Keep
  // them out of people management; service grants have their own catalog selector.
  const serviceIdentityIds = new Set(
    data.members
      .filter((member) => member.role === 'SERVICE_ACCOUNT')
      .map((member) => member.identityId),
  );
  const visibleData = {
    ...data,
    members: data.members.filter((member) => member.role !== 'SERVICE_ACCOUNT'),
    groups: data.groups.map((group) => ({
      ...group,
      members: group.members.filter((member) => !serviceIdentityIds.has(member.identityId)),
    })),
    grants: data.grants,
  };
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageBar
        actions={
          <Button
            variant="outline"
            disabled={busy || refreshing}
            aria-busy={refreshing}
            onClick={() => void reload()}
          >
            {refreshing ? <Spinner /> : <RefreshCw aria-hidden="true" />}
            {t('administration.refresh')}
          </Button>
        }
        description={t('administration.subtitle')}
        eyebrow={t('nav.administration')}
        title={t('administration.title')}
      />
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {notice ? <PageAlert tone="success">{notice}</PageAlert> : null}
      {refreshFailedAfterSave ? (
        <PageAlert tone="warning">{t('administration.savedRefreshFailed')}</PageAlert>
      ) : null}
      {!canManage ? <PageAlert tone="info">{t('administration.readOnlyNotice')}</PageAlert> : null}
      <Tabs
        className="min-w-0 gap-5"
        value={canManage ? section : 'overview'}
        onValueChange={setSection}
      >
        <div className="overflow-x-auto border-b border-border pb-1">
          <TabsList variant="line" aria-label={t('administration.sectionsLabel')}>
            <TabsTrigger value="overview">{t('administration.overviewTab')}</TabsTrigger>
            {canManage ? (
              <>
                <TabsTrigger value="members">{t('administration.membersTab')}</TabsTrigger>
                <TabsTrigger value="agents">{t('administration.agentsTab')}</TabsTrigger>
                <TabsTrigger value="groups">{t('administration.groupsTab')}</TabsTrigger>
                <TabsTrigger value="catalog-access">
                  {t('administration.catalogAccessTab')}
                </TabsTrigger>
              </>
            ) : null}
          </TabsList>
        </div>
        <TabsContent value="overview" forceMount hidden={canManage && section !== 'overview'}>
          <AdministrationOverview
            data={visibleData}
            onNavigate={setSection}
            busy={busy || refreshing || refreshFailedAfterSave}
            onEnableMfa={() => void enableMfa()}
          />
        </TabsContent>
        {/* Keep drafts mounted so switching sections never discards unsaved input. */}
        {canManage ? (
          <>
            <TabsContent value="members" forceMount hidden={section !== 'members'}>
              <MembersPanel
                busy={busy || refreshing || refreshFailedAfterSave}
                canManage={canManage}
                invitation={invitation}
                members={visibleData.members}
                onInvite={(input) =>
                  mutate(
                    async () => setInvitation(await controllers.invite(input)),
                    t('administration.inviteCreated'),
                  )
                }
                onUpdate={(input) =>
                  mutate(() => controllers.updateMember(input), t('administration.memberUpdated'))
                }
                onRemove={(membershipId) =>
                  mutate(
                    () => controllers.removeAccount(membershipId),
                    t('administration.accountRemoved'),
                  )
                }
              />
            </TabsContent>
            <TabsContent value="agents" forceMount hidden={section !== 'agents'}>
              <AgentManifestsPanel
                listAgentManifests={controllers.listAgentManifests}
                getAgentManifest={controllers.getAgentManifest}
                saveAgentManifest={controllers.saveAgentManifest}
                validateAgentManifest={controllers.validateAgentManifest}
                deleteAgentManifest={controllers.deleteAgentManifest}
              />
            </TabsContent>
            <TabsContent value="groups" forceMount hidden={section !== 'groups'}>
              <GroupsPanel
                busy={busy || refreshing || refreshFailedAfterSave}
                canManage={canManage}
                groups={visibleData.groups}
                members={visibleData.members}
                onAdd={(input) =>
                  mutate(
                    () => controllers.addGroupMember(input),
                    t('administration.groupMemberAdded'),
                  )
                }
                onCreate={(input) =>
                  mutate(() => controllers.createGroup(input), t('administration.groupCreated'))
                }
                onRemove={(input) =>
                  mutate(
                    () => controllers.removeGroupMember(input),
                    t('administration.groupMemberRemoved'),
                  )
                }
                onUpdateFeatures={(input) =>
                  mutate(
                    () => controllers.updateGroupFeatures(input),
                    t('administration.featureVisibilityUpdated'),
                  )
                }
              />
            </TabsContent>
            <TabsContent value="catalog-access" forceMount hidden={section !== 'catalog-access'}>
              <GrantsPanel
                busy={busy || refreshing || refreshFailedAfterSave}
                canManage={canManage}
                grants={visibleData.grants}
                serviceIdentities={data.serviceIdentities}
                groups={visibleData.groups}
                members={visibleData.members}
                listAgentManifests={controllers.listAgentManifests}
                onCreate={(input) =>
                  mutate(() => controllers.createGrant(input), t('administration.grantCreated'))
                }
                onDelete={(id) =>
                  mutate(() => controllers.deleteGrant(id), t('administration.grantDeleted'))
                }
              />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
