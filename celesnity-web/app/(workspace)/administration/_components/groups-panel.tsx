'use client';

import { useState } from 'react';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { Field, FieldLabel } from '@/app/_components/ui/field';
import { SelectField, TextField } from '@/app/_components/ui/fields';
import { workspaceFeatureOptions } from '@/app/_components/layout/feature-labels';
import { useTranslation } from '@/app/_i18n/use-translation';
import type {
  AuthorizationGroup,
  OrganizationMember,
  ChangeGroupMemberInput,
  CreateGroupInput,
  UpdateGroupFeaturesInput,
} from '@/src/entities/models/administration';
import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

interface GroupsPanelProps {
  readonly busy: boolean;
  readonly canManage: boolean;
  readonly groups: readonly AuthorizationGroup[];
  readonly members: readonly OrganizationMember[];
  readonly onAdd: (input: ChangeGroupMemberInput) => Promise<boolean>;
  readonly onCreate: (input: CreateGroupInput) => Promise<boolean>;
  readonly onRemove: (input: ChangeGroupMemberInput) => Promise<boolean>;
  readonly onUpdateFeatures: (input: UpdateGroupFeaturesInput) => Promise<boolean>;
}

export function GroupsPanel({
  busy,
  canManage,
  groups,
  members,
  onAdd,
  onCreate,
  onRemove,
  onUpdateFeatures,
}: GroupsPanelProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [identityId, setIdentityId] = useState('');
  return (
    <Card asChild className="gap-0 p-5 md:p-6">
      <section>
        <h2 className="m-0 text-body-lg font-medium tracking-[-0.02em]">
          {t('administration.groupsTitle')}
        </h2>
        <p className="mt-2 mb-5 text-sm text-muted-foreground">
          {t('administration.groupsDescription')}
        </p>
        {canManage ? (
          <>
            <h3 className="mb-3 text-sm font-semibold">{t('administration.createGroup')}</h3>
            <form
              className="mb-5 grid gap-3 min-[1081px]:grid-cols-[1fr_2fr_auto] min-[1081px]:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void onCreate({ name, ...(description ? { description } : {}) }).then((saved) => {
                  if (!saved) return;
                  setName('');
                  setDescription('');
                });
              }}
            >
              <TextField
                required
                label={t('administration.groupName')}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <TextField
                label={t('administration.description')}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
              <Button aria-busy={busy} disabled={busy} type="submit">
                {t('administration.createGroup')}
              </Button>
            </form>
            <h3 className="mb-3 border-t border-border pt-5 text-sm font-semibold">
              {t('administration.groupMembership')}
            </h3>
            <div className="mb-5 grid gap-3 md:grid-cols-2 min-[1081px]:grid-cols-[1fr_1fr_auto_auto] min-[1081px]:items-end">
              <SelectField
                label={t('administration.group')}
                data={[
                  { value: '', label: t('administration.chooseGroup') },
                  ...groups.map((group) => ({ value: group.id, label: group.name })),
                ]}
                value={groupId}
                onChange={setGroupId}
              />
              <SelectField
                label={t('administration.member')}
                data={[
                  { value: '', label: t('administration.chooseMember') },
                  ...members.map((member) => ({
                    value: member.identityId,
                    label:
                      member.identity.displayName ?? member.identity.email ?? member.identityId,
                  })),
                ]}
                value={identityId}
                onChange={setIdentityId}
              />
              <Button
                aria-busy={busy}
                disabled={busy || !groupId || !identityId}
                onClick={() => void onAdd({ groupId, identityId })}
              >
                {t('administration.addToGroup')}
              </Button>
              <Button
                aria-busy={busy}
                disabled={busy || !groupId || !identityId}
                variant="destructive-ghost"
                onClick={() => void onRemove({ groupId, identityId })}
              >
                {t('administration.removeFromGroup')}
              </Button>
            </div>
          </>
        ) : null}
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('administration.noGroups')}</p>
        ) : null}
        <div className="grid gap-3 border-t border-border pt-5 md:grid-cols-2">
          {groups.map((group) => (
            <div className="rounded border border-border p-3" key={group.id}>
              <strong>{group.name}</strong>
              <p className="text-sm text-muted-foreground">{group.description}</p>
              <p className="mt-2 text-sm">
                {group.members
                  .map(
                    (member) =>
                      member.identity.displayName ?? member.identity.email ?? member.identityId,
                  )
                  .join(', ') || t('administration.noGroupMembers')}
              </p>
              {canManage ? (
                <GroupFeatureEditor busy={busy} group={group} onSave={onUpdateFeatures} />
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </Card>
  );
}

interface GroupFeatureEditorProps {
  readonly busy: boolean;
  readonly group: AuthorizationGroup;
  readonly onSave: (input: UpdateGroupFeaturesInput) => Promise<boolean>;
}

function GroupFeatureEditor({ busy, group, onSave }: GroupFeatureEditorProps) {
  const { t } = useTranslation();
  const [features, setFeatures] = useState<WorkspaceFeature[]>([...group.visibleFeatures]);
  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t('administration.visibleFeatures')}</h4>
        <span className="text-xs text-muted-foreground">
          {group.featureVisibilityConfigured
            ? t('administration.featurePolicyConfigured')
            : t('administration.featurePolicyUnconfigured')}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {workspaceFeatureOptions.map((option) => {
          const id = `group-${group.id}-feature-${option.feature}`;
          return (
            <Field key={option.feature} orientation="horizontal">
              <Checkbox
                checked={features.includes(option.feature)}
                id={id}
                onCheckedChange={(checked) =>
                  setFeatures((current) =>
                    checked === true
                      ? [...current, option.feature]
                      : current.filter((feature) => feature !== option.feature),
                  )
                }
              />
              <FieldLabel className="font-normal" htmlFor={id}>
                {t(option.labelKey)}
              </FieldLabel>
            </Field>
          );
        })}
      </div>
      <Button
        aria-busy={busy}
        className="mt-4"
        disabled={busy}
        onClick={() => void onSave({ groupId: group.id, visibleFeatures: features })}
        variant="outline"
      >
        {t('administration.saveFeatureVisibility')}
      </Button>
    </div>
  );
}
