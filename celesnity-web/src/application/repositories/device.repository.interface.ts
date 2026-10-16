import type {
  Device,
  DeviceAlert,
  DeviceAlertStatus,
  DeviceLogEntry,
  DeviceLogKind,
  DeviceLogLevel,
  DeviceAdapterOption,
  DeviceRegistration,
  DeviceConfiguration,
  DeviceLifecycleTransition,
  CreateFirmwareReleaseInput,
  CreateFirmwareCampaignInput,
  FirmwareCampaign,
  FirmwareCampaignAction,
  FirmwareDeployment,
  FirmwareRelease,
  RegisterDeviceInput,
  ReplaceDeviceInput,
  PushDeviceConfigurationInput,
  CreateDeviceConfigurationTemplateInput,
  DeployDeviceConfigurationTemplateInput,
  DeviceConfigurationTemplate,
  DeviceConfigurationTemplateDeployment,
  TransitionDeviceLifecycleInput,
} from '@/src/entities/models/device';

export interface DeviceRepository {
  listAdapters(): Promise<readonly DeviceAdapterOption[]>;
  list(adapterId: string): Promise<readonly Device[]>;
  register(input: RegisterDeviceInput): Promise<DeviceRegistration>;
  transitionLifecycle(input: TransitionDeviceLifecycleInput): Promise<Device>;
  listLifecycleTransitions(id: string): Promise<readonly DeviceLifecycleTransition[]>;
  replace(input: ReplaceDeviceInput): Promise<DeviceRegistration>;
  activate(id: string): Promise<Device>;
  suspend(id: string): Promise<Device>;
  rotateCredential(id: string): Promise<DeviceRegistration>;
  retire(id: string): Promise<void>;
  listFirmwareReleases(): Promise<readonly FirmwareRelease[]>;
  createFirmwareRelease(input: CreateFirmwareReleaseInput): Promise<FirmwareRelease>;
  listFirmwareDeployments(deviceId: string): Promise<readonly FirmwareDeployment[]>;
  startFirmwareDeployment(deviceId: string, releaseId: string): Promise<FirmwareDeployment>;
  createFirmwareCampaign(input: CreateFirmwareCampaignInput): Promise<FirmwareCampaign>;
  listFirmwareCampaigns(): Promise<readonly FirmwareCampaign[]>;
  transitionFirmwareCampaign(id: string, action: FirmwareCampaignAction): Promise<FirmwareCampaign>;
  listAlerts(status?: DeviceAlertStatus): Promise<readonly DeviceAlert[]>;
  acknowledgeAlert(id: string): Promise<DeviceAlert>;
  clearAlert(id: string): Promise<DeviceAlert>;
  listLogs(
    deviceId: string,
    filter?: Readonly<{ level?: DeviceLogLevel; kind?: DeviceLogKind; limit?: number }>,
  ): Promise<readonly DeviceLogEntry[]>;
  listConfigurations(deviceId: string): Promise<readonly DeviceConfiguration[]>;
  pushConfiguration(input: PushDeviceConfigurationInput): Promise<DeviceConfiguration>;
  createConfigurationTemplate(
    input: CreateDeviceConfigurationTemplateInput,
  ): Promise<DeviceConfigurationTemplate>;
  listConfigurationTemplates(): Promise<readonly DeviceConfigurationTemplate[]>;
  deployConfigurationTemplate(
    input: DeployDeviceConfigurationTemplateInput,
  ): Promise<DeviceConfigurationTemplateDeployment>;
}
