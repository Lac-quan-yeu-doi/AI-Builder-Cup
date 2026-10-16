import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

export interface TutorialFeatureAccessService {
  accessibleFeatures(): Promise<readonly WorkspaceFeature[]>;
}
