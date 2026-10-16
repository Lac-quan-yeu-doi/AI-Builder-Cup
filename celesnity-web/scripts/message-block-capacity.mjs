/** Read credentials only from a private fixture file; never include them in results. */
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const run = promisify(execFile);
if (!process.env.STREAM_TEST_CONFIG) {
  console.info(
    'Usage: STREAM_TEST_CONFIG=/private/config.json node scripts/message-block-capacity.mjs\nSee docs/operations/message-block-streams.md. Default duration: 900 seconds.',
  );
  process.exit(0);
}
const config = JSON.parse(await readFile(process.env.STREAM_TEST_CONFIG, 'utf8'));
if (
  !['core', 'web', 'gateway'].includes(config.target) ||
  !Array.isArray(config.profiles) ||
  config.profiles.length === 0
)
  throw new Error('Invalid capacity test configuration');
const duration = Number(config.durationSeconds ?? 900);
if (!Number.isFinite(duration) || duration < 900)
  throw new Error('The development gate requires at least 900 seconds');
if (
  !config.kubernetes?.context ||
  !config.kubernetes?.namespace ||
  !config.pods?.length ||
  !config.probes?.length
)
  throw new Error('The live gate requires Kubernetes memory sampling and cleanup probes');
const outcomes = {
  accepted: 0,
  rejected: 0,
  rotations: 0,
  unexpected: 0,
  heartbeats: 0,
  memory: [],
};
const held = new Set();
function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
async function open(profile, expected = 200) {
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 30_000);
  let response;
  try {
    response = await fetch(profile.url, {
      headers: { ...profile.headers, Accept: 'text/event-stream' },
      signal: abort.signal,
    });
  } finally {
    clearTimeout(deadline);
  }
  if (expected === 429) {
    await response.body?.cancel();
    abort.abort();
    ensure(response.status === 429, 'Capacity probe was not rejected with 429');
    ensure(
      response.headers.get('retry-after') === '10',
      'Admission rejection omitted Retry-After: 10',
    );
    outcomes.rejected += 1;
    return null;
  }
  if (
    response.status !== 200 ||
    !response.headers.get('content-type')?.includes('text/event-stream')
  ) {
    await response.body?.cancel();
    abort.abort();
    throw new Error(`Expected an admitted SSE response, received HTTP ${response.status}`);
  }
  outcomes.accepted += 1;
  const reader = response.body?.getReader();
  ensure(reader, 'Missing stream body');
  const connection = {
    reader,
    abort,
    started: performance.now(),
    rotation: false,
    stopped: false,
    closed: false,
  };
  held.add(connection);
  return connection;
}
async function close(connection) {
  if (!connection || connection.closed) return;
  connection.closed = true;
  connection.abort.abort();
  await connection.reader.cancel().catch(() => {});
  connection.reader.releaseLock();
  held.delete(connection);
}
async function releaseAll() {
  await Promise.all([...held].map(close));
  await sleep(500);
}
async function verifyAdmission() {
  if (config.target === 'gateway') return;
  for (let index = 0; index < 8; index++) await open(config.profiles[0]);
  await open(config.profiles[0], 429);
  await close([...held][0]);
  await sleep(100);
  await open(config.profiles[0]);
  await releaseAll();
  if (config.target === 'core') {
    const organization = config.profiles[0].organization;
    const sameOrg = config.profiles.filter((profile) => profile.organization === organization);
    ensure(
      new Set(sameOrg.map((profile) => profile.identity)).size >= 3,
      'Core organization probe requires three identities in one organization',
    );
    for (const profile of sameOrg.slice(0, 2))
      for (let index = 0; index < 8; index++) await open(profile);
    await open(sameOrg[2], 429);
    await releaseAll();
  }
  const cap = config.target === 'core' ? 32 : 64;
  const perOrg = new Map();
  let admitted = 0;
  for (const profile of config.profiles) {
    const used = perOrg.get(profile.organization) ?? 0;
    const count = Math.min(8, cap - admitted, config.target === 'core' ? 16 - used : 8);
    for (let index = 0; index < count; index++) await open(profile);
    admitted += count;
    perOrg.set(profile.organization, used + count);
    if (admitted === cap) break;
  }
  ensure(admitted === cap, 'Insufficient distinct profiles to reach the pod cap');
  await open(config.profiles[0], 429);
  await releaseAll();
}
async function consume(connection) {
  const decoder = new TextDecoder();
  let buffer = '';
  while (!connection.stopped) {
    let watchdog;
    const expired = new Promise((_, reject) => {
      watchdog = setTimeout(() => reject(new Error('No stream activity for 45 seconds')), 45_000);
    });
    let result;
    try {
      result = await Promise.race([connection.reader.read(), expired]);
    } finally {
      clearTimeout(watchdog);
    }
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (frame.includes('event: heartbeat')) outcomes.heartbeats += 1;
      if (frame.includes('event: stream_end')) {
        connection.rotation = true;
        outcomes.rotations += 1;
      }
      ensure(
        !frame.includes('event: stream_error'),
        'Unexpected stream error during capacity test',
      );
    }
    ensure(buffer.length <= 1_048_576, 'Unbounded client frame accumulation');
  }
  if (!connection.stopped) {
    ensure(connection.rotation, 'Stream closed without a planned rotation');
    ensure(
      performance.now() - connection.started >= 239_000,
      'Stream ended before the application deadline',
    );
  }
}
async function sampleMemory() {
  if (!config.kubernetes || !config.pods?.length) return;
  const args = ['--context', config.kubernetes.context, '-n', config.kubernetes.namespace];
  for (const pod of config.pods) {
    const [{ stdout: spec }, { stdout: metrics }] = await Promise.all([
      run('kubectl', [...args, 'get', 'pod', pod, '-o', 'json']),
      run('kubectl', [
        ...args,
        'get',
        '--raw',
        `/apis/metrics.k8s.io/v1beta1/namespaces/${encodeURIComponent(config.kubernetes.namespace)}/pods/${encodeURIComponent(pod)}`,
      ]),
    ]);
    const containers = JSON.parse(spec).spec.containers;
    for (const usage of JSON.parse(metrics).containers) {
      const container = containers.find((value) => value.name === usage.name);
      const fraction =
        quantity(usage.usage.memory) / quantity(container?.resources?.limits?.memory);
      ensure(
        Number.isFinite(fraction) && fraction < 0.8,
        'Container memory reached 80% of its configured limit',
      );
      outcomes.memory.push({
        pod: config.pods.indexOf(pod),
        atSeconds: Math.round((performance.now() - started) / 1000),
        container: usage.name,
        fraction,
      });
    }
  }
}
function quantity(value) {
  const match = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|K|M|G)?$/.exec(value ?? '');
  return match
    ? Number(match[1]) *
        ({ Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, K: 1000, M: 1e6, G: 1e9 }[match[2]] ?? 1)
    : NaN;
}
async function verifyZero() {
  for (const probe of config.probes ?? []) {
    const response = await fetch(probe.url, { headers: probe.headers });
    ensure(response.ok, 'Cleanup probe failed');
    if (probe.kind === 'web')
      ensure(
        (await response.json()).messageBlockStreams.active === 0,
        'Web retained active streams after cleanup',
      );
    else
      ensure(
        /^message_block_active_streams(?:\{[^\n]*\})? 0(?:\s|$)/m.test(await response.text()),
        'Core retained active streams after cleanup',
      );
  }
}
const started = performance.now();
let stopping = false;
let fatal;
const workers = [];
try {
  await verifyAdmission();
  const until = performance.now() + duration * 1000;
  const profiles = config.profiles.slice(0, Math.min(3, config.profiles.length));
  for (const profile of profiles)
    for (let tab = 0; tab < 3; tab++)
      workers.push(
        (async () => {
          while (!stopping) {
            let connection;
            try {
              connection = await open(profile);
              await consume(connection);
            } catch (error) {
              if (!stopping) {
                fatal = error;
                outcomes.unexpected += 1;
                stopping = true;
              }
            } finally {
              await close(connection);
            }
            if (!stopping) await sleep(500 + Math.random() * 1000);
          }
        })(),
      );
  let lastChurn = 0;
  while (!stopping && performance.now() < until) {
    const churn = Math.floor((performance.now() - (until - duration * 1000)) / 60_000);
    if (churn > lastChurn) {
      lastChurn = churn;
      const obsolete = [...held][0];
      if (obsolete) {
        obsolete.stopped = true;
        await close(obsolete);
      }
    }
    await sampleMemory();
    await sleep(Math.min(15_000, Math.max(1, until - performance.now())));
  }
  stopping = true;
  for (const connection of held) connection.stopped = true;
  await releaseAll();
  await Promise.all(workers);
  if (fatal) throw fatal;
  await verifyZero();
  // Compare three five-minute windows after startup; flag steady growth, allowing 2% limit noise.
  const memoryGroups = new Map();
  for (const sample of outcomes.memory) {
    const key = `${sample.pod}:${sample.container}`;
    const values = memoryGroups.get(key) ?? [];
    values.push(sample);
    memoryGroups.set(key, values);
  }
  for (const values of memoryGroups.values()) {
    const windows = [0, 1, 2].map((window) =>
      values
        .filter(
          (sample) => sample.atSeconds >= window * 300 && sample.atSeconds < (window + 1) * 300,
        )
        .map((sample) => sample.fraction)
        .sort((left, right) => left - right),
    );
    const medians = windows.map((values) => values[Math.floor(values.length / 2)]);
    ensure(medians.every(Number.isFinite), 'Insufficient memory samples');
    ensure(
      !(medians[1] > medians[0] + 0.02 && medians[2] > medians[1] + 0.02),
      'Progressive memory growth during connection churn',
    );
  }
  ensure(outcomes.rotations >= 3, 'No sustained planned rotations were observed');
  console.info(
    JSON.stringify({ event: 'capacity_test_passed', durationSeconds: duration, ...outcomes }),
  );
} catch (error) {
  stopping = true;
  for (const connection of held) connection.stopped = true;
  await releaseAll();
  await Promise.all(workers);
  // Error messages are fixed assertions or HTTP status; request headers and URLs never appear here.
  console.error(
    JSON.stringify({
      event: 'capacity_test_failed',
      message: error instanceof Error ? error.message : 'test failed',
      ...outcomes,
    }),
  );
  process.exitCode = 1;
}
