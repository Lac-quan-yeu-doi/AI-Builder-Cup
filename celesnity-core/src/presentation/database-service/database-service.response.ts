import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ConnectionVerificationView } from '@application/database-service/database-service.use-cases';
import type {
  DatabaseServiceListPage,
  DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';
import type { DatabaseServiceConnectorDescriptor } from '@application/database-service/read-models/database-service-connector-descriptor';
import {
  VERIFICATION_OUTCOMES,
  VerificationStatusValue,
  type VerificationOutcomeValue,
} from '@domain/database-service/value-objects/connection-value-objects';
import type { JsonObject } from '@domain/database-service/value-objects/normalized-connection-config';

export class DatabaseServiceSummaryItemResponseDto {
  @ApiProperty() public readonly key!: string;
  @ApiProperty() public readonly label!: string;
  @ApiProperty() public readonly value!: string;
}

/** A DBMS-neutral, non-secret registered connection. */
export class DatabaseServiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Celesnity catalog databases linked to this physical datasource.',
  })
  public readonly databaseNames!: readonly string[];

  @ApiProperty({
    example: 'POSTGRESQL',
    maxLength: 50,
    description: 'Registered DBMS plugin identifier. Current values: POSTGRESQL, MYSQL.',
  })
  public readonly connectorType!: string;

  @ApiProperty({ minimum: 1 })
  public readonly configSchemaVersion!: number;

  @ApiProperty({
    additionalProperties: true,
    description: 'Canonical non-secret DBMS configuration.',
    type: 'object',
  })
  public readonly config!: JsonObject;

  @ApiProperty({ type: DatabaseServiceSummaryItemResponseDto, isArray: true })
  public readonly summary!: DatabaseServiceView['summary'];

  @ApiProperty({ enum: VerificationStatusValue })
  public readonly verificationStatus!: VerificationStatusValue;

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly lastTestedAt?: string;

  @ApiPropertyOptional()
  public readonly lastTestError?: string;

  @ApiProperty({ format: 'date-time' })
  public readonly createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  public static from(view: DatabaseServiceView): DatabaseServiceResponseDto {
    return Object.assign(new DatabaseServiceResponseDto(), {
      id: view.id,
      name: view.name,
      databaseNames: view.databaseNames,
      connectorType: view.connectorType,
      configSchemaVersion: view.configSchemaVersion,
      config: view.config,
      summary: view.summary,
      verificationStatus: view.verificationStatus,
      lastTestedAt: view.lastTestedAt,
      lastTestError: view.lastTestError,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    });
  }
}

/** @deprecated OpenAPI compatibility model for the pre-DatabaseService Web adapter. */
export class ConnectionResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ example: 'POSTGRESQL' }) public readonly dbmsType!: string;
  @ApiProperty({ minimum: 1 }) public readonly configSchemaVersion!: number;
  @ApiProperty({ additionalProperties: true, type: 'object' })
  public readonly config!: JsonObject;
  @ApiProperty({ enum: VerificationStatusValue })
  public readonly verificationStatus!: VerificationStatusValue;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly lastTestedAt?: string;
  @ApiPropertyOptional() public readonly lastTestError?: string;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
}

/** @deprecated OpenAPI compatibility model for the pre-DatabaseService Web adapter. */
export class DataConnectionResponseDto extends ConnectionResponseDto {}

export class DatabaseServiceListResponseDto {
  @ApiProperty({ type: DatabaseServiceResponseDto, isArray: true })
  public readonly items!: readonly DatabaseServiceResponseDto[];

  @ApiProperty()
  public readonly page!: number;

  @ApiProperty()
  public readonly pageSize!: number;

  @ApiProperty()
  public readonly total!: number;

  public static from(page: DatabaseServiceListPage): DatabaseServiceListResponseDto {
    return Object.assign(new DatabaseServiceListResponseDto(), {
      items: page.items.map((item) => DatabaseServiceResponseDto.from(item)),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
    });
  }
}

export class DatabaseServiceConnectorDescriptorResponseDto {
  @ApiProperty()
  public readonly connectorType!: string;

  @ApiProperty()
  public readonly label!: string;

  @ApiProperty()
  public readonly configSchemaVersion!: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly formSchema!: DatabaseServiceConnectorDescriptor['formSchema'];

  public static from(
    descriptor: DatabaseServiceConnectorDescriptor,
  ): DatabaseServiceConnectorDescriptorResponseDto {
    return Object.assign(new DatabaseServiceConnectorDescriptorResponseDto(), descriptor);
  }
}

export class ConnectionVerificationResponseDto {
  @ApiProperty({ enum: VERIFICATION_OUTCOMES })
  public readonly status!: VerificationOutcomeValue;

  @ApiProperty({ format: 'date-time' })
  public readonly testedAt!: string;

  @ApiPropertyOptional()
  public readonly failureReason?: string;

  public static from(view: ConnectionVerificationView): ConnectionVerificationResponseDto {
    return Object.assign(new ConnectionVerificationResponseDto(), view);
  }
}

/** @deprecated OpenAPI compatibility model for the pre-DatabaseService Web adapter. */
export class DatabaseServiceVerificationResponseDto extends ConnectionVerificationResponseDto {}
