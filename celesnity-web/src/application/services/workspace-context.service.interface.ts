export interface ContextResource {
  readonly id: string;
  readonly name: string;
  readonly resourceType: string;
}

export interface WorkspaceContextService {
  /** Lists only resources authorized for the current member and organization. */
  listAuthorizedResources(resourceType: string): Promise<readonly ContextResource[]>;
  isResourceStillValid(resourceType: string, resourceId: string): Promise<boolean>;
}
