'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/app/_components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/_components/ui/alert-dialog';
import { Card } from '@/app/_components/ui/card';
import { DataTable, type DataTableColumn } from '@/app/_components/ui/data-table';
import { SelectField, TextField } from '@/app/_components/ui/fields';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { useTranslation } from '@/app/_i18n/use-translation';
import type {
  InviteMemberInput,
  MemberInvitation,
  OrganizationMember,
  OrganizationRole,
  UpdateMemberInput,
} from '@/src/entities/models/administration';
import { isEditableOrganizationRole, RoleBadge, RoleSelector } from './role-selector';
import { Spinner } from '@/app/_components/ui/spinner';

interface MembersPanelProps {
  readonly busy: boolean;
  readonly canManage: boolean;
  readonly invitation?: MemberInvitation;
  readonly members: readonly OrganizationMember[];
  readonly onInvite: (input: InviteMemberInput) => Promise<boolean>;
  readonly onRemove: (membershipId: string) => Promise<boolean>;
  readonly onUpdate: (input: UpdateMemberInput) => Promise<boolean>;
}

export function MembersPanel({
  busy,
  canManage,
  invitation,
  members,
  onInvite,
  onRemove,
  onUpdate,
}: MembersPanelProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>('VIEWER');
  const columns: readonly DataTableColumn<OrganizationMember>[] = [
    {
      key: 'member',
      header: t('administration.member'),
      render: (member) => member.identity.displayName ?? member.identity.email ?? member.identityId,
    },
    {
      key: 'role',
      header: t('administration.role'),
      render: (member) => <RoleBadge role={member.role} />,
    },
    { key: 'status', header: t('administration.status'), render: (member) => member.status },
    {
      key: 'actions',
      header: t('administration.actions'),
      render: (member) =>
        canManage ? (
          isEditableOrganizationRole(member.role) ? (
            <MemberEditor
              key={`${member.id}:${member.role}:${member.status}`}
              busy={busy}
              member={member}
              onRemove={onRemove}
              onUpdate={onUpdate}
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {t('administration.roleNotEditable')}
            </span>
          )
        ) : null,
    },
  ];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onInvite({ email, role, expiresInHours: 72 }).then((saved) => {
      if (saved) setEmail('');
    });
  };
  return (
    <Card asChild className="gap-0 p-5 md:p-6">
      <section>
        <h2 className="m-0 text-body-lg font-medium tracking-[-0.02em]">
          {t('administration.membersTitle')}
        </h2>
        <p className="mt-2 mb-5 text-sm text-muted-foreground">
          {t('administration.membersDescription')}
        </p>
        {canManage ? (
          <form
            className="mb-6 grid gap-3 min-[1081px]:grid-cols-[2fr_1fr_auto] min-[1081px]:items-end"
            onSubmit={submit}
          >
            <TextField
              required
              label={t('administration.email')}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <RoleSelector
              label={t('administration.role')}
              value={role}
              disabled={busy}
              onChange={setRole}
            />
            <Button aria-busy={busy} disabled={busy} type="submit">
              {t('administration.inviteMember')}
            </Button>
          </form>
        ) : null}
        {invitation?.setupLink ? (
          <PageAlert tone="info">
            {t('administration.setupLink', { link: invitation.setupLink })}
          </PageAlert>
        ) : invitation ? (
          <PageAlert tone="info">{t('administration.existingIdentityAdded')}</PageAlert>
        ) : null}
        <DataTable
          ariaLabel={t('administration.membersTitle')}
          columns={columns}
          emptyMessage={t('administration.noMembers')}
          rowKey={(member) => member.id}
          rows={members}
        />
      </section>
    </Card>
  );
}

function MemberEditor({
  busy,
  member,
  onRemove,
  onUpdate,
}: {
  readonly busy: boolean;
  readonly member: OrganizationMember;
  readonly onRemove: (membershipId: string) => Promise<boolean>;
  readonly onUpdate: (input: UpdateMemberInput) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [role, setRole] = useState<OrganizationRole>(
    isEditableOrganizationRole(member.role) ? member.role : 'VIEWER',
  );
  const [status, setStatus] = useState(member.status);
  return (
    <div className="flex items-center gap-2">
      <RoleSelector className="w-56 shrink-0" value={role} disabled={busy} onChange={setRole} />
      <SelectField
        className="w-32 shrink-0"
        aria-label={t('administration.status')}
        data={['ACTIVE', 'REVOKED']}
        value={status}
        disabled={busy}
        onChange={(value) => setStatus(value as typeof status)}
      />
      <Button
        aria-busy={busy}
        disabled={busy || (role === member.role && status === member.status)}
        size="xs"
        variant="secondary"
        onClick={() => void onUpdate({ membershipId: member.id, role, status })}
      >
        {busy ? <Spinner /> : null}
        {t('administration.save')}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={busy} size="xs" variant="destructive-ghost">
            {t('administration.removeAccount')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('administration.removeAccountTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('administration.removeAccountDescription', {
                member: member.identity.displayName ?? member.identity.email ?? member.identityId,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant="destructive"
              onClick={() => void onRemove(member.id)}
            >
              {t('administration.removeAccountConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
