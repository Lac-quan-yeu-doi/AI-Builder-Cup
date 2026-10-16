import { createHash, timingSafeEqual } from 'node:crypto';

import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IDeviceConfigurationCommandPublisher } from '@application/device-management/interfaces/i-device-configuration-command-publisher';
import type { IDeviceConfigurationRepository } from '@application/device-management/interfaces/i-device-configuration.repository';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { IStreamingSecretGenerator } from '@application/streaming/interfaces/i-streaming-secret-generator';
import { DeviceError } from '@domain/device-management/errors/device.errors';
import type {
  DeviceConfiguration,
  DeviceConfigurationTemplate,
  DeviceConfigurationTemplateDeployment,
  DeviceConfigurationParameters,
  DiagnosticMetric,
} from '@domain/device-management/models/device-configuration';

export interface PushDeviceConfigurationInput {
  readonly parameters?: DeviceConfigurationParameters;
  readonly restoreFactoryDefaults?: boolean;
}

export interface ReportDeviceConfigurationEventInput {
  readonly token: string;
  readonly status: 'APPLIED' | 'FAILED' | 'ROLLED_BACK';
  readonly error?: string;
}

export interface CreateDeviceConfigurationTemplateInput {
  readonly name: string;
  readonly parameters: DeviceConfigurationParameters;
}

export interface DeployDeviceConfigurationTemplateInput {
  readonly deploymentSite?: string;
  readonly deviceType?: 'GATEWAY' | 'SENSOR';
}

const DIAGNOSTIC_METRICS = new Set<DiagnosticMetric>([
  'CPU_LOAD',
  'CPU_TEMPERATURE',
  'MEMORY',
  'BATTERY_PERCENT',
  'RSSI_SNR',
  'UPTIME',
]);

export class DeviceConfigurationUseCases {
  public constructor(
    private readonly repository: IDeviceConfigurationRepository,
    private readonly devices: IDeviceRepository,
    private readonly publisher: IDeviceConfigurationCommandPublisher,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly secrets: IStreamingSecretGenerator,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public async push(
    deviceId: string,
    input: PushDeviceConfigurationInput,
  ): Promise<DeviceConfiguration> {
    const device = await this.devices.findById(deviceId);
    if (device === undefined || device.status === 'RETIRED') throw DeviceError.notFound();
    if (device.desiredState !== 'ACTIVE' || device.lifecycleState !== 'COMMISSIONED') {
      throw DeviceError.stateConflict(
        'Configuration can only be pushed to a commissioned, enabled device.',
      );
    }
    const restoreFactoryDefaults = input.restoreFactoryDefaults === true;
    const parameters = validateParameters(input.parameters ?? {});
    if (device.deviceType === 'SENSOR' && parameters.gatewayUplinkMode !== undefined) {
      throw DeviceError.validation('Gateway uplink mode cannot be configured on a sensor.');
    }
    if (!restoreFactoryDefaults && Object.keys(parameters).length === 0) {
      throw DeviceError.validation('At least one configuration parameter is required.');
    }

    const now = this.clock.now().toISOString();
    const token = this.secrets.generate();
    const configuration = await this.unitOfWork.commit(async () => {
      const created = await this.repository.create({
        id: this.ids.next(),
        organizationId: device.organizationId,
        deviceId: device.id,
        version: await this.repository.nextVersion(device.id),
        status: 'QUEUED',
        parameters,
        restoreFactoryDefaults,
        previousAppliedVersion: device.appliedConfigurationVersion,
        requestedBy: this.contexts.require().identityId,
        requestedAt: now,
        updatedAt: now,
        eventTokenHash: tokenHash(token),
      });
      if (created === 'VERSION_CONFLICT') {
        throw DeviceError.stateConflict(
          'An active or concurrent configuration update must finish before another is pushed.',
        );
      }
      return created;
    });

    try {
      await this.publisher.publish(device, {
        configurationId: configuration.id,
        version: configuration.version,
        parameters,
        restoreFactoryDefaults,
        previousAppliedVersion: configuration.previousAppliedVersion,
        eventPath: `/device-management/device-configurations/${configuration.id}/events`,
        eventToken: token,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'Configuration dispatch failed.';
      await this.repository.updateStatus(configuration.id, 'QUEUED', 'FAILED', now, message);
      throw DeviceError.stateConflict('Configuration command could not be dispatched.');
    }
    const dispatched = await this.repository.updateStatus(
      configuration.id,
      'QUEUED',
      'DISPATCHED',
      now,
    );
    if (dispatched === undefined) {
      throw DeviceError.stateConflict('Configuration dispatch state changed concurrently.');
    }
    return dispatched;
  }

  public async list(deviceId: string): Promise<readonly DeviceConfiguration[]> {
    if ((await this.devices.findById(deviceId)) === undefined) throw DeviceError.notFound();
    return this.repository.list(deviceId);
  }

  public async createTemplate(
    input: CreateDeviceConfigurationTemplateInput,
  ): Promise<DeviceConfigurationTemplate> {
    const name = cleanTemplateName(input.name);
    const parameters = validateParameters(input.parameters);
    if (Object.keys(parameters).length === 0) {
      throw DeviceError.validation('At least one configuration parameter is required.');
    }
    const context = this.contexts.require();
    const template: DeviceConfigurationTemplate = {
      id: this.ids.next(),
      organizationId: context.organizationId,
      name,
      version: await this.repository.nextTemplateVersion(name),
      parameters,
      createdBy: context.identityId,
      createdAt: this.clock.now().toISOString(),
    };
    const created = await this.repository.createTemplate(template);
    if (created === 'VERSION_CONFLICT') {
      throw DeviceError.stateConflict('The configuration template changed concurrently.');
    }
    return created;
  }

  public listTemplates(): Promise<readonly DeviceConfigurationTemplate[]> {
    return this.repository.listTemplates();
  }

  public async deployTemplate(
    templateId: string,
    input: DeployDeviceConfigurationTemplateInput,
  ): Promise<DeviceConfigurationTemplateDeployment> {
    const template = await this.repository.findTemplateById(templateId);
    if (template === undefined) throw DeviceError.notFound();
    const deploymentSite = cleanOptionalTarget(input.deploymentSite);
    if (deploymentSite === undefined && input.deviceType === undefined) {
      throw DeviceError.validation('A deployment site or device type target is required.');
    }
    const targets = await this.devices.listConfigurationTargets({
      ...(deploymentSite === undefined ? {} : { deploymentSite }),
      ...(input.deviceType === undefined ? {} : { deviceType: input.deviceType }),
    });
    if (targets.length === 0) {
      throw DeviceError.validation(
        'No enabled commissioned devices match the configuration target.',
      );
    }
    const configurations: DeviceConfiguration[] = [];
    const failures: DeviceConfigurationTemplateDeployment['failures'][number][] = [];
    for (const target of targets) {
      try {
        configurations.push(
          await this.push(target.id, {
            parameters: template.parameters,
          }),
        );
      } catch (error) {
        failures.push({
          deviceId: target.id,
          deviceName: target.name,
          error: error instanceof Error ? error.message.slice(0, 500) : 'Configuration failed.',
        });
      }
    }
    return { template, targetCount: targets.length, configurations, failures };
  }

  public async authorizeEvent(configurationId: string, token: string): Promise<void> {
    const configuration = await this.repository.findById(configurationId);
    if (
      configuration === undefined ||
      !safeTokenEqual(configuration.eventTokenHash, tokenHash(token))
    ) {
      throw DeviceError.notFound();
    }
  }

  public async reportEvent(
    configurationId: string,
    input: ReportDeviceConfigurationEventInput,
  ): Promise<DeviceConfiguration> {
    const configuration = await this.repository.findById(configurationId);
    if (
      configuration === undefined ||
      !safeTokenEqual(configuration.eventTokenHash, tokenHash(input.token))
    ) {
      throw DeviceError.notFound();
    }
    if (configuration.status !== 'DISPATCHED') {
      throw DeviceError.stateConflict('Configuration is not waiting for acknowledgement.');
    }
    const device = await this.devices.findById(configuration.deviceId);
    if (device === undefined) throw DeviceError.notFound();
    await this.publisher.clear(device);
    const updated = await this.unitOfWork.commit(() =>
      this.repository.updateStatus(
        configuration.id,
        'DISPATCHED',
        input.status,
        this.clock.now().toISOString(),
        input.error === undefined ? undefined : cleanError(input.error),
      ),
    );
    if (updated === undefined) {
      throw DeviceError.stateConflict('Configuration acknowledgement changed concurrently.');
    }
    return updated;
  }
}

function validateParameters(input: DeviceConfigurationParameters): DeviceConfigurationParameters {
  const parameters: DeviceConfigurationParameters = {
    ...(input.samplingRateHz === undefined
      ? {}
      : { samplingRateHz: boundedNumber(input.samplingRateHz, 'Sampling rate', 0.001, 100_000) }),
    ...(input.reportingIntervalSeconds === undefined
      ? {}
      : {
          reportingIntervalSeconds: boundedInteger(
            input.reportingIntervalSeconds,
            'Reporting interval',
            1,
            86_400,
          ),
        }),
    ...(input.channels === undefined ? {} : { channels: validateMap(input.channels, true) }),
    ...(input.gatewayUplinkMode === undefined
      ? {}
      : { gatewayUplinkMode: validateUplinkMode(input.gatewayUplinkMode) }),
    ...(input.diagnosticLogging === undefined
      ? {}
      : { diagnosticLogging: validateDiagnostics(input.diagnosticLogging) }),
    ...(input.logLevel === undefined ? {} : { logLevel: validateLogLevel(input.logLevel) }),
    ...(input.alertThresholds === undefined
      ? {}
      : { alertThresholds: validateMap(input.alertThresholds, false) }),
  };
  return parameters;
}

function validateMap<T extends boolean | number>(
  values: Readonly<Record<string, T>>,
  booleanValues: boolean,
): Readonly<Record<string, T>> {
  const entries = Object.entries(values);
  if (entries.length > 64) throw DeviceError.validation('Configuration maps support 64 keys.');
  for (const [key, value] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(key)) {
      throw DeviceError.validation('Configuration keys must be topic-safe identifiers.');
    }
    if (
      booleanValues
        ? typeof value !== 'boolean'
        : typeof value !== 'number' || !Number.isFinite(value)
    ) {
      throw DeviceError.validation('Configuration map contains an invalid value.');
    }
  }
  return Object.fromEntries(entries);
}

function validateDiagnostics(values: readonly DiagnosticMetric[]): readonly DiagnosticMetric[] {
  const unique = [...new Set(values)];
  if (unique.some((value) => !DIAGNOSTIC_METRICS.has(value))) {
    throw DeviceError.validation('Diagnostic logging contains an unsupported metric.');
  }
  return unique;
}

function validateUplinkMode(value: string): 'MQTT' | 'BULK_HTTP' {
  if (value !== 'MQTT' && value !== 'BULK_HTTP') {
    throw DeviceError.validation('Gateway uplink mode must be MQTT or BULK_HTTP.');
  }
  return value;
}

function validateLogLevel(value: string): 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG' {
  if (value !== 'ERROR' && value !== 'WARNING' && value !== 'INFO' && value !== 'DEBUG') {
    throw DeviceError.validation('Log level must be ERROR, WARNING, INFO, or DEBUG.');
  }
  return value;
}

function boundedNumber(value: number, field: string, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw DeviceError.validation(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function boundedInteger(value: number, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value)) throw DeviceError.validation(`${field} must be an integer.`);
  return boundedNumber(value, field, minimum, maximum);
}

function cleanError(value: string): string {
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > 500) {
    throw DeviceError.validation('Configuration error must contain 1 to 500 characters.');
  }
  return cleaned;
}

function cleanTemplateName(value: string): string {
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > 160) {
    throw DeviceError.validation('Configuration template name must contain 1 to 160 characters.');
  }
  return cleaned;
}

function cleanOptionalTarget(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > 160) {
    throw DeviceError.validation('Deployment site must contain 1 to 160 characters.');
  }
  return cleaned;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeTokenEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
