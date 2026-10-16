import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';

export interface FirmwareConfirmationMonitorLogger {
  info(message: string, context: Readonly<Record<string, unknown>>): void;
  error(message: string, context: Readonly<Record<string, unknown>>): void;
}

export class FirmwareConfirmationMonitorService {
  public constructor(
    private readonly repository: IFirmwareRepository,
    private readonly clock: IClock,
    private readonly contexts: AuthenticatedContextStore,
    private readonly logger: FirmwareConfirmationMonitorLogger,
    private readonly confirmationTimeoutSeconds: number,
    private readonly batchSize: number,
  ) {}

  public async monitorOnce(): Promise<number> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - this.confirmationTimeoutSeconds * 1_000).toISOString();
    const candidates = await this.repository.findRebootingTimedOut(this.batchSize, cutoff);
    for (const candidate of candidates) {
      await this.contexts.runBackground(
        candidate.organizationId,
        async () => {
          try {
            const updated = await this.repository.updateDeployment(
              candidate.id,
              'REBOOTING',
              'ROLLED_BACK',
              candidate.progressPercent,
              now.toISOString(),
              'Device did not confirm the new firmware with a post-reboot heartbeat.',
            );
            if (updated === undefined) return;
            this.logger.info('Firmware boot confirmation timed out.', {
              organizationId: candidate.organizationId,
              deviceId: candidate.deviceId,
              deploymentId: candidate.id,
              releaseVersion: candidate.releaseVersion,
            });
          } catch (error) {
            this.logger.error('Firmware boot confirmation timeout handling failed.', {
              organizationId: candidate.organizationId,
              deviceId: candidate.deviceId,
              deploymentId: candidate.id,
              error: error instanceof Error ? error.message : 'Unknown firmware monitor error.',
            });
          }
        },
        'DEVICES',
      );
    }
    return candidates.length;
  }
}
