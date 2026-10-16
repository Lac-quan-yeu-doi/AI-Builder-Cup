import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IDeviceLogRepository } from '@application/device-management/interfaces/i-device-log.repository';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { DeviceError } from '@domain/device-management/errors/device.errors';
import type {
  DeviceLogEntry,
  DeviceLogKind,
  DeviceLogLevel,
} from '@domain/device-management/models/device-log';
import type { DeviceHeartbeatPrincipal } from '@domain/device-management/models/device';

export interface ReportDeviceLogInput {
  readonly deviceId: string;
  readonly eventId: string;
  readonly level: DeviceLogLevel;
  readonly kind: DeviceLogKind;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly observedAt: string;
}

export interface ListDeviceLogsInput {
  readonly level?: DeviceLogLevel;
  readonly kind?: DeviceLogKind;
  readonly limit?: number;
}

export class DeviceLogUseCases {
  public constructor(
    private readonly logs: IDeviceLogRepository,
    private readonly devices: IDeviceRepository,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public report(
    principal: DeviceHeartbeatPrincipal,
    input: ReportDeviceLogInput,
  ): Promise<DeviceLogEntry> {
    return this.contexts.runBackground(
      principal.organizationId,
      async () => {
        const device = await this.devices.findById(input.deviceId);
        if (device === undefined || device.status === 'RETIRED') throw DeviceError.notFound();
        if (device.desiredState !== 'ACTIVE' || device.lifecycleState !== 'COMMISSIONED') {
          throw DeviceError.validation('Log target must be commissioned and enabled.');
        }
        if (
          device.id !== principal.deviceId &&
          !(principal.deviceType === 'GATEWAY' && device.gatewayId === principal.deviceId)
        ) {
          throw DeviceError.validation('The authenticated gateway is not bound to this sensor.');
        }
        if (Number.isNaN(Date.parse(input.observedAt))) {
          throw DeviceError.validation('Log timestamp must be an ISO-8601 date-time.');
        }
        const entry: DeviceLogEntry = {
          id: this.ids.next(),
          organizationId: device.organizationId,
          deviceId: device.id,
          deviceName: device.name,
          sourceEventId: input.eventId,
          level: input.level,
          kind: input.kind,
          message: cleanMessage(input.message),
          context: { ...input.context },
          observedAt: new Date(input.observedAt).toISOString(),
          receivedAt: this.clock.now().toISOString(),
        };
        const created = await this.logs.create(entry);
        if (created !== 'SOURCE_EVENT_CONFLICT') return created;
        const existing = await this.logs.findBySourceEventId(input.eventId);
        if (existing === undefined)
          throw DeviceError.stateConflict('The log changed concurrently.');
        return existing;
      },
      'DEVICES',
    );
  }

  public async list(
    deviceId: string,
    input: ListDeviceLogsInput,
  ): Promise<readonly DeviceLogEntry[]> {
    const device = await this.devices.findById(deviceId);
    if (device === undefined || device.status === 'RETIRED') throw DeviceError.notFound();
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw DeviceError.validation('Device log limit must be between 1 and 500.');
    }
    return this.logs.list({
      deviceId,
      limit,
      ...(input.level === undefined ? {} : { level: input.level }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
    });
  }
}

function cleanMessage(value: string): string {
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > 500) {
    throw DeviceError.validation('Device log message must contain between 1 and 500 characters.');
  }
  return cleaned;
}
