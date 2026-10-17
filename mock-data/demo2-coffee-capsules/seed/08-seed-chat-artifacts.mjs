/**
 * Demo Data 2, phase 8 — runs the scripted Demo Data 2 conversation and keeps its charts.
 *
 * The demo's claim is that an answer can be kept and found again later, so this
 * does the same two things a person does on camera: ask, then press Keep. Each
 * chart preview the agent produces is promoted into the "Demo Data 2 – Coffee Capsules"
 * collection through the same `chat-charts` endpoint the Keep button uses, so
 * the room is never empty at the start of a take and the artifacts survive a
 * reload.
 *
 * It also serves as the rehearsal: every question is asked against live data and
 * its answer printed, so a wrong or empty answer is found here rather than in
 * front of the board.
 *
 * DATABASE_URL (Core's Postgres) lets the script read the chart blocks the agent
 * published. When it is unset and Core is local, the compose default
 * postgresql://celesnity:…@127.0.0.1:15432/celesnity is used.
 *
 *   node mock-data/demo2-coffee-capsules/seed/08-seed-chat-artifacts.mjs [--only 3] [--no-keep] [--room KEY]
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { agentFetch, coreFetch, coreUrl, readIds, writeIds } from '../ids.mjs';
import { DEMO } from '../reference.mjs';

/*
 * The caller id must be the identity *subject*, not its UUID. Core resolves an
 * MCP delegation by matching the room binding's `boundBy.subject` against the
 * caller the agent reports, so a UUID here binds the room as one principal and
 * calls tools as another — and every tool comes back "MCP room delegation is
 * invalid or no longer active".
 */
const LOCAL_CORE_DATABASE_URL =
  'postgresql://celesnity:celesnity_dev_password@127.0.0.1:15432/celesnity?schema=celesnity_app';
const isLocalCore = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//u.test(`${coreUrl()}/`);
const databaseUrl = process.env.DATABASE_URL ?? (isLocalCore ? LOCAL_CORE_DATABASE_URL : undefined);
const keep = !process.argv.includes('--no-keep');
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex === -1 ? undefined : Number(process.argv[onlyIndex + 1]);

/** Letters only Vietnamese uses (A/D/O/U with breve, stroke or horn, and the precomposed tone marks), as escapes. */
const VIETNAMESE_LETTERS = /[\u0102\u0103\u0110\u0111\u01A0\u01A1\u01AF\u01B0\u1EA0-\u1EF9]/u;

/**
 * The questions, in the order they are asked on camera.
 *
 * `expect` is a substring the answer must contain. It is what turns this from a
 * seeding script into a rehearsal: an assistant that quietly answers the wrong
 * station, or answers in the wrong language, fails here.
 */
const QUESTIONS = [
  {
    key: 'loss-3-weeks',
    text: 'How many kg of coffee powder did we lose over the last 3 weeks, where did it go and what did it cost? Draw a chart.',
    expect: ['overfill'],
  },
  {
    key: 'manual-vs-machine',
    text: 'How far are the losses the operators wrote in the shift log from the machine data? Which shift leaves the log blank most often?',
    expect: ['Shift 3'],
  },
  {
    key: 'forecast-ph-th',
    text: 'How does the 13-week demand forecast for Iced milk coffee and Americano in the Philippines and Thailand compare with the 6-month plan?',
    expect: ['Philippines'],
  },
  {
    key: 'risk-next-week',
    text: 'Is there a risk of a stoppage next week from humidity or from equipment? How should we adjust the production schedule?',
    expect: ['humidity', 'auger'],
  },
  {
    key: 'build-schedule',
    text: 'Build next week’s production schedule for the 2 lines following the proposal above and save it as a document.',
    expect: ['changeover'],
  },
  {
    key: 'seal-heater-lookback',
    text: 'How many days earlier could the lid seal heater failure on line 2 in September have been detected?',
    expect: ['days'],
  },
  {
    key: 'weekly-report',
    text: 'Write the weekly report for the Site Manager on output, OEE, losses, risks and next week’s schedule.',
    expect: [],
  },
];

const ids = readIds();
if (ids.chartCollectionId === undefined) {
  throw new Error('Run 04-seed-charts.mjs first — kept charts need its collection.');
}

const database =
  databaseUrl === undefined ? undefined : new pg.Client({ connectionString: databaseUrl });
if (database !== undefined) await database.connect();

/* A room keeps its session history; use a fresh key (--room) after any failed rehearsal,
   or the agent "remembers" earlier failures instead of querying again. */
const roomIndex = process.argv.indexOf('--room');
const roomKey = roomIndex === -1 ? 'demo2-coffee-capsules-site-manager' : process.argv[roomIndex + 1];
const room = await ensureRoom();
console.log(`Chat room: ${room.id}\n`);

const transcript = [];
let kept = 0;

for (const [index, question] of QUESTIONS.entries()) {
  if (only !== undefined && only !== index + 1) continue;
  console.log(`[${index + 1}/${QUESTIONS.length}] ${question.text}`);

  const before = await blockCount();
  /* Core must know the run before the agent calls any MCP tool (RUN_REGISTRATION_REQUIRED),
     exactly as the web chat does: pick the id, register it with its data scope, then admit it. */
  const runId = randomUUID();
  await coreFetch(`rooms/${room.id}/agent-runs`, {
    method: 'POST',
    body: { runId, agentName: 'chat-assistant', scope: { catalog: 'iceberg', schema: DEMO.database } },
  });
  const run = await agentFetch(`/rooms/${room.id}/runs`, {
    method: 'POST',
    body: JSON.stringify({
      run_id: runId,
      agent: 'chat-assistant',
      kind: 'session_bound',
      input: question.text,
      data_scope: { catalog: 'iceberg', schema: DEMO.database },
    }),
  });

  const answer = await waitForAnswer(run.run_id);
  const blocks = await blocksSince(before);
  const charts = blocks.filter((block) => block.block_type === 'chart');

  for (const missing of question.expect.filter((token) => !answer.includes(token))) {
    console.log(`    ! the answer does not mention "${missing}" — check it before recording`);
  }
  if (VIETNAMESE_LETTERS.test(answer)) {
    console.log('    ! the answer does not look like English — check the agent prompt (06-agents.mjs)');
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
console.log(`Open /chat and pick the conversation "${roomKey}" to replay it.`);

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
  const room =
    found ??
    (await agentFetch('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        name: DEMO.collectionName,
        max_concurrent_runs: 1,
        key: roomKey,
        members: ['chat-assistant'],
      }),
    }));
  await coreFetch(`rooms/${room.id}/message-blocks/bind`, { method: 'POST', body: { agentName: 'chat-assistant' } });
  return room;
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
  throw new Error(`Run ${runId} did not finish in time`);
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
