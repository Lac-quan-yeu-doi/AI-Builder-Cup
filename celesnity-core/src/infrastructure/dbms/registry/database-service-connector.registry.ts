import type {
  DatabaseServiceConnector,
  IDatabaseServiceConnectorRegistry,
} from '@application/database-service/interfaces/i-database-service-connector-registry';
import type { DatabaseServiceConnectorDescriptor } from '@application/database-service/read-models/database-service-connector-descriptor';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';

export class DatabaseServiceConnectorRegistry implements IDatabaseServiceConnectorRegistry {
  private readonly plugins: ReadonlyMap<string, DatabaseServiceConnector>;
  private readonly descriptorOnly: readonly DatabaseServiceConnectorDescriptor[];

  public constructor(
    plugins: readonly DatabaseServiceConnector[],
    descriptorOnly: readonly DatabaseServiceConnectorDescriptor[] = [],
  ) {
    const entries = new Map<string, DatabaseServiceConnector>();
    for (const plugin of plugins) {
      const connectorType = ConnectorType.create(plugin.connectorType.value);
      if (entries.has(connectorType.value)) {
        throw new Error(`Database type ${connectorType.value} is registered more than once.`);
      }
      entries.set(connectorType.value, { ...plugin, connectorType });
    }
    this.plugins = entries;
    this.descriptorOnly = descriptorOnly.map((descriptor) => ({ ...descriptor }));
  }

  public require(connectorType: ConnectorType): DatabaseServiceConnector {
    const plugin = this.plugins.get(connectorType.value);
    if (plugin === undefined) {
      throw ConnectionError.unsupportedDbms(connectorType.value);
    }
    return plugin;
  }

  public list(): readonly DatabaseServiceConnectorDescriptor[] {
    const descriptors = [
      ...[...this.plugins.values()]
        .map((plugin) => plugin.descriptor)
        .filter(
          (descriptor): descriptor is DatabaseServiceConnectorDescriptor =>
            descriptor !== undefined,
        ),
      ...this.descriptorOnly,
    ];
    const seen = new Set<string>();
    for (const descriptor of descriptors) {
      const connectorType = ConnectorType.create(descriptor.connectorType).value;
      if (seen.has(connectorType)) {
        throw new Error(`Connector descriptor ${connectorType} is registered more than once.`);
      }
      seen.add(connectorType);
    }
    return descriptors.sort((left, right) => left.label.localeCompare(right.label));
  }
}
