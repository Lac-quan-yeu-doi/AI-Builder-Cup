/**
 * Builds the side-by-side before/after page from the captures.
 *
 *   node scripts/build-redesign-comparison.mjs
 *
 * Reads docs/redesign-shots/states.json and writes
 * docs/analytics-redesign-comparison.html next to it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('docs');
const states = JSON.parse(await readFile(path.join(OUT, 'redesign-shots/states.json'), 'utf8'));

/**
 * Screenshots are inlined rather than linked. The page is something to send
 * someone, and a single file that works wherever it lands beats a file that
 * only works next to a folder.
 */
async function inline(id, side) {
  const file = path.join(OUT, 'redesign-shots', `${id}-${side}.png`);
  return `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
}

/** One line per change. The reasoning lives in docs/analytics-redesign-plan.md;
 * repeating it beside every screenshot buried the screenshots. */
const CHANGES = {
  '01-browse': [
    'A library, not a folder — hierarchy filters, it no longer navigates',
    'Titled for the area; the container name left the H1',
    '“Our analytics” → “Analytics”, one name for one place',
    'Every row names its collection — only possible once it stops being the page',
    'Charts and dashboards ranked together by freshness',
    'Rail counts what each collection holds, nesting included',
    'Relative dates, type filter, paging past 20',
  ],
  '01b-browse-recents': ['Leads with what this browser opened last'],
  '01c-browse-scoped': ['Narrowing keeps the page; it does not become another one'],
  '02-builder-entry': [
    'Option cards wrap instead of clipping',
    'Neutral icon tiles, no tinted band',
    'Copy says which choice is reversible',
  ],
  '03-builder-data': [
    'The three catalog columns moved onto the page',
    'One header, not two stacked titles',
    'The steps ahead are visible before you commit',
    'A way out of the editor',
  ],
  '04-builder-browse-dialog': ['The dialog is gone — the page holds all three levels'],
  '05-builder-notebook': [
    'One palette — the Metabase hexes are gone',
    'Step identity from icons, not hue',
    'Near-black CTA; chips wear the selection surface',
  ],
  '05b-builder-start-recents': [
    'Recent tables, for asking another question of one you already use',
  ],
  '06-builder-results': [
    'Chart type always visible, not behind a floating pill',
    'The shape is proposed from the columns',
    'Impossible shapes disabled, with a reason',
    'Numerals right-aligned and tabular',
  ],
  '07-saved-chart': [
    'Reading-width padding — it was flush and clipped',
    'Breadcrumb back to the collection',
    'Chart or data, not both stacked',
    '“CHAT” reads as “From chat”',
  ],
  '08-dashboard': [
    'Reading-width padding — it was flush and clipped',
    'Edit looks like an action',
    'Active filter count and a reset',
    'Charts fit their cards',
  ],
  '09-dashboard-editor': [
    'Six unlabelled icons became Add ▾, Filter, ⋯',
    'No window.prompt or window.confirm',
    'Mode bar on-skin, Save as the CTA',
  ],
  '10-browse-mobile': ['The library holds together one column wide'],
  '11-builder-notebook-mobile': ['One band per step, full-width CTA'],
};

const esc = (value) =>
  String(value).replace(
    /[&<>"]/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const sections = (
  await Promise.all(
    states.map(async (state) => {
      const changes = CHANGES[state.id] ?? [];
      const [beforeSrc, afterSrc] = await Promise.all([
        inline(state.id, 'before'),
        inline(state.id, 'after'),
      ]);
      return `
<section class="state" id="${esc(state.id)}">
  <header class="state-head">
    <h2>${esc(state.title)}</h2>
  </header>
  <div class="pair">
    <figure>
      <figcaption><span class="tag tag-before">Before</span> <code>${esc(state.path)}</code></figcaption>
      <img loading="lazy" src="${beforeSrc}" alt="${esc(state.title)} — before">
    </figure>
    <figure>
      <figcaption><span class="tag tag-after">After</span> <code>${esc(state.path)}</code></figcaption>
      <img loading="lazy" src="${afterSrc}" alt="${esc(state.title)} — after">
    </figure>
  </div>
  ${
    changes.length
      ? `<ul class="changes">${changes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`
      : ''
  }
</section>`;
    }),
  )
).join('\n');

const nav = states
  .map(
    (state) =>
      `<a href="#${esc(state.id)}">${esc(state.title.split('—')[1]?.trim() ?? state.title)}</a>`,
  )
  .join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Analytics redesign — before and after</title>
<style>
  :root {
    --bg: #ffffff; --fg: #0d0d0d; --muted: #5d5d5d; --line: #e5e5e5;
    --surface: #f9f9f9; --accent: #0075de; --before: #8a5a00; --before-bg: #fff4e0;
    --after: #0a6c3d; --after-bg: #e3f6ec;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0d0d0d; --fg: #ededed; --muted: #afafaf; --line: #2a2a2a;
      --surface: #171717; --accent: #3b9bec; --before: #ffb790; --before-bg: #3a2206;
      --after: #8cdfad; --after-bg: #06301c;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0d0d0d; --fg: #ededed; --muted: #afafaf; --line: #2a2a2a;
    --surface: #171717; --accent: #3b9bec; --before: #ffb790; --before-bg: #3a2206;
    --after: #8cdfad; --after-bg: #06301c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.55 ui-sans-serif, -apple-system, system-ui, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 1600px; margin: 0 auto; padding: 48px 16px 96px; }
  h1 { font-size: 32px; line-height: 1.2; letter-spacing: -0.025em; margin: 0 0 8px; }
  .lede { color: var(--muted); max-width: 70ch; margin: 0 0 8px; }
  .meta { color: var(--muted); font-size: 13px; margin: 24px 0 0; }
  nav {
    position: sticky; top: 0; z-index: 10; background: var(--bg);
    border-bottom: 1px solid var(--line); padding: 10px 0; margin: 32px 0 8px;
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  nav a {
    color: var(--muted); text-decoration: none; font-size: 13px;
    padding: 4px 10px; border-radius: 999px; border: 1px solid transparent;
  }
  nav a:hover { color: var(--fg); background: var(--surface); border-color: var(--line); }
  .state { padding: 32px 0; border-bottom: 1px solid var(--line); scroll-margin-top: 64px; }
  .state-head h2 { font-size: 20px; line-height: 1.3; margin: 0 0 14px; letter-spacing: -0.015em; }
  .pair { display: grid; gap: 16px; grid-template-columns: 1fr; }
  @media (min-width: 1024px) { .pair { grid-template-columns: 1fr 1fr; } }
  figure { margin: 0; }
  figcaption {
    display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
    font-size: 12px; color: var(--muted);
  }
  figcaption code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
  .tag { font-weight: 600; padding: 2px 8px; border-radius: 999px; font-size: 11px; letter-spacing: 0.03em; }
  .tag-before { color: var(--before); background: var(--before-bg); }
  .tag-after { color: var(--after); background: var(--after-bg); }
  img {
    width: 100%; height: auto; display: block; border: 1px solid var(--line);
    border-radius: 10px; background: var(--surface);
  }
  a:has(img):hover img { border-color: var(--accent); }
  .changes { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .changes li {
    font-size: 13px; color: var(--muted); padding: 5px 10px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>Analytics redesign — before and after</h1>
  <p class="lede">
    Left is <code>099cf8c</code>, right is the redesign. Same script, same stubbed data.
  </p>
  <nav>${nav}</nav>
  ${sections}
  <p class="meta">${states.length} states · 1440×900 unless noted · <code>scripts/capture-redesign.mjs</code></p>
</div>
</body>
</html>
`;

await writeFile(path.join(OUT, 'analytics-redesign-comparison.html'), html);
console.log(`wrote docs/analytics-redesign-comparison.html (${states.length} states)`);
