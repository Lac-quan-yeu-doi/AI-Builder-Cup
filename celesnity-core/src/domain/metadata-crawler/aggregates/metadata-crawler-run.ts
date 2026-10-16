import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import { MetadataCrawlerMessage } from '@domain/metadata-crawler/errors/metadata-crawler.messages';
import {
  copyCounters,
  copyJson,
  isActiveRunStatus,
  MetadataCrawlerRunStatus,
  type MetadataCrawlerRunCounters,
  type MetadataCrawlerRunFailure,
  type MetadataCrawlerRunStatusValue,
  type MetadataCrawlerTriggerTypeValue,
  uuid,
  validDate,
  type MetadataCrawlerDiscoveryConfig,
} from '@domain/metadata-crawler/value-objects/metadata-crawler-values';

export interface MetadataCrawlerRunState {
  readonly id: string;
  readonly organizationId?: string;
  readonly crawlerId: string;
  readonly triggerType: MetadataCrawlerTriggerTypeValue;
  readonly status: MetadataCrawlerRunStatusValue;
  readonly deduplicationKey: string;
  readonly scheduledFor?: Date;
  readonly queuedAt: Date;
  readonly claimedAt?: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly heartbeatAt?: Date;
  readonly leaseExpiresAt?: Date;
  readonly workerId?: string;
  readonly attempt: number;
  readonly crawlerRevision: number;
  readonly connectorTypeSnapshot: string;
  readonly safeConfigSnapshot: MetadataCrawlerDiscoveryConfig;
  readonly counters: MetadataCrawlerRunCounters;
  readonly failure?: MetadataCrawlerRunFailure;
  readonly logObjectKey?: string;
}

export interface QueueMetadataCrawlerRunInput {
  readonly id: string;
  readonly organizationId?: string;
  readonly crawlerId: string;
  readonly triggerType: MetadataCrawlerTriggerTypeValue;
  readonly deduplicationKey: string;
  readonly scheduledFor?: Date;
  readonly queuedAt: Date;
  readonly crawlerRevision: number;
  readonly connectorTypeSnapshot: string;
  readonly safeConfigSnapshot: MetadataCrawlerDiscoveryConfig;
}

export interface StartMetadataCrawlerRunInput {
  readonly workerId: string;
  readonly leaseExpiresAt: Date;
}

export class MetadataCrawlerRun {
  private readonly idValue: string;
  private readonly organizationIdValue: string | undefined;
  private readonly crawlerIdValue: string;
  private readonly triggerTypeValue: MetadataCrawlerTriggerTypeValue;
  private statusValue: MetadataCrawlerRunStatusValue;
  private readonly deduplicationKeyValue: string;
  private scheduledForValue: Date | undefined;
  private queuedAtValue: Date;
  private claimedAtValue: Date | undefined;
  private startedAtValue: Date | undefined;
  private finishedAtValue: Date | undefined;
  private heartbeatAtValue: Date | undefined;
  private leaseExpiresAtValue: Date | undefined;
  private workerIdValue: string | undefined;
  private attemptValue: number;
  private readonly crawlerRevisionValue: number;
  private readonly connectorTypeSnapshotValue: string;
  private readonly safeConfigSnapshotValue: MetadataCrawlerDiscoveryConfig;
  private countersValue: MetadataCrawlerRunCounters;
  private failureValue: MetadataCrawlerRunFailure | undefined;
  private logObjectKeyValue: string | undefined;

  private constructor(state: MetadataCrawlerRunState) {
    this.idValue = uuid('Metadata crawler run ID', state.id, MetadataCrawlerMessage.invalidRunId);
    this.organizationIdValue =
      state.organizationId === undefined
        ? undefined
        : uuid('Organization ID', state.organizationId);
    this.crawlerIdValue = uuid('Metadata crawler ID', state.crawlerId);
    this.triggerTypeValue = state.triggerType;
    this.statusValue = state.status;
    this.deduplicationKeyValue = nonEmpty(state.deduplicationKey, 255);
    this.scheduledForValue = optionalDate('Scheduled time', state.scheduledFor);
    this.queuedAtValue = validDate('Queue time', state.queuedAt);
    this.claimedAtValue = optionalDate('Claim time', state.claimedAt);
    this.startedAtValue = optionalDate('Start time', state.startedAt);
    this.finishedAtValue = optionalDate('Finish time', state.finishedAt);
    this.heartbeatAtValue = optionalDate('Heartbeat time', state.heartbeatAt);
    this.leaseExpiresAtValue = optionalDate('Lease expiry', state.leaseExpiresAt);
    this.workerIdValue = state.workerId === undefined ? undefined : nonEmpty(state.workerId, 160);
    this.attemptValue = nonNegativeInteger('Attempt', state.attempt);
    this.crawlerRevisionValue = positiveInteger('Crawler revision', state.crawlerRevision);
    this.connectorTypeSnapshotValue = nonEmpty(state.connectorTypeSnapshot, 50);
    this.safeConfigSnapshotValue = copyJson(state.safeConfigSnapshot);
    this.countersValue = copyCounters(state.counters);
    this.failureValue = state.failure === undefined ? undefined : failure(state.failure);
    this.logObjectKeyValue =
      state.logObjectKey === undefined ? undefined : nonEmpty(state.logObjectKey, 1000);
  }

  public static queue(input: QueueMetadataCrawlerRunInput): MetadataCrawlerRun {
    const queuedAt = validDate('Queue time', input.queuedAt);
    return new MetadataCrawlerRun({
      id: input.id,
      organizationId: input.organizationId,
      crawlerId: input.crawlerId,
      triggerType: input.triggerType,
      status: MetadataCrawlerRunStatus.QUEUED,
      deduplicationKey: input.deduplicationKey,
      scheduledFor: input.scheduledFor,
      queuedAt,
      attempt: 0,
      crawlerRevision: input.crawlerRevision,
      connectorTypeSnapshot: input.connectorTypeSnapshot,
      safeConfigSnapshot: input.safeConfigSnapshot,
      counters: emptyCounters(),
    });
  }

  public static rehydrate(state: MetadataCrawlerRunState): MetadataCrawlerRun {
    return new MetadataCrawlerRun(state);
  }

  public get id(): string {
    return this.idValue;
  }

  public get organizationId(): string | undefined {
    return this.organizationIdValue;
  }

  public get crawlerId(): string {
    return this.crawlerIdValue;
  }

  public get triggerType(): MetadataCrawlerTriggerTypeValue {
    return this.triggerTypeValue;
  }

  public get status(): MetadataCrawlerRunStatusValue {
    return this.statusValue;
  }

  public get deduplicationKey(): string {
    return this.deduplicationKeyValue;
  }

  public get scheduledFor(): Date | undefined {
    return copyDate(this.scheduledForValue);
  }

  public get queuedAt(): Date {
    return new Date(this.queuedAtValue.getTime());
  }

  public get claimedAt(): Date | undefined {
    return copyDate(this.claimedAtValue);
  }

  public get startedAt(): Date | undefined {
    return copyDate(this.startedAtValue);
  }

  public get finishedAt(): Date | undefined {
    return copyDate(this.finishedAtValue);
  }

  public get heartbeatAt(): Date | undefined {
    return copyDate(this.heartbeatAtValue);
  }

  public get leaseExpiresAt(): Date | undefined {
    return copyDate(this.leaseExpiresAtValue);
  }

  public get workerId(): string | undefined {
    return this.workerIdValue;
  }

  public get attempt(): number {
    return this.attemptValue;
  }

  public get crawlerRevision(): number {
    return this.crawlerRevisionValue;
  }

  public get connectorTypeSnapshot(): string {
    return this.connectorTypeSnapshotValue;
  }

  public get safeConfigSnapshot(): MetadataCrawlerDiscoveryConfig {
    return copyJson(this.safeConfigSnapshotValue);
  }

  public get counters(): MetadataCrawlerRunCounters {
    return { ...this.countersValue };
  }

  public get failure(): MetadataCrawlerRunFailure | undefined {
    return this.failureValue === undefined ? undefined : { ...this.failureValue };
  }

  public get logObjectKey(): string | undefined {
    return this.logObjectKeyValue;
  }

  public get isActive(): boolean {
    return isActiveRunStatus(this.statusValue);
  }

  public start(input: StartMetadataCrawlerRunInput, at: Date): void {
    this.assertTransition(MetadataCrawlerRunStatus.RUNNING);
    const when = validDate('Start time', at);
    const leaseExpiresAt = validDate('Lease expiry', input.leaseExpiresAt);
    const workerId = nonEmpty(input.workerId, 160);
    if (leaseExpiresAt.getTime() <= when.getTime()) {
      throw MetadataCrawlerError.validation(MetadataCrawlerMessage.leaseMustBeFuture);
    }
    this.statusValue = MetadataCrawlerRunStatus.RUNNING;
    this.attemptValue += 1;
    this.workerIdValue = workerId;
    this.claimedAtValue = when;
    this.startedAtValue = when;
    this.heartbeatAtValue = when;
    this.leaseExpiresAtValue = leaseExpiresAt;
  }

  public heartbeat(workerId: string, leaseExpiresAt: Date, at: Date): boolean {
    if (
      this.statusValue !== MetadataCrawlerRunStatus.RUNNING ||
      this.workerIdValue !== workerId.trim()
    ) {
      return false;
    }
    const when = validDate('Heartbeat time', at);
    const lease = validDate('Lease expiry', leaseExpiresAt);
    if (lease.getTime() <= when.getTime()) {
      return false;
    }
    this.heartbeatAtValue = when;
    this.leaseExpiresAtValue = lease;
    return true;
  }

  public requeueAfterLeaseExpiry(at: Date): void {
    if (this.statusValue !== MetadataCrawlerRunStatus.RUNNING) {
      throw MetadataCrawlerError.transition(this.statusValue, MetadataCrawlerRunStatus.QUEUED);
    }
    const when = validDate('Requeue time', at);
    if (
      this.leaseExpiresAtValue === undefined ||
      when.getTime() < this.leaseExpiresAtValue.getTime()
    ) {
      throw MetadataCrawlerError.validation(MetadataCrawlerMessage.leaseNotExpired);
    }
    this.statusValue = MetadataCrawlerRunStatus.QUEUED;
    this.queuedAtValue = when;
    this.claimedAtValue = undefined;
    this.startedAtValue = undefined;
    this.heartbeatAtValue = undefined;
    this.leaseExpiresAtValue = undefined;
    this.workerIdValue = undefined;
  }

  public finishSucceeded(counters: MetadataCrawlerRunCounters, at: Date): void {
    this.finish(MetadataCrawlerRunStatus.SUCCEEDED, counters, undefined, at);
  }

  public finishPartial(counters: MetadataCrawlerRunCounters, at: Date): void {
    this.finish(MetadataCrawlerRunStatus.PARTIAL, counters, undefined, at);
  }

  public finishFailed(
    failureInput: MetadataCrawlerRunFailure,
    counters: MetadataCrawlerRunCounters,
    at: Date,
  ): void {
    this.finish(MetadataCrawlerRunStatus.FAILED, counters, failureInput, at);
  }

  public cancel(at: Date): void {
    this.assertTransition(MetadataCrawlerRunStatus.CANCELLED);
    this.statusValue = MetadataCrawlerRunStatus.CANCELLED;
    this.finishedAtValue = validDate('Finish time', at);
  }

  private finish(
    status: MetadataCrawlerRunStatusValue,
    counters: MetadataCrawlerRunCounters,
    failureInput: MetadataCrawlerRunFailure | undefined,
    at: Date,
  ): void {
    this.assertTransition(status);
    this.statusValue = status;
    this.countersValue = copyCounters(counters);
    this.failureValue = failureInput === undefined ? undefined : failure(failureInput);
    this.finishedAtValue = validDate('Finish time', at);
    this.heartbeatAtValue = undefined;
    this.leaseExpiresAtValue = undefined;
  }

  private assertTransition(to: MetadataCrawlerRunStatusValue): void {
    const allowed: Readonly<
      Record<MetadataCrawlerRunStatusValue, readonly MetadataCrawlerRunStatusValue[]>
    > = {
      [MetadataCrawlerRunStatus.QUEUED]: [
        MetadataCrawlerRunStatus.RUNNING,
        MetadataCrawlerRunStatus.CANCELLED,
      ],
      [MetadataCrawlerRunStatus.RUNNING]: [
        MetadataCrawlerRunStatus.SUCCEEDED,
        MetadataCrawlerRunStatus.PARTIAL,
        MetadataCrawlerRunStatus.FAILED,
        MetadataCrawlerRunStatus.CANCELLED,
      ],
      [MetadataCrawlerRunStatus.SUCCEEDED]: [],
      [MetadataCrawlerRunStatus.PARTIAL]: [],
      [MetadataCrawlerRunStatus.FAILED]: [],
      [MetadataCrawlerRunStatus.CANCELLED]: [],
    };
    if (!allowed[this.statusValue].includes(to)) {
      throw MetadataCrawlerError.transition(this.statusValue, to);
    }
  }
}

function emptyCounters(): MetadataCrawlerRunCounters {
  return {
    databaseCount: 0,
    schemaCount: 0,
    relationCount: 0,
    columnCount: 0,
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    deletedCount: 0,
    warningCount: 0,
  };
}

function optionalDate(label: string, value: Date | undefined): Date | undefined {
  return value === undefined ? undefined : validDate(label, value);
}

function copyDate(value: Date | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value.getTime());
}

function nonEmpty(value: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw MetadataCrawlerError.validation(
      normalized.length === 0
        ? 'A metadata crawler value is required.'
        : `Value must not exceed ${maximum} characters.`,
    );
  }
  return normalized;
}

function positiveInteger(label: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw MetadataCrawlerError.validation(`${label} must be a positive integer.`);
  }
  return value;
}

function nonNegativeInteger(label: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw MetadataCrawlerError.validation(`${label} must be a non-negative integer.`);
  }
  return value;
}

function failure(value: MetadataCrawlerRunFailure): MetadataCrawlerRunFailure {
  return {
    category: nonEmpty(value.category, 40),
    summary: nonEmpty(value.summary, 4000),
  };
}
