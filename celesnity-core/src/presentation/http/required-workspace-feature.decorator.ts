import { SetMetadata } from '@nestjs/common';
import type { WorkspaceFeature } from '@application/administration/workspace-feature';

export const REQUIRED_WORKSPACE_FEATURES = 'celesnity.requiredWorkspaceFeatures';
export const RequireWorkspaceFeature = (
  ...features: readonly WorkspaceFeature[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_WORKSPACE_FEATURES, features);
