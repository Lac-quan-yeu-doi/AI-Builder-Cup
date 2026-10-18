/**
 * Phase 7 — runs the scripted Demo Data 1 conversation and keeps its charts.
 *
 * The demo's claim is that an answer can be kept and found again later, so this
 * does the same two things a person does on camera: ask, then press Keep. Each
 * chart preview the agent produces is promoted into the "Demo Data 1 – Home
 * Appliance" collection through the same `chat-charts` endpoint the Keep button
 * uses, so the room is never empty at the start of a take and the artifacts
 * survive a reload.
 *
 * It also serves as the rehearsal: every question is asked against live data and
 * its answer printed, so a wrong or empty answer is found here rather than in
 * front of the audience.
 *
 * Chart blocks are read from Core's database. DATABASE_URL defaults to the
 * compose Postgres when Core is local; without a database the questions are
 * still asked, but no chart is kept.
 *
 *   node mock-data/demo1-home-appliance/seed/07-seed-chat-artifacts.mjs [--only 3] [--no-keep]
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { DEMO, agentFetch, coreFetch, coreUrl, readIds, writeIds } from '../ids.mjs';

const isLocalCore = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//u.test(`${coreUrl()}/`);
const databaseUrl =
  process.env.DATABASE_URL ??
  (isLocalCore
    ? 'postgresql://celesnity:celesnity_dev_password@127.0.0.1:15432/celesnity?schema=celesnity_app'
    : undefined);
const keep = !process.argv.includes('--no-keep');
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex === -1 ? undefined : Number(process.argv[onlyIndex + 1]);

/**
 * The questions, in the order they are asked on camera.
 *
 * `expect` is a substring the answer must contain. It is what turns this from a
 * seeding script into a rehearsal: an assistant that quietly answers about the
 * wrong station or the wrong model fails here.
 */
const QUESTIONS = [
  {
    key: 'oee-week',
    text: 'How do output and OEE at the plant this week compare with last week?',
    expect: ['OEE'],
  },
  {
    key: 'output-loss',
    text: 'Which station lost the most output over the last 30 days? Draw a Pareto chart of the downtime reasons.',
    expect: ['foam'],
  },
  {
    key: 'why-foam',
    text: 'Why has OEE at the PU foam station dropped, and roughly how many units has it cost us?',
    expect: ['foam'],
  },
  {
    key: 'r600a-leak',
    text: 'Which model has the most R600a gas leaks, and which station does the defect originate from?',
    expect: ['FZ-S245'],
  },
  {
    key: 'exports',
    text: 'Compare export volume and on-time delivery to North America and Europe this quarter.',
    expect: ['North America'],
  },
  {
    key: 'weekly-report',
    text: "Write a weekly report for the leadership team on the plant's production.",
    expect: [],
  },
];

const ids = readIds();
if (ids.chartCollectionId === undefined) {
  throw new Error('Run 03-seed-charts.mjs first — kept charts need its collection.');
}

const database =
  databaseUrl === undefined ? undefined : new pg.Client({ connectionString: databaseUrl });
if (database !== undefined) await database.connect();

const roomKey = 'demo1-home-appliance-demo';
const room = await ensureRoom();
console.log(`Chat room: ${room.id}\n`);

const transcript = [];
let kept = 0;

for (const [index, question] of QUESTIONS.entries()) {
  if (only !== undefined && only !== index + 1) continue;
  console.log(`[${index + 1}/${QUESTIONS.length}] ${question.text}`);

  const before = await blockCount();
  /* Core must know the run before the agent calls any MCP tool
     (RUN_REGISTRATION_REQUIRED), exactly as the web chat does: pick the id,
     register it with its data scope, then admit it. */
  const runId = randomUUID();
  const dataScope = { catalog: 'iceberg', schema: DEMO.database };
  await coreFetch(`rooms/${room.id}/agent-runs`, {
    method: 'POST',
    body: { runId, agentName: 'chat-assistant', scope: dataScope },
  });
  const run = await agentFetch(`/rooms/${room.id}/runs`, {
    method: 'POST',
    body: JSON.stringify({
      run_id: runId,
      agent: 'chat-assistant',
      kind: 'session_bound',
      input: question.text,
      data_scope: dataScope,
    }),
  });

  const answer = await waitForAnswer(run.run_id);
  const blocks = await blocksSince(before);
  const charts = blocks.filter((block) => block.block_type === 'chart');

  for (const missing of question.expect.filter((token) => !answer.includes(token))) {
    console.log(`    ! the answer does not mention "${missing}" — check it before recording`);
  }

  console.log(`    ${answer.replace(/\s+/gu, ' ').slice(0, 260)}…`);
  console.log(`    charts: ${charts.length}`);

  for (const block of charts) {
    if (!keep) continue;
    const payload = block.payload;
    const saved = await coreFetch('chart-authoring/chat-charts', {
      method: 'POST',
      body: {
        title: payload.title,
        description: payload.description ?? question.text,
        collection_id: ids.chartCollectionId,
        query_definition: payload.query_definition,
        visualization_definition: payload.visualization_definition,
        ...(payload.parameter_values === undefined
          ? {}
          : { parameter_values: payload.parameter_values }),
      },
    });
    kept += 1;
    console.log(`    kept "${payload.title}" → ${saved.id}`);
  }

  transcript.push({ question: question.text, answer, charts: charts.length });
}

if (database !== undefined) await database.end();
writeIds({ chatRoomId: room.id });

console.log(
  `\nAsked ${transcript.length} questions, kept ${kept} charts in ${DEMO.collectionName}.`,
);
console.log(`Open /chat and pick the "${roomKey}" conversation to replay it.`);

/**
 * Creates the room and binds it to this organization in Core.
 *
 * The bind is not optional. Core's MCP endpoints run each tool as the user who
 * bound the room, and without an `AgentRoomBinding` every Trino and chart call
 * returns "MCP room delegation is invalid or no longer active" — the agent then
 * explains, fluently, that it could not reach the data.
 */
async function ensureRoom() {
  const rooms = await agentFetch('/rooms');
  const found = (Array.isArray(rooms) ? rooms : []).find((item) => item.key === roomKey);
  const created =
    found ??
    (await agentFetch('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        name: DEMO.siteName,
        max_concurrent_runs: 1,
        key: roomKey,
        members: ['chat-assistant'],
      }),
    }));
  await coreFetch(`rooms/${created.id}/message-blocks/bind`, {
    method: 'POST',
    body: { agentName: 'chat-assistant' },
  });
  return created;
}

/**
 * Waits for the run to finish and returns the assistant's text.
 *
 * The transcript is read from the agent's own session rather than the SSE
 * stream: the stream carries token deltas that have to be reassembled, and a
 * seeding script that mis-assembles them would silently "verify" a sentence the
 * user never saw.
 */
async function waitForAnswer(runId) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    /* `/runs/{id}` is not a route; the status contract lives at `/runs/{id}/status`
       and hands back the session id, so no lookup by room key is needed. */
    const run = await agentFetch(`/runs/${runId}/status`).catch(() => undefined);
    const status = String(run?.status ?? '').toLowerCase();
    if (['failed', 'cancelled', 'error'].some((value) => status.includes(value))) {
      throw new Error(`Run ${runId} ended ${run?.status}: ${run?.error ?? ''}`);
    }
    if (!['finished', 'completed', 'succeeded'].some((value) => status.includes(value))) continue;

    const dto = await agentFetch(`/sessions/${run.session_id}/transcript`).catch(() => undefined);
    const history = dto?.history ?? [];
    const assistant = [...history].reverse().find((message) => message.role === 'assistant');
    const content = assistant?.content;
    return typeof content === 'string' ? content : JSON.stringify(content ?? '');
  }
  throw new Error(`Run ${runId} did not finish within the wait`);
}

async function blockCount() {
  if (database === undefined) return 0;
  const result = await database.query(
    'select count(*)::int n from celesnity_app.message_blocks where room_id = $1',
    [room.id],
  );
  return result.rows[0].n;
}

async function blocksSince(offset) {
  if (database === undefined) return [];
  const result = await database.query(
    `select block_type, payload from celesnity_app.message_blocks
      where room_id = $1 order by published_at asc offset $2`,
    [room.id, offset],
  );
  return result.rows;
}
