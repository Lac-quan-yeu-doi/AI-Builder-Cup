import type {
  DatabaseService,
  DatabaseServiceVerificationResult,
  DatabaseServiceVerificationState,
  CdcConnectionProfile,
} from '@/src/entities/models/database-service';

export interface DatabaseServiceVerificationStateViewModel {
  readonly status: DatabaseServiceVerificationState['status'];
  readonly testedAt?: string;
  readonly message?: string;
}

export type CdcConnectionProfileViewModel = CdcConnectionProfile;

export function presentCdcConnectionProfile(
  profile: CdcConnectionProfile,
): CdcConnectionProfileViewModel {
  return { ...profile };
}

export interface DatabaseServiceVerificationViewModel {
  readonly status: DatabaseServiceVerificationResult['status'];
  readonly testedAt: string;
  readonly message?: string;
}

export interface DatabaseServiceViewModel {
  readonly id: string;
  readonly name: string;
  readonly databaseNames: readonly string[];
  /** @deprecated Use databaseNames. */
  readonly databaseName?: string;
  readonly connectorType: string;
  readonly configSchemaVersion: number;
  readonly config: Record<string, unknown>;
  readonly summary: DatabaseService['summary'];
  readonly verification: DatabaseServiceVerificationStateViewModel;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function presentDatabaseService(databaseService: DatabaseService): DatabaseServiceViewModel {
  return {
    id: databaseService.id,
    name: databaseService.name,
    databaseNames: databaseService.databaseNames,
    ...(databaseService.databaseNames[0] === undefined
      ? {}
      : { databaseName: databaseService.databaseNames[0] }),
    connectorType: databaseService.connectorType,
    configSchemaVersion: databaseService.configSchemaVersion,
    config: databaseService.config,
    summary: databaseService.summary,
    verification: {
      status: databaseService.verification.status,
      ...(databaseService.verification.testedAt !== undefined
        ? { testedAt: databaseService.verification.testedAt }
        : {}),
      ...(databaseService.verification.message !== undefined
        ? { message: databaseService.verification.message }
        : {}),
    },
    createdAt: databaseService.createdAt,
    updatedAt: databaseService.updatedAt,
  };
}

export function presentDatabaseServicePage(page: {
  readonly items: readonly DatabaseService[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}) {
  return {
    ...page,
    items: page.items.map(presentDatabaseService),
  };
}

export function presentDatabaseServiceVerification(
  verification: DatabaseServiceVerificationResult,
): DatabaseServiceVerificationViewModel {
  return {
    status: verification.status,
    testedAt: verification.testedAt,
    ...(verification.message !== undefined ? { message: verification.message } : {}),
  };
}
