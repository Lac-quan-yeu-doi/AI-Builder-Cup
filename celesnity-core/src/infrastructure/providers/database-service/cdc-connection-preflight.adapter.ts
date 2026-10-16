import { Inject, Injectable } from '@nestjs/common';

import type {
  CdcConnectionPreflightInput,
  CdcConnectionPreflightResult,
  ICdcConnectionPreflight,
} from '@application/database-service/interfaces/i-cdc-connection-preflight';
import type { IDestinationPolicy } from '@application/database-service/interfaces/i-destination-policy';
import { CdcConnectionRuntimeProfileValue } from '@application/database-service/read-models/cdc-connection-runtime-profile';
import { DESTINATION_POLICY } from '@application/database-service/tokens';
import { CdcConnectionVerificationStatus } from '@domain/database-service/value-objects/cdc-connection-profile';
import { CdcSourcePreflight } from '@infrastructure/data-workflow-watch-source/cdc-source-preflight';

@Injectable()
export class CdcConnectionPreflightAdapter implements ICdcConnectionPreflight {
  public constructor(
    @Inject(DESTINATION_POLICY) private readonly destinationPolicy: IDestinationPolicy,
    private readonly sourcePreflight: CdcSourcePreflight,
  ) {}

  public async validate(input: CdcConnectionPreflightInput): Promise<CdcConnectionPreflightResult> {
    if (isKnownPooler(input.destination.host)) {
      return {
        status: CdcConnectionVerificationStatus.FAILED,
        issueCode: 'CDC_DIRECT_CONNECTION_REQUIRED',
        message: 'CDC requires a direct database endpoint; the configured host is a pooler.',
      };
    }
    try {
      const resolved = await this.destinationPolicy.resolveAllowed(input.destination);
      const result = await this.sourcePreflight.check(
        new CdcConnectionRuntimeProfileValue(
          input.databaseServiceId,
          input.connectorType,
          input.config,
          input.credential,
          resolved.host,
          resolved.port,
          resolved.addresses,
          input.setupMode,
          input.publicationName,
          input.slotName,
        ),
      );
      return mapResult(result);
    } catch {
      return {
        status: CdcConnectionVerificationStatus.FAILED,
        issueCode: 'CDC_ENDPOINT_UNREACHABLE',
        message: 'The CDC endpoint could not be reached from the connector network.',
      };
    }
  }
}

function isKnownPooler(host: string): boolean {
  return host.trim().toLowerCase().endsWith('.pooler.supabase.com');
}

function mapResult(result: {
  readonly available: boolean;
  readonly code: string;
  readonly message: string;
}): CdcConnectionPreflightResult {
  if (result.available) return { status: CdcConnectionVerificationStatus.READY };
  if (result.code === 'WAL_LEVEL_NOT_LOGICAL' || result.code === 'BINLOG_DISABLED') {
    return {
      status: CdcConnectionVerificationStatus.SETUP_REQUIRED,
      issueCode: 'CDC_LOGICAL_REPLICATION_DISABLED',
      message: result.message,
    };
  }
  if (result.code === 'REPLICATION_PRIVILEGE_MISSING') {
    return {
      status: CdcConnectionVerificationStatus.SETUP_REQUIRED,
      issueCode: 'CDC_REPLICATION_PERMISSION_REQUIRED',
      message: result.message,
    };
  }
  if (result.code === 'AUTHENTICATION_FAILED') {
    return {
      status: CdcConnectionVerificationStatus.FAILED,
      issueCode: 'CDC_AUTHENTICATION_FAILED',
      message: result.message,
    };
  }
  if (result.code === 'DIRECT_CONNECTION_REQUIRED') {
    return {
      status: CdcConnectionVerificationStatus.FAILED,
      issueCode: 'CDC_DIRECT_CONNECTION_REQUIRED',
      message: result.message,
    };
  }
  if (result.code === 'CDC_PUBLICATION_REQUIRED') {
    return {
      status: CdcConnectionVerificationStatus.SETUP_REQUIRED,
      issueCode: 'CDC_PUBLICATION_REQUIRED',
      message: result.message,
    };
  }
  if (result.code === 'CDC_SLOT_REQUIRED') {
    return {
      status: CdcConnectionVerificationStatus.SETUP_REQUIRED,
      issueCode: 'CDC_SLOT_REQUIRED',
      message: result.message,
    };
  }
  return {
    status: CdcConnectionVerificationStatus.FAILED,
    issueCode: 'CDC_ENDPOINT_UNREACHABLE',
    message: result.message,
  };
}
