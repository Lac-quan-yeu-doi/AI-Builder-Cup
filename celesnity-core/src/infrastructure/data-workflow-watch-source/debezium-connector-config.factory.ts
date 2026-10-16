import { createHash } from 'node:crypto';

import type { CdcConnectionRuntimeProfile } from '@application/database-service/read-models/cdc-connection-runtime-profile';
import { CdcConnectionSetupMode } from '@domain/database-service/value-objects/cdc-connection-profile';
import type {
  WorkflowCdcRelation,
  WorkflowWatchSourceTrigger,
} from '@domain/data-workflow/models/workflow-trigger';

export const DEFAULT_CDC_APPLICATION_TOPIC = 'celesnity.data-workflow.cdc.v1';

export interface DebeziumConnectorSpec {
  readonly name: string;
  readonly config: Readonly<Record<string, string>>;
}

/** Builds a local-only connector payload. Callers must never log the returned config. */
export class DebeziumConnectorConfigFactory {
  public constructor(
    private readonly applicationTopic: string = DEFAULT_CDC_APPLICATION_TOPIC,
  ) {
    if (applicationTopic.trim() === '') {
      throw new Error('The CDC application topic must not be empty.');
    }
  }

  public build(
    organizationId: string,
    databaseServiceId: string,
    profile: CdcConnectionRuntimeProfile,
    trigger: Extract<WorkflowWatchSourceTrigger, { type: 'WATCH_SOURCE'; mode: 'CDC' }>,
  ): DebeziumConnectorSpec {
    const name = connectorName(organizationId, databaseServiceId);
    const config = profile.config.toRecord();
    const host = requiredText(config.host);
    const port = requiredNumber(config.port);
    const databaseName = requiredText(config.databaseName);
    const username = requiredText(config.username);
    const relations = [...trigger.relations].sort(relationOrder);
    const tableIncludeList = relations
      .map((relation) => `${relation.schema}.${relation.table}`)
      .join(',');
    const base: Record<string, string> = {
      name: name,
      'database.hostname': host,
      'database.port': String(port),
      'database.user': username,
      'database.password': profile.credential.value,
      'snapshot.mode': 'no_data',
      'tombstones.on.delete': 'false',
      'table.include.list': tableIncludeList,
      transforms: 'metadata,route',
      'transforms.metadata.type': 'io.celesnity.debezium.MetadataOnlyTransform',
      'transforms.metadata.celesnity.connector.id': name,
      'transforms.metadata.celesnity.organization.id': organizationId,
      'transforms.metadata.celesnity.database.service.id': databaseServiceId,
      'topic.prefix': `celesnity.cdc.${shortHash(`${organizationId}:${databaseServiceId}`)}`,
      'include.schema.changes': 'false',
      'transforms.route.type': 'org.apache.kafka.connect.transforms.RegexRouter',
      'transforms.route.regex': '.*',
      'transforms.route.replacement': this.applicationTopic.trim(),
    };

    const connectorType = profile.connectorType.trim().toUpperCase();
    if (connectorType === 'POSTGRESQL') {
      const names = postgresNames(name, profile);
      return {
        name,
        config: {
          ...base,
          'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
          'database.dbname': databaseName,
          'plugin.name': 'pgoutput',
          'publication.autocreate.mode':
            profile.setupMode === CdcConnectionSetupMode.MANAGED ? 'filtered' : 'disabled',
          'publication.name': names.publication,
          'slot.name': names.slot,
        },
      };
    }
    if (connectorType === 'MYSQL') {
      return {
        name,
        config: {
          ...base,
          'connector.class': 'io.debezium.connector.mysql.MySqlConnector',
          'database.include.list': databaseName,
          'database.server.id': String(mysqlServerId(name)),
          'database.server.name': `celesnity_${shortHash(name)}`,
          'schema.history.internal.kafka.topic': `celesnity.debezium.schema-history.${shortHash(name)}`,
          'schema.history.internal.kafka.bootstrap.servers': 'redpanda:9092',
        },
      };
    }
    throw new Error(`CDC is unsupported for connector ${profile.connectorType}.`);
  }
}

function postgresNames(
  connectorNameValue: string,
  profile: CdcConnectionRuntimeProfile,
): { readonly publication: string; readonly slot: string } {
  if (profile.setupMode === CdcConnectionSetupMode.EXISTING) {
    return {
      publication: requiredText(profile.publicationName),
      slot: requiredText(profile.slotName),
    };
  }
  const hash = shortHash(connectorNameValue).slice(0, 20);
  return {
    publication: profile.publicationName ?? `celesnity_pub_${hash}`,
    slot: profile.slotName ?? `celesnity_slot_${hash}`,
  };
}

export function connectorName(organizationId: string, databaseServiceId: string): string {
  return `celesnity-cdc-${shortHash(`${organizationId}:${databaseServiceId}`).slice(0, 20)}`;
}

function relationOrder(left: WorkflowCdcRelation, right: WorkflowCdcRelation): number {
  return `${left.schema}\u0000${left.table}`.localeCompare(`${right.schema}\u0000${right.table}`);
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function mysqlServerId(name: string): number {
  const value = Number.parseInt(shortHash(name).slice(0, 8), 16);
  return 1_000 + (value % 2_000_000_000);
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error('CDC config field is missing.');
  return value;
}

function requiredNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('CDC port is invalid.');
  }
  return value;
}
