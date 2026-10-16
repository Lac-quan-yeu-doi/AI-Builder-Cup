import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DeviceReconcilerService } from '@application/device-management/device-reconciler.service';

@Injectable()
export class DeviceReconcilerWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DeviceReconcilerWorker.name);
  private readonly intervalMilliseconds: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  public constructor(
    private readonly reconciler: DeviceReconcilerService,
    config: ConfigService,
  ) {
    this.intervalMilliseconds = config.getOrThrow<number>('STREAMING_RECONCILE_INTERVAL_MS');
  }

  public onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMilliseconds);
    void this.tick();
  }

  public onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconciler.reconcileOnce();
    } catch (error) {
      this.logger.error('Device reconciliation cycle failed.', error);
    } finally {
      this.running = false;
    }
  }
}
