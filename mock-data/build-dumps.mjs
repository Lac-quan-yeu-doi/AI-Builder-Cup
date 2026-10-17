/**
 * Builds the committed Postgres dumps in `mock-data/init/` from the two
 * deterministic generators. `sample-postgres` (docker-compose.yaml) loads every
 * file in that folder the first time its volume is created.
 *
 *   node mock-data/build-dumps.mjs [--end-date YYYY-MM-DD] [--only demo1|demo2]
 *
 * The end date is pinned so a rebuild produces byte-identical dumps. The planted
 * stories are tuned against it: the generators assert them and this script
 * fails if one is missing, so try another date if you move it.
 *
 * Needs Node 20+ and python3 (Demo 2's weekly scheduler). No npm packages.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const DEFAULT_END_DATE = '2026-10-09';

const here = dirname(fileURLToPath(import.meta.url));
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const endDate = new Date(`${argument('end-date', DEFAULT_END_DATE)}T00:00:00Z`);
const only = argument('only', undefined);

const DEMOS = [
  {
    key: 'demo1',
    dir: 'demo1-home-appliance',
    schema: 'demo1_home_appliance',
    file: '10-demo1_home_appliance.sql.gz',
    title: 'Demo Data 1 (home appliance — chest freezers)',
  },
  {
    key: 'demo2',
    dir: 'demo2-coffee-capsules',
    schema: 'demo2_coffee_capsules',
    file: '20-demo2_coffee_capsules.sql.gz',
    title: 'Demo Data 2 (coffee capsules)',
    afterGenerate: addSchedulerPlan,
  },
];

/** Column names per table, in DDL order, read from the demo's schema.sql. */
function tableColumns(schemaSql, schema) {
  const tables = new Map();
  const pattern = new RegExp(`CREATE TABLE ${schema}\\.(\\w+) \\(([\\s\\S]*?)\\n\\);`, 'gu');
  for (const [, table, body] of schemaSql.matchAll(pattern)) {
    const columns = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('--'))
      .map((line) => line.split(/\s+/u)[0]);
    tables.set(table, columns);
  }
  return tables;
}

/** One value in COPY text format. */
function copyValue(value) {
  if (value === null || value === undefined) return '\\N';
  if (typeof value === 'boolean') return value ? 't' : 'f';
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\t', '\\t')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r');
}

function copyBlock(schema, table, columns, rows) {
  const lines = [`COPY ${schema}.${table} (${columns.join(', ')}) FROM stdin;`];
  for (const row of rows) {
    const byLower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
    lines.push(columns.map((column) => copyValue(byLower[column])).join('\t'));
  }
  lines.push('\\.', '');
  return lines.join('\n');
}

/** Checks every generated key lands in a column, so a rename never drops data silently. */
function checkKeys(table, columns, rows) {
  const known = new Set(columns);
  const keys = new Set(rows.flatMap((row) => Object.keys(row)).map((key) => key.toLowerCase()));
  const unknown = [...keys].filter((key) => !known.has(key) && !key.startsWith('_'));
  if (unknown.length > 0) throw new Error(`${table}: generated keys missing from schema.sql: ${unknown.join(', ')}`);
}

/**
 * Demo 2's "AI" weekly plan: the generator writes next week's scheduling input,
 * the scheduler plans it, and the plan is stored beside the hand-made ones.
 */
function addSchedulerPlan(result, demoDir) {
  const work = mkdtempSync(join(tmpdir(), 'demo2-schedule-'));
  try {
    const input = join(work, 'input.json');
    writeFileSync(input, JSON.stringify(result.scheduleInput, null, 2));
    execFileSync('python3', ['-I', join(demoDir, 'scheduler', 'scheduler.py'), input, '--out', work, '--no-png'], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const planned = JSON.parse(readFileSync(join(work, 'schedule.json'), 'utf8'));
    const kpis = planned.kpis.total;
    if (kpis.unmet_total > 0 || kpis.milk_minutes_in_high_risk > 0) {
      throw new Error(
        `The scheduler plan is not demo-ready: unmet ${kpis.unmet_total}, milk in HIGH risk ${kpis.milk_minutes_in_high_risk} min.`,
      );
    }
    const planId = `PLAN-${planned.week_label.replace('-W', '')}-AI`;
    result.tables.mes_plan_header.push({
      PLAN_ID: planId,
      PLAN_WEEK: planned.week_label,
      SOURCE: 'MINDER_AI',
      CREATED_BY: 'minder.ai',
      CREATED_AT: `${result.summary.window.to} 14:00:00`,
      APPROVED_BY: null,
      APPROVED_AT: null,
      EFFORT_HOURS: 0.1,
    });
    for (const slot of planned.slots.filter((item) => item.kind === 'RUN')) {
      result.tables.mes_plan_slot.push({
        PLAN_ID: planId,
        LINE: slot.line,
        SLOT_NO: slot.slot_no,
        START_TS: slot.start.replace('T', ' '),
        END_TS: slot.end.replace('T', ' '),
        MATNR: slot.sku.padStart(18, '0'),
        PLAN_BOX: slot.boxes,
        NOTE: slot.note ?? '',
      });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

mkdirSync(join(here, 'init'), { recursive: true });
for (const demo of DEMOS) {
  if (only !== undefined && only !== demo.key) continue;
  const demoDir = join(here, demo.dir);
  const { generate, assertPlantedSignals } = await import(join(demoDir, 'generate.mjs'));
  const result = generate({ endDate });
  assertPlantedSignals(result.summary);
  demo.afterGenerate?.(result, demoDir);

  const schemaSql = readFileSync(join(demoDir, 'schema.sql'), 'utf8');
  const indexSql = readFileSync(join(demoDir, 'indexes.sql'), 'utf8');
  const columnsByTable = tableColumns(schemaSql, demo.schema);

  const parts = [
    `-- ${demo.title} — generated by mock-data/build-dumps.mjs, do not edit by hand.`,
    `-- Window: ${result.summary.window.from} → ${result.summary.window.to}. Mock data only.`,
    "SET client_encoding = 'UTF8';",
    'BEGIN;',
    schemaSql,
  ];
  let total = 0;
  for (const [table, rows] of Object.entries(result.tables)) {
    const columns = columnsByTable.get(table);
    if (columns === undefined) throw new Error(`${demo.schema}.${table} is generated but not in schema.sql.`);
    checkKeys(table, columns, rows);
    parts.push(copyBlock(demo.schema, table, columns, rows));
    total += rows.length;
  }
  for (const table of columnsByTable.keys()) {
    if (!(table in result.tables)) throw new Error(`${demo.schema}.${table} is in schema.sql but never generated.`);
  }
  parts.push(indexSql, `ANALYZE;`, 'COMMIT;', '');

  const sql = parts.join('\n');
  const gz = gzipSync(Buffer.from(sql, 'utf8'), { level: 9 });
  writeFileSync(join(here, 'init', demo.file), gz);
  console.log(
    `${demo.file}: ${Object.keys(result.tables).length} tables, ${total} rows, ` +
      `${(sql.length / 1e6).toFixed(1)} MB SQL → ${(gz.length / 1e6).toFixed(1)} MB gzip ` +
      `(${result.summary.window.from} → ${result.summary.window.to})`,
  );
}
