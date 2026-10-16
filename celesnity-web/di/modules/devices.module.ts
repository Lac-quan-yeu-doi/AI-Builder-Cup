import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createActivateDeviceUseCase } from '@/src/application/use-cases/devices/activate-device.use-case';
import { createListDeviceAdaptersUseCase } from '@/src/application/use-cases/devices/list-device-adapters.use-case';
import { createListDevicesUseCase } from '@/src/application/use-cases/devices/list-devices.use-case';
import { createRegisterDeviceUseCase } from '@/src/application/use-cases/devices/register-device.use-case';
import { createRetireDeviceUseCase } from '@/src/application/use-cases/devices/retire-device.use-case';
import { createRotateDeviceCredentialUseCase } from '@/src/application/use-cases/devices/rotate-device-credential.use-case';
import { createSuspendDeviceUseCase } from '@/src/application/use-cases/devices/suspend-device.use-case';
import { createTransitionDeviceLifecycleUseCase } from '@/src/application/use-cases/devices/transition-device-lifecycle.use-case';
import { createListDeviceLifecycleUseCase } from '@/src/application/use-cases/devices/list-device-lifecycle.use-case';
import { createReplaceDeviceUseCase } from '@/src/application/use-cases/devices/replace-device.use-case';
import { createCreateFirmwareReleaseUseCase } from '@/src/application/use-cases/devices/create-firmware-release.use-case';
import { createListFirmwareDeploymentsUseCase } from '@/src/application/use-cases/devices/list-firmware-deployments.use-case';
import { createListFirmwareReleasesUseCase } from '@/src/application/use-cases/devices/list-firmware-releases.use-case';
import { createStartFirmwareDeploymentUseCase } from '@/src/application/use-cases/devices/start-firmware-deployment.use-case';
import { createCreateFirmwareCampaignUseCase } from '@/src/application/use-cases/devices/create-firmware-campaign.use-case';
import { createListFirmwareCampaignsUseCase } from '@/src/application/use-cases/devices/list-firmware-campaigns.use-case';
import { createTransitionFirmwareCampaignUseCase } from '@/src/application/use-cases/devices/transition-firmware-campaign.use-case';
import { createListDeviceAlertsUseCase } from '@/src/application/use-cases/devices/list-device-alerts.use-case';
import { createListDeviceLogsUseCase } from '@/src/application/use-cases/devices/list-device-logs.use-case';
import { createAcknowledgeDeviceAlertUseCase } from '@/src/application/use-cases/devices/acknowledge-device-alert.use-case';
import { createClearDeviceAlertUseCase } from '@/src/application/use-cases/devices/clear-device-alert.use-case';
import { createListDeviceConfigurationsUseCase } from '@/src/application/use-cases/devices/list-device-configurations.use-case';
import { createPushDeviceConfigurationUseCase } from '@/src/application/use-cases/devices/push-device-configuration.use-case';
import { createCreateDeviceConfigurationTemplateUseCase } from '@/src/application/use-cases/devices/create-device-configuration-template.use-case';
import { createListDeviceConfigurationTemplatesUseCase } from '@/src/application/use-cases/devices/list-device-configuration-templates.use-case';
import { createDeployDeviceConfigurationTemplateUseCase } from '@/src/application/use-cases/devices/deploy-device-configuration-template.use-case';
import { CoreApiDeviceRepository } from '@/src/infrastructure/repositories/core-api-device.repository';
import { createActivateDeviceController } from '@/src/interface-adapters/controllers/devices/activate-device.controller';
import { createListDeviceAdaptersController } from '@/src/interface-adapters/controllers/devices/list-device-adapters.controller';
import { createListDevicesController } from '@/src/interface-adapters/controllers/devices/list-devices.controller';
import { createRegisterDeviceController } from '@/src/interface-adapters/controllers/devices/register-device.controller';
import { createRetireDeviceController } from '@/src/interface-adapters/controllers/devices/retire-device.controller';
import { createRotateDeviceCredentialController } from '@/src/interface-adapters/controllers/devices/rotate-device-credential.controller';
import { createSuspendDeviceController } from '@/src/interface-adapters/controllers/devices/suspend-device.controller';
import { createTransitionDeviceLifecycleController } from '@/src/interface-adapters/controllers/devices/transition-device-lifecycle.controller';
import { createListDeviceLifecycleController } from '@/src/interface-adapters/controllers/devices/list-device-lifecycle.controller';
import { createReplaceDeviceController } from '@/src/interface-adapters/controllers/devices/replace-device.controller';
import { createCreateFirmwareReleaseController } from '@/src/interface-adapters/controllers/devices/create-firmware-release.controller';
import { createListFirmwareDeploymentsController } from '@/src/interface-adapters/controllers/devices/list-firmware-deployments.controller';
import { createListFirmwareReleasesController } from '@/src/interface-adapters/controllers/devices/list-firmware-releases.controller';
import { createStartFirmwareDeploymentController } from '@/src/interface-adapters/controllers/devices/start-firmware-deployment.controller';
import { createCreateFirmwareCampaignController } from '@/src/interface-adapters/controllers/devices/create-firmware-campaign.controller';
import { createListFirmwareCampaignsController } from '@/src/interface-adapters/controllers/devices/list-firmware-campaigns.controller';
import { createTransitionFirmwareCampaignController } from '@/src/interface-adapters/controllers/devices/transition-firmware-campaign.controller';
import { createListDeviceAlertsController } from '@/src/interface-adapters/controllers/devices/list-device-alerts.controller';
import { createListDeviceLogsController } from '@/src/interface-adapters/controllers/devices/list-device-logs.controller';
import { createAcknowledgeDeviceAlertController } from '@/src/interface-adapters/controllers/devices/acknowledge-device-alert.controller';
import { createClearDeviceAlertController } from '@/src/interface-adapters/controllers/devices/clear-device-alert.controller';
import { createListDeviceConfigurationsController } from '@/src/interface-adapters/controllers/devices/list-device-configurations.controller';
import { createPushDeviceConfigurationController } from '@/src/interface-adapters/controllers/devices/push-device-configuration.controller';
import { createCreateDeviceConfigurationTemplateController } from '@/src/interface-adapters/controllers/devices/create-device-configuration-template.controller';
import { createListDeviceConfigurationTemplatesController } from '@/src/interface-adapters/controllers/devices/list-device-configuration-templates.controller';
import { createDeployDeviceConfigurationTemplateController } from '@/src/interface-adapters/controllers/devices/deploy-device-configuration-template.controller';

export function createDevicesModule() {
  const devicesModule = createTypedModule();
  devicesModule
    .bind(DI_SYMBOLS.DeviceRepository)
    .toClass(CoreApiDeviceRepository, [DI_SYMBOLS.CoreApiClient]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceAdaptersUseCase)
    .toHigherOrderFunction(createListDeviceAdaptersUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ListDevicesUseCase)
    .toHigherOrderFunction(createListDevicesUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.RegisterDeviceUseCase)
    .toHigherOrderFunction(createRegisterDeviceUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ActivateDeviceUseCase)
    .toHigherOrderFunction(createActivateDeviceUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.SuspendDeviceUseCase)
    .toHigherOrderFunction(createSuspendDeviceUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.RotateDeviceCredentialUseCase)
    .toHigherOrderFunction(createRotateDeviceCredentialUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.RetireDeviceUseCase)
    .toHigherOrderFunction(createRetireDeviceUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.TransitionDeviceLifecycleUseCase)
    .toHigherOrderFunction(createTransitionDeviceLifecycleUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceLifecycleUseCase)
    .toHigherOrderFunction(createListDeviceLifecycleUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ReplaceDeviceUseCase)
    .toHigherOrderFunction(createReplaceDeviceUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.CreateFirmwareReleaseUseCase)
    .toHigherOrderFunction(createCreateFirmwareReleaseUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ListFirmwareReleasesUseCase)
    .toHigherOrderFunction(createListFirmwareReleasesUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ListFirmwareDeploymentsUseCase)
    .toHigherOrderFunction(createListFirmwareDeploymentsUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.StartFirmwareDeploymentUseCase)
    .toHigherOrderFunction(createStartFirmwareDeploymentUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.CreateFirmwareCampaignUseCase)
    .toHigherOrderFunction(createCreateFirmwareCampaignUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ListFirmwareCampaignsUseCase)
    .toHigherOrderFunction(createListFirmwareCampaignsUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.TransitionFirmwareCampaignUseCase)
    .toHigherOrderFunction(createTransitionFirmwareCampaignUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceAlertsUseCase)
    .toHigherOrderFunction(createListDeviceAlertsUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceLogsUseCase)
    .toHigherOrderFunction(createListDeviceLogsUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.AcknowledgeDeviceAlertUseCase)
    .toHigherOrderFunction(createAcknowledgeDeviceAlertUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ClearDeviceAlertUseCase)
    .toHigherOrderFunction(createClearDeviceAlertUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceConfigurationsUseCase)
    .toHigherOrderFunction(createListDeviceConfigurationsUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.PushDeviceConfigurationUseCase)
    .toHigherOrderFunction(createPushDeviceConfigurationUseCase, [DI_SYMBOLS.DeviceRepository]);
  devicesModule
    .bind(DI_SYMBOLS.CreateDeviceConfigurationTemplateUseCase)
    .toHigherOrderFunction(createCreateDeviceConfigurationTemplateUseCase, [
      DI_SYMBOLS.DeviceRepository,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceConfigurationTemplatesUseCase)
    .toHigherOrderFunction(createListDeviceConfigurationTemplatesUseCase, [
      DI_SYMBOLS.DeviceRepository,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.DeployDeviceConfigurationTemplateUseCase)
    .toHigherOrderFunction(createDeployDeviceConfigurationTemplateUseCase, [
      DI_SYMBOLS.DeviceRepository,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceAdaptersController)
    .toHigherOrderFunction(createListDeviceAdaptersController, [
      DI_SYMBOLS.ListDeviceAdaptersUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ListDevicesController)
    .toHigherOrderFunction(createListDevicesController, [DI_SYMBOLS.ListDevicesUseCase]);
  devicesModule
    .bind(DI_SYMBOLS.RegisterDeviceController)
    .toHigherOrderFunction(createRegisterDeviceController, [DI_SYMBOLS.RegisterDeviceUseCase]);
  devicesModule
    .bind(DI_SYMBOLS.ActivateDeviceController)
    .toHigherOrderFunction(createActivateDeviceController, [DI_SYMBOLS.ActivateDeviceUseCase]);
  devicesModule
    .bind(DI_SYMBOLS.SuspendDeviceController)
    .toHigherOrderFunction(createSuspendDeviceController, [DI_SYMBOLS.SuspendDeviceUseCase]);
  devicesModule
    .bind(DI_SYMBOLS.RotateDeviceCredentialController)
    .toHigherOrderFunction(createRotateDeviceCredentialController, [
      DI_SYMBOLS.RotateDeviceCredentialUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.RetireDeviceController)
    .toHigherOrderFunction(createRetireDeviceController, [DI_SYMBOLS.RetireDeviceUseCase]);
  devicesModule
    .bind(DI_SYMBOLS.TransitionDeviceLifecycleController)
    .toHigherOrderFunction(createTransitionDeviceLifecycleController, [
      DI_SYMBOLS.TransitionDeviceLifecycleUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceLifecycleController)
    .toHigherOrderFunction(createListDeviceLifecycleController, [
      DI_SYMBOLS.ListDeviceLifecycleUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ReplaceDeviceController)
    .toHigherOrderFunction(createReplaceDeviceController, [DI_SYMBOLS.ReplaceDeviceUseCase]);
  devicesModule
    .bind(DI_SYMBOLS.CreateFirmwareReleaseController)
    .toHigherOrderFunction(createCreateFirmwareReleaseController, [
      DI_SYMBOLS.CreateFirmwareReleaseUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ListFirmwareReleasesController)
    .toHigherOrderFunction(createListFirmwareReleasesController, [
      DI_SYMBOLS.ListFirmwareReleasesUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ListFirmwareDeploymentsController)
    .toHigherOrderFunction(createListFirmwareDeploymentsController, [
      DI_SYMBOLS.ListFirmwareDeploymentsUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.StartFirmwareDeploymentController)
    .toHigherOrderFunction(createStartFirmwareDeploymentController, [
      DI_SYMBOLS.StartFirmwareDeploymentUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.CreateFirmwareCampaignController)
    .toHigherOrderFunction(createCreateFirmwareCampaignController, [
      DI_SYMBOLS.CreateFirmwareCampaignUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ListFirmwareCampaignsController)
    .toHigherOrderFunction(createListFirmwareCampaignsController, [
      DI_SYMBOLS.ListFirmwareCampaignsUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.TransitionFirmwareCampaignController)
    .toHigherOrderFunction(createTransitionFirmwareCampaignController, [
      DI_SYMBOLS.TransitionFirmwareCampaignUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceAlertsController)
    .toHigherOrderFunction(createListDeviceAlertsController, [DI_SYMBOLS.ListDeviceAlertsUseCase]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceLogsController)
    .toHigherOrderFunction(createListDeviceLogsController, [DI_SYMBOLS.ListDeviceLogsUseCase]);
  devicesModule
    .bind(DI_SYMBOLS.AcknowledgeDeviceAlertController)
    .toHigherOrderFunction(createAcknowledgeDeviceAlertController, [
      DI_SYMBOLS.AcknowledgeDeviceAlertUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ClearDeviceAlertController)
    .toHigherOrderFunction(createClearDeviceAlertController, [DI_SYMBOLS.ClearDeviceAlertUseCase]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceConfigurationsController)
    .toHigherOrderFunction(createListDeviceConfigurationsController, [
      DI_SYMBOLS.ListDeviceConfigurationsUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.PushDeviceConfigurationController)
    .toHigherOrderFunction(createPushDeviceConfigurationController, [
      DI_SYMBOLS.PushDeviceConfigurationUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.CreateDeviceConfigurationTemplateController)
    .toHigherOrderFunction(createCreateDeviceConfigurationTemplateController, [
      DI_SYMBOLS.CreateDeviceConfigurationTemplateUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.ListDeviceConfigurationTemplatesController)
    .toHigherOrderFunction(createListDeviceConfigurationTemplatesController, [
      DI_SYMBOLS.ListDeviceConfigurationTemplatesUseCase,
    ]);
  devicesModule
    .bind(DI_SYMBOLS.DeployDeviceConfigurationTemplateController)
    .toHigherOrderFunction(createDeployDeviceConfigurationTemplateController, [
      DI_SYMBOLS.DeployDeviceConfigurationTemplateUseCase,
    ]);
  return devicesModule;
}
