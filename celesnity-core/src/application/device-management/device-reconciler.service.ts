import type { IDeviceCredentialVault } from '@application/device-management/interfaces/i-device-credential-vault';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IDevicePrincipalProvisioner } from '@application/device-management/interfaces/i-device-principal-provisioner';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';

export interface DeviceReconcilerLogger {
  info(message: string, context: Readonly<Record<string, unknown>>): void;
  error(message: string, context: Readonly<Record<string, unknown>>): void;
}

export class DeviceReconcilerService {
  public constructor(
    private readonly repository: IDeviceRepository,
    private readonly credentials: IDeviceCredentialVault,
    private readonly provisioner: IDevicePrincipalProvisioner,
    private readonly clock: IClock,
    private readonly logger: DeviceReconcilerLogger,
    private readonly batchSize: number,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public async reconcileOnce(): Promise<number> {
    const candidates = await this.repository.claimReconciliation(
      this.batchSize,
      this.clock.now().toISOString(),
    );
    for (const candidate of candidates) {
      await this.contexts.runBackground(
        candidate.organizationId,
        async () => {
          try {
            const credentials = await this.credentials.decrypt(candidate.credentials);
            const authorizedTelemetryTopics =
              candidate.deviceType === 'GATEWAY'
                ? [
                    candidate.topics.telemetry,
                    ...(await this.repository.listBoundActiveSensorTelemetryTopics(candidate.id)),
                  ]
                : [];
            await this.provisioner.apply(candidate, credentials, authorizedTelemetryTopics);
            if (candidate.deviceType === 'SENSOR' && candidate.gatewayId !== undefined) {
              await this.repository.schedulePrincipalReconciliation(
                candidate.gatewayId,
                this.clock.now().toISOString(),
              );
            }
            await this.repository.completeReconciliation(
              candidate.id,
              candidate.generation,
              candidate.attemptId,
              this.clock.now().toISOString(),
            );
            this.logger.info('Device principal reconciled.', {
              organizationId: candidate.organizationId,
              deviceId: candidate.id,
              generation: candidate.generation,
              desiredState: candidate.desiredState,
            });
          } catch (error) {
            const safeError =
              error instanceof Error ? error.message : 'Device provisioning failed.';
            await this.repository.failReconciliation(
              candidate.id,
              candidate.generation,
              candidate.attemptId,
              safeError,
              this.clock.now().toISOString(),
            );
            this.logger.error('Device principal reconciliation failed.', {
              organizationId: candidate.organizationId,
              deviceId: candidate.id,
              generation: candidate.generation,
              error: safeError,
            });
          }
        },
        'DEVICES',
      );
    }
    return candidates.length;
  }
}
