import {
  BlocksIcon,
  BoxIcon,
  DatabaseIcon,
  FileTextIcon,
  MessageSquareIcon,
  RadioTowerIcon,
  ChartNoAxesCombinedIcon,
  // ZapIcon,
  FactoryIcon,
  // WorkflowIcon,
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
 * The six-capability workspace keeps setup routes for its data, workflow, and
 * analytics features. Unrelated screens remain in source but are paused in
 * `route-features.ts` and excluded from this navigation.
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
        href: '/plant-model/twin',
        labelKey: 'nav.digitalTwin',
        icon: BoxIcon,
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
  // {
  //   labelKey: 'nav.group.tools',
  //   items: [
  //     {
  //       href: '/data-workflows',
  //       labelKey: 'nav.dataWorkflows',
  //       icon: WorkflowIcon,
  //       feature: 'PIPELINES',
  //     },
  //     { href: '/plugins', labelKey: 'nav.plugins', icon: BlocksIcon, feature: 'HOME' },
  //     { href: '/automations', labelKey: 'nav.automations', icon: ZapIcon, feature: 'AUTOMATIONS' },
  //   ],
  // },
  {
    labelKey: 'nav.group.tools',
    items: [
      { href: '/plugins', labelKey: 'nav.plugins', icon: BlocksIcon, feature: 'HOME' },
    ],
  },
  {
    labelKey: 'nav.group.resources',
    items: [
      { href: '/documents', labelKey: 'nav.documents', icon: FileTextIcon, feature: 'DOCUMENTS' },
    ],
  },
];

// The administration screen is paused for the six-capability workspace.
export const workspaceFooterNavigation: readonly WorkspaceNavigationItem[] = [];

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
