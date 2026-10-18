'use client';

import Link from 'next/link';
import {
  type ComponentProps,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
} from 'react';

import { contextualErrorMessage } from '@/app/_components/shared/error-message';
import { Badge as BaseBadge, type BadgeVariant } from '@/app/_components/ui/badge';
import { Button as BaseButton } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { DataTable, type DataTableColumn } from '@/app/_components/ui/data-table';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { Field, FieldDescription, FieldLabel } from '@/app/_components/ui/field';
import { Input } from '@/app/_components/ui/input';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { cn } from '@/app/_components/ui/utils';
import { Progress } from '@/app/_components/ui/progress';
import { SearchField } from '@/app/_components/ui/search-field';
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/_components/ui/select';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Spinner } from '@/app/_components/ui/spinner';
import { Textarea } from '@/app/_components/ui/textarea';
import { Tabs as TabsRoot, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { TranslationKey } from '@/app/_i18n/en';
import type {
  DeviceAdapterOption,
  DeviceAlertType,
  DeviceLifecycleState,
  DeviceLifecycleTransition,
  DeviceType,
  IssuedDeviceCredential,
  CreateFirmwareReleaseInput,
  FirmwareCampaignAction,
  FirmwareCampaignStatus,
  DeviceConfigurationParameters,
} from '@/src/entities/models/device';
import type { CreateFirmwareCampaignController } from '@/src/interface-adapters/controllers/devices/create-firmware-campaign.controller';
import type { ListFirmwareCampaignsController } from '@/src/interface-adapters/controllers/devices/list-firmware-campaigns.controller';
import type { TransitionFirmwareCampaignController } from '@/src/interface-adapters/controllers/devices/transition-firmware-campaign.controller';
import type { CreateFirmwareReleaseController } from '@/src/interface-adapters/controllers/devices/create-firmware-release.controller';
import type { ListFirmwareDeploymentsController } from '@/src/interface-adapters/controllers/devices/list-firmware-deployments.controller';
import type { ListFirmwareReleasesController } from '@/src/interface-adapters/controllers/devices/list-firmware-releases.controller';
import type { StartFirmwareDeploymentController } from '@/src/interface-adapters/controllers/devices/start-firmware-deployment.controller';
import type { ActivateDeviceController } from '@/src/interface-adapters/controllers/devices/activate-device.controller';
import type { ListDeviceAdaptersController } from '@/src/interface-adapters/controllers/devices/list-device-adapters.controller';
import type { ListDeviceLifecycleController } from '@/src/interface-adapters/controllers/devices/list-device-lifecycle.controller';
import type { ListDevicesController } from '@/src/interface-adapters/controllers/devices/list-devices.controller';
import type { RegisterDeviceController } from '@/src/interface-adapters/controllers/devices/register-device.controller';
import type { ReplaceDeviceController } from '@/src/interface-adapters/controllers/devices/replace-device.controller';
import type { RetireDeviceController } from '@/src/interface-adapters/controllers/devices/retire-device.controller';
import type { RotateDeviceCredentialController } from '@/src/interface-adapters/controllers/devices/rotate-device-credential.controller';
import type { SuspendDeviceController } from '@/src/interface-adapters/controllers/devices/suspend-device.controller';
import type { TransitionDeviceLifecycleController } from '@/src/interface-adapters/controllers/devices/transition-device-lifecycle.controller';
import type { DeviceViewModel } from '@/src/interface-adapters/presenters/device.presenter';
import type {
  FirmwareDeploymentViewModel,
  FirmwareCampaignViewModel,
  FirmwareReleaseViewModel,
} from '@/src/interface-adapters/presenters/firmware.presenter';
import type { DeviceAlertViewModel } from '@/src/interface-adapters/presenters/device-alert.presenter';
import type { DeviceLogViewModel } from '@/src/interface-adapters/presenters/device-log.presenter';
import type { DeviceConfigurationViewModel } from '@/src/interface-adapters/presenters/device-configuration.presenter';
import type { ListDeviceConfigurationsController } from '@/src/interface-adapters/controllers/devices/list-device-configurations.controller';
import type { PushDeviceConfigurationController } from '@/src/interface-adapters/controllers/devices/push-device-configuration.controller';
import type { ListDeviceLogsController } from '@/src/interface-adapters/controllers/devices/list-device-logs.controller';
import type { CreateDeviceConfigurationTemplateController } from '@/src/interface-adapters/controllers/devices/create-device-configuration-template.controller';
import type { ListDeviceConfigurationTemplatesController } from '@/src/interface-adapters/controllers/devices/list-device-configuration-templates.controller';
import type { DeployDeviceConfigurationTemplateController } from '@/src/interface-adapters/controllers/devices/deploy-device-configuration-template.controller';
import type {
  DeviceConfigurationTemplateDeploymentViewModel,
  DeviceConfigurationTemplateViewModel,
} from '@/src/interface-adapters/presenters/device-configuration.presenter';

interface DeviceManagementControllers {
  readonly listAdapters: ListDeviceAdaptersController;
  readonly list: ListDevicesController;
  readonly register: RegisterDeviceController;
  readonly activate: ActivateDeviceController;
  readonly suspend: SuspendDeviceController;
  readonly rotateCredential: RotateDeviceCredentialController;
  readonly retire: RetireDeviceController;
  readonly transitionLifecycle: TransitionDeviceLifecycleController;
  readonly listLifecycle: ListDeviceLifecycleController;
  readonly replace: ReplaceDeviceController;
  readonly createFirmwareRelease: CreateFirmwareReleaseController;
  readonly listFirmwareReleases: ListFirmwareReleasesController;
  readonly listFirmwareDeployments: ListFirmwareDeploymentsController;
  readonly startFirmwareDeployment: StartFirmwareDeploymentController;
  readonly createFirmwareCampaign: CreateFirmwareCampaignController;
  readonly listFirmwareCampaigns: ListFirmwareCampaignsController;
  readonly transitionFirmwareCampaign: TransitionFirmwareCampaignController;
  readonly listAlerts: () => Promise<readonly DeviceAlertViewModel[]>;
  readonly listLogs: ListDeviceLogsController;
  readonly acknowledgeAlert: (id: string) => Promise<DeviceAlertViewModel>;
  readonly clearAlert: (id: string) => Promise<DeviceAlertViewModel>;
  readonly listConfigurations: ListDeviceConfigurationsController;
  readonly pushConfiguration: PushDeviceConfigurationController;
  readonly createConfigurationTemplate: CreateDeviceConfigurationTemplateController;
  readonly listConfigurationTemplates: ListDeviceConfigurationTemplatesController;
  readonly deployConfigurationTemplate: DeployDeviceConfigurationTemplateController;
}

interface DeviceManagementScreenProps {
  readonly controllers: DeviceManagementControllers;
  /**
   * The stream adapter these devices belong to.
   *
   * `ListDevicesController` already takes an adapter id — a device is filed
   * under one, never under the workspace — so when the adapter comes from the
   * route the picker in the header has nothing left to decide and is dropped.
   * Omitted, the screen keeps choosing the first active adapter itself, which is
   * what the standalone `/devices` route still does.
   */
  readonly adapterId?: string;
  /** Rendered inside the adapter's own screen, which already supplies a heading. */
  readonly embedded?: boolean;
}

interface CredentialResult {
  readonly brokerUrl: string;
  readonly topics: DeviceViewModel['topics'];
  readonly credential: IssuedDeviceCredential;
}

const emptyForm = {
  externalDeviceId: '',
  deviceType: 'GATEWAY' as DeviceType,
  name: '',
  model: '',
  hardwareRevision: '',
  currentFirmwareVersion: '',
  deploymentSite: '',
  physicalLocation: '',
  gatewayId: '',
  measurementPointKey: '',
  measurementPointName: '',
  replacementId: '',
};

type FirmwareReleaseForm = Omit<
  CreateFirmwareReleaseInput,
  'file' | 'hardwareRevision' | 'releaseNotes'
> & {
  readonly file?: File;
  readonly hardwareRevision: string;
  readonly releaseNotes: string;
};

const emptyFirmwareReleaseForm: FirmwareReleaseForm = {
  version: '',
  deviceModel: '',
  hardwareRevision: '',
  releaseNotes: '',
};

const emptyFirmwareCampaignForm = {
  name: '',
  releaseId: '',
  deviceIds: [] as readonly string[],
  canarySize: '1',
  batchSize: '10',
};

const emptyConfigurationForm = {
  samplingRateHz: '1',
  reportingIntervalSeconds: '60',
  gatewayUplinkMode: 'MQTT' as 'MQTT' | 'BULK_HTTP',
  temperatureChannel: true,
  diagnosticPreset: 'basic',
  logLevel: 'WARNING' as 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG',
  batteryPercentLow: '10',
  restoreFactoryDefaults: false,
};

const emptyConfigurationTemplateForm = {
  name: '',
  templateId: '',
  deploymentSite: '',
  deviceType: '' as '' | DeviceType,
};

const HEALTH_REFRESH_INTERVAL_MS = 5_000;

function configurationParametersFromForm(
  form: typeof emptyConfigurationForm,
  deviceType?: DeviceType,
): DeviceConfigurationParameters {
  return {
    samplingRateHz: Number(form.samplingRateHz),
    reportingIntervalSeconds: Number(form.reportingIntervalSeconds),
    channels: { temperature: form.temperatureChannel },
    ...(deviceType === 'GATEWAY' ? { gatewayUplinkMode: form.gatewayUplinkMode } : {}),
    diagnosticLogging:
      form.diagnosticPreset === 'full'
        ? ['CPU_LOAD', 'CPU_TEMPERATURE', 'MEMORY', 'BATTERY_PERCENT', 'RSSI_SNR', 'UPTIME']
        : form.diagnosticPreset === 'basic'
          ? ['BATTERY_PERCENT', 'RSSI_SNR', 'UPTIME']
          : [],
    logLevel: form.logLevel,
    alertThresholds: { batteryPercentLow: Number(form.batteryPercentLow) },
  };
}

export function DeviceManagementScreen({
  controllers,
  adapterId: scopedAdapterId,
  embedded = false,
}: DeviceManagementScreenProps) {
  const { locale, t } = useTranslation();
  const [tab, setTab] = useState('overview');
  const [adapters, setAdapters] = useState<readonly DeviceAdapterOption[]>();
  const [adapterId, setAdapterId] = useState(scopedAdapterId ?? '');
  const [devices, setDevices] = useState<readonly DeviceViewModel[]>();
  const [form, setForm] = useState(emptyForm);
  const [credential, setCredential] = useState<CredentialResult>();
  const [history, setHistory] = useState<readonly DeviceLifecycleTransition[]>();
  const [historyDevice, setHistoryDevice] = useState<DeviceViewModel>();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [firmwareReleases, setFirmwareReleases] = useState<readonly FirmwareReleaseViewModel[]>();
  const [firmwareDeployments, setFirmwareDeployments] =
    useState<readonly FirmwareDeploymentViewModel[]>();
  const [firmwareDeviceId, setFirmwareDeviceId] = useState('');
  const [firmwareReleaseId, setFirmwareReleaseId] = useState('');
  const [firmwareReleaseForm, setFirmwareReleaseForm] = useState(emptyFirmwareReleaseForm);
  const [firmwareCampaigns, setFirmwareCampaigns] =
    useState<readonly FirmwareCampaignViewModel[]>();
  const [firmwareCampaignForm, setFirmwareCampaignForm] = useState(emptyFirmwareCampaignForm);
  const [alerts, setAlerts] = useState<readonly DeviceAlertViewModel[]>();
  const [logDeviceId, setLogDeviceId] = useState('');
  const [deviceLogs, setDeviceLogs] = useState<readonly DeviceLogViewModel[]>();
  const [configurationDeviceId, setConfigurationDeviceId] = useState('');
  const [configurations, setConfigurations] = useState<readonly DeviceConfigurationViewModel[]>();
  const [configurationForm, setConfigurationForm] = useState(emptyConfigurationForm);
  const [configurationTemplates, setConfigurationTemplates] =
    useState<readonly DeviceConfigurationTemplateViewModel[]>();
  const [configurationTemplateForm, setConfigurationTemplateForm] = useState(
    emptyConfigurationTemplateForm,
  );
  const [configurationTemplateDeployment, setConfigurationTemplateDeployment] =
    useState<DeviceConfigurationTemplateDeploymentViewModel>();
  const listRequestToken = useRef(0);
  const activeAdapters = useMemo(
    () => adapters?.filter((adapter) => adapter.active) ?? [],
    [adapters],
  );
  const gateways = useMemo(
    () => devices?.filter((device) => device.deviceType === 'GATEWAY') ?? [],
    [devices],
  );
  const filteredDevices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (devices ?? []).filter(
      (device) =>
        (!typeFilter || device.deviceType === typeFilter) &&
        (!lifecycleFilter || device.lifecycleState === lifecycleFilter) &&
        (!query ||
          [
            device.name,
            device.externalDeviceId,
            device.id,
            device.model,
            device.deploymentSite ?? '',
          ]
            .join(' ')
            .toLocaleLowerCase()
            .includes(query)),
    );
  }, [devices, lifecycleFilter, search, typeFilter]);

  const loadDevices = useCallback(
    async (selectedAdapterId: string) => {
      const requestToken = ++listRequestToken.current;
      if (!selectedAdapterId) {
        setDevices(undefined);
        return;
      }
      try {
        const loaded = await controllers.list(selectedAdapterId);
        if (requestToken === listRequestToken.current) setDevices(loaded);
      } catch (cause) {
        if (requestToken === listRequestToken.current) {
          setError(contextualErrorMessage(cause, t('devices.loadError')));
        }
      }
    },
    [controllers, t],
  );

  useEffect(() => {
    let cancelled = false;
    void controllers
      .listAdapters()
      .then((loaded) => {
        if (cancelled) return;
        setAdapters(loaded);
        // Scoped by the route, the adapter is already decided; picking the first
        // active one would silently show a different adapter's devices.
        const active = scopedAdapterId ?? loaded.find((adapter) => adapter.active)?.id ?? '';
        setAdapterId(active);
        return loadDevices(active);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(contextualErrorMessage(cause, t('devices.loadError')));
      });
    return () => {
      cancelled = true;
      listRequestToken.current += 1;
    };
    // `scopedAdapterId` is a dependency: moving between two adapters keeps this
    // component mounted, and leaving it out would leave the previous adapter's
    // devices on screen under the new adapter's name.
  }, [controllers, loadDevices, scopedAdapterId, t]);

  useEffect(() => {
    let cancelled = false;
    void controllers
      .listFirmwareReleases()
      .then((loaded) => {
        if (!cancelled) setFirmwareReleases(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(contextualErrorMessage(cause, t('devices.firmwareLoadError')));
      });
    return () => {
      cancelled = true;
    };
  }, [controllers, t]);

  useEffect(() => {
    let cancelled = false;
    void controllers
      .listConfigurationTemplates()
      .then((loaded) => {
        if (!cancelled) setConfigurationTemplates(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(contextualErrorMessage(cause, t('devices.templateLoadError')));
      });
    return () => {
      cancelled = true;
    };
  }, [controllers, t]);

  const loadFirmwareCampaigns = useCallback(async () => {
    try {
      setFirmwareCampaigns(await controllers.listFirmwareCampaigns());
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.firmwareCampaignLoadError')));
    }
  }, [controllers, t]);

  useEffect(() => {
    let cancelled = false;
    void controllers
      .listFirmwareCampaigns()
      .then((loaded) => {
        if (!cancelled) setFirmwareCampaigns(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(contextualErrorMessage(cause, t('devices.firmwareCampaignLoadError')));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [controllers, t]);

  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await controllers.listAlerts());
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.alertLoadError')));
    }
  }, [controllers, t]);

  useEffect(() => {
    if (tab !== 'health' || !adapterId) return;
    const refreshHealth = () => {
      void loadDevices(adapterId);
      void loadAlerts();
    };
    refreshHealth();
    const timer = window.setInterval(refreshHealth, HEALTH_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [adapterId, loadAlerts, loadDevices, tab]);

  useEffect(() => {
    let cancelled = false;
    void controllers
      .listAlerts()
      .then((loaded) => {
        if (!cancelled) setAlerts(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(contextualErrorMessage(cause, t('devices.alertLoadError')));
      });
    return () => {
      cancelled = true;
    };
  }, [controllers, t]);

  const loadFirmwareDeployments = useCallback(
    async (deviceId: string) => {
      if (!deviceId) {
        setFirmwareDeployments(undefined);
        return;
      }
      try {
        setFirmwareDeployments(await controllers.listFirmwareDeployments(deviceId));
      } catch (cause) {
        setError(contextualErrorMessage(cause, t('devices.firmwareLoadError')));
      }
    },
    [controllers, t],
  );

  const loadDeviceLogs = useCallback(
    async (deviceId: string) => {
      if (!deviceId) {
        setDeviceLogs(undefined);
        return;
      }
      try {
        setDeviceLogs(await controllers.listLogs(deviceId));
      } catch (cause) {
        setError(contextualErrorMessage(cause, t('devices.logLoadError')));
      }
    },
    [controllers, t],
  );

  const loadConfigurations = useCallback(
    async (deviceId: string) => {
      if (!deviceId) {
        setConfigurations(undefined);
        return;
      }
      try {
        setConfigurations(await controllers.listConfigurations(deviceId));
      } catch (cause) {
        setError(contextualErrorMessage(cause, t('devices.configurationLoadError')));
      }
    },
    [controllers, t],
  );

  async function pushConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configurationDeviceId) return;
    setBusy(true);
    setError(undefined);
    try {
      const selectedDevice = devices?.find((device) => device.id === configurationDeviceId);
      const configuration = await controllers.pushConfiguration({
        deviceId: configurationDeviceId,
        restoreFactoryDefaults: configurationForm.restoreFactoryDefaults,
        ...(configurationForm.restoreFactoryDefaults
          ? {}
          : {
              parameters: configurationParametersFromForm(
                configurationForm,
                selectedDevice?.deviceType,
              ),
            }),
      });
      setConfigurations((current) => [configuration, ...(current ?? [])]);
      await loadDevices(adapterId);
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.configurationPushError')));
    } finally {
      setBusy(false);
    }
  }

  async function createConfigurationTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const created = await controllers.createConfigurationTemplate({
        name: configurationTemplateForm.name,
        parameters: configurationParametersFromForm(
          configurationForm,
          configurationTemplateForm.deviceType || undefined,
        ),
      });
      setConfigurationTemplates((current) => [created, ...(current ?? [])]);
      setConfigurationTemplateForm((current) => ({
        ...current,
        name: '',
        templateId: created.id,
      }));
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.templateCreateError')));
    } finally {
      setBusy(false);
    }
  }

  async function deployConfigurationTemplate() {
    if (!configurationTemplateForm.templateId) return;
    setBusy(true);
    setError(undefined);
    try {
      const deployment = await controllers.deployConfigurationTemplate({
        templateId: configurationTemplateForm.templateId,
        ...(configurationTemplateForm.deploymentSite.trim()
          ? { deploymentSite: configurationTemplateForm.deploymentSite }
          : {}),
        ...(configurationTemplateForm.deviceType
          ? { deviceType: configurationTemplateForm.deviceType }
          : {}),
      });
      setConfigurationTemplateDeployment(deployment);
      await loadDevices(adapterId);
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.templateDeployError')));
    } finally {
      setBusy(false);
    }
  }

  async function createFirmwareRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (firmwareReleaseForm.file === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const created = await controllers.createFirmwareRelease({
        version: firmwareReleaseForm.version,
        deviceModel: firmwareReleaseForm.deviceModel,
        file: firmwareReleaseForm.file,
        ...(firmwareReleaseForm.hardwareRevision
          ? { hardwareRevision: firmwareReleaseForm.hardwareRevision }
          : {}),
        ...(firmwareReleaseForm.releaseNotes
          ? { releaseNotes: firmwareReleaseForm.releaseNotes }
          : {}),
      });
      setFirmwareReleases((current) => [created, ...(current ?? [])]);
      setFirmwareReleaseId(created.id);
      setFirmwareReleaseForm(emptyFirmwareReleaseForm);
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.firmwareReleaseError')));
    } finally {
      setBusy(false);
    }
  }

  async function startFirmwareDeployment() {
    if (!firmwareDeviceId || !firmwareReleaseId) return;
    if (!window.confirm(t('devices.firmwareDeployConfirm'))) return;
    setBusy(true);
    setError(undefined);
    try {
      const deployment = await controllers.startFirmwareDeployment({
        deviceId: firmwareDeviceId,
        releaseId: firmwareReleaseId,
      });
      setFirmwareDeployments((current) => [deployment, ...(current ?? [])]);
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.firmwareDeployError')));
    } finally {
      setBusy(false);
    }
  }

  async function createFirmwareCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const created = await controllers.createFirmwareCampaign({
        name: firmwareCampaignForm.name,
        releaseId: firmwareCampaignForm.releaseId,
        deviceIds: firmwareCampaignForm.deviceIds,
        canarySize: Number(firmwareCampaignForm.canarySize),
        batchSize: Number(firmwareCampaignForm.batchSize),
      });
      setFirmwareCampaigns((current) => [created, ...(current ?? [])]);
      setFirmwareCampaignForm(emptyFirmwareCampaignForm);
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.firmwareCampaignCreateError')));
    } finally {
      setBusy(false);
    }
  }

  async function transitionFirmwareCampaign(id: string, action: FirmwareCampaignAction) {
    if (action === 'abort' && !window.confirm(t('devices.firmwareCampaignAbortConfirm'))) return;
    setBusy(true);
    setError(undefined);
    try {
      const updated = await controllers.transitionFirmwareCampaign({ id, action });
      setFirmwareCampaigns((current) =>
        current?.map((campaign) => (campaign.id === updated.id ? updated : campaign)),
      );
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.firmwareCampaignActionError')));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapterId) return;
    setBusy(true);
    setError(undefined);
    try {
      const registered = form.replacementId
        ? await controllers.replace({
            id: form.replacementId,
            externalDeviceId: form.externalDeviceId,
            name: form.name,
            model: form.model,
            ...(form.hardwareRevision ? { hardwareRevision: form.hardwareRevision } : {}),
            ...(form.currentFirmwareVersion
              ? { currentFirmwareVersion: form.currentFirmwareVersion }
              : {}),
          })
        : await controllers.register({
            adapterId,
            externalDeviceId: form.externalDeviceId,
            deviceType: form.deviceType,
            name: form.name,
            model: form.model,
            ...(form.hardwareRevision ? { hardwareRevision: form.hardwareRevision } : {}),
            ...(form.currentFirmwareVersion
              ? { currentFirmwareVersion: form.currentFirmwareVersion }
              : {}),
            ...(form.deploymentSite ? { deploymentSite: form.deploymentSite } : {}),
            ...(form.physicalLocation ? { physicalLocation: form.physicalLocation } : {}),
            ...(form.deviceType === 'SENSOR' && form.gatewayId
              ? { gatewayId: form.gatewayId }
              : {}),
            ...(form.deviceType === 'SENSOR' && form.measurementPointKey
              ? { measurementPointKey: form.measurementPointKey }
              : {}),
            ...(form.deviceType === 'SENSOR' && form.measurementPointName
              ? { measurementPointName: form.measurementPointName }
              : {}),
          });
      setCredential({
        brokerUrl: registered.device.brokerUrl,
        topics: registered.device.topics,
        credential: registered.credential,
      });
      setForm(emptyForm);
      await loadDevices(adapterId);
      setTab('registry');
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.loadError')));
    } finally {
      setBusy(false);
    }
  }

  async function changeOperational(device: DeviceViewModel, action: 'activate' | 'suspend') {
    await perform(async () => controllers[action](device.id));
  }

  async function transitionLifecycle(
    device: DeviceViewModel,
    state: Exclude<DeviceLifecycleState, 'MANUFACTURED'>,
  ) {
    if (!window.confirm(t('devices.lifecycleConfirm'))) return;
    await perform(() => controllers.transitionLifecycle({ id: device.id, state }));
  }

  async function perform(operation: () => Promise<DeviceViewModel>) {
    setBusy(true);
    setError(undefined);
    try {
      const updated = await operation();
      setDevices((current) => current?.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.loadError')));
    } finally {
      setBusy(false);
    }
  }

  async function rotate(device: DeviceViewModel) {
    if (!window.confirm(t('devices.rotateConfirm'))) return;
    setBusy(true);
    try {
      const rotated = await controllers.rotateCredential(device.id);
      setDevices((current) =>
        current?.map((item) => (item.id === device.id ? rotated.device : item)),
      );
      setCredential({
        brokerUrl: rotated.device.brokerUrl,
        topics: rotated.device.topics,
        credential: rotated.credential,
      });
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.loadError')));
    } finally {
      setBusy(false);
    }
  }

  async function retire(device: DeviceViewModel) {
    if (!window.confirm(t('devices.retireConfirm'))) return;
    setBusy(true);
    try {
      await controllers.retire(device.id);
      setDevices((current) => current?.filter((item) => item.id !== device.id));
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.loadError')));
    } finally {
      setBusy(false);
    }
  }

  async function showHistory(device: DeviceViewModel) {
    setBusy(true);
    try {
      setHistory(await controllers.listLifecycle(device.id));
      setHistoryDevice(device);
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.loadError')));
    } finally {
      setBusy(false);
    }
  }

  async function changeAlert(
    alert: DeviceAlertViewModel,
    action: 'acknowledgeAlert' | 'clearAlert',
  ) {
    setBusy(true);
    setError(undefined);
    try {
      const updated = await controllers[action](alert.id);
      setAlerts((current) => current?.map((item) => (item.id === updated.id ? updated : item)));
      if (updated.status === 'CLEARED') await loadDevices(adapterId);
    } catch (cause) {
      setError(contextualErrorMessage(cause, t('devices.alertActionError')));
    } finally {
      setBusy(false);
    }
  }

  const shared = { busy, devices: devices ?? [], locale, t };
  const tabs = [
    { value: 'overview', label: t('devices.overviewTab'), content: <Overview {...shared} /> },
    {
      value: 'registry',
      label: t('devices.registryTab'),
      content: (
        <Registry
          {...shared}
          devices={filteredDevices}
          history={history}
          historyDevice={historyDevice}
          lifecycleFilter={lifecycleFilter}
          onActivate={(device) => void changeOperational(device, 'activate')}
          onDecommission={(device) => void transitionLifecycle(device, 'DECOMMISSIONED')}
          onHistory={(device) => void showHistory(device)}
          onLifecycle={(device, state) => void transitionLifecycle(device, state)}
          onRetire={(device) => void retire(device)}
          onRotate={(device) => void rotate(device)}
          onSearch={setSearch}
          onSuspend={(device) => void changeOperational(device, 'suspend')}
          onTypeFilter={setTypeFilter}
          onLifecycleFilter={setLifecycleFilter}
          search={search}
          typeFilter={typeFilter}
        />
      ),
    },
    {
      value: 'health',
      label: t('devices.healthTab'),
      content: (
        <Health
          {...shared}
          alerts={alerts}
          deviceLogs={deviceLogs}
          logDeviceId={logDeviceId}
          onAcknowledge={(alert) => void changeAlert(alert, 'acknowledgeAlert')}
          onClear={(alert) => void changeAlert(alert, 'clearAlert')}
          onLogDeviceChange={(value) => {
            setLogDeviceId(value);
            void loadDeviceLogs(value);
          }}
          onRefresh={() => {
            void loadDevices(adapterId);
            void loadAlerts();
            void loadDeviceLogs(logDeviceId);
          }}
        />
      ),
    },
    {
      value: 'configuration',
      label: t('devices.configurationTab'),
      content: (
        <ConfigurationManagement
          busy={busy}
          configurations={configurations}
          deployment={configurationTemplateDeployment}
          deviceId={configurationDeviceId}
          devices={devices ?? []}
          form={configurationForm}
          locale={locale}
          onCreateTemplate={createConfigurationTemplate}
          onDeployTemplate={() => void deployConfigurationTemplate()}
          onDeviceChange={(value) => {
            setConfigurationDeviceId(value);
            void loadConfigurations(value);
          }}
          onFormChange={setConfigurationForm}
          onPush={pushConfiguration}
          onRefresh={() => void loadConfigurations(configurationDeviceId)}
          onTemplateFormChange={setConfigurationTemplateForm}
          t={t}
          templateForm={configurationTemplateForm}
          templates={configurationTemplates}
        />
      ),
    },
    {
      value: 'firmware',
      label: t('devices.firmwareTab'),
      content: (
        <FirmwareManagement
          busy={busy}
          campaignForm={firmwareCampaignForm}
          campaigns={firmwareCampaigns}
          deployments={firmwareDeployments}
          deviceId={firmwareDeviceId}
          devices={devices ?? []}
          locale={locale}
          onCreateRelease={createFirmwareRelease}
          onCreateCampaign={createFirmwareCampaign}
          onCampaignFormChange={setFirmwareCampaignForm}
          onCampaignRefresh={() => void loadFirmwareCampaigns()}
          onCampaignTransition={(id, action) => void transitionFirmwareCampaign(id, action)}
          onDeploy={() => void startFirmwareDeployment()}
          onDeviceChange={(value) => {
            setFirmwareDeviceId(value);
            setFirmwareReleaseId('');
            void loadFirmwareDeployments(value);
          }}
          onRefresh={() => void loadFirmwareDeployments(firmwareDeviceId)}
          onReleaseChange={setFirmwareReleaseId}
          onReleaseFormChange={setFirmwareReleaseForm}
          releaseForm={firmwareReleaseForm}
          releaseId={firmwareReleaseId}
          releases={firmwareReleases}
          t={t}
        />
      ),
    },
    {
      value: 'provisioning',
      label: t('devices.provisioningTab'),
      content: (
        <Provisioning
          activeAdapters={activeAdapters}
          adapterId={adapterId}
          busy={busy}
          credential={credential}
          devices={devices ?? []}
          form={form}
          gateways={gateways}
          onAdapterChange={(value) => {
            setAdapterId(value);
            void loadDevices(value);
          }}
          onCredentialDismiss={() => setCredential(undefined)}
          onFormChange={setForm}
          onSubmit={submit}
          t={t}
        />
      ),
    },
  ];

  return (
    <main className={cn('grid gap-5', embedded ? 'p-0' : 'p-5')}>
      {embedded ? null : (
        <PageBar
          actions={
            <Select
              className="min-w-64"
              label={t('devices.adapter')}
              data={[
                { value: '', label: t('devices.selectAdapter') },
                ...activeAdapters.map((adapter) => ({ value: adapter.id, label: adapter.name })),
              ]}
              onChange={(value) => {
                setAdapterId(value);
                void loadDevices(value);
              }}
              value={adapterId}
            />
          }
          description={t('devices.subtitle')}
          eyebrow={
            <>
              {t('nav.group.data')} · {t('nav.streaming')}
            </>
          }
          title={t('devices.title')}
        />
      )}
      {error ? <PageAlert>{error}</PageAlert> : null}
      {!adapters ? (
        <div className="grid min-h-72 place-items-center">
          <Spinner />
        </div>
      ) : activeAdapters.length === 0 ? (
        <PageAlert tone="info">{t('devices.noActiveAdapter')}</PageAlert>
      ) : (
        <Tabs ariaLabel={t('devices.sectionLabel')} onChange={setTab} tabs={tabs} value={tab} />
      )}
    </main>
  );
}

interface ConfigurationManagementProps {
  readonly busy: boolean;
  readonly configurations?: readonly DeviceConfigurationViewModel[];
  readonly deployment?: DeviceConfigurationTemplateDeploymentViewModel;
  readonly deviceId: string;
  readonly devices: readonly DeviceViewModel[];
  readonly form: typeof emptyConfigurationForm;
  readonly locale: string;
  readonly onDeviceChange: (value: string) => void;
  readonly onCreateTemplate: (event: FormEvent<HTMLFormElement>) => void;
  readonly onDeployTemplate: () => void;
  readonly onFormChange: (value: typeof emptyConfigurationForm) => void;
  readonly onPush: (event: FormEvent<HTMLFormElement>) => void;
  readonly onRefresh: () => void;
  readonly onTemplateFormChange: (value: typeof emptyConfigurationTemplateForm) => void;
  readonly t: ReturnType<typeof useTranslation>['t'];
  readonly templateForm: typeof emptyConfigurationTemplateForm;
  readonly templates?: readonly DeviceConfigurationTemplateViewModel[];
}

function ConfigurationManagement(props: ConfigurationManagementProps) {
  const {
    configurations,
    deployment,
    deviceId,
    devices,
    form,
    locale,
    templateForm,
    templates,
    t,
  } = props;
  const configurableDevices = devices.filter(
    (device) => device.status === 'ACTIVE' && device.lifecycleState === 'COMMISSIONED',
  );
  const selectedDevice = configurableDevices.find((device) => device.id === deviceId);
  const columns: readonly DataTableColumn<DeviceConfigurationViewModel>[] = [
    {
      key: 'version',
      header: t('devices.configurationVersion'),
      render: (item) => `v${item.version}`,
    },
    {
      key: 'status',
      header: t('devices.configurationStatus'),
      render: (item) => <Badge variant={configurationStatusTone(item.status)}>{item.status}</Badge>,
    },
    {
      key: 'parameters',
      header: t('devices.configurationParameters'),
      render: (item) => (
        <span className="font-mono text-xs">
          {item.restoreFactoryDefaults
            ? t('devices.configurationFactoryDefaults')
            : JSON.stringify(item.parameters)}
        </span>
      ),
    },
    {
      key: 'requested',
      header: t('devices.configurationRequestedAt'),
      render: (item) => formatDate(item.requestedAt, locale),
    },
    { key: 'error', header: t('devices.configurationError'), render: (item) => item.error ?? '—' },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.8fr)_minmax(520px,1.2fr)]">
        <Panel
          className="h-fit p-5"
          component="section"
          aria-label={t('devices.configurationPushTitle')}
        >
          <h2 className="m-0 text-lg font-semibold text-ink">
            {t('devices.configurationPushTitle')}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">{t('devices.configurationDescription')}</p>
          <form className="mt-5 grid gap-4" onSubmit={props.onPush}>
            <Select
              label={t('devices.name')}
              data={[
                { value: '', label: t('devices.configurationSelectDevice') },
                ...configurableDevices.map((device) => ({ value: device.id, label: device.name })),
              ]}
              onChange={props.onDeviceChange}
              required
              value={deviceId}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                disabled={form.restoreFactoryDefaults}
                label={t('devices.configurationSamplingRate')}
                min="0.001"
                onChange={(event) =>
                  props.onFormChange({ ...form, samplingRateHz: event.currentTarget.value })
                }
                required={!form.restoreFactoryDefaults}
                step="0.001"
                type="number"
                value={form.samplingRateHz}
              />
              <TextInput
                disabled={form.restoreFactoryDefaults}
                label={t('devices.configurationReportingInterval')}
                min="1"
                onChange={(event) =>
                  props.onFormChange({
                    ...form,
                    reportingIntervalSeconds: event.currentTarget.value,
                  })
                }
                required={!form.restoreFactoryDefaults}
                type="number"
                value={form.reportingIntervalSeconds}
              />
            </div>
            <Select
              disabled={form.restoreFactoryDefaults || selectedDevice?.deviceType !== 'GATEWAY'}
              label={t('devices.configurationUplinkMode')}
              data={[
                { value: 'MQTT', label: 'MQTT' },
                { value: 'BULK_HTTP', label: t('devices.configurationBulkHttp') },
              ]}
              onChange={(value) =>
                props.onFormChange({ ...form, gatewayUplinkMode: value as 'MQTT' | 'BULK_HTTP' })
              }
              value={form.gatewayUplinkMode}
            />
            <Select
              disabled={form.restoreFactoryDefaults}
              label={t('devices.configurationDiagnostics')}
              data={[
                { value: 'none', label: t('devices.configurationDiagnosticsNone') },
                { value: 'basic', label: t('devices.configurationDiagnosticsBasic') },
                { value: 'full', label: t('devices.configurationDiagnosticsFull') },
              ]}
              onChange={(value) => props.onFormChange({ ...form, diagnosticPreset: value })}
              value={form.diagnosticPreset}
            />
            <Select
              disabled={form.restoreFactoryDefaults}
              label={t('devices.configurationLogLevel')}
              data={[
                { value: 'ERROR', label: t('devices.logLevelError') },
                { value: 'WARNING', label: t('devices.logLevelWarning') },
                { value: 'INFO', label: t('devices.logLevelInfo') },
                { value: 'DEBUG', label: t('devices.logLevelDebug') },
              ]}
              onChange={(value) =>
                props.onFormChange({
                  ...form,
                  logLevel: value as 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG',
                })
              }
              value={form.logLevel}
            />
            <TextInput
              disabled={form.restoreFactoryDefaults}
              label={t('devices.configurationBatteryThreshold')}
              max="100"
              min="0"
              onChange={(event) =>
                props.onFormChange({ ...form, batteryPercentLow: event.currentTarget.value })
              }
              type="number"
              value={form.batteryPercentLow}
            />
            <label className="flex items-center gap-3 text-sm text-ink">
              <Checkbox
                checked={form.temperatureChannel}
                disabled={form.restoreFactoryDefaults}
                onCheckedChange={(checked) =>
                  props.onFormChange({ ...form, temperatureChannel: checked === true })
                }
              />
              {t('devices.configurationTemperatureChannel')}
            </label>
            <label className="flex items-center gap-3 text-sm text-ink">
              <Checkbox
                checked={form.restoreFactoryDefaults}
                onCheckedChange={(checked) =>
                  props.onFormChange({ ...form, restoreFactoryDefaults: checked === true })
                }
              />
              {t('devices.configurationRestoreDefaults')}
            </label>
            <Button disabled={props.busy || !deviceId} type="submit">
              {props.busy ? <Spinner /> : null}
              {t('devices.configurationPush')}
            </Button>
          </form>
        </Panel>
        <Panel className="p-5" component="section" aria-label={t('devices.configurationHistory')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-semibold text-ink">
                {t('devices.configurationHistory')}
              </h2>
              {selectedDevice ? (
                <p className="mt-2 text-sm text-ink-muted">
                  {t('devices.configurationDrift')}: {selectedDevice.desiredConfigurationVersion} /{' '}
                  {selectedDevice.appliedConfigurationVersion} /{' '}
                  {selectedDevice.reportedConfigurationVersion}
                </p>
              ) : null}
            </div>
            <Button
              disabled={!deviceId || props.busy}
              onClick={props.onRefresh}
              size="sm"
              variant="secondary"
            >
              {t('devices.configurationRefresh')}
            </Button>
          </div>
          {selectedDevice &&
          selectedDevice.desiredConfigurationVersion !==
            selectedDevice.reportedConfigurationVersion ? (
            <PageAlert className="mt-4" tone="warning">
              {t('devices.configurationDriftWarning')}
            </PageAlert>
          ) : null}
          <div className="mt-4">
            <DataTable
              ariaLabel={t('devices.configurationHistory')}
              columns={columns}
              emptyMessage={
                deviceId
                  ? t('devices.configurationEmpty')
                  : t('devices.configurationSelectDeviceHint')
              }
              rowKey={(item) => item.id}
              rows={configurations ?? []}
            />
          </div>
        </Panel>
      </div>
      <Panel className="p-5" component="section" aria-label={t('devices.templateTitle')}>
        <div className="grid gap-5 lg:grid-cols-2">
          <form className="grid content-start gap-4" onSubmit={props.onCreateTemplate}>
            <div>
              <h2 className="m-0 text-lg font-semibold text-ink">{t('devices.templateTitle')}</h2>
              <p className="mt-2 text-sm text-ink-muted">{t('devices.templateDescription')}</p>
            </div>
            <TextInput
              label={t('devices.templateName')}
              onChange={(event) =>
                props.onTemplateFormChange({ ...templateForm, name: event.currentTarget.value })
              }
              required
              value={templateForm.name}
            />
            <Button disabled={props.busy || !templateForm.name.trim()} type="submit">
              {props.busy ? <Spinner /> : null}
              {t('devices.templateCreate')}
            </Button>
          </form>
          <div className="grid content-start gap-4">
            <Select
              label={t('devices.templateVersion')}
              data={[
                { value: '', label: t('devices.templateSelect') },
                ...(templates ?? []).map((template) => ({
                  value: template.id,
                  label: `${template.name} · v${template.version}`,
                })),
              ]}
              onChange={(value) =>
                props.onTemplateFormChange({ ...templateForm, templateId: value })
              }
              value={templateForm.templateId}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label={t('devices.templateTargetSite')}
                onChange={(event) =>
                  props.onTemplateFormChange({
                    ...templateForm,
                    deploymentSite: event.currentTarget.value,
                  })
                }
                placeholder={t('devices.templateTargetSitePlaceholder')}
                value={templateForm.deploymentSite}
              />
              <Select
                label={t('devices.templateTargetType')}
                data={[
                  { value: '', label: t('devices.templateAllTypes') },
                  { value: 'GATEWAY', label: t('devices.gateway') },
                  { value: 'SENSOR', label: t('devices.sensor') },
                ]}
                onChange={(value) =>
                  props.onTemplateFormChange({
                    ...templateForm,
                    deviceType: value as '' | DeviceType,
                  })
                }
                value={templateForm.deviceType}
              />
            </div>
            <Button
              disabled={
                props.busy ||
                !templateForm.templateId ||
                (!templateForm.deploymentSite.trim() && !templateForm.deviceType)
              }
              onClick={props.onDeployTemplate}
            >
              {props.busy ? <Spinner /> : null}
              {t('devices.templateDeploy')}
            </Button>
            {deployment ? (
              <PageAlert tone={deployment.failures.length === 0 ? 'info' : 'warning'}>
                {t('devices.templateDeploymentResult', {
                  targetCount: deployment.targetCount,
                  successCount: deployment.configurations.length,
                  failureCount: deployment.failures.length,
                })}
              </PageAlert>
            ) : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}

interface SharedSectionProps {
  readonly busy: boolean;
  readonly devices: readonly DeviceViewModel[];
  readonly locale: string;
  readonly t: ReturnType<typeof useTranslation>['t'];
}

function Overview({ devices, t }: SharedSectionProps) {
  const attention = devices.filter(
    (device) => device.status === 'FAILED' || device.status === 'DEGRADED',
  ).length;
  const stats = [
    [t('devices.totalDevices'), devices.length],
    [t('devices.gatewayCount'), devices.filter((device) => device.deviceType === 'GATEWAY').length],
    [t('devices.sensorCount'), devices.filter((device) => device.deviceType === 'SENSOR').length],
    [t('devices.attentionCount'), attention],
  ] as const;
  return (
    <div className="grid gap-4">
      <Panel className="p-5">
        <p className="m-0 text-sm text-ink-muted">{t('devices.overviewDescription')}</p>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <Panel key={label} className="p-5">
            <p className="m-0 text-xs font-semibold uppercase text-ink-faint">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}

interface RegistryProps extends SharedSectionProps {
  readonly history?: readonly DeviceLifecycleTransition[];
  readonly historyDevice?: DeviceViewModel;
  readonly search: string;
  readonly typeFilter: string;
  readonly lifecycleFilter: string;
  readonly onSearch: (value: string) => void;
  readonly onTypeFilter: (value: string) => void;
  readonly onLifecycleFilter: (value: string) => void;
  readonly onActivate: (device: DeviceViewModel) => void;
  readonly onSuspend: (device: DeviceViewModel) => void;
  readonly onRotate: (device: DeviceViewModel) => void;
  readonly onRetire: (device: DeviceViewModel) => void;
  readonly onHistory: (device: DeviceViewModel) => void;
  readonly onLifecycle: (
    device: DeviceViewModel,
    state: Exclude<DeviceLifecycleState, 'MANUFACTURED'>,
  ) => void;
  readonly onDecommission: (device: DeviceViewModel) => void;
}

function Registry(props: RegistryProps) {
  const { devices, history, historyDevice, lifecycleFilter, locale, search, t, typeFilter } = props;
  const columns: readonly DataTableColumn<DeviceViewModel>[] = [
    {
      key: 'device',
      header: t('devices.name'),
      render: (device) => (
        <div>
          <strong>{device.name}</strong>
          <div className="font-mono text-xs text-ink-muted">{device.externalDeviceId}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: t('devices.deviceType'),
      render: (device) => t(device.deviceType === 'GATEWAY' ? 'devices.gateway' : 'devices.sensor'),
    },
    {
      key: 'lifecycle',
      header: t('devices.lifecycle'),
      render: (device) => (
        <Badge variant={lifecycleTone(device.lifecycleState)}>{device.lifecycleState}</Badge>
      ),
    },
    {
      key: 'connectivity',
      header: t('devices.connectivity'),
      render: (device) => (
        <div>
          <ConnectivityBadge device={device} t={t} />
          <div className="mt-1 text-xs text-ink-muted">
            {device.lastSeenAt ? formatDate(device.lastSeenAt, locale) : t('devices.neverSeen')}
          </div>
        </div>
      ),
    },
    {
      key: 'location',
      header: t('devices.siteAndLocation'),
      render: (device) =>
        [device.deploymentSite, device.physicalLocation].filter(Boolean).join(' / ') || '—',
    },
    {
      key: 'actions',
      header: '',
      render: (device) => <DeviceActions device={device} {...props} />,
    },
  ];
  return (
    <div className="grid gap-4">
      <Panel className="p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_180px_220px]">
          <SearchField
            aria-label={t('devices.search')}
            onChange={(event) => props.onSearch(event.currentTarget.value)}
            onClear={() => props.onSearch('')}
            value={search}
          />
          <Select
            aria-label={t('devices.deviceType')}
            data={[
              { value: '', label: t('devices.allTypes') },
              { value: 'GATEWAY', label: t('devices.gateway') },
              { value: 'SENSOR', label: t('devices.sensor') },
            ]}
            onChange={props.onTypeFilter}
            value={typeFilter}
          />
          <Select
            aria-label={t('devices.lifecycle')}
            data={[
              { value: '', label: t('devices.allLifecycle') },
              ...LIFECYCLE_STATES.map((state) => ({ value: state, label: state })),
            ]}
            onChange={props.onLifecycleFilter}
            value={lifecycleFilter}
          />
        </div>
        <div className="mt-4">
          <DataTable
            ariaLabel={t('devices.registryTitle')}
            columns={columns}
            emptyMessage={t('devices.noFilterResults')}
            rowKey={(device) => device.id}
            rows={devices}
          />
        </div>
      </Panel>
      {historyDevice && history ? (
        <Panel className="p-5">
          <h2 className="m-0 text-lg font-semibold text-ink">
            {t('devices.lifecycleHistory')}: {historyDevice.name}
          </h2>
          <ol className="mt-4 grid gap-3">
            {history
              .filter((item) => item.fromState !== item.toState)
              .map((item) => (
                <li key={item.id} className="rounded-lg border border-line-soft p-3">
                  <strong>
                    {item.fromState ?? '—'} → {item.toState}
                  </strong>
                  <div className="mt-1 text-xs text-ink-muted">
                    {item.operatorId} · {formatDate(item.transitionedAt, locale)}
                  </div>
                  {item.reason ? <p className="mb-0 mt-2 text-sm">{item.reason}</p> : null}
                </li>
              ))}
          </ol>
        </Panel>
      ) : null}
    </div>
  );
}

function DeviceActions({
  busy,
  device,
  onActivate,
  onDecommission,
  onHistory,
  onLifecycle,
  onRetire,
  onRotate,
  onSuspend,
  t,
}: RegistryProps & { readonly device: DeviceViewModel }) {
  const next = nextLifecycle(device.lifecycleState);
  return (
    <div className="flex min-w-64 flex-wrap gap-2">
      {next ? (
        <Button
          disabled={busy}
          onClick={() => onLifecycle(device, next)}
          size="xs"
          variant="secondary"
        >
          {lifecycleAction(next, t)}
        </Button>
      ) : null}
      {device.lifecycleState !== 'DECOMMISSIONED' ? (
        <Button
          disabled={busy}
          onClick={() => onDecommission(device)}
          size="xs"
          variant="destructive-ghost"
        >
          {t('devices.markDecommissioned')}
        </Button>
      ) : null}
      {device.canActivate ? (
        <Button disabled={busy} onClick={() => onActivate(device)} size="xs" variant="secondary">
          {t('devices.activate')}
        </Button>
      ) : null}
      {device.canSuspend ? (
        <Button disabled={busy} onClick={() => onSuspend(device)} size="xs" variant="ghost">
          {t('devices.suspend')}
        </Button>
      ) : null}
      <Button disabled={busy} onClick={() => onHistory(device)} size="xs" variant="ghost">
        {t('devices.lifecycleHistory')}
      </Button>
      <Button disabled={busy} onClick={() => onRotate(device)} size="xs" variant="ghost">
        {t('devices.rotateCredential')}
      </Button>
      <Button
        disabled={busy}
        onClick={() => onRetire(device)}
        size="xs"
        variant="destructive-ghost"
      >
        {t('devices.retire')}
      </Button>
    </div>
  );
}

function ConnectivityBadge({
  device,
  t,
}: Readonly<{
  device: DeviceViewModel;
  t: ReturnType<typeof useTranslation>['t'];
}>) {
  return (
    <Badge
      variant={
        device.contactStatus === 'ONLINE'
          ? 'success'
          : device.contactStatus === 'LOST_CONTACT'
            ? 'danger'
            : 'warning'
      }
    >
      {t(
        device.contactStatus === 'ONLINE'
          ? 'devices.online'
          : device.contactStatus === 'LOST_CONTACT'
            ? 'devices.lostContact'
            : 'devices.neverSeen',
      )}
    </Badge>
  );
}

interface HealthProps extends SharedSectionProps {
  readonly alerts?: readonly DeviceAlertViewModel[];
  readonly deviceLogs?: readonly DeviceLogViewModel[];
  readonly logDeviceId: string;
  readonly onAcknowledge: (alert: DeviceAlertViewModel) => void;
  readonly onClear: (alert: DeviceAlertViewModel) => void;
  readonly onLogDeviceChange: (deviceId: string) => void;
  readonly onRefresh: () => void;
}

function Health({
  alerts,
  busy,
  deviceLogs,
  devices,
  logDeviceId,
  locale,
  onAcknowledge,
  onClear,
  onLogDeviceChange,
  onRefresh,
  t,
}: HealthProps) {
  const columns: readonly DataTableColumn<DeviceViewModel>[] = [
    {
      key: 'name',
      header: t('devices.name'),
      render: (device) => (
        <Link
          className="font-semibold text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          href={`/catalog/tables?catalog=iceberg&schema=${encodeURIComponent(
            `${device.tenantStorageKey}_bronze`,
          )}&table=mqtt_events&deviceId=${encodeURIComponent(device.id)}&deviceName=${encodeURIComponent(
            device.name,
          )}`}
        >
          {device.name}
        </Link>
      ),
    },
    { key: 'type', header: t('devices.deviceType'), render: (device) => device.deviceType },
    {
      key: 'connectivity',
      header: t('devices.connectivity'),
      render: (device) => <ConnectivityBadge device={device} t={t} />,
    },
    {
      key: 'lastSeen',
      header: t('devices.lastSeen'),
      render: (device) => (device.lastSeenAt ? formatDate(device.lastSeenAt, locale) : '—'),
    },
    {
      key: 'firmware',
      header: t('devices.firmwareVersion'),
      render: (device) => device.currentFirmwareVersion ?? '—',
    },
  ];
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-ink">{t('devices.healthTab')}</h2>
          <p className="mt-2 text-sm text-ink-muted">{t('devices.healthDescription')}</p>
        </div>
        <Button disabled={busy} onClick={onRefresh} size="sm" variant="secondary">
          {t('devices.healthRefresh')}
        </Button>
      </div>
      <div className="mt-4">
        <DataTable
          ariaLabel={t('devices.healthTab')}
          columns={columns}
          emptyMessage={t('devices.empty')}
          rowKey={(device) => device.id}
          rows={devices}
        />
      </div>
      <h3 className="mb-0 mt-6 text-base font-semibold text-ink">{t('devices.alertsTitle')}</h3>
      <div className="mt-3">
        <DataTable
          ariaLabel={t('devices.alertsTitle')}
          columns={[
            {
              key: 'device',
              header: t('devices.name'),
              render: (alert: DeviceAlertViewModel) => alert.deviceName,
            },
            {
              key: 'type',
              header: t('devices.alertType'),
              render: (alert: DeviceAlertViewModel) => t(alertTypeLabelKey(alert.type)),
            },
            {
              key: 'severity',
              header: t('devices.alertSeverity'),
              render: (alert: DeviceAlertViewModel) => (
                <Badge variant={alert.severity === 'CRITICAL' ? 'danger' : 'warning'}>
                  {alert.severity}
                </Badge>
              ),
            },
            {
              key: 'status',
              header: t('devices.alertStatus'),
              render: (alert: DeviceAlertViewModel) => alert.status,
            },
            {
              key: 'raised',
              header: t('devices.alertRaisedAt'),
              render: (alert: DeviceAlertViewModel) => formatDate(alert.raisedAt, locale),
            },
            {
              key: 'actions',
              header: t('devices.actions'),
              render: (alert: DeviceAlertViewModel) => (
                <div className="flex flex-wrap gap-2">
                  {alert.canAcknowledge ? (
                    <Button
                      disabled={busy}
                      onClick={() => onAcknowledge(alert)}
                      size="xs"
                      variant="secondary"
                    >
                      {t('devices.alertAcknowledge')}
                    </Button>
                  ) : null}
                  {alert.canClear ? (
                    <Button
                      disabled={busy}
                      onClick={() => onClear(alert)}
                      size="xs"
                      variant="ghost"
                    >
                      {t('devices.alertClear')}
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
          emptyMessage={t('devices.alertsEmpty')}
          rowKey={(alert) => alert.id}
          rows={alerts ?? []}
        />
      </div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-64 flex-1">
          <Select
            label={t('devices.logsTitle')}
            data={[
              { value: '', label: t('devices.logsSelectDevice') },
              ...devices.map((device) => ({ value: device.id, label: device.name })),
            ]}
            onChange={onLogDeviceChange}
            value={logDeviceId}
          />
        </div>
        <p className="m-0 max-w-xl text-sm text-ink-muted">{t('devices.logsDescription')}</p>
      </div>
      <div className="mt-3">
        <DataTable
          ariaLabel={t('devices.logsTitle')}
          columns={[
            {
              key: 'observedAt',
              header: t('devices.logObservedAt'),
              render: (entry: DeviceLogViewModel) => formatDate(entry.observedAt, locale),
            },
            {
              key: 'level',
              header: t('devices.logLevel'),
              render: (entry: DeviceLogViewModel) => (
                <Badge
                  variant={
                    entry.level === 'ERROR'
                      ? 'danger'
                      : entry.level === 'WARNING'
                        ? 'warning'
                        : 'info'
                  }
                >
                  {entry.level}
                </Badge>
              ),
            },
            {
              key: 'kind',
              header: t('devices.logKind'),
              render: (entry: DeviceLogViewModel) => entry.kind,
            },
            {
              key: 'message',
              header: t('devices.logMessage'),
              render: (entry: DeviceLogViewModel) => entry.message,
            },
            {
              key: 'context',
              header: t('devices.logContext'),
              render: (entry: DeviceLogViewModel) =>
                Object.keys(entry.context).length === 0 ? '—' : JSON.stringify(entry.context),
            },
          ]}
          emptyMessage={logDeviceId ? t('devices.logsEmpty') : t('devices.logsSelectDeviceHint')}
          rowKey={(entry: DeviceLogViewModel) => entry.id}
          rows={deviceLogs ?? []}
        />
      </div>
    </Panel>
  );
}

function alertTypeLabelKey(type: DeviceAlertType): TranslationKey {
  const keys: Readonly<Record<DeviceAlertType, TranslationKey>> = {
    LOSS_OF_CONTACT: 'devices.lossOfContactAlert',
    STORAGE_ALMOST_FULL: 'devices.storageAlmostFullAlert',
    SIM_DATA_LIMIT: 'devices.simDataLimitAlert',
    BATTERY_LOW: 'devices.batteryLowAlert',
    TAMPER: 'devices.tamperAlert',
    SHOCK: 'devices.shockAlert',
    MOVED: 'devices.movedAlert',
    SENSOR_FAULT: 'devices.sensorFaultAlert',
    UNEXPECTED_REBOOT: 'devices.unexpectedRebootAlert',
    RADIO_DEGRADED: 'devices.radioDegradedAlert',
    LTE_MODEM_FAILURE: 'devices.lteModemFailureAlert',
  };
  return keys[type];
}

interface FirmwareManagementProps {
  readonly busy: boolean;
  readonly campaignForm: typeof emptyFirmwareCampaignForm;
  readonly campaigns?: readonly FirmwareCampaignViewModel[];
  readonly deployments?: readonly FirmwareDeploymentViewModel[];
  readonly deviceId: string;
  readonly devices: readonly DeviceViewModel[];
  readonly locale: string;
  readonly onCreateRelease: (event: FormEvent<HTMLFormElement>) => void;
  readonly onCreateCampaign: (event: FormEvent<HTMLFormElement>) => void;
  readonly onCampaignFormChange: (value: typeof emptyFirmwareCampaignForm) => void;
  readonly onCampaignRefresh: () => void;
  readonly onCampaignTransition: (id: string, action: FirmwareCampaignAction) => void;
  readonly onDeploy: () => void;
  readonly onDeviceChange: (value: string) => void;
  readonly onRefresh: () => void;
  readonly onReleaseChange: (value: string) => void;
  readonly onReleaseFormChange: (value: FirmwareReleaseForm) => void;
  readonly releaseForm: FirmwareReleaseForm;
  readonly releaseId: string;
  readonly releases?: readonly FirmwareReleaseViewModel[];
  readonly t: ReturnType<typeof useTranslation>['t'];
}

function FirmwareManagement(props: FirmwareManagementProps) {
  const {
    campaignForm,
    campaigns,
    deployments,
    deviceId,
    devices,
    locale,
    releaseForm,
    releaseId,
    releases,
    t,
  } = props;
  const deployableDevices = devices.filter(
    (device) => device.status === 'ACTIVE' && device.lifecycleState === 'COMMISSIONED',
  );
  const selectedDevice = deployableDevices.find((device) => device.id === deviceId);
  const compatibleReleases = (releases ?? []).filter(
    (release) =>
      selectedDevice !== undefined &&
      release.deviceModel === selectedDevice.model &&
      (release.hardwareRevision === undefined ||
        release.hardwareRevision === selectedDevice.hardwareRevision),
  );
  const campaignRelease = (releases ?? []).find((release) => release.id === campaignForm.releaseId);
  const campaignDevices = deployableDevices.filter(
    (device) =>
      campaignRelease !== undefined &&
      campaignRelease.deviceModel === device.model &&
      (campaignRelease.hardwareRevision === undefined ||
        campaignRelease.hardwareRevision === device.hardwareRevision) &&
      campaignRelease.version !== device.currentFirmwareVersion,
  );
  const deploymentColumns: readonly DataTableColumn<FirmwareDeploymentViewModel>[] = [
    {
      key: 'version',
      header: t('devices.firmwareTargetVersion'),
      render: (deployment) => (
        <div>
          <strong>{deployment.releaseVersion}</strong>
          <div className="text-xs text-ink-muted">
            {deployment.previousVersion ?? t('devices.firmwareUnknownVersion')} →{' '}
            {deployment.releaseVersion}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('devices.firmwareStatus'),
      render: (deployment) => (
        <Badge variant={firmwareStatusTone(deployment.status)}>{deployment.status}</Badge>
      ),
    },
    {
      key: 'progress',
      header: t('devices.firmwareProgress'),
      render: (deployment) => (
        <div className="min-w-32">
          <Progress aria-label={t('devices.firmwareProgress')} value={deployment.progressPercent} />
          <span className="mt-1 block text-xs text-ink-muted">{deployment.progressPercent}%</span>
        </div>
      ),
    },
    {
      key: 'requested',
      header: t('devices.firmwareRequestedAt'),
      render: (deployment) => formatDate(deployment.requestedAt, locale),
    },
    {
      key: 'error',
      header: t('devices.firmwareError'),
      render: (deployment) => deployment.error ?? '—',
    },
  ];
  const releaseColumns: readonly DataTableColumn<FirmwareReleaseViewModel>[] = [
    {
      key: 'version',
      header: t('devices.firmwareTargetVersion'),
      render: (release) => <strong>{release.version}</strong>,
    },
    {
      key: 'compatibility',
      header: t('devices.firmwareCompatibility'),
      render: (release) =>
        `${release.deviceModel} · ${release.hardwareRevision ?? t('devices.firmwareAllRevisions')}`,
    },
    {
      key: 'artifact',
      header: t('devices.firmwareArtifact'),
      render: (release) => (
        <div>
          <div>{release.artifactFileName ?? t('devices.firmwareExternalArtifact')}</div>
          {release.signingKeyId ? (
            <div className="text-xs text-ink-muted">
              {t('devices.firmwareSigningKeyId')}: {release.signingKeyId}
            </div>
          ) : null}
          <div className="text-xs text-ink-muted">
            {release.artifactStorageProvider ?? 'HTTPS'}
            {release.artifactSizeBytes === undefined
              ? ''
              : ` · ${formatBytes(release.artifactSizeBytes, locale)}`}
          </div>
        </div>
      ),
    },
    {
      key: 'digest',
      header: t('devices.firmwareSha256'),
      render: (release) => (
        <span className="font-mono text-xs">{release.sha256.slice(0, 12)}…</span>
      ),
    },
  ];
  const campaignTargetColumns: readonly DataTableColumn<
    FirmwareCampaignViewModel['targets'][number]
  >[] = [
    { key: 'device', header: t('devices.name'), render: (target) => target.deviceName },
    {
      key: 'batch',
      header: t('devices.firmwareCampaignBatch'),
      render: (target) =>
        target.batchNumber === 0 ? t('devices.firmwareCampaignCanary') : String(target.batchNumber),
    },
    {
      key: 'status',
      header: t('devices.firmwareStatus'),
      render: (target) => (
        <Badge variant={firmwareStatusTone(target.status)}>{target.status}</Badge>
      ),
    },
    {
      key: 'progress',
      header: t('devices.firmwareProgress'),
      render: (target) => `${target.progressPercent}%`,
    },
    { key: 'error', header: t('devices.firmwareError'), render: (target) => target.error ?? '—' },
  ];

  return (
    <div className="grid gap-4">
      <PageAlert tone="info">{t('devices.firmwareSecurityHint')}</PageAlert>
      <div className="grid min-w-0 gap-4 min-[1080px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel
            className="h-fit p-5"
            component="section"
            aria-label={t('devices.firmwareReleaseTitle')}
          >
            <h2 className="m-0 text-lg font-semibold text-ink">
              {t('devices.firmwareReleaseTitle')}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">{t('devices.firmwareReleaseDescription')}</p>
            <form className="mt-5 grid gap-4" onSubmit={props.onCreateRelease}>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput
                  label={t('devices.firmwareTargetVersion')}
                  onChange={(event) =>
                    props.onReleaseFormChange({
                      ...releaseForm,
                      version: event.currentTarget.value,
                    })
                  }
                  placeholder="1.2.0"
                  required
                  value={releaseForm.version}
                />
                <TextInput
                  label={t('devices.model')}
                  onChange={(event) =>
                    props.onReleaseFormChange({
                      ...releaseForm,
                      deviceModel: event.currentTarget.value,
                    })
                  }
                  placeholder="Celesnity Edge Sensor"
                  required
                  value={releaseForm.deviceModel}
                />
              </div>
              <TextInput
                label={t('devices.hardwareRevision')}
                onChange={(event) =>
                  props.onReleaseFormChange({
                    ...releaseForm,
                    hardwareRevision: event.currentTarget.value,
                  })
                }
                placeholder={t('devices.firmwareAllRevisions')}
                value={releaseForm.hardwareRevision}
              />
              <Field>
                <FieldLabel htmlFor="firmware-artifact">
                  {t('devices.firmwareArtifactFile')}
                </FieldLabel>
                <Input
                  accept=".bin,.hex,.uf2,.img,application/octet-stream"
                  id="firmware-artifact"
                  key={releaseForm.file?.name ?? 'empty-firmware-artifact'}
                  onChange={(event) => {
                    const { file: currentFile, ...formWithoutFile } = releaseForm;
                    void currentFile;
                    const selected = event.currentTarget.files?.[0];
                    props.onReleaseFormChange({
                      ...formWithoutFile,
                      ...(selected === undefined ? {} : { file: selected }),
                    });
                  }}
                  required
                  type="file"
                />
                <FieldDescription>{t('devices.firmwareArtifactFileHint')}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t('devices.firmwareManagedSigning')}</FieldLabel>
                <FieldDescription>{t('devices.firmwareManagedSigningHint')}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t('devices.firmwareReleaseNotes')}</FieldLabel>
                <Textarea
                  onChange={(event) =>
                    props.onReleaseFormChange({
                      ...releaseForm,
                      releaseNotes: event.currentTarget.value,
                    })
                  }
                  value={releaseForm.releaseNotes}
                />
              </Field>
              <Button disabled={props.busy} type="submit">
                {props.busy ? <Spinner /> : null}
                {t('devices.firmwareRegisterRelease')}
              </Button>
            </form>
          </Panel>

          <Panel
            className="h-fit p-5"
            component="section"
            aria-label={t('devices.firmwareCampaignCreateTitle')}
          >
            <h2 className="m-0 text-lg font-semibold text-ink">
              {t('devices.firmwareCampaignCreateTitle')}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {t('devices.firmwareCampaignDescription')}
            </p>
            <form className="mt-5 grid gap-4" onSubmit={props.onCreateCampaign}>
              <TextInput
                label={t('devices.firmwareCampaignName')}
                onChange={(event) =>
                  props.onCampaignFormChange({
                    ...campaignForm,
                    name: event.currentTarget.value,
                  })
                }
                required
                value={campaignForm.name}
              />
              <Select
                label={t('devices.firmwareRelease')}
                data={[
                  { value: '', label: t('devices.firmwareSelectRelease') },
                  ...(releases ?? []).map((release) => ({
                    value: release.id,
                    label: `${release.version} · ${release.deviceModel}`,
                  })),
                ]}
                onChange={(value) =>
                  props.onCampaignFormChange({
                    ...campaignForm,
                    releaseId: value,
                    deviceIds: [],
                  })
                }
                required
                value={campaignForm.releaseId}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput
                  label={t('devices.firmwareCampaignCanarySize')}
                  max={String(Math.max(1, campaignForm.deviceIds.length))}
                  min="1"
                  onChange={(event) =>
                    props.onCampaignFormChange({
                      ...campaignForm,
                      canarySize: event.currentTarget.value,
                    })
                  }
                  required
                  type="number"
                  value={campaignForm.canarySize}
                />
                <TextInput
                  label={t('devices.firmwareCampaignBatchSize')}
                  max="100"
                  min="1"
                  onChange={(event) =>
                    props.onCampaignFormChange({
                      ...campaignForm,
                      batchSize: event.currentTarget.value,
                    })
                  }
                  required
                  type="number"
                  value={campaignForm.batchSize}
                />
              </div>
              <fieldset className="grid gap-2 rounded-lg border border-line p-3">
                <legend className="px-1 text-sm font-semibold text-ink">
                  {t('devices.firmwareCampaignTargets')}
                </legend>
                {campaignRelease === undefined ? (
                  <span className="text-sm text-ink-muted">
                    {t('devices.firmwareCampaignSelectReleaseHint')}
                  </span>
                ) : campaignDevices.length === 0 ? (
                  <span className="text-sm text-ink-muted">
                    {t('devices.firmwareCampaignNoTargets')}
                  </span>
                ) : (
                  campaignDevices.map((device) => (
                    <label className="flex items-center gap-3 text-sm text-ink" key={device.id}>
                      <Checkbox
                        checked={campaignForm.deviceIds.includes(device.id)}
                        onCheckedChange={(checked) =>
                          props.onCampaignFormChange({
                            ...campaignForm,
                            deviceIds:
                              checked === true
                                ? [...campaignForm.deviceIds, device.id]
                                : campaignForm.deviceIds.filter((id) => id !== device.id),
                          })
                        }
                      />
                      {device.name} ·{' '}
                      {device.currentFirmwareVersion ?? t('devices.firmwareUnknownVersion')}
                    </label>
                  ))
                )}
              </fieldset>
              <Button
                disabled={
                  props.busy ||
                  !campaignForm.releaseId ||
                  campaignForm.deviceIds.length === 0 ||
                  Number(campaignForm.canarySize) > campaignForm.deviceIds.length
                }
                type="submit"
              >
                {props.busy ? <Spinner /> : null}
                {t('devices.firmwareCampaignCreate')}
              </Button>
            </form>
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Panel
            className="min-w-0 p-5"
            component="section"
            aria-label={t('devices.firmwareLibrary')}
          >
            <h2 className="m-0 text-lg font-semibold text-ink">{t('devices.firmwareLibrary')}</h2>
            <p className="mt-2 text-sm text-ink-muted">{t('devices.firmwareLibraryDescription')}</p>
            <div className="mt-4">
              <DataTable
                ariaLabel={t('devices.firmwareLibrary')}
                columns={releaseColumns}
                emptyMessage={t('devices.firmwareNoReleases')}
                rowKey={(release) => release.id}
                rows={releases ?? []}
              />
            </div>
          </Panel>
          <Panel
            className="min-w-0 p-5"
            component="section"
            aria-label={t('devices.firmwareDeployTitle')}
          >
            <h2 className="m-0 text-lg font-semibold text-ink">
              {t('devices.firmwareDeployTitle')}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">{t('devices.firmwareDeployDescription')}</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Select
                label={t('devices.name')}
                data={[
                  { value: '', label: t('devices.firmwareSelectDevice') },
                  ...deployableDevices.map((device) => ({
                    value: device.id,
                    label: `${device.name} · ${device.model}${device.currentFirmwareVersion ? ` · ${device.currentFirmwareVersion}` : ''}`,
                  })),
                ]}
                onChange={props.onDeviceChange}
                value={deviceId}
              />
              <Select
                disabled={!selectedDevice}
                label={t('devices.firmwareRelease')}
                data={[
                  { value: '', label: t('devices.firmwareSelectRelease') },
                  ...compatibleReleases.map((release) => ({
                    value: release.id,
                    label: `${release.version} · ${release.deviceModel}${release.hardwareRevision ? ` · ${release.hardwareRevision}` : ''}`,
                  })),
                ]}
                onChange={props.onReleaseChange}
                value={releaseId}
              />
            </div>
            {selectedDevice && compatibleReleases.length === 0 ? (
              <PageAlert className="mt-4" tone="warning">
                {t('devices.firmwareNoCompatibleRelease')}
              </PageAlert>
            ) : null}
            <Button
              className="mt-4"
              disabled={props.busy || !deviceId || !releaseId}
              onClick={props.onDeploy}
            >
              {props.busy ? <Spinner /> : null}
              {t('devices.firmwareDeploy')}
            </Button>
          </Panel>

          <Panel
            className="min-w-0 p-5"
            component="section"
            aria-label={t('devices.firmwareHistory')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-lg font-semibold text-ink">{t('devices.firmwareHistory')}</h2>
              <Button
                disabled={!deviceId || props.busy}
                onClick={props.onRefresh}
                size="sm"
                variant="secondary"
              >
                {t('devices.firmwareRefresh')}
              </Button>
            </div>
            <div className="mt-4">
              <DataTable
                ariaLabel={t('devices.firmwareHistory')}
                columns={deploymentColumns}
                emptyMessage={
                  deviceId
                    ? t('devices.firmwareNoDeployments')
                    : t('devices.firmwareSelectDeviceHint')
                }
                rowKey={(deployment) => deployment.id}
                rows={deployments ?? []}
              />
            </div>
          </Panel>

          <Panel
            className="min-w-0 p-5"
            component="section"
            aria-label={t('devices.firmwareCampaigns')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="m-0 text-lg font-semibold text-ink">
                  {t('devices.firmwareCampaigns')}
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                  {t('devices.firmwareCampaignsDescription')}
                </p>
              </div>
              <Button
                disabled={props.busy}
                onClick={props.onCampaignRefresh}
                size="sm"
                variant="secondary"
              >
                {t('devices.firmwareRefresh')}
              </Button>
            </div>
            <div className="mt-4 grid gap-4">
              {campaigns === undefined ? (
                <Spinner />
              ) : campaigns.length === 0 ? (
                <EmptyBlock
                  description={t('devices.firmwareCampaignDescription')}
                  title={t('devices.firmwareCampaignsEmpty')}
                />
              ) : (
                campaigns.map((campaign) => (
                  <div className="rounded-lg border border-line p-4" key={campaign.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{campaign.name}</strong>
                          <Badge variant={campaignStatusTone(campaign.status)}>
                            {campaign.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">
                          {campaign.releaseVersion} · {campaign.targets.length}{' '}
                          {t('devices.firmwareCampaignDevices')} ·{' '}
                          {campaign.currentBatch === undefined
                            ? t('devices.firmwareCampaignNotStarted')
                            : t('devices.firmwareCampaignCurrentBatch', {
                                batch:
                                  campaign.currentBatch === 0
                                    ? t('devices.firmwareCampaignCanary')
                                    : campaign.currentBatch,
                              })}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {campaign.status === 'DRAFT' ? (
                          <Button
                            disabled={props.busy}
                            onClick={() => props.onCampaignTransition(campaign.id, 'start')}
                            size="sm"
                          >
                            {t('devices.firmwareCampaignStart')}
                          </Button>
                        ) : null}
                        {campaign.status === 'RUNNING' ? (
                          <>
                            <Button
                              disabled={props.busy}
                              onClick={() => props.onCampaignTransition(campaign.id, 'advance')}
                              size="sm"
                            >
                              {t('devices.firmwareCampaignAdvance')}
                            </Button>
                            <Button
                              disabled={props.busy}
                              onClick={() => props.onCampaignTransition(campaign.id, 'pause')}
                              size="sm"
                              variant="secondary"
                            >
                              {t('devices.firmwareCampaignPause')}
                            </Button>
                          </>
                        ) : null}
                        {campaign.status === 'PAUSED' && campaign.error === undefined ? (
                          <Button
                            disabled={props.busy}
                            onClick={() => props.onCampaignTransition(campaign.id, 'resume')}
                            size="sm"
                          >
                            {t('devices.firmwareCampaignResume')}
                          </Button>
                        ) : null}
                        {campaign.status === 'DRAFT' ||
                        campaign.status === 'RUNNING' ||
                        campaign.status === 'PAUSED' ? (
                          <Button
                            disabled={props.busy}
                            onClick={() => props.onCampaignTransition(campaign.id, 'abort')}
                            size="sm"
                            variant="destructive"
                          >
                            {t('devices.firmwareCampaignAbort')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {campaign.error ? (
                      <PageAlert className="mt-3" tone="warning">
                        {campaign.error}
                      </PageAlert>
                    ) : null}
                    <div className="mt-4">
                      <DataTable
                        ariaLabel={t('devices.firmwareCampaignTargets')}
                        columns={campaignTargetColumns}
                        emptyMessage={t('devices.firmwareCampaignNoTargets')}
                        rowKey={(target) => target.id}
                        rows={campaign.targets}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

interface ProvisioningProps {
  readonly activeAdapters: readonly DeviceAdapterOption[];
  readonly adapterId: string;
  readonly busy: boolean;
  readonly credential?: CredentialResult;
  readonly devices: readonly DeviceViewModel[];
  readonly gateways: readonly DeviceViewModel[];
  readonly form: typeof emptyForm;
  readonly onAdapterChange: (value: string) => void;
  readonly onCredentialDismiss: () => void;
  readonly onFormChange: (value: typeof emptyForm) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly t: ReturnType<typeof useTranslation>['t'];
}

function Provisioning(props: ProvisioningProps) {
  const { activeAdapters, adapterId, busy, credential, devices, form, gateways, t } = props;
  const replacementOptions = devices.filter(
    (device) => device.deviceType === 'SENSOR' && device.lifecycleState === 'COMMISSIONED',
  );
  const replacing = Boolean(form.replacementId);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]">
      <Panel className="h-fit p-5" component="section" aria-label={t('devices.registerTitle')}>
        <h2 className="m-0 text-lg font-semibold text-ink">{t('devices.registerTitle')}</h2>
        <form className="mt-5 grid gap-4" onSubmit={props.onSubmit}>
          <Select
            label={t('devices.adapter')}
            data={[
              { value: '', label: t('devices.selectAdapter') },
              ...activeAdapters.map((adapter) => ({ value: adapter.id, label: adapter.name })),
            ]}
            disabled={busy}
            onChange={props.onAdapterChange}
            value={adapterId}
          />
          <Select
            label={t('devices.registrationMode')}
            data={[
              { value: '', label: t('devices.newDevice') },
              ...replacementOptions.map((device) => ({
                value: device.id,
                label: `${t('devices.replacement')}: ${device.name}`,
              })),
            ]}
            onChange={(value) =>
              props.onFormChange({
                ...form,
                replacementId: value,
                deviceType: value ? 'SENSOR' : form.deviceType,
              })
            }
            value={form.replacementId}
          />
          {!replacing ? (
            <Select
              label={t('devices.deviceType')}
              data={[
                { value: 'GATEWAY', label: t('devices.gateway') },
                { value: 'SENSOR', label: t('devices.sensor') },
              ]}
              onChange={(value) =>
                props.onFormChange({
                  ...form,
                  deviceType: value as DeviceType,
                  gatewayId: value === 'SENSOR' ? form.gatewayId : '',
                })
              }
              value={form.deviceType}
            />
          ) : (
            <PageAlert tone="info">{t('devices.replacementHint')}</PageAlert>
          )}
          {!replacing && form.deviceType === 'SENSOR' ? (
            <Select
              label={t('devices.boundGateway')}
              data={[
                { value: '', label: t('devices.selectGateway') },
                ...gateways.map((gateway) => ({ value: gateway.id, label: gateway.name })),
              ]}
              onChange={(value) => props.onFormChange({ ...form, gatewayId: value })}
              required
              value={form.gatewayId}
            />
          ) : null}
          <TextInput
            hint={t('devices.externalIdHint')}
            label={t('devices.externalId')}
            onChange={(event) =>
              props.onFormChange({ ...form, externalDeviceId: event.currentTarget.value })
            }
            pattern="[A-Za-z0-9][A-Za-z0-9._:-]{0,127}"
            required
            value={form.externalDeviceId}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label={t('devices.name')}
              onChange={(event) => props.onFormChange({ ...form, name: event.currentTarget.value })}
              required
              value={form.name}
            />
            <TextInput
              label={t('devices.model')}
              onChange={(event) =>
                props.onFormChange({ ...form, model: event.currentTarget.value })
              }
              required
              value={form.model}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label={t('devices.hardwareRevision')}
              onChange={(event) =>
                props.onFormChange({ ...form, hardwareRevision: event.currentTarget.value })
              }
              placeholder={t('devices.optional')}
              value={form.hardwareRevision}
            />
            <TextInput
              label={t('devices.firmwareVersion')}
              onChange={(event) =>
                props.onFormChange({ ...form, currentFirmwareVersion: event.currentTarget.value })
              }
              placeholder={t('devices.optional')}
              value={form.currentFirmwareVersion}
            />
          </div>
          {!replacing ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput
                  label={t('devices.deploymentSite')}
                  onChange={(event) =>
                    props.onFormChange({ ...form, deploymentSite: event.currentTarget.value })
                  }
                  value={form.deploymentSite}
                />
                <TextInput
                  label={t('devices.physicalLocation')}
                  onChange={(event) =>
                    props.onFormChange({ ...form, physicalLocation: event.currentTarget.value })
                  }
                  value={form.physicalLocation}
                />
              </div>
              {form.deviceType === 'SENSOR' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label={t('devices.measurementPointKey')}
                    onChange={(event) =>
                      props.onFormChange({
                        ...form,
                        measurementPointKey: event.currentTarget.value,
                      })
                    }
                    value={form.measurementPointKey}
                  />
                  <TextInput
                    label={t('devices.measurementPointName')}
                    onChange={(event) =>
                      props.onFormChange({
                        ...form,
                        measurementPointName: event.currentTarget.value,
                      })
                    }
                    value={form.measurementPointName}
                  />
                </div>
              ) : null}
            </>
          ) : null}
          <Button
            type="submit"
            disabled={
              busy || !adapterId || (!replacing && form.deviceType === 'SENSOR' && !form.gatewayId)
            }
          >
            {busy ? <Spinner /> : null}
            {replacing ? t('devices.replacement') : t('devices.register')}
          </Button>
        </form>
      </Panel>
      <Panel className="h-fit p-5">
        <h2 className="m-0 text-lg font-semibold text-ink">{t('devices.credentialTitle')}</h2>
        {credential ? (
          <CredentialPanel credential={credential} onDismiss={props.onCredentialDismiss} t={t} />
        ) : (
          <div className="mt-4">
            <EmptyBlock title={t('devices.credentialOnce')} />
          </div>
        )}
      </Panel>
    </div>
  );
}

function CredentialPanel({
  credential,
  onDismiss,
  t,
}: {
  readonly credential: CredentialResult;
  readonly onDismiss: () => void;
  readonly t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <div
      role="status"
      className="mt-4 rounded-xl border border-warning-line bg-warning-surface p-4"
    >
      <p className="m-0 text-xs text-ink-muted">{t('devices.credentialOnce')}</p>
      <dl className="mt-3 grid gap-2 text-xs">
        <Topic label={t('devices.brokerUrl')} value={credential.brokerUrl} />
        <Topic label={t('devices.telemetryTopic')} value={credential.topics.telemetry} />
        <Topic label={t('devices.username')} value={credential.credential.username} />
        <Topic label={t('devices.password')} value={credential.credential.password} />
      </dl>
      <Button className="mt-3" size="sm" variant="secondary" onClick={onDismiss}>
        {t('devices.dismissCredential')}
      </Button>
    </div>
  );
}

function Topic({ label, value }: { readonly label: ReactNode; readonly value: string }) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className="m-0 break-all font-mono">{value}</dd>
    </div>
  );
}

const EMPTY_SELECT_VALUE = '__celesnity_empty__';

function Select({
  className,
  data,
  label,
  onChange,
  value,
  ...props
}: {
  readonly className?: string;
  readonly data: readonly { readonly value: string; readonly label: string }[];
  readonly label?: ReactNode;
  readonly onChange: (value: string) => void;
  readonly value: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly 'aria-label'?: string;
}) {
  const id = useId();
  const control = (
    <SelectRoot
      disabled={props.disabled}
      required={props.required}
      value={value || EMPTY_SELECT_VALUE}
      onValueChange={(next) => onChange(next === EMPTY_SELECT_VALUE ? '' : next)}
    >
      <SelectTrigger
        id={id}
        className={className ?? 'w-full'}
        aria-label={props['aria-label'] ?? (typeof label === 'string' ? label : undefined)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {data.map((option) => (
          <SelectItem
            key={option.value || EMPTY_SELECT_VALUE}
            value={option.value || EMPTY_SELECT_VALUE}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
  return label === undefined ? (
    control
  ) : (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {control}
    </Field>
  );
}

function TextInput({
  hint,
  label,
  ...props
}: ComponentProps<typeof Input> & { readonly hint?: ReactNode; readonly label: ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} aria-describedby={hint === undefined ? undefined : hintId} {...props} />
      {hint === undefined ? null : <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  );
}

function Panel({
  component,
  children,
  ...props
}: ComponentProps<typeof Card> & { readonly component?: 'section' }) {
  return component === 'section' ? (
    <Card asChild {...props}>
      <section>{children}</section>
    </Card>
  ) : (
    <Card {...props}>{children}</Card>
  );
}

const Badge = BaseBadge;
const Button = BaseButton;

function Tabs({
  ariaLabel,
  onChange,
  tabs,
  value,
}: {
  readonly ariaLabel: string;
  readonly onChange: (value: string) => void;
  readonly tabs: readonly {
    readonly value: string;
    readonly label: string;
    readonly content: ReactNode;
  }[];
  readonly value: string;
}) {
  return (
    <TabsRoot value={value} onValueChange={onChange}>
      <TabsList aria-label={ariaLabel}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </TabsRoot>
  );
}

const LIFECYCLE_STATES: readonly DeviceLifecycleState[] = [
  'MANUFACTURED',
  'PROVISIONED',
  'COMMISSIONED',
  'DECOMMISSIONED',
];

function nextLifecycle(
  state: DeviceLifecycleState,
): Exclude<DeviceLifecycleState, 'MANUFACTURED'> | undefined {
  if (state === 'MANUFACTURED') return 'PROVISIONED';
  if (state === 'PROVISIONED') return 'COMMISSIONED';
  return undefined;
}

function lifecycleAction(
  state: Exclude<DeviceLifecycleState, 'MANUFACTURED'>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (state === 'PROVISIONED') return t('devices.markProvisioned');
  if (state === 'COMMISSIONED') return t('devices.markCommissioned');
  return t('devices.markDecommissioned');
}

function lifecycleTone(state: DeviceLifecycleState): BadgeVariant {
  if (state === 'COMMISSIONED') return 'success';
  if (state === 'DECOMMISSIONED') return 'outline';
  return 'warning';
}

function firmwareStatusTone(
  status: FirmwareDeploymentViewModel['status'] | 'PENDING',
): BadgeVariant {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED' || status === 'ROLLED_BACK') return 'danger';
  if (status === 'CANCELLED') return 'outline';
  return 'warning';
}

function campaignStatusTone(status: FirmwareCampaignStatus): BadgeVariant {
  if (status === 'COMPLETED') return 'success';
  if (status === 'ABORTED') return 'danger';
  if (status === 'PAUSED') return 'warning';
  return status === 'RUNNING' ? 'info' : 'outline';
}

function configurationStatusTone(status: DeviceConfigurationViewModel['status']): BadgeVariant {
  if (status === 'APPLIED') return 'success';
  if (status === 'FAILED' || status === 'ROLLED_BACK') return 'danger';
  return 'warning';
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function formatBytes(value: number, locale: string): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024)} KiB`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / (1024 * 1024))} MiB`;
}
