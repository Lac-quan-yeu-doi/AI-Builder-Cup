import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const composeFile = resolve(repositoryRoot, 'tests/mysql/compose.yaml');
const project = 'celesnity-mysql-jdbc-smoke';

function run(command, args, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (capture) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${String(result.status)}`);
  }
  return capture ? result.stdout ?? '' : '';
}

function cleanup() {
  const result = spawnSync(
    'docker',
    ['compose', '-p', project, '-f', composeFile, 'down', '-v', '--remove-orphans'],
    { cwd: repositoryRoot, stdio: 'inherit' },
  );
  return result.status === 0;
}

let failure;
try {
  run('docker', [
    'compose',
    '-p',
    project,
    '-f',
    composeFile,
    'build',
    'truststore',
    'spark-smoke-plain',
    'spark-smoke-tls',
  ]);
  run('docker', [
    'compose',
    '-p',
    project,
    '-f',
    composeFile,
    'up',
    '-d',
    '--wait',
    'mysql-plain',
    'mysql-tls',
  ]);
  run('docker', [
    'compose',
    '-p',
    project,
    '-f',
    composeFile,
    'run',
    '--rm',
    '--no-deps',
    'truststore',
  ]);
  const plainOutput = run('docker', [
    'compose',
    '-p',
    project,
    '-f',
    composeFile,
    'run',
    '--rm',
    '--no-deps',
    'spark-smoke-plain',
  ], { capture: true });
  if (!plainOutput.includes('MYSQL_SPARK_SMOKE_OK')) {
    throw new Error('Plain MySQL Spark smoke did not report MYSQL_SPARK_SMOKE_OK.');
  }
  const tlsOutput = run('docker', [
    'compose',
    '-p',
    project,
    '-f',
    composeFile,
    'run',
    '--rm',
    '--no-deps',
    'spark-smoke-tls',
  ], { capture: true });
  if (!tlsOutput.includes('MYSQL_SPARK_SMOKE_OK')) {
    throw new Error('TLS MySQL Spark smoke did not report MYSQL_SPARK_SMOKE_OK.');
  }
} catch (error) {
  failure = error;
} finally {
  cleanup();
}

if (failure !== undefined) {
  throw failure;
}
