import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import type {
  ConnectionTestResult,
  DatabaseServiceConnector,
  IConnectionConfigCodec,
  IConnectionProbe,
  IExecutionConnectionAdapter,
  NetworkDestination,
  NormalizedConnectionDetails,
} from '@application/database-service/interfaces';
import { DatabaseServiceConnectorRegistry } from '@infrastructure/dbms/registry/database-service-connector.registry';

const destination: NetworkDestination = {
  host: 'db.internal',
  port: 5432,
  engineLabel: 'Test',
};

const config = NormalizedConnectionConfig.create(1, { engine: 'test' });

class FakeCodec implements IConnectionConfigCodec {
  public normalize(): NormalizedConnectionDetails {
    return { config, destination };
  }

  public restore(): Omit<NormalizedConnectionDetails, 'credential'> {
    return { config, destination };
  }
}

class FakeProbe implements IConnectionProbe {
  public test(): Promise<ConnectionTestResult> {
    return Promise.resolve({ status: VerificationStatusValue.SUCCEEDED, testedAt: new Date(0) });
  }
}

class FakeExecutionAdapter implements IExecutionConnectionAdapter {
  public build(): ExecutionConnectionDescriptor {
    return ExecutionConnectionDescriptor.create({
      driverClass: 'org.example.Driver',
      jdbcUrl: 'jdbc:example:test',
      publicOptions: {},
      secretOptions: {},
    });
  }
}

function plugin(connectorType: string): DatabaseServiceConnector {
  return {
    connectorType: ConnectorType.create(connectorType),
    configCodec: new FakeCodec(),
    probe: new FakeProbe(),
    executionAdapter: new FakeExecutionAdapter(),
  };
}

describe('DatabaseServiceConnectorRegistry', () => {
  it('normalizes lookup keys and returns the matching plugin', () => {
    const registry = new DatabaseServiceConnectorRegistry([
      plugin('postgresql'),
      plugin('test_dbms'),
    ]);

    expect(registry.require(ConnectorType.create('POSTGRESQL')).connectorType.value).toBe(
      'POSTGRESQL',
    );
    expect(registry.require(ConnectorType.create('test_dbms')).connectorType.value).toBe(
      'TEST_DBMS',
    );
  });

  it('rejects duplicate plugin types during construction', () => {
    expect(
      () => new DatabaseServiceConnectorRegistry([plugin('postgresql'), plugin('POSTGRESQL')]),
    ).toThrow('Database type POSTGRESQL is registered more than once.');
  });

  it('rejects an unsupported type lookup', () => {
    const registry = new DatabaseServiceConnectorRegistry([plugin('postgresql')]);

    try {
      registry.require(ConnectorType.create('MYSQL'));
      throw new Error('Expected an unsupported DBMS error.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConnectionError);
      expect(error).toMatchObject({
        code: 'UNSUPPORTED_DBMS',
        message: 'Database type MYSQL is not supported.',
      });
    }
  });

  it('does not observe changes to the constructor input after creation', () => {
    const plugins = [plugin('postgresql')];
    const registry = new DatabaseServiceConnectorRegistry(plugins);

    plugins.push(plugin('mysql'));

    expect(() => registry.require(ConnectorType.create('MYSQL'))).toThrow(
      'Database type MYSQL is not supported.',
    );
  });
});
