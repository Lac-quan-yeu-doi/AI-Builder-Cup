import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiDeviceRepository } from '@/src/infrastructure/repositories/core-api-device.repository';

class FakeTransport implements GeneratedApiTransport {
  public readonly requests: { path: string; init?: RequestInit }[] = [];
  public constructor(private readonly responses: readonly unknown[]) {}

  public request<T>(path: string, init?: RequestInit): Promise<T> {
    this.requests.push({ path, ...(init === undefined ? {} : { init }) });
    return Promise.resolve(this.responses[this.requests.length - 1] as T);
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

const device = {
  id: '11111111-1111-4111-8111-111111111111',
  deviceKey: 'dev_11111111111141118111111111111111',
  adapterId: '22222222-2222-4222-8222-222222222222',
  adapterKey: 'adp_22222222222242228222222222222222',
  tenantStorageKey: 'tnt_7f3a2c19d8e4',
  externalDeviceId: 'sensor-001',
  deviceType: 'GATEWAY',
  name: 'Temperature sensor',
  model: 'Edge Sensor',
  hardwareRevision: 'rev-b',
  currentFirmwareVersion: '1.0.0',
  lifecycleState: 'MANUFACTURED',
  brokerUrl: 'mqtts://mqtt.celesnity.test:8883',
  topics: {
    telemetry:
      'tenants/tnt_7f3a2c19d8e4/adapters/adp_22222222222242228222222222222222/devices/sensor-001/telemetry',
    firmwareEvents:
      'tenants/tnt_7f3a2c19d8e4/adapters/adp_22222222222242228222222222222222/devices/sensor-001/events/firmware',
    firmwareCommands:
      'tenants/tnt_7f3a2c19d8e4/adapters/adp_22222222222242228222222222222222/devices/sensor-001/commands/firmware',
  },
  qos: 1,
  desiredState: 'ACTIVE',
  status: 'ACTIVE',
  generation: 1,
  observedGeneration: 1,
  desiredConfigurationVersion: 3,
  appliedConfigurationVersion: 2,
  reportedConfigurationVersion: 2,
  expectedCheckInIntervalSeconds: 60,
  missedCheckInThreshold: 3,
  contactStatus: 'NEVER_SEEN',
  updatedAt: '2026-08-24T00:00:00.000Z',
} as const;

describe('CoreApiDeviceRepository', () => {
  it('lists devices within an encoded adapter boundary', async () => {
    const transport = new FakeTransport([[device]]);
    const repository = new CoreApiDeviceRepository(transport);

    const devices = await repository.list('adapter/id with space');

    expect(transport.requests[0]).toMatchObject({
      path: '/device-management/devices?adapterId=adapter%2Fid%20with%20space',
      init: { method: 'GET' },
    });
    expect(devices[0]).toMatchObject({
      externalDeviceId: 'sensor-001',
      status: 'ACTIVE',
      qos: 1,
    });
  });

  it('registers device metadata and returns its one-time credential', async () => {
    const credential = { username: device.deviceKey, password: 'issued-secret' };
    const transport = new FakeTransport([{ device, credential }]);
    const repository = new CoreApiDeviceRepository(transport);

    const registration = await repository.register({
      adapterId: device.adapterId,
      externalDeviceId: device.externalDeviceId,
      deviceType: 'GATEWAY',
      name: device.name,
      model: device.model,
      hardwareRevision: device.hardwareRevision,
      currentFirmwareVersion: device.currentFirmwareVersion,
    });

    expect(transport.requests[0]?.path).toBe('/device-management/devices');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      adapterId: device.adapterId,
      externalDeviceId: 'sensor-001',
      deviceType: 'GATEWAY',
      name: 'Temperature sensor',
      model: 'Edge Sensor',
      hardwareRevision: 'rev-b',
      currentFirmwareVersion: '1.0.0',
      expectedCheckInIntervalSeconds: 60,
      missedCheckInThreshold: 3,
    });
    expect(registration.credential).toEqual(credential);
  });

  it('encodes identifiers for every lifecycle command', async () => {
    const credential = { username: device.deviceKey, password: 'rotated-secret' };
    const transport = new FakeTransport([device, device, { device, credential }, undefined]);
    const repository = new CoreApiDeviceRepository(transport);

    await repository.activate('device/id with space');
    await repository.suspend('device/id with space');
    await repository.rotateCredential('device/id with space');
    await repository.retire('device/id with space');

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/device-management/devices/device%2Fid%20with%20space/activate',
      '/device-management/devices/device%2Fid%20with%20space/suspend',
      '/device-management/devices/device%2Fid%20with%20space/credentials',
      '/device-management/devices/device%2Fid%20with%20space',
    ]);
  });

  it('maps physical lifecycle history and replacement operations', async () => {
    const transition = {
      id: '33333333-3333-4333-8333-333333333333',
      deviceId: device.id,
      fromState: 'MANUFACTURED',
      toState: 'PROVISIONED',
      operatorId: 'factory-tool',
      transitionedAt: '2026-08-24T01:00:00.000Z',
    } as const;
    const credential = { username: device.deviceKey, password: 'replacement-secret' };
    const transport = new FakeTransport([device, [transition], { device, credential }]);
    const repository = new CoreApiDeviceRepository(transport);

    await repository.transitionLifecycle({
      id: device.id,
      state: 'PROVISIONED',
    });
    const history = await repository.listLifecycleTransitions(device.id);
    await repository.replace({
      id: device.id,
      externalDeviceId: 'sensor-002',
      name: 'Replacement sensor',
      model: 'Edge Sensor',
    });

    expect(history).toEqual([transition]);
    expect(transport.requests.map(({ path }) => path)).toEqual([
      `/device-management/devices/${device.id}/lifecycle-transitions`,
      `/device-management/devices/${device.id}/lifecycle-transitions`,
      `/device-management/devices/${device.id}/replacements`,
    ]);
    expect(JSON.parse(String(transport.requests[2]?.init?.body))).toEqual({
      externalDeviceId: 'sensor-002',
      name: 'Replacement sensor',
      model: 'Edge Sensor',
    });
  });

  it('maps device-reported alerts and updates them through encoded paths', async () => {
    const raised = {
      id: 'alert/id with space',
      deviceId: device.id,
      deviceName: device.name,
      sourceEventId: '77777777-7777-4777-8777-777777777777',
      type: 'RADIO_DEGRADED',
      severity: 'WARNING',
      status: 'RAISED',
      snapshot: { lastSeenAt: null },
      raisedAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
    } as const;
    const acknowledged = {
      ...raised,
      status: 'ACKNOWLEDGED',
      acknowledgedAt: '2026-09-05T12:01:00.000Z',
      acknowledgedBy: 'operator-1',
      updatedAt: '2026-09-05T12:01:00.000Z',
    } as const;
    const cleared = {
      ...acknowledged,
      status: 'CLEARED',
      clearedAt: '2026-09-05T12:02:00.000Z',
      clearedBy: 'operator-1',
      updatedAt: '2026-09-05T12:02:00.000Z',
    } as const;
    const transport = new FakeTransport([[raised], acknowledged, cleared]);
    const repository = new CoreApiDeviceRepository(transport);

    const alerts = await repository.listAlerts('RAISED');
    const acknowledgedAlert = await repository.acknowledgeAlert(raised.id);
    const clearedAlert = await repository.clearAlert(raised.id);

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/device-management/device-alerts?status=RAISED',
      '/device-management/device-alerts/alert%2Fid%20with%20space/acknowledgements',
      '/device-management/device-alerts/alert%2Fid%20with%20space/clearances',
    ]);
    expect(alerts[0]).toMatchObject({
      status: 'RAISED',
      severity: 'WARNING',
      type: 'RADIO_DEGRADED',
      sourceEventId: raised.sourceEventId,
    });
    expect(acknowledgedAlert.status).toBe('ACKNOWLEDGED');
    expect(clearedAlert.status).toBe('CLEARED');
  });

  it('lists bounded device diagnostics and preserves fault context', async () => {
    const log = {
      id: '88888888-8888-4888-8888-888888888888',
      deviceId: device.id,
      deviceName: device.name,
      sourceEventId: '99999999-9999-4999-8999-999999999999',
      level: 'ERROR',
      kind: 'FAULT',
      message: 'Watchdog reset',
      context: { resetReason: 'WATCHDOG', programCounter: '0x400d1234' },
      observedAt: '2026-09-06T12:00:00.000Z',
      receivedAt: '2026-09-06T12:01:00.000Z',
    } as const;
    const transport = new FakeTransport([[log]]);
    const repository = new CoreApiDeviceRepository(transport);

    const logs = await repository.listLogs('device/id with space', {
      level: 'ERROR',
      kind: 'FAULT',
      limit: 25,
    });

    expect(transport.requests[0]).toMatchObject({
      path: '/device-management/devices/device%2Fid%20with%20space/logs?level=ERROR&kind=FAULT&limit=25',
      init: { method: 'GET' },
    });
    expect(logs[0]).toMatchObject({
      level: 'ERROR',
      kind: 'FAULT',
      context: { resetReason: 'WATCHDOG', programCounter: '0x400d1234' },
    });
  });

  it('registers releases and dispatches organization-scoped firmware deployments', async () => {
    const release = {
      id: '44444444-4444-4444-8444-444444444444',
      version: '1.1.0',
      deviceModel: 'Edge Sensor',
      hardwareRevision: 'rev-b',
      artifactUrl: 'https://firmware.example.test/edge-sensor/1.1.0.bin',
      sha256: 'a'.repeat(64),
      signature: `${'A'.repeat(86)}==`,
      signingKeyId: 'release-primary',
      signatureVerifiedAt: '2026-09-05T00:00:00.000Z',
      createdBy: 'operator-1',
      createdAt: '2026-09-05T00:00:00.000Z',
    } as const;
    const deployment = {
      id: '55555555-5555-4555-8555-555555555555',
      deviceId: device.id,
      releaseId: release.id,
      releaseVersion: release.version,
      status: 'DISPATCHED',
      progressPercent: 0,
      previousVersion: '1.0.0',
      requestedBy: 'operator-1',
      requestedAt: '2026-09-05T00:01:00.000Z',
      updatedAt: '2026-09-05T00:01:00.000Z',
    } as const;
    const transport = new FakeTransport([[release], release, [deployment], deployment]);
    const repository = new CoreApiDeviceRepository(transport);

    await repository.listFirmwareReleases();
    const firmwareFile = new File(['managed firmware'], 'edge-sensor-1.1.0.bin', {
      type: 'application/octet-stream',
    });
    await repository.createFirmwareRelease({
      version: release.version,
      deviceModel: release.deviceModel,
      hardwareRevision: release.hardwareRevision,
      file: firmwareFile,
    });
    await repository.listFirmwareDeployments('device/id with space');
    const started = await repository.startFirmwareDeployment('device/id with space', release.id);

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/device-management/firmware-releases',
      '/device-management/firmware-releases/upload',
      '/device-management/devices/device%2Fid%20with%20space/firmware-deployments',
      '/device-management/devices/device%2Fid%20with%20space/firmware-deployments',
    ]);
    const uploadBody = transport.requests[1]?.init?.body;
    expect(uploadBody).toBeInstanceOf(FormData);
    expect((uploadBody as FormData).get('file')).toMatchObject({
      name: firmwareFile.name,
      size: firmwareFile.size,
      type: firmwareFile.type,
    });
    expect((uploadBody as FormData).get('version')).toBe(release.version);
    expect((uploadBody as FormData).has('signingKeyId')).toBe(false);
    expect((uploadBody as FormData).has('signature')).toBe(false);
    expect(JSON.parse(String(transport.requests[3]?.init?.body))).toEqual({
      releaseId: release.id,
    });
    expect(started.status).toBe('DISPATCHED');
  });

  it('lists and pushes versioned device configuration', async () => {
    const configuration = {
      id: '66666666-6666-4666-8666-666666666666',
      deviceId: device.id,
      version: 4,
      status: 'DISPATCHED',
      parameters: { samplingRateHz: 2, reportingIntervalSeconds: 30 },
      restoreFactoryDefaults: false,
      previousAppliedVersion: 2,
      requestedBy: 'operator-1',
      requestedAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    } as const;
    const transport = new FakeTransport([[configuration], configuration]);
    const repository = new CoreApiDeviceRepository(transport);

    const listed = await repository.listConfigurations('device/id with space');
    const pushed = await repository.pushConfiguration({
      deviceId: 'device/id with space',
      parameters: configuration.parameters,
    });

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/device-management/devices/device%2Fid%20with%20space/configurations',
      '/device-management/devices/device%2Fid%20with%20space/configurations',
    ]);
    expect(JSON.parse(String(transport.requests[1]?.init?.body))).toEqual({
      parameters: configuration.parameters,
    });
    expect(listed[0]?.version).toBe(4);
    expect(pushed.status).toBe('DISPATCHED');
  });

  it('creates, lists, and deploys immutable configuration templates', async () => {
    const template = {
      id: '99999999-9999-4999-8999-999999999999',
      name: 'Factory sensors',
      version: 2,
      parameters: { samplingRateHz: 2, logLevel: 'WARNING' },
      createdBy: 'operator-1',
      createdAt: '2026-09-06T12:00:00.000Z',
    } as const;
    const configuration = {
      id: '66666666-6666-4666-8666-666666666666',
      deviceId: device.id,
      version: 4,
      status: 'DISPATCHED',
      parameters: template.parameters,
      restoreFactoryDefaults: false,
      previousAppliedVersion: 2,
      requestedBy: 'operator-1',
      requestedAt: '2026-09-06T12:01:00.000Z',
      updatedAt: '2026-09-06T12:01:00.000Z',
    } as const;
    const deployment = {
      template,
      targetCount: 1,
      configurations: [configuration],
      failures: [],
    } as const;
    const transport = new FakeTransport([template, [template], deployment]);
    const repository = new CoreApiDeviceRepository(transport);

    const created = await repository.createConfigurationTemplate({
      name: template.name,
      parameters: template.parameters,
    });
    const listed = await repository.listConfigurationTemplates();
    const deployed = await repository.deployConfigurationTemplate({
      templateId: template.id,
      deploymentSite: 'Factory 2',
      deviceType: 'SENSOR',
    });

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/device-management/device-configuration-templates',
      '/device-management/device-configuration-templates',
      `/device-management/device-configuration-templates/${template.id}/deployments`,
    ]);
    expect(JSON.parse(String(transport.requests[2]?.init?.body))).toEqual({
      deploymentSite: 'Factory 2',
      deviceType: 'SENSOR',
    });
    expect(created.parameters).toEqual(template.parameters);
    expect(listed[0]?.version).toBe(2);
    expect(deployed).toMatchObject({ targetCount: 1, failures: [] });
  });

  it('creates, lists, and transitions staged firmware campaigns', async () => {
    const releaseId = '44444444-4444-4444-8444-444444444444';
    const campaign = {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Factory 2 rollout',
      releaseId,
      releaseVersion: '1.1.0',
      status: 'DRAFT',
      canarySize: 1,
      batchSize: 10,
      requestedBy: 'operator-1',
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      targets: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          deviceId: device.id,
          deviceName: device.name,
          batchNumber: 0,
          status: 'PENDING',
          progressPercent: 0,
          updatedAt: '2026-09-06T00:00:00.000Z',
        },
      ],
    } as const;
    const running = { ...campaign, status: 'RUNNING', currentBatch: 0 } as const;
    const transport = new FakeTransport([campaign, [campaign], running]);
    const repository = new CoreApiDeviceRepository(transport);

    const created = await repository.createFirmwareCampaign({
      name: campaign.name,
      releaseId,
      deviceIds: [device.id],
      canarySize: 1,
      batchSize: 10,
    });
    const listed = await repository.listFirmwareCampaigns();
    const started = await repository.transitionFirmwareCampaign(campaign.id, 'start');

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/device-management/firmware-campaigns',
      '/device-management/firmware-campaigns',
      `/device-management/firmware-campaigns/${campaign.id}/start`,
    ]);
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      name: campaign.name,
      releaseId,
      deviceIds: [device.id],
      canarySize: 1,
      batchSize: 10,
    });
    expect(created.targets[0]?.status).toBe('PENDING');
    expect(listed).toHaveLength(1);
    expect(started).toMatchObject({ status: 'RUNNING', currentBatch: 0 });
  });
});
