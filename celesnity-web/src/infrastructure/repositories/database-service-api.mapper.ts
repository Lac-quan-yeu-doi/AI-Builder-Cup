import {
  sanitizeVerificationMessage,
  type DatabaseService,
  type DatabaseServiceConnectorDescriptor,
  type DatabaseServiceDetailsInput,
  type DatabaseServiceInput,
  type DatabaseServiceListPage,
  type DatabaseServiceUpdateInput,
  type DatabaseServiceVerificationResult,
  type CdcConnectionProfile,
  type CdcConnectionProfileInput,
} from '@/src/entities/models/database-service';
import type { components } from '@/src/infrastructure/api/generated/schema';

export type DatabaseServiceDetailsRequestDto =
  components['schemas']['DatabaseServiceDetailsRequestDto'];
export type CreateDatabaseServiceRequestDto =
  components['schemas']['CreateDatabaseServiceRequestDto'];
export type UpdateDatabaseServiceRequestDto =
  components['schemas']['UpdateDatabaseServiceRequestDto'];
export type DatabaseServiceResponseDto = components['schemas']['DatabaseServiceResponseDto'];
export type DatabaseServiceListResponseDto =
  components['schemas']['DatabaseServiceListResponseDto'];
export type DatabaseServiceVerificationResponseDto =
  components['schemas']['ConnectionVerificationResponseDto'];

export interface CdcConnectionProfileResponseDto {
  readonly id?: unknown;
  readonly databaseServiceId?: unknown;
  readonly connectorType?: unknown;
  readonly endpointSummary?: unknown;
  readonly setupMode?: unknown;
  readonly publicationName?: unknown;
  readonly slotName?: unknown;
  readonly verificationStatus?: unknown;
  readonly verificationIssueCode?: unknown;
  readonly verificationMessage?: unknown;
  readonly lastTestedAt?: unknown;
  readonly revision?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

export function toPutCdcConnectionProfileRequest(input: CdcConnectionProfileInput) {
  return {
    details: input.details,
    setupMode: input.setupMode === 'managed' ? 'MANAGED' : 'EXISTING',
    ...(input.publicationName === undefined ? {} : { publicationName: input.publicationName }),
    ...(input.slotName === undefined ? {} : { slotName: input.slotName }),
  };
}

export function fromCdcConnectionProfileResponse(
  dto: CdcConnectionProfileResponseDto,
): CdcConnectionProfile {
  return {
    id: requiredString(dto.id, 'cdc profile id'),
    databaseServiceId: requiredString(dto.databaseServiceId, 'cdc databaseServiceId'),
    connectorType: requiredString(dto.connectorType, 'cdc connectorType'),
    endpointSummary: requiredString(dto.endpointSummary, 'cdc endpointSummary'),
    setupMode: cdcSetupMode(dto.setupMode),
    ...(optionalString(dto.publicationName) === undefined
      ? {}
      : { publicationName: optionalString(dto.publicationName) }),
    ...(optionalString(dto.slotName) === undefined
      ? {}
      : { slotName: optionalString(dto.slotName) }),
    verificationStatus: cdcVerificationStatus(dto.verificationStatus),
    ...(optionalString(dto.verificationIssueCode) === undefined
      ? {}
      : { verificationIssueCode: optionalString(dto.verificationIssueCode) }),
    ...(sanitizeVerificationMessage(optionalString(dto.verificationMessage)) === undefined
      ? {}
      : {
          verificationMessage: sanitizeVerificationMessage(optionalString(dto.verificationMessage)),
        }),
    ...(optionalString(dto.lastTestedAt) === undefined
      ? {}
      : { lastTestedAt: optionalString(dto.lastTestedAt) }),
    revision: requiredNumber(dto.revision, 'cdc revision'),
    createdAt: requiredString(dto.createdAt, 'cdc createdAt'),
    updatedAt: requiredString(dto.updatedAt, 'cdc updatedAt'),
  };
}

export function toCreateDatabaseServiceRequest(
  input: DatabaseServiceInput,
): CreateDatabaseServiceRequestDto {
  return {
    name: input.name,
    ...(input.initialDatabaseName === undefined
      ? {}
      : { initialDatabaseName: input.initialDatabaseName }),
    connectorType: input.connectorType,
    details: input.details,
  } as CreateDatabaseServiceRequestDto;
}

export function toUpdateDatabaseServiceRequest(
  input: DatabaseServiceUpdateInput,
): UpdateDatabaseServiceRequestDto {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
  };
}

export function toTestDatabaseServiceRequest(
  connectorType: string,
  details: DatabaseServiceDetailsInput,
): DatabaseServiceDetailsRequestDto {
  return { connectorType, details };
}

export function fromDatabaseServiceResponse(dto: DatabaseServiceResponseDto): DatabaseService {
  const config = record(dto.config, 'config');
  const summary = dto.summary === undefined ? [] : dto.summary.map(toSummaryItem);
  const databaseNames = Array.isArray(dto.databaseNames)
    ? dto.databaseNames.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    id: requiredString(dto.id, 'id'),
    name: requiredString(dto.name, 'name'),
    databaseNames,
    ...(databaseNames[0] === undefined ? {} : { databaseName: databaseNames[0] }),
    connectorType: requiredString(dto.connectorType, 'connectorType'),
    configSchemaVersion: requiredNumber(dto.configSchemaVersion, 'configSchemaVersion'),
    config,
    summary,
    verification: {
      status: verificationStatus(dto.verificationStatus),
      ...(dto.lastTestedAt ? { testedAt: dto.lastTestedAt } : {}),
      ...(sanitizeVerificationMessage(dto.lastTestError)
        ? { message: sanitizeVerificationMessage(dto.lastTestError) }
        : {}),
    },
    createdAt: requiredString(dto.createdAt, 'createdAt'),
    updatedAt: requiredString(dto.updatedAt, 'updatedAt'),
  };
}

export function fromDatabaseServiceListResponse(
  dto: DatabaseServiceListResponseDto,
): DatabaseServiceListPage {
  return {
    items: dto.items.map(fromDatabaseServiceResponse),
    page: dto.page,
    pageSize: dto.pageSize,
    total: dto.total,
  };
}

export function fromConnectorDescriptorResponse(
  dto: DatabaseServiceConnectorDescriptor,
): DatabaseServiceConnectorDescriptor {
  return {
    connectorType: requiredString(dto.connectorType, 'connectorType'),
    label: requiredString(dto.label, 'label'),
    configSchemaVersion: requiredNumber(dto.configSchemaVersion, 'configSchemaVersion'),
    formSchema: { fields: dto.formSchema.fields.map((field) => ({ ...field })) },
  };
}

export function fromVerificationResponse(
  dto: DatabaseServiceVerificationResponseDto,
): DatabaseServiceVerificationResult {
  const message = sanitizeVerificationMessage(dto.failureReason);
  return {
    status: dto.status === 'SUCCEEDED' ? 'succeeded' : 'failed',
    testedAt: requiredString(dto.testedAt, 'testedAt'),
    ...(message ? { message } : {}),
  };
}

function verificationStatus(value: string): DatabaseService['verification']['status'] {
  if (value === 'SUCCEEDED') return 'succeeded';
  if (value === 'FAILED') return 'failed';
  if (value === 'UNTESTED') return 'untested';
  throw new Error('The Core API returned an invalid database service verification status.');
}

function cdcSetupMode(value: unknown): CdcConnectionProfile['setupMode'] {
  if (value === 'EXISTING') return 'existing';
  if (value === 'MANAGED') return 'managed';
  throw new Error('The Core API returned an invalid CDC setup mode.');
}

function cdcVerificationStatus(value: unknown): CdcConnectionProfile['verificationStatus'] {
  if (value === 'UNTESTED') return 'untested';
  if (value === 'READY') return 'ready';
  if (value === 'SETUP_REQUIRED') return 'setup-required';
  if (value === 'FAILED') return 'failed';
  throw new Error('The Core API returned an invalid CDC verification status.');
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`The Core API returned an invalid database service ${field}.`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`The Core API returned an invalid database service ${field}.`);
  }
  return value;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The Core API returned an invalid database service ${field}.`);
  }
  return value as Record<string, unknown>;
}

function toSummaryItem(value: Record<string, unknown>): DatabaseService['summary'][number] {
  return {
    key: typeof value.key === 'string' ? value.key : '',
    label: typeof value.label === 'string' ? value.label : '',
    value: typeof value.value === 'string' ? value.value : String(value.value ?? ''),
  };
}

/** Unknown input: an older Core omits the field, and JSON can carry anything. */
function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
