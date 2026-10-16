'use client';

import { useId } from 'react';
import {
  Bot,
  ChartNoAxesCombined,
  Crown,
  Eye,
  ScanSearch,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/app/_components/ui/badge';
import { Field, FieldLabel } from '@/app/_components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/app/_components/ui/select';
import { useTranslation } from '@/app/_i18n/use-translation';
import { organizationRoles, type OrganizationRole } from '@/src/entities/models/administration';

const roleDetails = {
  ORG_OWNER: { label: 'administration.roleOwner', icon: Crown },
  ORG_ADMIN: { label: 'administration.roleAdmin', icon: ShieldCheck },
  DATA_ENGINEER: { label: 'administration.roleEngineer', icon: Wrench },
  ANALYST: { label: 'administration.roleAnalyst', icon: ChartNoAxesCombined },
  VIEWER: { label: 'administration.roleViewer', icon: Eye },
  AUDITOR: { label: 'administration.roleAuditor', icon: ScanSearch },
  SERVICE_ACCOUNT: { label: 'administration.roleServiceAccount', icon: Bot },
} as const;

export function isEditableOrganizationRole(role: string): role is OrganizationRole {
  return organizationRoles.some((candidate) => candidate === role);
}

function RoleLabel({ role }: { readonly role: string }) {
  const { t } = useTranslation();
  const details = Object.hasOwn(roleDetails, role)
    ? roleDetails[role as keyof typeof roleDetails]
    : undefined;
  if (!details) return <span>{role}</span>;
  const Icon = details.icon;
  return (
    <>
      <Icon aria-hidden="true" />
      <span>{t(details.label)}</span>
    </>
  );
}

export function RoleBadge({ role }: { readonly role: string }) {
  return (
    <Badge variant="outline">
      <RoleLabel role={role} />
    </Badge>
  );
}

interface RoleSelectorProps {
  readonly value: OrganizationRole;
  readonly onChange: (value: OrganizationRole) => void;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly className?: string;
}

export function RoleSelector({ value, onChange, disabled, label, className }: RoleSelectorProps) {
  const { t } = useTranslation();
  const id = useId();
  const groups = [
    { label: t('administration.administrativeRoles'), roles: organizationRoles.slice(0, 2) },
    { label: t('administration.workspaceRoles'), roles: organizationRoles.slice(2) },
  ];
  return (
    <Field className={className}>
      {label ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (isEditableOrganizationRole(next)) onChange(next);
        }}
      >
        <SelectTrigger
          id={id}
          aria-label={label ? undefined : t('administration.role')}
          className="w-full"
        >
          <SelectValue>
            <RoleLabel role={value} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="min-w-60">
          {groups.map((group, index) => (
            <SelectGroup key={group.label}>
              {index > 0 ? <SelectSeparator /> : null}
              <SelectLabel>{group.label}</SelectLabel>
              {group.roles.map((role) => (
                <SelectItem
                  key={role}
                  value={role}
                  textValue={t(roleDetails[role].label)}
                  className="py-2.5"
                >
                  <RoleLabel role={role} />
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
