/**
 * Writes the committed Trino fixtures for Demo Data 1 and 2 —
 * `trino/seed/demo1-home-appliance.sql.zip` and
 * `trino/seed/demo2-coffee-capsules.sql.zip` — from the Iceberg tables each
 * demo's pipelines built on a local stack.
 *
 * The compose `trino-seed` service loads them next to the `iceberg.demo`
 * fixture, so a fresh stack has both curated warehouses without running the
 * crawler, the pipelines or Spark. Core lets every organization read them
 * (`demo-namespace-access.ts`).
 *
 * Why a zip of small files: as plain SQL a fixture is tens of MB, the Trino
 * image has no gzip but does have the JDK's `jar` (which unpacks a zip), and
 * the Trino CLI reads a whole file into memory — inside trino-seed's 256 MB
 * limit it is killed above roughly 5 MB. So each zip holds one folder named
 * after the schema: `000-schema.sql` (header and CREATE SCHEMA), then
 * `001.sql`, `002.sql` … of at most 2 MB each, loaded in name order. The
 * header's `-- check:` line names the last table filled and its row count.
 *
 * Run it after the data-platform seeds (Demo Data 1 step 05, Demo Data 2 step
 * 03) have built the tables. Trino is not published on the host, so run it on
 * the compose network, from the repository root:
 *
 *   docker compose run --rm --no-deps -v "$PWD":/work -w /work --entrypoint node \
 *     celesnity-api mock-data/build-trino-seed.mjs [--only demo1|demo2]
 *
 * Rows are written in a fixed order and the zip carries a fixed timestamp, so a
 * rebuild over the same tables gives the same bytes. Needs Node 22+ (for
 * `zlib.crc32`); no npm packages.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const TRINO_URL = (process.env.TRINO_URL ?? 'http://trino-coordinator:8080').replace(/\/$/u, '');
const TRINO_USER = process.env.TRINO_USER ?? 'celesnity';

/** Trino refuses statements over 1,000,000 characters; stay well under it. */
const MAX_STATEMENT_CHARS = 400_000;
/** Per SQL file in the zip, so the Trino CLI fits in trino-seed's memory limit. */
const MAX_FILE_CHARS = 2_000_000;

const here = dirname(fileURLToPath(import.meta.url));
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const only = argument('only', undefined);

const DEMOS = [
  {
    key: 'demo1',
    schema: 'demo1_home_appliance',
    file: 'demo1-home-appliance.sql.zip',
    title: 'Demo Data 1 (home appliance — chest freezers)',
    builtBy: 'mock-data/demo1-home-appliance/seed/05-seed-data-platform.mjs',
  },
  {
    key: 'demo2',
    schema: 'demo2_coffee_capsules',
    file: 'demo2-coffee-capsules.sql.zip',
    title: 'Demo Data 2 (coffee capsules)',
    builtBy: 'mock-data/demo2-coffee-capsules/seed/03-seed-data-platform.mjs',
  },
];

/** Runs one statement through Trino's client protocol and returns every row. */
async function query(sql) {
  const headers = { 'X-Trino-User': TRINO_USER, 'X-Trino-Catalog': 'iceberg' };
  let response = await fetch(`${TRINO_URL}/v1/statement`, { method: 'POST', headers, body: sql });
  const rows = [];
  for (;;) {
    if (!response.ok) throw new Error(`Trino answered HTTP ${response.status}: ${await response.text()}`);
    const page = await response.json();
    if (page.error) throw new Error(`Trino query failed: ${page.error.message}\n${sql.slice(0, 500)}`);
    if (page.data) rows.push(...page.data);
    if (!page.nextUri) return rows;
    response = await fetch(page.nextUri, { headers });
  }
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
/** Column names are quoted: a source may name one `date` or `value`. */
const ident = (name) => `"${name.replaceAll('"', '""')}"`;

/**
 * How one column travels inside a batch's JSON array: the type of its field in
 * the `ROW(...)` the JSON is cast to, and the expression that turns that field
 * back into the column's own type. JSON carries strings, numbers and booleans
 * natively; dates, timestamps, decimals and the rest ride as strings and are
 * cast back, which is exact.
 */
function columnCodec(column, type) {
  if (type === 'varchar' || type.startsWith('varchar(') || type.startsWith('char(')) {
    return { field: type.toUpperCase(), select: ident(column) };
  }
  if (['boolean', 'integer', 'bigint', 'double', 'real'].includes(type)) {
    return { field: type.toUpperCase(), select: ident(column) };
  }
  if (type === 'varbinary') return { field: 'VARCHAR', select: `from_base64(${ident(column)})` };
  if (type.startsWith('decimal(') || type === 'date' || type.startsWith('timestamp(') || type.startsWith('time(') || type === 'uuid') {
    return { field: 'VARCHAR', select: `CAST(${ident(column)} AS ${type.toUpperCase()})` };
  }
  throw new Error(`No JSON encoding for Trino type ${type}.`);
}

/** A value as Trino's REST API returned it, ready for JSON.stringify. */
function jsonValue(value, type) {
  if (value === null) return null;
  if ((type === 'double' || type === 'real') && typeof value !== 'number') {
    // NaN and the infinities arrive as strings and have no JSON number form.
    throw new Error(`Cannot carry ${type} value ${value} in JSON.`);
  }
  return value;
}

/**
 * DROP, CREATE and the INSERT batches that rebuild one table, in order.
 *
 * Each batch is a single JSON string literal unnested into rows, not a VALUES
 * list. The coordinator keeps every finished query's plan for 15 minutes, and a
 * VALUES plan holds an expression per cell — about 40 times the statement's
 * size — so a whole fixture loaded as VALUES runs a 896 MB coordinator out of
 * heap. A JSON literal is one constant, however many rows it holds.
 */
async function tableStatements(schema, table) {
  const columns = await query(
    `SELECT column_name, data_type FROM iceberg.information_schema.columns
      WHERE table_schema = ${quote(schema)} AND table_name = ${quote(table)}
      ORDER BY ordinal_position`,
  );
  const name = `iceberg.${schema}.${table}`;
  const order = columns.map((_, index) => index + 1).join(', ');
  const rows = await query(`SELECT * FROM ${name} ORDER BY ${order}`);

  const statements = [
    `DROP TABLE IF EXISTS ${name};`,
    `CREATE TABLE ${name} (\n${columns.map(([column, type]) => `    ${ident(column)} ${type.toUpperCase()}`).join(',\n')}\n);`,
  ];
  const codecs = columns.map(([column, type]) => columnCodec(column, type));
  const names = columns.map(([column]) => ident(column)).join(', ');
  const rowType = columns.map(([column], index) => `${ident(column)} ${codecs[index].field}`).join(', ');
  const head = `INSERT INTO ${name} (${names})\nSELECT ${codecs.map((codec) => codec.select).join(', ')}\nFROM UNNEST(CAST(json_parse(`;
  const tail = `) AS ARRAY(ROW(${rowType})))) AS batch (${names});`;

  let batch = [];
  let size = head.length + tail.length + 4;
  const flush = () => {
    if (batch.length === 0) return;
    statements.push(`${head}${quote(`[${batch.join(',')}]`)}${tail}`);
    batch = [];
    size = head.length + tail.length + 4;
  };
  for (const row of rows) {
    const encoded = JSON.stringify(row.map((value, index) => jsonValue(value, columns[index][1])));
    // Quotes double inside the SQL literal, so count them twice.
    const length = encoded.length + (encoded.match(/'/gu)?.length ?? 0) + 1;
    if (size + length > MAX_STATEMENT_CHARS) flush();
    batch.push(encoded);
    size += length;
  }
  flush();
  return { statements, rowCount: rows.length };
}

/** Packs statements, in order, into files of at most MAX_FILE_CHARS. */
function packFiles(statements) {
  const files = [];
  let current = [];
  let size = 0;
  for (const statement of statements) {
    if (current.length > 0 && size + statement.length + 2 > MAX_FILE_CHARS) {
      files.push(current);
      current = [];
      size = 0;
    }
    current.push(statement);
    size += statement.length + 2;
  }
  if (current.length > 0) files.push(current);
  return files.map((group) => `${group.join('\n\n')}\n`);
}

/**
 * A zip of deflated files. MS-DOS date 1980-01-01 00:00 keeps the bytes stable
 * across rebuilds; the sizes stay far below the 4 GB that needs ZIP64.
 */
function zip(entries) {
  const dosDate = (1 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, content } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: deflate
    local.writeUInt16LE(8, 8); // method: deflate (flags and time stay 0)
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, deflated);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + deflated.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // entries in total
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

for (const demo of DEMOS.filter((item) => only === undefined || item.key === only)) {
  const tables = (
    await query(
      `SELECT table_name FROM iceberg.information_schema.tables
        WHERE table_schema = ${quote(demo.schema)} AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    )
  ).map(([table]) => table);
  if (tables.length === 0) {
    throw new Error(`iceberg.${demo.schema} has no tables. Run ${demo.builtBy} first.`);
  }

  const statements = [];
  let total = 0;
  let lastRowCount = 0;
  for (const table of tables) {
    const { statements: tableSql, rowCount } = await tableStatements(demo.schema, table);
    statements.push(...tableSql);
    total += rowCount;
    lastRowCount = rowCount;
    console.log(`${demo.schema}.${table}: ${rowCount} rows`);
  }

  const header = [
    `-- Generated by mock-data/build-trino-seed.mjs from the tables ${demo.builtBy} builds.`,
    '-- Regenerate with the command at the top of that script. Mock data only.',
    `-- ${demo.title}: the curated warehouse every organization can read via the`,
    '-- demo namespace bypass in AdministrationUseCases.authorizeCatalog.',
    // trino-seed skips the schema while this table, the last one the files
    // fill, has at least this many rows: a load cut short leaves it short.
    `-- check: ${tables.at(-1)} ${lastRowCount}`,
    '',
    `CREATE SCHEMA IF NOT EXISTS iceberg.${demo.schema};`,
    '',
  ].join('\n');
  const entries = [
    { name: `${demo.schema}/000-schema.sql`, content: header },
    ...packFiles(statements).map((content, index) => ({
      name: `${demo.schema}/${String(index + 1).padStart(3, '0')}.sql`,
      content,
    })),
  ];
  const archive = zip(entries);
  const path = join(here, '..', 'trino', 'seed', demo.file);
  writeFileSync(path, archive);
  const sqlBytes = entries.reduce((sum, entry) => sum + entry.content.length, 0);
  console.log(
    `Wrote ${path}: ${tables.length} tables, ${total} rows, ${entries.length} files, ` +
      `${(sqlBytes / 1e6).toFixed(1)} MB of SQL in ${(archive.length / 1e6).toFixed(1)} MB`,
  );
}
