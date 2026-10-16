import { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import { MysqlConnectionProbe } from '@infrastructure/dbms/mysql/mysql-connection.probe';
import { MysqlExecutionAdapter } from '@infrastructure/dbms/mysql/mysql-execution.adapter';
import { createMysqlPlugin, MYSQL_TYPE } from '@infrastructure/dbms/mysql/mysql.plugin';

describe('createMysqlPlugin', () => {
  it('bundles the MySQL capabilities under the MYSQL identity', () => {
    const configCodec = new MysqlConfigCodec();
    const probe = new MysqlConnectionProbe(configCodec, { timeoutMilliseconds: 1_000 });
    const executionAdapter = new MysqlExecutionAdapter(configCodec);

    const plugin = createMysqlPlugin({ configCodec, probe, executionAdapter });

    expect(MYSQL_TYPE.value).toBe('MYSQL');
    expect(plugin.connectorType).toBe(MYSQL_TYPE);
    expect(plugin.configCodec).toBe(configCodec);
    expect(plugin.probe).toBe(probe);
    expect(plugin.executionAdapter).toBe(executionAdapter);
  });
});
