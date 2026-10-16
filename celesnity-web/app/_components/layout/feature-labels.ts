import type { TranslationKey } from '@/app/_i18n/en';
import { workspaceFeatures, type WorkspaceFeature } from '@/src/entities/models/workspace-feature';

/**
 * What to call each feature when an admin is granting or revoking it.
 *
 * The administration grid used to be built by mapping `workspaceNavigation`,
 * which tied an admin's ability to configure a feature to whether the sidebar
 * happened to offer it. Folding a destination into its container would then have
 * silently removed the control while Core kept enforcing the feature — the
 * policy would still apply, with no way left to see or change it.
 *
 * Two smaller things that coupling got wrong, fixed by keying on the feature
 * itself: `HOME` backs two destinations, so it rendered twice with a duplicate
 * DOM id; and a feature with no destination at all would not have rendered.
 */
const FEATURE_LABELS: Readonly<Record<WorkspaceFeature, TranslationKey>> = {
  HOME: 'nav.chat',
  CONNECTIONS: 'nav.connectionDatabase',
  STREAMING: 'nav.streaming',
  DEVICES: 'nav.devices',
  SOURCE_SCHEMA: 'nav.sourceSchema',
  CRAWLER: 'nav.crawler',
  PIPELINES: 'nav.jobs',
  EXECUTIONS: 'nav.jobRunning',
  AUTOMATIONS: 'nav.automations',
  CATALOG_DATABASES: 'nav.databases',
  CATALOG_TABLES: 'nav.tables',
  PLANT_MODEL: 'nav.plantModel',
  QUERY: 'nav.query',
  ANALYTICS: 'nav.analytics',
  DOCUMENTS: 'nav.documents',
  GUIDE: 'nav.guide',
  ADMINISTRATION: 'nav.administration',
};

export interface WorkspaceFeatureOption {
  readonly feature: WorkspaceFeature;
  readonly labelKey: TranslationKey;
}

/** Every configurable feature, in the order `workspaceFeatures` declares them. */
export const workspaceFeatureOptions: readonly WorkspaceFeatureOption[] = workspaceFeatures.map(
  (feature) => ({ feature, labelKey: FEATURE_LABELS[feature] }),
);
