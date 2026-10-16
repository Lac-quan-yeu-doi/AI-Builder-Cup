import {
  FeatureNotImplementedError,
  type WorkspacePort,
} from "@application/shared/ports/index.js";
export const createUnavailableWorkspacePort = (): WorkspacePort => ({
  ensure: () =>
    Promise.reject(new FeatureNotImplementedError("workspace-provider")),
  tree: () =>
    Promise.reject(new FeatureNotImplementedError("workspace-provider")),
  read: () =>
    Promise.reject(new FeatureNotImplementedError("workspace-provider")),
  sync: () =>
    Promise.reject(new FeatureNotImplementedError("workspace-provider")),
});
