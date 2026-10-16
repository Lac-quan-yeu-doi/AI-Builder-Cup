import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DeviceConfigurationMonitorService } from '@application/device-management/device-configuration-monitor.service';

@Injectable()
export class DeviceConfigurationMonitorWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DeviceConfigurationMonitorWorker.name);
  private readonly intervalMilliseconds: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  public constructor(
    private readonly monitor: DeviceConfigurationMonitorService,
    config: ConfigService,
  ) {
    this.intervalMilliseconds = config.getOrThrow<number>(
      'DEVICE_CONFIGURATION_MONITOR_INTERVAL_MS',
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
      this.logger.error('Device configuration monitor cycle failed.', error);
    } finally {
      this.running = false;
    }
  }
}
