export interface DatabaseSourcePipelineUsage {
  readonly id: string;
  readonly name: string;
}

export interface IDatabaseSourceUsageReader {
  listUsingPipelines(
    databaseName: string,
    databaseServiceId: string,
  ): Promise<readonly DatabaseSourcePipelineUsage[]>;
}
