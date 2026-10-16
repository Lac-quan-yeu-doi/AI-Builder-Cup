import { spawn } from 'node:child_process';
import { Client } from 'pg';

const DATABASE_NAME = 'celesnity_data_workflow_foundation_test';
const SCHEMA_NAME = 'celesnity_app';
const databaseUrl = process.env.DATA_WORKFLOW_INTEGRATION_DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error(
    'Set DATA_WORKFLOW_INTEGRATION_DATABASE_URL to the designated disposable database.',
  );
}

const url = new URL(databaseUrl);
if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
  throw new Error('DATA_WORKFLOW_INTEGRATION_DATABASE_URL must use a PostgreSQL URL.');
}
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
  throw new Error('DATA_WORKFLOW_INTEGRATION_DATABASE_URL must target a loopback host.');
}
if (url.pathname.replace(/^\//, '') !== DATABASE_NAME) {
  throw new Error(`DATA_WORKFLOW_INTEGRATION_DATABASE_URL must target only ${DATABASE_NAME}.`);
}
if (url.searchParams.get('schema') !== SCHEMA_NAME) {
  throw new Error(`DATA_WORKFLOW_INTEGRATION_DATABASE_URL must select the ${SCHEMA_NAME} schema.`);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

await recreateDisposableDatabase();
try {
  await run(npm, ['run', 'prisma:migrate:deploy']);
  await run(npx, ['jest', '--config', 'jest.data-workflow-integration.config.ts', '--runInBand']);
} finally {
  await dropDisposableDatabase();
}

async function recreateDisposableDatabase() {
  const admin = new Client({ connectionString: administratorUrl() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DATABASE_NAME} TEMPLATE template0`);
  } finally {
    await admin.end();
  }

  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  try {
    await database.query(`CREATE SCHEMA ${SCHEMA_NAME} AUTHORIZATION celesnity_app_owner`);
  } finally {
    await database.end();
  }
}

async function dropDisposableDatabase() {
  const admin = new Client({ connectionString: administratorUrl() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

function administratorUrl() {
  const admin = new URL(databaseUrl);
  admin.pathname = '/postgres';
  admin.search = '';
  return admin.toString();
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : command,
      process.platform === 'win32' ? ['/d', '/s', '/c', `${command} ${args.join(' ')}`] : args,
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}
