import type { IDeviceCredentialVault } from '@application/device-management/interfaces/i-device-credential-vault';
import type { IDeviceConfigurationRepository } from '@application/device-management/interfaces/i-device-configuration.repository';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import { DeviceUseCases } from '@application/device-management/device.use-cases';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { OutboxMessage } from '@application/shared/outbox-message';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type {
  DeviceAlert,
  DeviceDesiredState,
  DeviceLifecycleTransition,
  DeviceRecord,
} from '@domain/device-management/models/device';

describe('DeviceUseCases', () => {
  it('registers an adapter-owned device with exact MQTT topics and a one-time credential', async () => {
    const fixture = createFixture();

    const registration = await fixture.useCases.register({
      adapterId: ADAPTER_ID,
      externalDeviceId: 'sensor-001',
      deviceType: 'GATEWAY',
      name: 'Temperature sensor',
      model: 'Edge Sensor',
      hardwareRevision: 'rev-b',
      currentFirmwareVersion: '1.0.0',
    });

    expect(registration.device).toMatchObject({
      adapterId: ADAPTER_ID,
      tenantStorageKey: 'tnt_7f3a2c19d8e4',
      externalDeviceId: 'sensor-001',
      topics: {
        telemetry:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/00000000-0000-4000-8000-000000000001/telemetry',
        firmwareEvents:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/00000000-0000-4000-8000-000000000001/events/firmware',
        firmwareCommands:
          'tenants/tnt_7f3a2c19d8e4/adapters/adp_abc123abc123/devices/00000000-0000-4000-8000-000000000001/commands/firmware',
      },
      status: 'PROVISIONING',
    });
    expect(registration.credential).toEqual({
      username: 'dev_00000000000040008000000000000001',
      password: 'generated-secret',
    });
    expect(fixture.records[0]?.credentials.ciphertext).toBe('encrypted');
    expect(JSON.stringify(fixture.events)).not.toContain('generated-secret');
  });

  it('suspends and activates through desired-state reconciliation', async () => {
    const fixture = createFixture();
    const registered = await fixture.useCases.register(validInput());

    const suspended = await fixture.useCases.suspend(registered.device.id);
    const activated = await fixture.useCases.activate(registered.device.id);

    expect(suspended).toMatchObject({
      desiredState: 'SUSPENDED',
      status: 'PROVISIONING',
      generation: 2,
    });
    expect(activated).toMatchObject({
      desiredState: 'ACTIVE',
      status: 'PROVISIONING',
      generation: 3,
    });
  });

  it('preserves optional device details when a patch omits them', async () => {
    const fixture = createFixture();
    const registered = await fixture.useCases.register({
      ...validInput(),
      hardwareRevision: 'rev-b',
      currentFirmwareVersion: '1.0.0',
    });

    const updated = await fixture.useCases.update(registered.device.id, { name: 'Sensor two' });

    expect(updated).toMatchObject({
      name: 'Sensor two',
      hardwareRevision: 'rev-b',
      currentFirmwareVersion: '1.0.0',
    });
  });

  it('rejects registration against an inactive adapter', async () => {
    const fixture = createFixture(false);
    await expect(fixture.useCases.register(validInput())).rejects.toMatchObject({
      code: 'DEVICE_ADAPTER_NOT_FOUND',
    });
  });

  it('rejects topic-unsafe device identifiers', async () => {
    const fixture = createFixture();
    await expect(
      fixture.useCases.register({ ...validInput(), externalDeviceId: 'line/a' }),
    ).rejects.toMatchObject({ code: 'DEVICE_INVALID' });
  });

  it('binds sensors to an eligible gateway and creates a stable measurement point', async () => {
    const fixture = createFixture();
    const gateway = await fixture.useCases.register(validInput());

    const sensor = await fixture.useCases.register({
      ...validInput(),
      externalDeviceId: 'sensor-002',
      deviceType: 'SENSOR',
      gatewayId: gateway.device.id,
      measurementPointKey: 'line-a-temperature',
    });

    expect(sensor.device).toMatchObject({
      deviceType: 'SENSOR',
      gatewayId: gateway.device.id,
      measurementPointKey: 'line-a-temperature',
      lifecycleState: 'MANUFACTURED',
    });
  });

  it('records the specified physical lifecycle with operator identity', async () => {
    const fixture = createFixture();
    const registered = await fixture.useCases.register(validInput());

    await fixture.useCases.confirmProvisioning(registered.device.id);
    await fixture.useCases.transitionLifecycle(registered.device.id, {
      state: 'COMMISSIONED',
    });

    expect(
      fixture.transitions.map(({ fromState, toState, operatorId }) => ({
        fromState,
        toState,
        operatorId,
      })),
    ).toEqual([
      { fromState: undefined, toState: 'MANUFACTURED', operatorId: ACTOR_ID },
      { fromState: 'MANUFACTURED', toState: 'PROVISIONED', operatorId: ACTOR_ID },
      { fromState: 'PROVISIONED', toState: 'COMMISSIONED', operatorId: ACTOR_ID },
    ]);
  });

  it('starts the contact deadline when a device is commissioned', async () => {
    const fixture = createFixture();
    const registered = await fixture.useCases.register({
      ...validInput(),
      expectedCheckInIntervalSeconds: 15,
      missedCheckInThreshold: 4,
    });

    await fixture.useCases.confirmProvisioning(registered.device.id);
    const commissioned = await fixture.useCases.transitionLifecycle(registered.device.id, {
      state: 'COMMISSIONED',
    });

    expect(commissioned).toMatchObject({
      contactStatus: 'NEVER_SEEN',
      contactDeadlineAt: '2026-08-24T00:01:00.000Z',
    });
  });

  it('accepts a sensor check-in only from its bound gateway', async () => {
    const fixture = createFixture();
    const gateway = await fixture.useCases.register(validInput());
    const sensor = await fixture.useCases.register({
      ...validInput(),
      externalDeviceId: 'sensor-003',
      deviceType: 'SENSOR',
      gatewayId: gateway.device.id,
    });

    await expect(
      fixture.useCases.recordCheckIn(sensor.device.id, {
        reportingGatewayId: '99999999-9999-4999-8999-999999999999',
      }),
    ).rejects.toMatchObject({ code: 'DEVICE_INVALID' });
    const checkedIn = await fixture.useCases.recordCheckIn(sensor.device.id, {
      reportingGatewayId: gateway.device.id,
      currentFirmwareVersion: '1.1.0',
    });
    expect(checkedIn).toMatchObject({
      lastSeenAt: '2026-08-24T00:00:00.000Z',
      currentFirmwareVersion: '1.1.0',
    });
  });

  it('authenticates a gateway credential and records a fresh contact deadline', async () => {
    const fixture = createFixture();
    const gateway = await fixture.useCases.register(validInput());
    await fixture.useCases.confirmProvisioning(gateway.device.id);
    await fixture.useCases.transitionLifecycle(gateway.device.id, { state: 'COMMISSIONED' });

    await expect(
      fixture.useCases.authenticateHeartbeat(gateway.device.publicKey, 'wrong-secret'),
    ).resolves.toBeUndefined();
    const principal = await fixture.useCases.authenticateHeartbeat(
      gateway.device.publicKey,
      'device-secret',
    );
    expect(principal).toBeDefined();
    if (principal === undefined) throw new Error('Expected an authenticated device principal.');

    const checkedIn = await fixture.useCases.recordAuthenticatedHeartbeat(principal, {
      deviceId: gateway.device.id,
      observedAt: '2099-01-01T00:00:00.000Z',
      currentFirmwareVersion: '1.1.0',
      configurationVersion: 2,
    });

    expect(checkedIn).toMatchObject({
      contactStatus: 'ONLINE',
      contactDeadlineAt: '2026-08-24T00:03:00.000Z',
      currentFirmwareVersion: '1.1.0',
      reportedConfigurationVersion: 2,
    });
    expect(fixture.confirmedFirmwareVersions).toEqual(['1.1.0']);
    expect(fixture.confirmedConfigurationVersions).toEqual([2]);
  });

  it('does not authenticate a sensor as a direct cloud principal', async () => {
    const fixture = createFixture();
    const gateway = await fixture.useCases.register(validInput());
    const sensor = await fixture.useCases.register({
      ...validInput(),
      externalDeviceId: 'sensor-relayed',
      deviceType: 'SENSOR',
      gatewayId: gateway.device.id,
    });

    await expect(
      fixture.useCases.authenticateHeartbeat(sensor.device.publicKey, 'device-secret'),
    ).resolves.toBeUndefined();
  });

  it('schedules the bound gateway ACL when a sensor lifecycle changes', async () => {
    const fixture = createFixture();
    const gateway = await fixture.useCases.register(validInput());
    const sensor = await fixture.useCases.register({
      ...validInput(),
      externalDeviceId: 'sensor-acl',
      deviceType: 'SENSOR',
      gatewayId: gateway.device.id,
    });

    await fixture.useCases.confirmProvisioning(sensor.device.id);

    expect(fixture.scheduledPrincipalReconciliations).toEqual([gateway.device.id]);
  });

  it('replaces a sensor while preserving its measurement point', async () => {
    const fixture = createFixture();
    const gateway = await fixture.useCases.register(validInput());
    const sensor = await fixture.useCases.register({
      ...validInput(),
      externalDeviceId: 'sensor-old',
      deviceType: 'SENSOR',
      gatewayId: gateway.device.id,
      measurementPointKey: 'line-a-temperature',
    });
    await fixture.useCases.confirmProvisioning(sensor.device.id);
    await fixture.useCases.transitionLifecycle(sensor.device.id, {
      state: 'COMMISSIONED',
    });

    const replacement = await fixture.useCases.replace(sensor.device.id, {
      externalDeviceId: 'sensor-new',
      name: 'Replacement sensor',
      model: 'Edge Sensor v2',
    });

    expect(replacement.device.measurementPointId).toBe(sensor.device.measurementPointId);
    expect(replacement.device.measurementPointKey).toBe('line-a-temperature');
    expect(fixture.records.find((record) => record.id === sensor.device.id)?.lifecycleState).toBe(
      'DECOMMISSIONED',
    );
  });

  it('acknowledges and manually clears an organization-scoped device alert', async () => {
    const fixture = createFixture();
    fixture.alerts.push({
      id: '55555555-5555-4555-8555-555555555555',
      organizationId: ORGANIZATION_ID,
      deviceId: '66666666-6666-4666-8666-666666666666',
      deviceName: 'Factory gateway',
      type: 'LOSS_OF_CONTACT',
      severity: 'CRITICAL',
      status: 'RAISED',
      snapshot: {},
      raisedAt: '2026-08-23T23:59:00.000Z',
      updatedAt: '2026-08-23T23:59:00.000Z',
    });

    const acknowledged = await fixture.useCases.acknowledgeAlert(fixture.alerts[0]!.id);
    const cleared = await fixture.useCases.clearAlert(fixture.alerts[0]!.id);

    expect(acknowledged).toMatchObject({ status: 'ACKNOWLEDGED', acknowledgedBy: ACTOR_ID });
    expect(cleared).toMatchObject({ status: 'CLEARED', clearedBy: ACTOR_ID });
  });

  it('ingests an idempotent device alert with its original offline timestamp', async () => {
    const fixture = createFixture();
    const gateway = await fixture.useCases.register(validInput());
    await fixture.useCases.confirmProvisioning(gateway.device.id);
    await fixture.useCases.transitionLifecycle(gateway.device.id, { state: 'COMMISSIONED' });
    const principal = await fixture.useCases.authenticateHeartbeat(
      gateway.device.publicKey,
      'device-secret',
    );
    if (principal === undefined) throw new Error('Expected an authenticated gateway.');
    const input = {
      deviceId: gateway.device.id,
      eventId: '77777777-7777-4777-8777-777777777777',
      type: 'BATTERY_LOW' as const,
      severity: 'WARNING' as const,
      observedAt: '2026-08-23T20:00:00.000Z',
      snapshot: { batteryPercent: 8, thresholdPercent: 10 },
    };

    const created = await fixture.useCases.reportAuthenticatedAlert(principal, input);
    const replayed = await fixture.useCases.reportAuthenticatedAlert(principal, input);

    expect(created).toMatchObject({
      sourceEventId: input.eventId,
      type: 'BATTERY_LOW',
      raisedAt: input.observedAt,
      snapshot: input.snapshot,
    });
    expect(replayed.id).toBe(created.id);
    expect(fixture.alerts).toHaveLength(1);
  });
});

const ADAPTER_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';

function validInput() {
  return {
    adapterId: ADAPTER_ID,
    externalDeviceId: 'sensor-001',
    deviceType: 'GATEWAY' as const,
    name: 'Temperature sensor',
    model: 'Edge Sensor',
  };
}

function createFixture(adapterActive = true): {
  readonly events: OutboxMessage[];
  readonly alerts: DeviceAlert[];
  readonly records: DeviceRecord[];
  readonly transitions: DeviceLifecycleTransition[];
  readonly scheduledPrincipalReconciliations: string[];
  readonly confirmedFirmwareVersions: string[];
  readonly confirmedConfigurationVersions: number[];
  readonly useCases: DeviceUseCases;
} {
  const records: DeviceRecord[] = [];
  const alerts: DeviceAlert[] = [];
  const events: OutboxMessage[] = [];
  const transitions: DeviceLifecycleTransition[] = [];
  const scheduledPrincipalReconciliations: string[] = [];
  const confirmedFirmwareVersions: string[] = [];
  const confirmedConfigurationVersions: number[] = [];
  const repository: IDeviceRepository = {
    findAdapterContext: () =>
      Promise.resolve({
        id: ADAPTER_ID,
        organizationId: ORGANIZATION_ID,
        publicKey: 'adp_abc123abc123',
        tenantId: '22222222-2222-4222-8222-222222222222',
        tenantStorageKey: 'tnt_7f3a2c19d8e4',
        brokerUrl: 'mqtts://mqtt.celesnity.test:8883',
        qos: 1,
        active: adapterActive,
      }),
    list: () => Promise.resolve(records),
    findById: (id) => Promise.resolve(records.find((record) => record.id === id)),
    findByPublicKey: (publicKey) =>
      Promise.resolve(records.find((record) => record.publicKey === publicKey)),
    isEligibleGateway: (id, adapterId) =>
      Promise.resolve(
        records.some(
          (record) =>
            record.id === id && record.adapterId === adapterId && record.deviceType === 'GATEWAY',
        ),
      ),
    listBoundActiveSensorTelemetryTopics: () => Promise.resolve([]),
    listConfigurationTargets: () => Promise.resolve([]),
    schedulePrincipalReconciliation: (id) => {
      scheduledPrincipalReconciliations.push(id);
      return Promise.resolve();
    },
    createMeasurementPoint: () => Promise.resolve('CREATED'),
    create: (device) => {
      records.push(device);
      return Promise.resolve(device);
    },
    updateDetails: (id, details, updatedAt) => {
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) return Promise.resolve(undefined);
      records[index] = { ...records[index]!, ...details, updatedAt };
      return Promise.resolve(records[index]);
    },
    setDesiredState: (id, desiredState, updatedAt) => {
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) return Promise.resolve(undefined);
      records[index] = transition(records[index]!, desiredState, updatedAt);
      return Promise.resolve(records[index]);
    },
    replaceCredentials: () => Promise.resolve(undefined),
    transitionLifecycle: (
      id,
      lifecycleState,
      transitionedAt,
      provisioningConfirmed,
      contactDeadlineAt,
    ) => {
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) return Promise.resolve(undefined);
      records[index] = {
        ...records[index]!,
        lifecycleState,
        ...(lifecycleState === 'COMMISSIONED' ? { commissionedAt: transitionedAt } : {}),
        ...(provisioningConfirmed ? { provisioningConfirmedAt: transitionedAt } : {}),
        ...(contactDeadlineAt === undefined ? {} : { contactDeadlineAt }),
        updatedAt: transitionedAt,
      };
      return Promise.resolve(records[index]);
    },
    recordLifecycleTransition: (transition) => {
      transitions.push(transition);
      return Promise.resolve();
    },
    listLifecycleTransitions: () => Promise.resolve(transitions),
    recordCheckIn: (
      id,
      observedAt,
      contactDeadlineAt,
      currentFirmwareVersion,
      reportedConfigurationVersion,
    ) => {
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) return Promise.resolve(undefined);
      records[index] = {
        ...records[index]!,
        lastSeenAt: observedAt,
        contactStatus: 'ONLINE',
        contactDeadlineAt,
        ...(currentFirmwareVersion === undefined ? {} : { currentFirmwareVersion }),
        ...(reportedConfigurationVersion === undefined ? {} : { reportedConfigurationVersion }),
        updatedAt: observedAt,
      };
      return Promise.resolve(records[index]);
    },
    findLostContactCandidates: () => Promise.resolve([]),
    markLostContact: () => Promise.resolve(undefined),
    createAlert: (alert) => {
      if (
        alerts.some(
          (existing) =>
            existing.sourceEventId === alert.sourceEventId ||
            (existing.deviceId === alert.deviceId &&
              existing.type === alert.type &&
              existing.status !== 'CLEARED'),
        )
      ) {
        return Promise.resolve('ACTIVE_ALERT_CONFLICT');
      }
      alerts.push(alert);
      return Promise.resolve(alert);
    },
    listAlerts: (filter) =>
      Promise.resolve(
        alerts.filter(
          (alert) =>
            (filter.deviceId === undefined || alert.deviceId === filter.deviceId) &&
            (filter.status === undefined || alert.status === filter.status),
        ),
      ),
    findAlert: (id) => Promise.resolve(alerts.find((alert) => alert.id === id)),
    findAlertBySourceEventId: (sourceEventId) =>
      Promise.resolve(alerts.find((alert) => alert.sourceEventId === sourceEventId)),
    findActiveAlert: (deviceId, type) =>
      Promise.resolve(
        alerts.find(
          (alert) =>
            alert.deviceId === deviceId && alert.type === type && alert.status !== 'CLEARED',
        ),
      ),
    updateAlertStatus: (id, expectedStatus, status, operatorId, now) => {
      const index = alerts.findIndex((alert) => alert.id === id && alert.status === expectedStatus);
      if (index < 0) return Promise.resolve(undefined);
      const current = alerts[index]!;
      alerts[index] = {
        ...current,
        status,
        ...(status === 'ACKNOWLEDGED'
          ? { acknowledgedAt: now, acknowledgedBy: operatorId }
          : { clearedAt: now, clearedBy: operatorId }),
        updatedAt: now,
      };
      return Promise.resolve(alerts[index]);
    },
    clearActiveLossOfContactAlert: (deviceId, operatorId, now) => {
      const index = alerts.findIndex(
        (alert) => alert.deviceId === deviceId && alert.status !== 'CLEARED',
      );
      if (index >= 0) {
        alerts[index] = {
          ...alerts[index]!,
          status: 'CLEARED',
          clearedAt: now,
          clearedBy: operatorId,
          updatedAt: now,
        };
      }
      return Promise.resolve();
    },
    claimReconciliation: () => Promise.resolve([]),
    completeReconciliation: () => Promise.resolve(),
    failReconciliation: () => Promise.resolve(),
  };
  const vault: IDeviceCredentialVault = {
    encrypt: () =>
      Promise.resolve({
        ciphertext: 'encrypted',
        initializationVector: 'iv',
        authenticationTag: 'tag',
        keyVersion: 'v1',
      }),
    decrypt: () => Promise.resolve({ password: 'device-secret' }),
  };
  const unitOfWork: IUnitOfWork = {
    commit: async (work) => work({ record: (...messages) => events.push(...messages) }),
  };
  let sequence = 0;
  const useCases = new DeviceUseCases(
    repository,
    vault,
    unitOfWork,
    { now: (): Date => new Date('2026-08-24T00:00:00.000Z') },
    {
      next: (): string => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    },
    { generate: (): string => 'generated-secret' },
    {
      require: () => ({ identityId: ACTOR_ID, organizationId: ORGANIZATION_ID }),
      runBackground: (_organizationId: string, work: () => Promise<unknown>) => work(),
    } as unknown as AuthenticatedContextStore,
    {
      confirmRebootedDeployment: (_deviceId: string, releaseVersion: string) => {
        confirmedFirmwareVersions.push(releaseVersion);
        return Promise.resolve(undefined);
      },
    } as unknown as IFirmwareRepository,
    {
      confirmApplied: (_deviceId: string, version: number) => {
        confirmedConfigurationVersions.push(version);
        return Promise.resolve(undefined);
      },
    } as unknown as IDeviceConfigurationRepository,
  );
  return {
    alerts,
    events,
    records,
    transitions,
    scheduledPrincipalReconciliations,
    confirmedFirmwareVersions,
    confirmedConfigurationVersions,
    useCases,
  };
}

function transition(
  record: DeviceRecord,
  desiredState: DeviceDesiredState,
  updatedAt: string,
): DeviceRecord {
  return {
    ...record,
    desiredState,
    status: 'PROVISIONING',
    generation: record.generation + 1,
    updatedAt,
  };
}
