'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { DataTable, type DataTableColumn } from '@/app/_components/ui/data-table';
import { Field, FieldLabel } from '@/app/_components/ui/field';
import { FieldBlock, SelectField, TextField } from '@/app/_components/ui/fields';
import { useTranslation } from '@/app/_i18n/use-translation';
import type {
  AuthorizationGroup,
  CatalogAccessGrant,
  CatalogPermission,
  CreateCatalogGrantInput,
  OrganizationMember,
  ServiceIdentitySummary,
} from '@/src/entities/models/administration';
import { catalogPermissions, catalogResourceTypes } from '@/src/entities/models/administration';
import type { ListAgentManifestsController } from '@/src/interface-adapters/controllers/agent-manifests/list-agent-manifests.controller';

interface GrantsPanelProps {
  readonly busy: boolean;
  readonly canManage: boolean;
  readonly grants: readonly CatalogAccessGrant[];
  readonly groups: readonly AuthorizationGroup[];
  readonly serviceIdentities?: readonly ServiceIdentitySummary[];
  readonly members: readonly OrganizationMember[];
  readonly listAgentManifests: ListAgentManifestsController;
  readonly fixedAgentName?: string;
  readonly onCreate: (input: CreateCatalogGrantInput) => Promise<boolean>;
  readonly onDelete: (id: string) => Promise<boolean>;
}

export function GrantsPanel({
  busy,
  canManage,
  grants,
  groups,
  members,
  serviceIdentities = [],
  listAgentManifests,
  fixedAgentName,
  onCreate,
  onDelete,
}: GrantsPanelProps) {
  const { t } = useTranslation();
  const [principalType, setPrincipalType] =
    useState<CreateCatalogGrantInput['principalType']>('GROUP');
  const [agentNames, setAgentNames] = useState<readonly string[]>([]);
  const [agentLoadError, setAgentLoadError] = useState(false);
  useEffect(() => {
    if (fixedAgentName) return;
    let cancelled = false;
    void listAgentManifests()
      .then((agents) => {
        if (!cancelled) setAgentNames(agents.map((agent) => agent.name));
      })
      .catch(() => {
        if (!cancelled) setAgentLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fixedAgentName, listAgentManifests]);
  const [principalId, setPrincipalId] = useState('');
  const [resourceType, setResourceType] =
    useState<CreateCatalogGrantInput['resourceType']>('CATALOG');
  const [resourceId, setResourceId] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [effect, setEffect] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [includeDescendants, setIncludeDescendants] = useState(false);
  const serviceLabel = (purpose: 'BACKGROUND' | 'AGENT') =>
    t(
      purpose === 'BACKGROUND'
        ? 'administration.backgroundExecutor'
        : 'administration.agentServiceIdentity',
    );
  const serviceNames = new Map(
    serviceIdentities
      .filter((identity) => identity.identityId)
      .map((identity) => [identity.identityId, serviceLabel(identity.purpose)]),
  );
  const principalOptions =
    principalType === 'GROUP'
      ? groups.map((group) => ({ value: group.id, label: group.name }))
      : principalType === 'AGENT'
        ? agentNames.map((name) => ({ value: name, label: name }))
        : principalType === 'SERVICE_IDENTITY'
          ? serviceIdentities
              .filter((identity) => identity.identityId)
              .map((identity) => ({
                value: identity.identityId ?? '',
                label: t('administration.servicePrincipalLabel', {
                  name: serviceLabel(identity.purpose),
                  status: t(
                    identity.enabled && identity.identity.status === 'ACTIVE'
                      ? 'administration.serviceIdentitiesEnabled'
                      : 'administration.serviceIdentitiesDisabled',
                  ),
                }),
              }))
          : members.map((member) => ({
              value: member.identityId,
              label: member.identity.displayName ?? member.identity.email ?? member.identityId,
            }));
  const columns: readonly DataTableColumn<CatalogAccessGrant>[] = [
    {
      key: 'principal',
      header: t('administration.principal'),
      render: (grant) =>
        serviceNames.get(grant.identityId) ??
        grant.group?.name ??
        grant.identity?.displayName ??
        grant.identity?.email ??
        grant.agentName ??
        grant.groupId ??
        grant.identityId,
    },
    {
      key: 'resource',
      header: t('administration.resource'),
      render: (grant) => `${grant.resourceType}: ${grant.resourceId}`,
    },
    {
      key: 'permissions',
      header: t('administration.permissions'),
      render: (grant) => `${grant.effect} · ${grant.permissions.join(', ')}`,
    },
    {
      key: 'scope',
      header: t('administration.scope'),
      render: (grant) =>
        grant.includeDescendants
          ? t('administration.descendantsIncluded')
          : t('administration.namedResourceOnly'),
    },
    {
      key: 'actions',
      header: t('administration.actions'),
      render: (grant) =>
        canManage ? (
          <Button
            aria-busy={busy}
            disabled={busy}
            size="xs"
            variant="destructive-ghost"
            onClick={() => void onDelete(grant.id)}
          >
            {t('administration.deleteGrant')}
          </Button>
        ) : null,
    },
  ];
  return (
    <Card asChild className="gap-0 p-5 md:p-6">
      <section>
        <h2 className="m-0 text-body-lg font-medium tracking-[-0.02em]">
          {t('administration.catalogAccessTitle')}
        </h2>
        <p className="mt-2 mb-5 text-sm text-muted-foreground">
          {t('administration.catalogAccessDescription')}
        </p>
        {agentLoadError ? <p role="alert">{t('administration.agentGrantLoadFailed')}</p> : null}
        {canManage ? (
          <form
            className="mb-5 grid items-start gap-5 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onCreate({
                principalType: fixedAgentName ? 'AGENT' : principalType,
                principalId: fixedAgentName ?? principalId,
                resourceType,
                resourceId,
                permissions: permissions as CatalogPermission[],
                effect,
                includeDescendants,
                grantOption: false,
              });
            }}
          >
            {!fixedAgentName ? (
              <SelectField
                label={t('administration.principalType')}
                data={[
                  { value: 'GROUP', label: t('administration.group') },
                  { value: 'MEMBER', label: t('administration.member') },
                  { value: 'AGENT', label: t('administration.agent') },
                  { value: 'SERVICE_IDENTITY', label: t('administration.serviceIdentity') },
                ]}
                value={principalType}
                onChange={(value) => {
                  setPrincipalType(value as typeof principalType);
                  setPrincipalId('');
                }}
              />
            ) : null}
            {!fixedAgentName ? (
              <SelectField
                required
                label={t('administration.principal')}
                data={[
                  { value: '', label: t('administration.choosePrincipal') },
                  ...principalOptions,
                ]}
                value={principalId}
                onChange={setPrincipalId}
              />
            ) : null}
            {!fixedAgentName && principalType === 'SERVICE_IDENTITY' ? (
              <p className="col-span-full text-sm text-muted-foreground" role="status">
                {t(
                  serviceIdentities.some((identity) => identity.identityId)
                    ? 'administration.serviceGrantHelp'
                    : 'administration.serviceGrantUnavailable',
                )}
              </p>
            ) : null}
            <SelectField
              label={t('administration.resourceType')}
              data={catalogResourceTypes.map((value) => ({ value, label: value }))}
              value={resourceType}
              onChange={(value) => setResourceType(value as typeof resourceType)}
            />
            <TextField
              required
              label={t('administration.resourceId')}
              placeholder={t('administration.resourceIdHint')}
              value={resourceId}
              onChange={(event) => setResourceId(event.currentTarget.value)}
            />
            <FieldBlock className="md:col-span-2" label={t('administration.permissions')}>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {catalogPermissions.map((permission) => (
                  <Field key={permission} orientation="horizontal" className="w-auto">
                    <Checkbox
                      checked={permissions.includes(permission)}
                      id={`${fixedAgentName ?? 'all'}-permission-${permission}`}
                      onCheckedChange={(checked) =>
                        setPermissions(
                          checked === true
                            ? [...permissions, permission]
                            : permissions.filter((value) => value !== permission),
                        )
                      }
                    />
                    <FieldLabel
                      className="font-normal"
                      htmlFor={`${fixedAgentName ?? 'all'}-permission-${permission}`}
                    >
                      {permission}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </FieldBlock>
            <SelectField
              label={t('administration.effect')}
              data={['ALLOW', 'DENY']}
              value={effect}
              onChange={(value) => setEffect(value as typeof effect)}
            />
            <Field orientation="horizontal" className="md:self-end md:pb-2">
              <Checkbox
                checked={includeDescendants}
                id={`${fixedAgentName ?? 'all'}-include-descendants`}
                onCheckedChange={(checked) => setIncludeDescendants(checked === true)}
              />
              <FieldLabel
                className="font-normal"
                htmlFor={`${fixedAgentName ?? 'all'}-include-descendants`}
              >
                {t('administration.includeDescendants')}
              </FieldLabel>
            </Field>
            <Button
              className="w-fit md:col-span-2"
              aria-busy={busy}
              disabled={
                busy || !(fixedAgentName ?? principalId) || !resourceId || permissions.length === 0
              }
              type="submit"
            >
              {t('administration.createGrant')}
            </Button>
          </form>
        ) : null}
        <DataTable
          ariaLabel={t('administration.catalogAccessTitle')}
          columns={columns}
          emptyMessage={t('administration.noGrants')}
          rowKey={(grant) => grant.id}
          rows={
            fixedAgentName ? grants.filter((grant) => grant.agentName === fixedAgentName) : grants
          }
        />
      </section>
    </Card>
  );
}
