import { backgroundContexts } from '../administration/background-principal.fixture';
import { FirmwareUseCases } from '@application/device-management/firmware.use-cases';
import type { IFirmwareCommandPublisher } from '@application/device-management/interfaces/i-firmware-command-publisher';
import type { IFirmwareArtifactStore } from '@application/device-management/interfaces/i-firmware-artifact-store';
import type { IFirmwareSigner } from '@application/device-management/interfaces/i-firmware-signer';
import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { DeviceRecord } from '@domain/device-management/models/device';
import type {
  FirmwareDeployment,
  FirmwareDeploymentRecord,
  FirmwareCommand,
  FirmwareRelease,
} from '@domain/device-management/models/firmware';

const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const DEVICE_ID = '30000000-0000-4000-8000-000000000001';
const RELEASE_ID = '40000000-0000-4000-8000-000000000001';
const DEPLOYMENT_ID = '50000000-0000-4000-8000-000000000001';
const SIGNATURE = `${'A'.repeat(86)}==`;

describe('FirmwareUseCases', () => {
  it('stores an uploaded artifact and derives its checksum before creating a release', async () => {
    const fixture = createFixture();

    const created = await fixture.run(() =>
      fixture.useCases.uploadRelease({
        version: '1.3.0',
        deviceModel: 'Edge Sensor',
        hardwareRevision: 'rev-b',
        fileName: 'edge-sensor-1.3.0.bin',
        contentType: 'application/octet-stream',
        bytes: new TextEncoder().encode('managed firmware bytes'),
      }),
    );

    expect(created).toMatchObject({
      version: '1.3.0',
      artifactStorageProvider: 'MINIO',
      artifactFileName: 'edge-sensor-1.3.0.bin',
      artifactSizeBytes: 22,
      signingKeyId: 'release-primary',
      signatureVerifiedAt: '2026-09-05T08:00:00.000Z',
      signaturePayload:
        '{"schemaVersion":1,"version":"1.3.0","deviceModel":"Edge Sensor","hardwareRevision":"rev-b","artifactSizeBytes":22,"sha256":"61ba01c250a1cbdba33a4c3dd294c05eb7dcc845b92d65317f955f855e254043"}',
    });
    expect(created.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(fixture.storedArtifacts).toHaveLength(1);
  });

  it('removes an uploaded artifact when managed signing fails', async () => {
    const fixture = createFixture({ signingError: new Error('KMS unavailable') });

    await expect(
      fixture.run(() =>
        fixture.useCases.uploadRelease({
          version: '1.3.0',
          deviceModel: 'Edge Sensor',
          fileName: 'edge-sensor-1.3.0.bin',
          contentType: 'application/octet-stream',
          bytes: new TextEncoder().encode('managed firmware bytes'),
        }),
      ),
    ).rejects.toThrow('KMS unavailable');
    expect(fixture.storedArtifacts).toHaveLength(0);
  });

  it('dispatches only a compatible release and never exposes the event token', async () => {
    const fixture = createFixture();

    const deployment = await fixture.run(() =>
      fixture.useCases.startDeployment(DEVICE_ID, { releaseId: RELEASE_ID }),
    );

    expect(deployment).toMatchObject({ status: 'DISPATCHED', releaseVersion: '1.2.0' });
    expect(deployment).not.toHaveProperty('eventTokenHash');
    expect(fixture.commands).toHaveLength(1);
    expect(fixture.commands[0]).toMatchObject({
      deviceId: DEVICE_ID,
      command: {
        deploymentId: DEPLOYMENT_ID,
        version: '1.2.0',
        artifactSizeBytes: 4096,
        sha256: 'a'.repeat(64),
        signingKeyId: 'release-primary',
        download: { resumable: true, chunkSizeBytes: 262144 },
        boot: { strategy: 'A_B', confirmationTimeoutSeconds: 300 },
      },
    });
    expect(fixture.commands[0]?.command).toHaveProperty('eventToken', 'device-event-secret');
  });

  it('waits in rebooting until a separate authenticated heartbeat confirms success', async () => {
    const fixture = createFixture();
    await fixture.run(() => fixture.useCases.startDeployment(DEVICE_ID, { releaseId: RELEASE_ID }));

    for (const [status, progress] of [
      ['ACCEPTED', 0],
      ['DOWNLOADING', 25],
      ['VERIFYING', 60],
      ['INSTALLING', 80],
      ['REBOOTING', 95],
    ] as const) {
      await fixture.useCases.reportEvent(DEPLOYMENT_ID, {
        token: 'device-event-secret',
        status,
        progressPercent: progress,
      });
    }

    expect(fixture.checkIns).toEqual([]);
    expect(fixture.deployments[0]).toMatchObject({ status: 'REBOOTING', progressPercent: 95 });
  });

  it('rejects an event with the wrong one-time token', async () => {
    const fixture = createFixture();
    await fixture.run(() => fixture.useCases.startDeployment(DEVICE_ID, { releaseId: RELEASE_ID }));

    await expect(
      fixture.useCases.reportEvent(DEPLOYMENT_ID, {
        token: 'wrong-token',
        status: 'ACCEPTED',
      }),
    ).rejects.toMatchObject({ code: 'DEVICE_NOT_FOUND' });
  });

  it('marks a deployment failed when command dispatch fails', async () => {
    const fixture = createFixture({ publishError: new Error('broker unavailable') });

    await expect(
      fixture.run(() => fixture.useCases.startDeployment(DEVICE_ID, { releaseId: RELEASE_ID })),
    ).rejects.toMatchObject({ code: 'DEVICE_STATE_CONFLICT' });
    expect(fixture.deployments[0]).toMatchObject({
      status: 'FAILED',
      error: 'broker unavailable',
    });
  });

  it('rejects a second active deployment for the same device', async () => {
    const fixture = createFixture();
    await fixture.run(() => fixture.useCases.startDeployment(DEVICE_ID, { releaseId: RELEASE_ID }));

    await expect(
      fixture.run(() => fixture.useCases.startDeployment(DEVICE_ID, { releaseId: RELEASE_ID })),
    ).rejects.toMatchObject({ code: 'DEVICE_STATE_CONFLICT' });
    expect(fixture.commands).toHaveLength(1);
  });
});

function createFixture(
  options: { readonly publishError?: Error; readonly signingError?: Error } = {},
) {
  const contexts = backgroundContexts();
  const releases: FirmwareRelease[] = [release()];
  const deployments: FirmwareDeploymentRecord[] = [];
  const commands: Array<Readonly<{ deviceId: string; command: FirmwareCommand }>> = [];
  const checkIns: Array<Readonly<{ id: string; firmware?: string }>> = [];
  const storedArtifacts: Array<Readonly<{ fileName: string; sha256: string }>> = [];
  const repository: IFirmwareRepository = {
    createRelease: async (value) => value,
    listReleases: async () => releases,
    findRelease: async (id) => releases.find((value) => value.id === id),
    createDeployment: async (value) => {
      if (
        deployments.some(
          (deployment) =>
            deployment.deviceId === value.deviceId &&
            !['SUCCEEDED', 'FAILED', 'ROLLED_BACK', 'CANCELLED'].includes(deployment.status),
        )
      ) {
        return 'ACTIVE_DEPLOYMENT_CONFLICT';
      }
      deployments.push(value);
      return withoutToken(value);
    },
    listDeployments: async (deviceId) =>
      deployments.filter((value) => value.deviceId === deviceId).map(withoutToken),
    findDeployment: async (id) => deployments.find((value) => value.id === id),
    findRebootingTimedOut: async () => [],
    confirmRebootedDeployment: async (deviceId, releaseVersion, confirmedAt) => {
      const index = deployments.findIndex(
        (value) =>
          value.deviceId === deviceId &&
          value.releaseVersion === releaseVersion &&
          value.status === 'REBOOTING',
      );
      if (index < 0) return undefined;
      const current = deployments[index]!;
      deployments[index] = {
        ...current,
        status: 'SUCCEEDED',
        progressPercent: 100,
        finishedAt: confirmedAt,
        updatedAt: confirmedAt,
      };
      return withoutToken(deployments[index]);
    },
    updateDeployment: async (id, expectedStatus, status, progressPercent, updatedAt, error) => {
      const index = deployments.findIndex((value) => value.id === id);
      if (index < 0) return undefined;
      const current = deployments[index];
      if (current === undefined || current.status !== expectedStatus) return undefined;
      const updated: FirmwareDeploymentRecord = {
        ...current,
        status,
        progressPercent,
        updatedAt,
        ...(error === undefined ? {} : { error }),
      };
      deployments[index] = updated;
      return withoutToken(updated);
    },
  };
  const deviceRepository = {
    findById: async (id: string) => (id === DEVICE_ID ? device() : undefined),
    recordCheckIn: async (
      id: string,
      _observedAt: string,
      _contactDeadlineAt: string,
      firmware?: string,
    ) => {
      checkIns.push({ id, ...(firmware === undefined ? {} : { firmware }) });
      return device(firmware);
    },
    clearActiveLossOfContactAlert: async () => undefined,
  } as unknown as IDeviceRepository;
  const publisher: IFirmwareCommandPublisher = {
    publish: async (target, command) => {
      if (options.publishError !== undefined) throw options.publishError;
      commands.push({ deviceId: target.id, command });
    },
  };
  const artifacts: IFirmwareArtifactStore = {
    put: async (input) => {
      storedArtifacts.push({ fileName: input.fileName, sha256: input.sha256 });
      return {
        storageProvider: 'MINIO',
        bucket: 'celesnity-artifacts',
        objectKey: `firmware/${input.organizationId}/${input.releaseId}/artifact`,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
      };
    },
    remove: async () => {
      storedArtifacts.pop();
    },
    createDownloadUrl: async () => 'http://minio:9000/signed-firmware-artifact',
  };
  const signer: IFirmwareSigner = {
    sign: async () => {
      if (options.signingError !== undefined) throw options.signingError;
      return { algorithm: 'ED25519', signingKeyId: 'release-primary', signature: SIGNATURE };
    },
  };
  let generated = 0;
  const useCases = new FirmwareUseCases(
    repository,
    deviceRepository,
    publisher,
    artifacts,
    signer,
    { now: () => new Date('2026-09-05T08:00:00.000Z') },
    { next: () => (generated++ === 0 ? DEPLOYMENT_ID : RELEASE_ID) },
    { generate: () => 'device-event-secret' },
    contexts,
    300,
  );
  const run = <T>(work: () => T): T =>
    contexts.run(
      {
        identityId: 'owner-1',
        subject: 'owner-subject',
        identityTenantId: 'tenant-auth',
        organizationId: ORGANIZATION_ID,
        organizationStatus: 'ACTIVE',
        mfaRequired: false,
        membershipId: 'membership-1',
        role: 'ORG_OWNER',
        authenticationTime: 0,
        mfaVerified: true,
      },
      work,
    );
  return { useCases, deployments, commands, checkIns, storedArtifacts, run };
}

function release(): FirmwareRelease {
  return {
    id: RELEASE_ID,
    organizationId: ORGANIZATION_ID,
    version: '1.2.0',
    deviceModel: 'Edge Sensor',
    hardwareRevision: 'rev-b',
    artifactUrl: 'https://firmware.example.com/edge-sensor-1.2.0.bin',
    artifactSizeBytes: 4096,
    sha256: 'a'.repeat(64),
    signature: SIGNATURE,
    signingKeyId: 'release-primary',
    signaturePayload:
      '{"schemaVersion":1,"version":"1.2.0","deviceModel":"Edge Sensor","hardwareRevision":"rev-b","artifactSizeBytes":4096,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
    signatureVerifiedAt: '2026-09-05T07:59:00.000Z',
    createdBy: 'owner-1',
    createdAt: '2026-09-05T08:00:00.000Z',
  };
}

function device(firmware = '1.0.0'): DeviceRecord {
  return {
    id: DEVICE_ID,
    organizationId: ORGANIZATION_ID,
    publicKey: 'dev_key',
    adapterId: '60000000-0000-4000-8000-000000000001',
    adapterKey: 'adp_key',
    tenantId: '70000000-0000-4000-8000-000000000001',
    tenantStorageKey: 'tnt_key',
    externalDeviceId: 'sensor-1',
    deviceType: 'GATEWAY',
    name: 'Sensor',
    model: 'Edge Sensor',
    hardwareRevision: 'rev-b',
    currentFirmwareVersion: firmware,
    lifecycleState: 'COMMISSIONED',
    brokerUrl: 'mqtt://emqx:1883',
    topics: { telemetry: 'telemetry', firmwareEvents: 'events', firmwareCommands: 'commands' },
    qos: 1,
    credentials: {
      ciphertext: 'ciphertext',
      initializationVector: 'iv',
      authenticationTag: 'tag',
      keyVersion: 'v1',
    },
    desiredState: 'ACTIVE',
    status: 'ACTIVE',
    generation: 1,
    observedGeneration: 1,
    desiredConfigurationVersion: 0,
    appliedConfigurationVersion: 0,
    reportedConfigurationVersion: 0,
    expectedCheckInIntervalSeconds: 60,
    missedCheckInThreshold: 3,
    contactStatus: 'ONLINE',
    createdAt: '2026-09-05T07:00:00.000Z',
    updatedAt: '2026-09-05T07:00:00.000Z',
  };
}

function withoutToken(record: FirmwareDeploymentRecord): FirmwareDeployment {
  const { eventTokenHash, ...deployment } = record;
  void eventTokenHash;
  return deployment;
}
