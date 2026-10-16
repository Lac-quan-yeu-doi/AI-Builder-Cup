export interface IRunOwnershipResolver {
  ownsRun(runId: string, organizationId: string): Promise<boolean>;
}
