import {
  createS3WorkspaceProviderFromEnvironment,
  type S3WorkspaceEnvironment,
  type S3WorkspaceProvider,
} from "@infrastructure/workspace";

/** Build the only production tool workspace backend: MinIO/S3. */
export function createProductionWorkspaceProvider(
  environment: S3WorkspaceEnvironment,
): Promise<S3WorkspaceProvider> {
  return createS3WorkspaceProviderFromEnvironment(environment);
}
