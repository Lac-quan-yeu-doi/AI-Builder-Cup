import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';

export interface DeviceContactMonitorLogger {
  info(message: string, context: Readonly<Record<string, unknown>>): void;
  error(message: string, context: Readonly<Record<string, unknown>>): void;
}

export class DeviceContactMonitorService {
  public constructor(
    private readonly repository: IDeviceRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly contexts: AuthenticatedContextStore,
    private readonly logger: DeviceContactMonitorLogger,
    private readonly batchSize: number,
  ) {}

  public async monitorOnce(): Promise<number> {
    const now = this.clock.now().toISOString();
    const candidates = await this.repository.findLostContactCandidates(this.batchSize, now);
    for (const candidate of candidates) {
      await this.contexts.runBackground(
        candidate.organizationId,
        async () => {
          try {
            await this.unitOfWork.commit(async () => {
              const updated = await this.repository.markLostContact(
                candidate.id,
                candidate.contactDeadlineAt ?? now,
                now,
              );
              if (updated === undefined) return;
              await this.repository.createAlert({
                id: this.ids.next(),
                organizationId: candidate.organizationId,
                deviceId: candidate.id,
                deviceName: candidate.name,
                type: 'LOSS_OF_CONTACT',
                severity: 'CRITICAL',
                status: 'RAISED',
                snapshot: {
                  lastSeenAt: candidate.lastSeenAt ?? null,
                  contactDeadlineAt: candidate.contactDeadlineAt ?? null,
                  expectedCheckInIntervalSeconds: candidate.expectedCheckInIntervalSeconds,
                  missedCheckInThreshold: candidate.missedCheckInThreshold,
                },
                raisedAt: now,
                updatedAt: now,
              });
            });
            this.logger.info('Device loss of contact detected.', {
              organizationId: candidate.organizationId,
              deviceId: candidate.id,
            });
          } catch (error) {
            this.logger.error('Device contact monitoring failed.', {
              organizationId: candidate.organizationId,
              deviceId: candidate.id,
              error: error instanceof Error ? error.message : 'Unknown contact monitor error.',
            });
          }
        },
        'DEVICES',
      );
    }
    return candidates.length;
  }
}
