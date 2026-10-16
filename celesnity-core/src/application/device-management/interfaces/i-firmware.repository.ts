import type {
  FirmwareDeployment,
  FirmwareDeploymentRecord,
  FirmwareDeploymentStatus,
  FirmwareRelease,
} from '@domain/device-management/models/firmware';

export interface IFirmwareRepository {
  createRelease(release: FirmwareRelease): Promise<FirmwareRelease | 'VERSION_CONFLICT'>;
  listReleases(): Promise<readonly FirmwareRelease[]>;
  findRelease(id: string): Promise<FirmwareRelease | undefined>;
  createDeployment(
    deployment: FirmwareDeploymentRecord,
  ): Promise<FirmwareDeployment | 'ACTIVE_DEPLOYMENT_CONFLICT'>;
  listDeployments(deviceId: string): Promise<readonly FirmwareDeployment[]>;
  findDeployment(id: string): Promise<FirmwareDeploymentRecord | undefined>;
  findRebootingTimedOut(
    limit: number,
    updatedBefore: string,
  ): Promise<readonly FirmwareDeploymentRecord[]>;
  confirmRebootedDeployment(
    deviceId: string,
    releaseVersion: string,
    confirmedAt: string,
  ): Promise<FirmwareDeployment | undefined>;
  updateDeployment(
    id: string,
    expectedStatus: FirmwareDeploymentStatus,
    status: FirmwareDeploymentStatus,
    progressPercent: number,
    updatedAt: string,
    error?: string,
  ): Promise<FirmwareDeployment | undefined>;
}
