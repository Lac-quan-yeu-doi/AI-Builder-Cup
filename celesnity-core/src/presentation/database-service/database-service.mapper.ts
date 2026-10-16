import type {
  CreateDatabaseServiceCommand,
  TestUnsavedDatabaseServiceCommand,
  UpdateDatabaseServiceCommand,
} from '@application/database-service/database-service.use-cases';
import type {
  DatabaseServiceDetailsRequestDto,
  CreateDatabaseServiceRequestDto,
  UpdateDatabaseServiceRequestDto,
} from '@presentation/database-service/database-service.dto';

/** Translates the DBMS-neutral HTTP contract into application commands. */
export function toCreateDatabaseServiceCommand(
  request: CreateDatabaseServiceRequestDto,
): CreateDatabaseServiceCommand {
  return {
    name: request.name,
    ...(request.databaseName === undefined ? {} : { databaseName: request.databaseName }),
    ...(request.initialDatabaseName === undefined
      ? {}
      : { initialDatabaseName: request.initialDatabaseName }),
    connectorType: request.connectorType,
    details: request.details,
  };
}

export function toTestUnsavedDatabaseServiceCommand(
  request: DatabaseServiceDetailsRequestDto,
): TestUnsavedDatabaseServiceCommand {
  return {
    connectorType: request.connectorType,
    details: request.details,
  };
}

export function toUpdateDatabaseServiceCommand(
  request: UpdateDatabaseServiceRequestDto,
  id: string,
): UpdateDatabaseServiceCommand {
  return {
    id,
    name: request.name,
    details: request.details,
  };
}

/** Compatibility aliases for adapters that have not migrated in lockstep. */
export const toCreateConnectionCommand = toCreateDatabaseServiceCommand;
export const toTestUnsavedConnectionCommand = toTestUnsavedDatabaseServiceCommand;
export const toUpdateConnectionCommand = toUpdateDatabaseServiceCommand;
