import type {
  GovernanceEvidencePage,
  ManifestGovernance,
  RunGovernance,
} from '@/src/entities/models/governance';

export interface GovernanceRepository {
  getManifestGovernance(name: string): Promise<ManifestGovernance>;
  validateManifestGovernance(yaml: string): Promise<ManifestGovernance>;
  getRunGovernance(runId: string): Promise<RunGovernance>;
  getRunGovernanceEvidence(runId: string, cursor?: string): Promise<GovernanceEvidencePage>;
}
