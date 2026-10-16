'use client';

import { getInjection } from '@/di/container';

import { DeviceManagementScreen } from './device-management-screen';

const controllers = Object.freeze({
  listAdapters: getInjection('ListDeviceAdaptersController'),
  list: getInjection('ListDevicesController'),
  register: getInjection('RegisterDeviceController'),
  activate: getInjection('ActivateDeviceController'),
  suspend: getInjection('SuspendDeviceController'),
  rotateCredential: getInjection('RotateDeviceCredentialController'),
  retire: getInjection('RetireDeviceController'),
  transitionLifecycle: getInjection('TransitionDeviceLifecycleController'),
  listLifecycle: getInjection('ListDeviceLifecycleController'),
  replace: getInjection('ReplaceDeviceController'),
  createFirmwareRelease: getInjection('CreateFirmwareReleaseController'),
  listFirmwareReleases: getInjection('ListFirmwareReleasesController'),
  listFirmwareDeployments: getInjection('ListFirmwareDeploymentsController'),
  startFirmwareDeployment: getInjection('StartFirmwareDeploymentController'),
  createFirmwareCampaign: getInjection('CreateFirmwareCampaignController'),
  listFirmwareCampaigns: getInjection('ListFirmwareCampaignsController'),
  transitionFirmwareCampaign: getInjection('TransitionFirmwareCampaignController'),
  listAlerts: getInjection('ListDeviceAlertsController'),
  listLogs: getInjection('ListDeviceLogsController'),
  acknowledgeAlert: getInjection('AcknowledgeDeviceAlertController'),
  clearAlert: getInjection('ClearDeviceAlertController'),
  listConfigurations: getInjection('ListDeviceConfigurationsController'),
  pushConfiguration: getInjection('PushDeviceConfigurationController'),
  createConfigurationTemplate: getInjection('CreateDeviceConfigurationTemplateController'),
  listConfigurationTemplates: getInjection('ListDeviceConfigurationTemplatesController'),
  deployConfigurationTemplate: getInjection('DeployDeviceConfigurationTemplateController'),
});

interface DeviceManagementFeatureProps {
  /** The stream adapter whose devices these are. */
  readonly adapterId?: string;
  readonly embedded?: boolean;
}

export function DeviceManagementFeature({
  adapterId,
  embedded,
}: DeviceManagementFeatureProps = {}) {
  return (
    <DeviceManagementScreen
      controllers={controllers}
      {...(adapterId ? { adapterId } : {})}
      {...(embedded ? { embedded } : {})}
    />
  );
}
