'use client';

import { ArrowRight, Database, Users, UsersRound } from 'lucide-react';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
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
import { useTranslation } from '@/app/_i18n/use-translation';
import type { AdministrationGovernance } from '@/src/entities/models/administration';
import { RoleBadge } from './role-selector';

interface AdministrationOverviewProps {
  readonly data: AdministrationGovernance;
  readonly onNavigate: (section: string) => void;
  readonly busy: boolean;
  readonly onEnableMfa: () => void;
}

export function AdministrationOverview({
  data,
  onNavigate,
  busy,
  onEnableMfa,
}: AdministrationOverviewProps) {
  const { t } = useTranslation();
  const { session } = data;
  const sections = ['ORG_OWNER', 'ORG_ADMIN'].includes(session.organization.role)
    ? [
        {
          value: 'members',
          icon: Users,
          count: data.members.length,
          title: t('administration.membersTab'),
          description: t('administration.membersDescription'),
          action: t('administration.manageMembers'),
        },
        {
          value: 'groups',
          icon: UsersRound,
          count: data.groups.length,
          title: t('administration.groupsTab'),
          description: t('administration.groupsDescription'),
          action: t('administration.manageGroups'),
        },
        {
          value: 'catalog-access',
          icon: Database,
          count: data.grants.length,
          title: t('administration.accessRules'),
          description: t('administration.catalogAccessDescription'),
          action: t('administration.manageCatalogAccess'),
        },
      ]
    : [];
  const details = [
    { label: t('administration.organizationName'), value: session.organization.organizationName },
    { label: t('administration.homeRegion'), value: session.organization.homeRegion },
    { label: t('administration.signedInAs'), value: session.email ?? session.identityId },
    { label: t('administration.role'), value: <RoleBadge role={session.organization.role} /> },
  ];

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 min-[1081px]:grid-cols-3">
        {sections.map(({ value, icon: Icon, count, title, description, action }) => (
          <Card className="gap-4 p-5" key={value}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
              <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-semibold tabular-nums">{count}</p>
            <p className="flex-1 text-sm text-muted-foreground">{description}</p>
            <Button className="w-fit" variant="outline" onClick={() => onNavigate(value)}>
              {action}
              <ArrowRight aria-hidden="true" />
            </Button>
          </Card>
        ))}
      </div>
      <Card className="gap-5 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t('administration.organizationDetails')}</h2>
          <Badge variant={session.mfaVerified ? 'success' : 'warning'}>
            {t(
              session.mfaVerified
                ? 'administration.mfaVerified'
                : session.organization.mfaRequired
                  ? 'administration.mfaRequired'
                  : 'administration.passwordSignIn',
            )}
          </Badge>
        </div>
        <dl className="grid gap-5 md:grid-cols-2">
          {details.map(({ label, value }) => (
            <div className="min-w-0" key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-border pt-4 text-xs leading-relaxed break-words text-muted-foreground">
          {t('administration.tenantBinding', { tenant: session.identityTenantId })}
        </p>
      </Card>
      <Card className="gap-4 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t('administration.mfaTitle')}</h2>
          <Badge variant={session.organization.mfaRequired ? 'success' : 'secondary'}>
            {t(
              session.organization.mfaRequired
                ? 'administration.mfaEnabled'
                : 'administration.mfaOff',
            )}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t('administration.mfaDescription')}</p>
        {!session.organization.mfaRequired && sections.length > 0 ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="w-fit" disabled={busy} aria-busy={busy}>
                {t('administration.enableMfa')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('administration.enableMfaTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('administration.enableMfaWarning')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>{t('action.cancel')}</AlertDialogCancel>
                <AlertDialogAction disabled={busy} onClick={onEnableMfa}>
                  {t('administration.confirmEnableMfa')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </Card>
    </div>
  );
}
