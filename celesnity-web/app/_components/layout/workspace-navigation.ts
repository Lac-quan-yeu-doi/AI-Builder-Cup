import {
  BlocksIcon,
  BookOpenIcon,
  DatabaseIcon,
  FileCodeIcon,
  FileTextIcon,
  MessageSquareIcon,
  RadioTowerIcon,
  ShieldIcon,
  SparklesIcon,
  TerminalIcon,
  ChartNoAxesCombinedIcon,
  ZapIcon,
  FactoryIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { TranslationKey } from '@/app/_i18n/en';
import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

export interface WorkspaceNavigationItem {
  readonly href: string;
  readonly labelKey: TranslationKey;
  readonly icon: LucideIcon;
  readonly feature: WorkspaceFeature;
}

export interface WorkspaceNavigationGroup {
  /** Omitted for the leading group, which carries no heading of its own. */
  readonly labelKey?: TranslationKey;
  readonly sections?: readonly WorkspaceNavigationSection[];
  readonly items: readonly WorkspaceNavigationItem[];
  readonly isolated?: boolean;
}

export interface WorkspaceNavigationSection {
  readonly labelKey: TranslationKey;
  readonly items: readonly WorkspaceNavigationItem[];
}

/**
 * The sidebar lists containers, not their parts.
 *
 * A destination that a container already holds as a tab must not also appear
 * here: offering both states the workspace's shape twice, and neither reading
 * says what a database actually is — connect a source, build a pipeline that
 * reads it, get tables. Seven entries came out on that rule, and each one is now
 * reached inside the object that owns it:
 *
 *   /connections, /source-schema, /metadata-crawler,
 *   /pipelines, /executions, /catalog/tables   ->  the database
 *   /devices                                   ->  the streaming adapter
 *
 * Nothing was removed — every screen is still mounted, still routed, and still
 * guarded by its own feature (`route-features.ts`). What changed is that they
 * are stages of something rather than peers of everything.
 *
 * What stays top-level, and why it has to: streaming adapters belong to a tenant
 * and write Bronze objects rather than Iceberg tables; a script's only link is
 * to a source, with no target database to derive; automations are keyed by event
 * topic; analytics is its own collection hierarchy. None of them has a field
 * naming a database, so filing them under one would be a claim the data does not
 * make.
 */
export const workspaceNavigationGroups: readonly WorkspaceNavigationGroup[] = [
  {
    items: [{ href: '/chat', labelKey: 'nav.chat', icon: MessageSquareIcon, feature: 'HOME' }],
  },
  {
    labelKey: 'nav.group.data',
    items: [
      {
        href: '/catalog/databases',
        labelKey: 'nav.databases',
        icon: DatabaseIcon,
        feature: 'CATALOG_DATABASES',
      },
      { href: '/streaming', labelKey: 'nav.streaming', icon: RadioTowerIcon, feature: 'STREAMING' },
      {
        href: '/plant-model',
        labelKey: 'nav.plantModel',
        icon: FactoryIcon,
        feature: 'PLANT_MODEL',
      },
      {
        href: '/analytics',
        labelKey: 'nav.analytics',
        icon: ChartNoAxesCombinedIcon,
        feature: 'ANALYTICS',
      },
    ],
  },
  {
    labelKey: 'nav.group.tools',
    items: [
      { href: '/sql', labelKey: 'nav.query', icon: TerminalIcon, feature: 'QUERY' },
      /*
       * A script reads one source and has its own workbench, so no container
       * holds it as a tab — which is why it belongs here rather than under a
       * database. It lost this entry while the rest of the rail was being
       * rewritten and spent that time reachable only by typing the URL.
       */
      { href: '/scripts', labelKey: 'nav.scripts', icon: FileCodeIcon, feature: 'PIPELINES' },
      {
        href: '/data-workflows',
        labelKey: 'nav.dataWorkflows',
        icon: WorkflowIcon,
        feature: 'PIPELINES',
      },
      { href: '/skills', labelKey: 'nav.skills', icon: SparklesIcon, feature: 'HOME' },
      { href: '/plugins', labelKey: 'nav.plugins', icon: BlocksIcon, feature: 'HOME' },
      { href: '/automations', labelKey: 'nav.automations', icon: ZapIcon, feature: 'AUTOMATIONS' },
    ],
  },
  {
    labelKey: 'nav.group.resources',
    items: [
      { href: '/documents', labelKey: 'nav.documents', icon: FileTextIcon, feature: 'DOCUMENTS' },
      { href: '/guide', labelKey: 'nav.guide', icon: BookOpenIcon, feature: 'GUIDE' },
    ],
  },
];

/** Administration sits in the footer: it is workspace setup, not daily work. */
export const workspaceFooterNavigation: readonly WorkspaceNavigationItem[] = [
  {
    href: '/administration',
    labelKey: 'nav.administration',
    icon: ShieldIcon,
    feature: 'ADMINISTRATION',
  },
];

/** Every destination, flattened — the order the groups render in. */
export const workspaceNavigation: readonly WorkspaceNavigationItem[] = [
  ...workspaceNavigationGroups.flatMap((group) => [
    ...(group.sections?.flatMap((section) => section.items) ?? []),
    ...group.items,
  ]),
  ...workspaceFooterNavigation,
];

export function canAccessWorkspaceFeature(
  visibleFeatures: readonly WorkspaceFeature[] | null,
  feature: WorkspaceFeature,
): boolean {
  return visibleFeatures === null || visibleFeatures.includes(feature);
}

export function visibleWorkspaceNavigationGroups(
  visibleFeatures: readonly WorkspaceFeature[] | null,
): readonly WorkspaceNavigationGroup[] {
  return workspaceNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessWorkspaceFeature(visibleFeatures, item.feature)),
      ...(group.sections
        ? {
            sections: group.sections
              .map((section) => ({
                ...section,
                items: section.items.filter((item) =>
                  canAccessWorkspaceFeature(visibleFeatures, item.feature),
                ),
              }))
              .filter((section) => section.items.length > 0),
          }
        : {}),
    }))
    .filter((group) => group.items.length > 0 || (group.sections?.length ?? 0) > 0);
}

export function firstVisibleWorkspaceDestination(
  visibleFeatures: readonly WorkspaceFeature[] | null,
): WorkspaceNavigationItem | undefined {
  return workspaceNavigation.find((item) =>
    canAccessWorkspaceFeature(visibleFeatures, item.feature),
  );
}

/**
 * Re-exported so existing call sites keep one import, but the mapping itself no
 * longer comes from this file. A route's guard must not depend on whether the
 * sidebar happens to offer it — see `route-features.ts`.
 */
export { workspaceFeatureForPath } from './route-features';
