/**
 * Pipeline-authoring-owned boundary for the membership rows it must lock while
 * saving a graph. The adapter returns missing ids so the application service
 * can raise a pipeline validation error without importing Prisma concerns.
 */
export interface IPipelineSourceMembershipReader {
  lockAndListMissing(
    databaseName: string,
    databaseServiceIds: readonly string[],
  ): Promise<readonly string[]>;
}
