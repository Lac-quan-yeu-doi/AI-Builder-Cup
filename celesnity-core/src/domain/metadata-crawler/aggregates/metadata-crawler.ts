import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import { MetadataCrawlerMessage } from '@domain/metadata-crawler/errors/metadata-crawler.messages';
import {
  copyJson,
  MetadataCrawlerConcurrencyPolicy,
  type MetadataCrawlerConcurrencyPolicyValue,
  MetadataCrawlerServiceFamily,
  type MetadataCrawlerServiceFamilyValue,
  nonEmpty,
  stableJson,
  uuid,
  validDate,
  type MetadataCrawlerDiscoveryConfig,
} from '@domain/metadata-crawler/value-objects/metadata-crawler-values';

export interface MetadataCrawlerState {
  readonly id: string;
  readonly databaseServiceId: string;
  readonly name: string;
  readonly serviceFamily: MetadataCrawlerServiceFamilyValue;
  readonly enabled: boolean;
  readonly scheduleCron: string;
  readonly scheduleTimezone: string;
  readonly nextRunAt: Date;
  readonly concurrencyPolicy: MetadataCrawlerConcurrencyPolicyValue;
  readonly timeoutSeconds: number;
  readonly revision: number;
  readonly discoveryConfig: MetadataCrawlerDiscoveryConfig;
  readonly configSchemaVersion: number;
  readonly archivedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateMetadataCrawlerInput {
  readonly id: string;
  readonly databaseServiceId: string;
  readonly name: string;
  readonly serviceFamily?: MetadataCrawlerServiceFamilyValue;
  readonly enabled?: boolean;
  readonly scheduleCron: string;
  readonly scheduleTimezone: string;
  readonly nextRunAt: Date;
  readonly concurrencyPolicy?: MetadataCrawlerConcurrencyPolicyValue;
  readonly timeoutSeconds?: number;
  readonly revision?: number;
  readonly discoveryConfig: MetadataCrawlerDiscoveryConfig;
  readonly configSchemaVersion?: number;
  readonly now: Date;
}

export interface ReconfigureMetadataCrawlerInput {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly scheduleCron?: string;
  readonly scheduleTimezone?: string;
  readonly nextRunAt?: Date;
  readonly concurrencyPolicy?: MetadataCrawlerConcurrencyPolicyValue;
  readonly timeoutSeconds?: number;
  readonly discoveryConfig?: MetadataCrawlerDiscoveryConfig;
}

export class MetadataCrawler {
  private readonly idValue: string;
  private readonly databaseServiceIdValue: string;
  private nameValue: string;
  private readonly serviceFamilyValue: MetadataCrawlerServiceFamilyValue;
  private enabledValue: boolean;
  private scheduleCronValue: string;
  private scheduleTimezoneValue: string;
  private nextRunAtValue: Date;
  private readonly concurrencyPolicyValue: MetadataCrawlerConcurrencyPolicyValue;
  private timeoutSecondsValue: number;
  private revisionValue: number;
  private discoveryConfigValue: MetadataCrawlerDiscoveryConfig;
  private readonly configSchemaVersionValue: number;
  private archivedAtValue: Date | undefined;
  private readonly createdAtValue: Date;
  private updatedAtValue: Date;

  private constructor(state: MetadataCrawlerState) {
    this.idValue = uuid('Metadata crawler ID', state.id, MetadataCrawlerMessage.invalidCrawlerId);
    this.databaseServiceIdValue = uuid(
      'Database service ID',
      state.databaseServiceId,
      MetadataCrawlerMessage.invalidDatabaseServiceId,
    );
    this.nameValue = nonEmpty('Metadata crawler name', state.name, 160);
    this.serviceFamilyValue = state.serviceFamily;
    this.enabledValue = state.enabled;
    this.scheduleCronValue = nonEmpty('Metadata crawler schedule', state.scheduleCron, 120);
    this.scheduleTimezoneValue = timezone(state.scheduleTimezone);
    this.nextRunAtValue = validDate('Next run time', state.nextRunAt);
    this.concurrencyPolicyValue = state.concurrencyPolicy;
    this.timeoutSecondsValue = positiveInteger(
      'Metadata crawler timeout',
      state.timeoutSeconds,
      MetadataCrawlerMessage.timeoutInvalid,
    );
    this.revisionValue = positiveInteger(
      'Metadata crawler revision',
      state.revision,
      'Revision must be positive.',
    );
    this.discoveryConfigValue = copyJson(state.discoveryConfig);
    this.configSchemaVersionValue = positiveInteger(
      'Metadata crawler config schema version',
      state.configSchemaVersion,
      'Config schema version must be positive.',
    );
    this.archivedAtValue =
      state.archivedAt === undefined ? undefined : validDate('Archive time', state.archivedAt);
    this.createdAtValue = validDate('Creation time', state.createdAt);
    this.updatedAtValue = validDate('Update time', state.updatedAt);
    if (this.updatedAtValue.getTime() < this.createdAtValue.getTime()) {
      throw MetadataCrawlerError.validation(
        'Metadata crawler update time cannot precede creation time.',
      );
    }
    if (this.archivedAtValue !== undefined) {
      this.enabledValue = false;
    }
  }

  public static create(input: CreateMetadataCrawlerInput): MetadataCrawler {
    const now = validDate('Creation time', input.now);
    return new MetadataCrawler({
      id: input.id,
      databaseServiceId: input.databaseServiceId,
      name: input.name,
      serviceFamily: input.serviceFamily ?? MetadataCrawlerServiceFamily.DATABASE,
      enabled: input.enabled ?? true,
      scheduleCron: input.scheduleCron,
      scheduleTimezone: input.scheduleTimezone,
      nextRunAt: input.nextRunAt,
      concurrencyPolicy: input.concurrencyPolicy ?? MetadataCrawlerConcurrencyPolicy.SKIP,
      timeoutSeconds: input.timeoutSeconds ?? 3600,
      revision: input.revision ?? 1,
      discoveryConfig: input.discoveryConfig,
      configSchemaVersion: input.configSchemaVersion ?? 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(state: MetadataCrawlerState): MetadataCrawler {
    return new MetadataCrawler(state);
  }

  public get id(): string {
    return this.idValue;
  }

  public get databaseServiceId(): string {
    return this.databaseServiceIdValue;
  }

  public get name(): string {
    return this.nameValue;
  }

  public get serviceFamily(): MetadataCrawlerServiceFamilyValue {
    return this.serviceFamilyValue;
  }

  public get enabled(): boolean {
    return this.enabledValue;
  }

  public get scheduleCron(): string {
    return this.scheduleCronValue;
  }

  public get scheduleTimezone(): string {
    return this.scheduleTimezoneValue;
  }

  public get nextRunAt(): Date {
    return new Date(this.nextRunAtValue.getTime());
  }

  public get concurrencyPolicy(): MetadataCrawlerConcurrencyPolicyValue {
    return this.concurrencyPolicyValue;
  }

  public get timeoutSeconds(): number {
    return this.timeoutSecondsValue;
  }

  public get revision(): number {
    return this.revisionValue;
  }

  public get discoveryConfig(): MetadataCrawlerDiscoveryConfig {
    return copyJson(this.discoveryConfigValue);
  }

  public get configSchemaVersion(): number {
    return this.configSchemaVersionValue;
  }

  public get archivedAt(): Date | undefined {
    return this.archivedAtValue === undefined
      ? undefined
      : new Date(this.archivedAtValue.getTime());
  }

  public get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this.updatedAtValue.getTime());
  }

  public get isArchived(): boolean {
    return this.archivedAtValue !== undefined;
  }

  public reconfigure(input: ReconfigureMetadataCrawlerInput, at: Date): void {
    const when = this.monotonicDate(at);
    const before = this.configurationFingerprint();
    if (input.name !== undefined) {
      this.nameValue = nonEmpty('Metadata crawler name', input.name, 160);
    }
    if (input.enabled !== undefined && !this.isArchived) {
      this.enabledValue = input.enabled;
    }
    if (input.scheduleCron !== undefined) {
      this.scheduleCronValue = nonEmpty('Metadata crawler schedule', input.scheduleCron, 120);
    }
    if (input.scheduleTimezone !== undefined) {
      this.scheduleTimezoneValue = timezone(input.scheduleTimezone);
    }
    if (input.nextRunAt !== undefined) {
      this.nextRunAtValue = validDate('Next run time', input.nextRunAt);
    }
    if (input.timeoutSeconds !== undefined) {
      this.timeoutSecondsValue = positiveInteger(
        'Metadata crawler timeout',
        input.timeoutSeconds,
        MetadataCrawlerMessage.timeoutInvalid,
      );
    }
    if (input.discoveryConfig !== undefined) {
      this.discoveryConfigValue = copyJson(input.discoveryConfig);
    }
    if (this.configurationFingerprint() !== before) {
      this.revisionValue += 1;
    }
    this.updatedAtValue = when;
  }

  public archive(at: Date): void {
    this.archivedAtValue = this.monotonicDate(at);
    this.enabledValue = false;
  }

  public restore(at: Date): void {
    this.archivedAtValue = undefined;
    this.enabledValue = true;
    this.updatedAtValue = this.monotonicDate(at);
  }

  public pause(at: Date): void {
    this.enabledValue = false;
    this.updatedAtValue = this.monotonicDate(at);
  }

  public resume(at: Date): void {
    if (this.isArchived) {
      throw MetadataCrawlerError.validation('An archived metadata crawler cannot be resumed.');
    }
    this.enabledValue = true;
    this.updatedAtValue = this.monotonicDate(at);
  }

  private configurationFingerprint(): string {
    return stableJson({
      name: this.nameValue,
      enabled: this.enabledValue,
      scheduleCron: this.scheduleCronValue,
      scheduleTimezone: this.scheduleTimezoneValue,
      nextRunAt: this.nextRunAtValue.toISOString(),
      timeoutSeconds: this.timeoutSecondsValue,
      discoveryConfig: this.discoveryConfigValue,
    });
  }

  private monotonicDate(at: Date): Date {
    const when = validDate('Metadata crawler update time', at);
    return when.getTime() < this.updatedAtValue.getTime()
      ? new Date(this.updatedAtValue.getTime())
      : when;
  }
}

function positiveInteger(label: string, value: number, message: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw MetadataCrawlerError.validation(message || `${label} must be a positive integer.`);
  }
  return value;
}

function timezone(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw MetadataCrawlerError.validation(MetadataCrawlerMessage.timezoneInvalid);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format();
  } catch {
    throw MetadataCrawlerError.validation(MetadataCrawlerMessage.timezoneInvalid);
  }
  return normalized;
}
