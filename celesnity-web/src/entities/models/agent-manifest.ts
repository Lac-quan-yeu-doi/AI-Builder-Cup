/** One owner-scoped YAML manifest stored by minder-agent in S3. */
export interface AgentManifestSummary {
  readonly name: string;
  readonly description: string;
  readonly skills: readonly string[];
  readonly sourcePath: string;
  readonly contentHash: string;
  readonly yaml: string;
}

export type AgentManifest = AgentManifestSummary;

export interface SaveAgentManifestInput {
  readonly name: string;
  readonly yaml: string;
}
