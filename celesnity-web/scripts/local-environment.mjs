import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(webRoot, '..');
const webEnvironmentPath = join(webRoot, '.env.local');
const coreEnvironmentPath = join(workspaceRoot, 'celesnity-core', '.env');
const mode = process.argv[2];

if (mode === '--sync') {
  syncLocalEnvironment();
} else if (mode === '--check') {
  checkLocalEnvironment();
} else {
  fail('Usage: node scripts/local-environment.mjs --check|--sync');
}

function syncLocalEnvironment() {
  const web = readEnvironment(webEnvironmentPath);
  const core = readEnvironment(coreEnvironmentPath);
  const webKey = web.values.get('LOCAL_DEV_AUTH_SIGNING_KEY') ?? '';
  const coreKey = core.values.get('LOCAL_DEV_AUTH_SIGNING_KEY') ?? '';
  const signingKey = validSigningKey(webKey)
    ? webKey
    : validSigningKey(coreKey)
      ? coreKey
      : randomBytes(32).toString('hex');

  writeEnvironment(webEnvironmentPath, web.text, {
    CELESNITY_AUTH_MODE: 'local-development',
    LOCAL_DEV_AUTH_SIGNING_KEY: signingKey,
    AGENT_API_URL: web.values.get('AGENT_API_URL') || 'http://localhost:8080/api/v2',
  });
  writeEnvironment(coreEnvironmentPath, core.text, {
    CELESNITY_AUTH_MODE: 'local-development',
    LOCAL_DEV_AUTH_SIGNING_KEY: signingKey,
  });

  console.log('Local Web/Core authentication is synchronized; secret values were not printed.');
}

function checkLocalEnvironment() {
  const web = readEnvironment(webEnvironmentPath);
  const core = readEnvironment(coreEnvironmentPath);
  const webMode = web.values.get('CELESNITY_AUTH_MODE') ?? '';
  const coreMode = core.values.get('CELESNITY_AUTH_MODE') ?? '';

  if (webMode !== coreMode) {
    fail(
      `Local auth mode mismatch: Web is '${webMode || '<unset>'}' and Core is '${coreMode || '<unset>'}'. Run npm run local:env.`,
    );
  }
  if (webMode === 'local-development') {
    const webKey = web.values.get('LOCAL_DEV_AUTH_SIGNING_KEY') ?? '';
    const coreKey = core.values.get('LOCAL_DEV_AUTH_SIGNING_KEY') ?? '';
    if (!validSigningKey(webKey) || webKey !== coreKey) {
      fail('Local Web/Core signing keys are missing or different. Run npm run local:env.');
    }
  }
  if ((web.values.get('AGENT_API_URL') ?? '') === '') {
    fail('AGENT_API_URL is missing from .env.local. Run npm run local:env.');
  }

  console.log(`Local environment check passed (${webMode}).`);
}

function readEnvironment(path) {
  if (!existsSync(path)) {
    fail(`${path} does not exist. Copy its .env.example first, then run npm run local:env.`);
  }
  const text = readFileSync(path, 'utf8');
  const values = new Map();
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (match !== null) values.set(match[1], match[2]);
  }
  return { text, values };
}

function writeEnvironment(path, original, updates) {
  let text = original;
  for (const [name, value] of Object.entries(updates)) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, 'mu');
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(path, text, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function validSigningKey(value) {
  return value.length >= 32;
}

function fail(message) {
  console.error(`Local environment error: ${message}`);
  process.exit(1);
}
