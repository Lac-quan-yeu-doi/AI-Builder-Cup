import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FirmwareConfirmationMonitorService } from '@application/device-management/firmware-confirmation-monitor.service';

@Injectable()
export class FirmwareConfirmationMonitorWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(FirmwareConfirmationMonitorWorker.name);
  private readonly intervalMilliseconds: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  public constructor(
    private readonly monitor: FirmwareConfirmationMonitorService,
    config: ConfigService,
  ) {
    this.intervalMilliseconds = config.getOrThrow<number>(
      'FIRMWARE_CONFIRMATION_MONITOR_INTERVAL_MS',
    );
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
      await this.monitor.monitorOnce();
    } catch (error) {
      this.logger.error('Firmware confirmation monitor cycle failed.', error);
    } finally {
      this.running = false;
    }
  }
}
