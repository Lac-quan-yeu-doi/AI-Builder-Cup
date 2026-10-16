import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { FirmwareCampaignUseCases } from '@application/device-management/firmware-campaign.use-cases';
import type { IDeviceRepository } from '@application/device-management/interfaces/i-device.repository';
import type { IFirmwareArtifactStore } from '@application/device-management/interfaces/i-firmware-artifact-store';
import type { IFirmwareCampaignRepository } from '@application/device-management/interfaces/i-firmware-campaign.repository';
import type { IFirmwareCommandPublisher } from '@application/device-management/interfaces/i-firmware-command-publisher';
import type { IFirmwareRepository } from '@application/device-management/interfaces/i-firmware.repository';
import type { DeviceRecord } from '@domain/device-management/models/device';
import type {
  FirmwareCampaign,
  FirmwareCampaignRecord,
  FirmwareCommand,
  FirmwareDeployment,
  FirmwareDeploymentRecord,
  FirmwareRelease,
} from '@domain/device-management/models/firmware';

const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const RELEASE_ID = '40000000-0000-4000-8000-000000000001';

describe('FirmwareCampaignUseCases', () => {
  it('creates deterministic canary and progressive batches', async () => {
    const fixture = createFixture();

    const campaign = await fixture.run(() =>
      fixture.useCases.create({
        name: 'Factory 2 rollout',
        releaseId: RELEASE_ID,
        deviceIds: ['device-1', 'device-2', 'device-3', 'device-4'],
        canarySize: 1,
        batchSize: 2,
      }),
    );

    expect(campaign.status).toBe('DRAFT');
    expect(campaign.targets.map((target) => target.batchNumber)).toEqual([0, 1, 1, 2]);
  });

  it('dispatches the canary first and advances only after each successful batch', async () => {
    const fixture = createFixture();
    const created = await fixture.run(() =>
      fixture.useCases.create({
        name: 'Progressive rollout',
        releaseId: RELEASE_ID,
        deviceIds: ['device-1', 'device-2', 'device-3'],
        canarySize: 1,
        batchSize: 2,
      }),
    );

    const canary = await fixture.run(() => fixture.useCases.start(created.id));
    expect(canary.currentBatch).toBe(0);
    expect(fixture.commands.map((command) => command.deviceId)).toEqual(['device-1']);

    fixture.succeedCurrentBatch(0);
    const progressive = await fixture.run(() => fixture.useCases.advance(created.id));
    expect(progressive.currentBatch).toBe(1);
    expect(fixture.commands.map((command) => command.deviceId)).toEqual([
      'device-1',
      'device-2',
      'device-3',
    ]);

    fixture.succeedCurrentBatch(1);
    const completed = await fixture.run(() => fixture.useCases.advance(created.id));
    expect(completed.status).toBe('COMPLETED');
  });

  it('does not advance while the current batch is still active', async () => {
    const fixture = createFixture();
    const created = await fixture.run(() =>
      fixture.useCases.create({
        name: 'Guarded rollout',
        releaseId: RELEASE_ID,
        deviceIds: ['device-1', 'device-2'],
        canarySize: 1,
        batchSize: 1,
      }),
    );
    await fixture.run(() => fixture.useCases.start(created.id));

    await expect(fixture.run(() => fixture.useCases.advance(created.id))).rejects.toMatchObject({
      code: 'DEVICE_STATE_CONFLICT',
    });
    expect(fixture.commands).toHaveLength(1);
  });

  it('recovers a pending current target left by an interrupted dispatch', async () => {
    const fixture = createFixture();
    const created = await fixture.run(() =>
      fixture.useCases.create({
        name: 'Recoverable rollout',
        releaseId: RELEASE_ID,
        deviceIds: ['device-1'],
        canarySize: 1,
        batchSize: 1,
      }),
    );
    fixture.setCampaignRunning(0);

    const recovered = await fixture.run(() => fixture.useCases.advance(created.id));

    expect(recovered.targets[0]?.status).toBe('DISPATCHED');
    expect(fixture.commands).toHaveLength(1);
  });

  it('aborts pending targets without pretending to retract an active command', async () => {
    const fixture = createFixture();
    const created = await fixture.run(() =>
      fixture.useCases.create({
        name: 'Abortable rollout',
        releaseId: RELEASE_ID,
        deviceIds: ['device-1', 'device-2', 'device-3'],
        canarySize: 1,
        batchSize: 1,
      }),
    );
    await fixture.run(() => fixture.useCases.start(created.id));

    const aborted = await fixture.run(() => fixture.useCases.abort(created.id));

    expect(aborted.status).toBe('ABORTED');
    expect(aborted.targets.map((target) => target.status)).toEqual([
      'DISPATCHED',
      'CANCELLED',
      'CANCELLED',
    ]);
    expect(fixture.commands).toHaveLength(1);
  });

  it('does not resume a campaign paused by a dispatch failure', async () => {
    const fixture = createFixture({ publishError: true });
    const created = await fixture.run(() =>
      fixture.useCases.create({
        name: 'Failed rollout',
        releaseId: RELEASE_ID,
        deviceIds: ['device-1', 'device-2'],
        canarySize: 1,
        batchSize: 1,
      }),
    );

    const paused = await fixture.run(() => fixture.useCases.start(created.id));

    expect(paused).toMatchObject({ status: 'PAUSED' });
    expect(paused.error).toBeDefined();
    await expect(fixture.run(() => fixture.useCases.resume(created.id))).rejects.toMatchObject({
      code: 'DEVICE_STATE_CONFLICT',
    });
  });
});

function createFixture(options: { readonly publishError?: boolean } = {}) {
  const contexts = new AuthenticatedContextStore();
  const deployments: FirmwareDeploymentRecord[] = [];
  const commands: Array<Readonly<{ deviceId: string; command: FirmwareCommand }>> = [];
  let campaign: FirmwareCampaignRecord | undefined;
  let sequence = 0;
  const campaignRepository: IFirmwareCampaignRepository = {
    createCampaign: async (value) => {
      campaign = value;
      return materialize(value, deployments);
    },
    listCampaigns: async () => (campaign === undefined ? [] : [materialize(campaign, deployments)]),
    findCampaign: async (id) =>
      campaign?.id === id ? materialize(campaign, deployments) : undefined,
    transitionCampaign: async (
      id,
      expectedStatus,
      expectedCurrentBatch,
      status,
      currentBatch,
      updatedAt,
      error,
    ) => {
      if (
        campaign?.id !== id ||
        campaign.status !== expectedStatus ||
        (campaign.currentBatch ?? null) !== expectedCurrentBatch
      ) {
        return undefined;
      }
      campaign = {
        ...campaign,
        status,
        ...(currentBatch === undefined ? {} : { currentBatch }),
        updatedAt,
        ...(error === undefined ? {} : { error }),
      };
      return materialize(campaign, deployments);
    },
    linkCampaignDeployment: async (targetId, deploymentId, updatedAt) => {
      if (campaign === undefined) return;
      campaign = {
        ...campaign,
        targets: campaign.targets.map((target) =>
          target.id === targetId ? { ...target, deploymentId, updatedAt } : target,
        ),
      };
    },
    cancelPendingCampaignTargets: async (_campaignId, updatedAt) => {
      if (campaign === undefined) return;
      campaign = {
        ...campaign,
        targets: campaign.targets.map((target) =>
          target.deploymentId === undefined
            ? { ...target, status: 'CANCELLED', updatedAt }
            : target,
        ),
      };
    },
  };
  const firmwareRepository: IFirmwareRepository = {
    createRelease: async (value) => value,
    listReleases: async () => [release()],
    findRelease: async (id) => (id === RELEASE_ID ? release() : undefined),
    createDeployment: async (value) => {
      deployments.push(value);
      return withoutToken(value);
    },
    listDeployments: async (deviceId) =>
      deployments.filter((deployment) => deployment.deviceId === deviceId).map(withoutToken),
    findDeployment: async (id) => deployments.find((deployment) => deployment.id === id),
    findRebootingTimedOut: async () => [],
    confirmRebootedDeployment: async () => undefined,
    updateDeployment: async (id, expectedStatus, status, progressPercent, updatedAt, error) => {
      const index = deployments.findIndex((deployment) => deployment.id === id);
      const current = deployments[index];
      if (current === undefined || current.status !== expectedStatus) return undefined;
      deployments[index] = {
        ...current,
        status,
        progressPercent,
        updatedAt,
        ...(error === undefined ? {} : { error }),
      };
      return withoutToken(deployments[index]);
    },
  };
  const deviceRepository = {
    findById: async (id: string) => device(id),
  } as unknown as IDeviceRepository;
  const publisher: IFirmwareCommandPublisher = {
    publish: async (target, command) => {
      commands.push({ deviceId: target.id, command });
      if (options.publishError === true) throw new Error('Broker unavailable');
    },
  };
  const artifacts: IFirmwareArtifactStore = {
    put: async () => {
      throw new Error('not used');
    },
    remove: async () => undefined,
    createDownloadUrl: async () => 'https://firmware.example.test/release.bin',
  };
  const useCases = new FirmwareCampaignUseCases(
    campaignRepository,
    firmwareRepository,
    deviceRepository,
    publisher,
    artifacts,
    { now: () => new Date('2026-09-06T08:00:00.000Z') },
    { next: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` },
    { generate: () => `event-token-${sequence}` },
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
  const succeedCurrentBatch = (batch: number): void => {
    if (campaign === undefined) return;
    const ids = new Set(
      campaign.targets
        .filter((target) => target.batchNumber === batch)
        .map((target) => target.deploymentId),
    );
    for (let index = 0; index < deployments.length; index += 1) {
      const current = deployments[index];
      if (current !== undefined && ids.has(current.id)) {
        deployments[index] = { ...current, status: 'SUCCEEDED', progressPercent: 100 };
      }
    }
  };
  const setCampaignRunning = (batch: number): void => {
    if (campaign === undefined) return;
    campaign = { ...campaign, status: 'RUNNING', currentBatch: batch };
  };
  return { useCases, commands, run, succeedCurrentBatch, setCampaignRunning };
}

function materialize(
  campaign: FirmwareCampaignRecord,
  deployments: readonly FirmwareDeploymentRecord[],
): FirmwareCampaign {
  return {
    ...campaign,
    targets: campaign.targets.map((target) => {
      if (target.status === 'CANCELLED') return target;
      const deployment = deployments.find((candidate) => candidate.id === target.deploymentId);
      return deployment === undefined
        ? target
        : {
            ...target,
            status: deployment.status,
            progressPercent: deployment.progressPercent,
            ...(deployment.error === undefined ? {} : { error: deployment.error }),
          };
    }),
  };
}

function release(): FirmwareRelease {
  return {
    id: RELEASE_ID,
    organizationId: ORGANIZATION_ID,
    version: '2.0.0',
    deviceModel: 'Edge Sensor',
    artifactUrl: 'https://firmware.example.test/release.bin',
    artifactSizeBytes: 4096,
    sha256: 'a'.repeat(64),
    signature: `${'A'.repeat(86)}==`,
    signingKeyId: 'release-primary',
    signaturePayload:
      '{"schemaVersion":1,"version":"1.2.0","deviceModel":"Edge Sensor","hardwareRevision":"rev-b","artifactSizeBytes":4096,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
    signatureVerifiedAt: '2026-09-06T07:00:00.000Z',
    createdBy: 'owner-1',
    createdAt: '2026-09-06T07:00:00.000Z',
  };
}

function device(id: string): DeviceRecord {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    publicKey: `dev_${id}`,
    adapterId: '60000000-0000-4000-8000-000000000001',
    adapterKey: 'adp_key',
    tenantId: '70000000-0000-4000-8000-000000000001',
    tenantStorageKey: 'tnt_key',
    externalDeviceId: id,
    deviceType: 'SENSOR',
    name: id,
    model: 'Edge Sensor',
    hardwareRevision: 'rev-a',
    currentFirmwareVersion: '1.0.0',
    lifecycleState: 'COMMISSIONED',
    brokerUrl: 'mqtt://emqx:1883',
    topics: {
      telemetry: `devices/${id}/telemetry`,
      firmwareEvents: `devices/${id}/events/firmware`,
      firmwareCommands: `devices/${id}/commands/firmware`,
    },
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
    createdAt: '2026-09-06T07:00:00.000Z',
    updatedAt: '2026-09-06T07:00:00.000Z',
  };
}

function withoutToken(record: FirmwareDeploymentRecord): FirmwareDeployment {
  const { eventTokenHash, ...deployment } = record;
  void eventTokenHash;
  return deployment;
}
