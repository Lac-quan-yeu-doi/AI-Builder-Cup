import type { IStreamingCredentialVault } from '@application/streaming/interfaces/i-streaming-credential-vault';
import type { IMqttStreamAdapterRepository } from '@application/streaming/interfaces/i-mqtt-stream-adapter.repository';
import type { IStreamingProvisioner } from '@application/streaming/interfaces/i-streaming-provisioner';
import type { IClock } from '@application/shared/interfaces/i-clock';

export interface StreamingReconcilerLogger {
  info(message: string, context: Readonly<Record<string, unknown>>): void;
  error(message: string, context: Readonly<Record<string, unknown>>): void;
}

export class StreamingReconcilerService {
  public constructor(
    private readonly repository: IMqttStreamAdapterRepository,
    private readonly credentials: IStreamingCredentialVault,
    private readonly provisioner: IStreamingProvisioner,
    private readonly clock: IClock,
    private readonly logger: StreamingReconcilerLogger,
    private readonly batchSize: number,
  ) {}

  public async reconcileOnce(): Promise<number> {
    const candidates = await this.repository.claimReconciliation(
      this.batchSize,
      this.clock.now().toISOString(),
    );
    for (const candidate of candidates) {
      try {
        const credentials = await this.credentials.decrypt(candidate.credentials);
        await this.provisioner.apply(candidate, credentials);
        await this.repository.completeReconciliation(
          candidate.id,
          candidate.generation,
          candidate.attemptId,
          this.clock.now().toISOString(),
        );
        this.logger.info('MQTT adapter reconciled.', {
          adapterId: candidate.id,
          generation: candidate.generation,
          desiredState: candidate.desiredState,
        });
      } catch (error) {
        const safeError = error instanceof Error ? error.message : 'Provisioning failed.';
        await this.repository.failReconciliation(
          candidate.id,
          candidate.generation,
          candidate.attemptId,
          safeError,
          this.clock.now().toISOString(),
        );
        this.logger.error('MQTT adapter reconciliation failed.', {
          adapterId: candidate.id,
          generation: candidate.generation,
          error: safeError,
        });
      }
    }
    return candidates.length;
  }
}
