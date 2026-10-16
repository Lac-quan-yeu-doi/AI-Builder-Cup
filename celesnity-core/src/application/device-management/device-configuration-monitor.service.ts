import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IDeviceConfigurationCommandPublisher } from '@application/device-management/interfaces/i-device-configuration-command-publisher';
import type { IDeviceConfigurationRepository } from '@application/device-management/interfaces/i-device-configuration.repository';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';

export interface DeviceConfigurationMonitorLogger {
  info(message: string, context: Readonly<Record<string, unknown>>): void;
  error(message: string, context: Readonly<Record<string, unknown>>): void;
}

export class DeviceConfigurationMonitorService {
  public constructor(
    private readonly configurations: IDeviceConfigurationRepository,
    private readonly devices: IDeviceRepository,
    private readonly publisher: IDeviceConfigurationCommandPublisher,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly contexts: AuthenticatedContextStore,
    private readonly logger: DeviceConfigurationMonitorLogger,
    private readonly confirmationTimeoutSeconds: number,
    private readonly batchSize: number,
  ) {}

  public async monitorOnce(): Promise<number> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - this.confirmationTimeoutSeconds * 1_000).toISOString();
    const candidates = await this.configurations.findTimedOut(this.batchSize, cutoff);
    for (const candidate of candidates) {
      await this.contexts.runBackground(
        candidate.organizationId,
        async () => {
          try {
            const device = await this.devices.findById(candidate.deviceId);
            if (device === undefined) return;
            if (
              candidate.status === 'APPLIED' &&
              (device.desiredConfigurationVersion !== candidate.version ||
                device.appliedConfigurationVersion !== candidate.version ||
                device.reportedConfigurationVersion === candidate.version)
            ) {
              return;
            }
            await this.publisher.clear(device);
            const updated = await this.unitOfWork.commit(() =>
              this.configurations.updateStatus(
                candidate.id,
                candidate.status,
                'ROLLED_BACK',
                now.toISOString(),
                'Device did not confirm configuration within the allowed window.',
              ),
            );
            if (updated === undefined) return;
            this.logger.info('Device configuration confirmation timed out.', {
              organizationId: candidate.organizationId,
              deviceId: candidate.deviceId,
              configurationId: candidate.id,
              version: candidate.version,
            });
          } catch (error) {
            this.logger.error('Device configuration timeout handling failed.', {
              organizationId: candidate.organizationId,
              deviceId: candidate.deviceId,
              configurationId: candidate.id,
              error:
                error instanceof Error ? error.message : 'Unknown configuration monitor error.',
            });
          }
        },
        'DEVICES',
      );
    }
    return candidates.length;
  }
}
