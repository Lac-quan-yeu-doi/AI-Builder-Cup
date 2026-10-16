import { Module } from '@nestjs/common';

import { DeviceReconcilerWorker } from '@infrastructure/worker/device-management/device-reconciler.worker';
import { DeviceContactMonitorWorker } from '@infrastructure/worker/device-management/device-contact-monitor.worker';
import { DeviceConfigurationMonitorWorker } from '@infrastructure/worker/device-management/device-configuration-monitor.worker';
import { FirmwareConfirmationMonitorWorker } from '@infrastructure/worker/device-management/firmware-confirmation-monitor.worker';
import { DeviceManagementModule } from '@modules/device-management.module';

@Module({
  imports: [DeviceManagementModule],
  providers: [
    DeviceConfigurationMonitorWorker,
    DeviceContactMonitorWorker,
    DeviceReconcilerWorker,
    FirmwareConfirmationMonitorWorker,
  ],
})
export class DeviceManagementWorkerModule {}
