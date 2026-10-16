/**
 * Builds the side-by-side before/after page for the /skills redesign.
 *
 *   node scripts/build-skills-comparison.mjs
 *
 * Reads docs/skills-shots/*.png and writes docs/skills-redesign-comparison.html.
 *
 * The captures come from `tests/visual/shots.spec.ts` against the fixtures in
 * `tests/visual/fixtures.ts`; "before" is rendered from a worktree at 099cf8c.
 * See docs/skills-shots/README.md.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DOCS = path.resolve('docs');
const SHOTS = path.join(DOCS, 'skills-shots');

/** Inlined, not linked: one file that works wherever it is sent. */
async function inline(name) {
  const bytes = await readFile(path.join(SHOTS, `${name}.png`));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

/**
 * One line per change, in the order someone notices it. The prose lives in
 * docs/skills-redesign-plan.md; this page is the pictures.
 */
const SECTIONS = [
  {
    id: 'library',
    title: 'The library',
    shot: '02-wide',
    pair: true,
    changes: [
      'Source is a heading, not a badge repeated on every row',
      'The monospace namespace line under every name is gone',
      'Descriptions get two lines instead of four words',
      'Search appears past eight skills',
      'Row actions sit behind ⋯',
      'The assistant is a toggle now, closed by default — it took 400px on arrival',
    ],
  },
  {
    id: 'skill',
    title: 'A skill',
    shot: '03-detail',
    pair: true,
    changes: [
      'Description leads: it is what the agent routes on',
      'The index line the agent actually reads, rendered live',
      'Name is the heading, not an input that exists to be disabled',
      'The “Skill configuration” box restated a badge and the editor below it',
    ],
  },
  {
    id: 'create',
    title: 'Creating one',
    shot: '04-create',
    pair: true,
    changes: [
      'Same field order as editing',
      'Cancel returns to the skill you had open',
      'Actions pinned to the card, and the stray horizontal scrollbar is gone',
    ],
  },
  {
    id: 'phone',
    title: 'Phone',
    shot: '05-narrow',
    pair: true,
    narrow: true,
    changes: [
      'Panes stack on available width, not window width',
      'The library is capped so the editor below stays reachable',
    ],
  },
  {
    id: 'new',
    title: 'New',
    gallery: [
      ['06-search-after', 'Search', 'There was none'],
      ['07-delete-after', 'Delete', 'Was a browser confirm box'],
      ['08-undescribed-after', 'Undescribed skill', 'Was a blank line'],
      ['09-assistant-after', 'Assistant', 'Opens on the toggle'],
    ],
  },
];

const CSS = `
  :root {
    --bg:#fff; --fg:#0d0d0d; --muted:#5d5d5d; --line:#e5e5e5; --surface:#f9f9f9;
    --accent:#0075de; --before:#8a5a00; --before-bg:#fff4e0; --after:#0a6c3d; --after-bg:#e3f6ec;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg:#0d0d0d; --fg:#ededed; --muted:#afafaf; --line:#2a2a2a; --surface:#171717;
      --accent:#3b9bec; --before:#ffb790; --before-bg:#3a2206; --after:#8cdfad; --after-bg:#06301c;
    }
  }
  :root[data-theme="dark"] {
    --bg:#0d0d0d; --fg:#ededed; --muted:#afafaf; --line:#2a2a2a; --surface:#171717;
    --accent:#3b9bec; --before:#ffb790; --before-bg:#3a2206; --after:#8cdfad; --after-bg:#06301c;
  }
  * { box-sizing: border-box; }
  body {
    margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.55 ui-sans-serif,-apple-system,system-ui,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif;
  }
  .wrap { max-width:1600px; margin:0 auto; padding:48px 16px 96px; }
  h1 { font-size:32px; line-height:1.2; letter-spacing:-0.025em; margin:0 0 6px; }
  .lede { color:var(--muted); margin:0; }
  nav {
    position:sticky; top:0; z-index:10; background:var(--bg); border-bottom:1px solid var(--line);
    padding:10px 0; margin:28px 0 0; display:flex; flex-wrap:wrap; gap:6px;
  }
  nav a {
    color:var(--muted); text-decoration:none; font-size:13px; padding:4px 10px;
    border-radius:999px; border:1px solid transparent;
  }
  nav a:hover { color:var(--fg); background:var(--surface); border-color:var(--line); }
  .state { padding:36px 0; border-bottom:1px solid var(--line); scroll-margin-top:60px; }
  .state h2 { font-size:22px; line-height:1.3; letter-spacing:-0.015em; margin:0 0 18px; }
  .pair { display:grid; gap:16px; grid-template-columns:1fr; }
  .gallery { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }
  @media (min-width:1024px) {
    .pair { grid-template-columns:1fr 1fr; }
  }
  figure { margin:0; }
  figcaption { display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:12px; color:var(--muted); }
  .tag { font-weight:600; padding:2px 8px; border-radius:999px; font-size:11px; letter-spacing:0.03em; }
  .tag-before { color:var(--before); background:var(--before-bg); }
  .tag-after { color:var(--after); background:var(--after-bg); }
  img { width:100%; height:auto; display:block; border:1px solid var(--line); border-radius:10px; background:var(--surface); }
  .pair.narrow img { max-width:390px; margin-inline:auto; }
  .changes { list-style:none; margin:18px 0 0; padding:0; display:grid; gap:6px; }
  .changes li {
    color:var(--muted); font-size:13px; padding:9px 12px; background:var(--surface);
    border:1px solid var(--line); border-radius:8px;
  }
  .meta { color:var(--muted); font-size:13px; margin:28px 0 0; }
`;

function escapeHtml(value) {
  return value.replace(
    /[&<>"]/gu,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character],
  );
}

async function renderSection(section) {
  const heading = `<h2>${escapeHtml(section.title)}</h2>`;

  if (section.gallery) {
    const figures = await Promise.all(
      section.gallery.map(async ([name, label, was]) => {
        const src = await inline(name);
        return `    <figure>
      <figcaption><span class="tag tag-after">After</span> ${escapeHtml(label)} — ${escapeHtml(was)}</figcaption>
      <img loading="lazy" src="${src}" alt="${escapeHtml(label)}">
    </figure>`;
      }),
    );
    return `<section class="state" id="${section.id}">
  ${heading}
  <div class="gallery">
${figures.join('\n')}
  </div>
</section>`;
  }

  const [before, after] = await Promise.all([
    inline(`${section.shot}-before`),
    inline(`${section.shot}-after`),
  ]);
  const changes = section.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join('');

  return `<section class="state" id="${section.id}">
  ${heading}
  <div class="pair${section.narrow ? ' narrow' : ''}">
    <figure>
      <figcaption><span class="tag tag-before">Before</span></figcaption>
      <img loading="lazy" src="${before}" alt="${escapeHtml(section.title)} — before">
    </figure>
    <figure>
      <figcaption><span class="tag tag-after">After</span></figcaption>
      <img loading="lazy" src="${after}" alt="${escapeHtml(section.title)} — after">
    </figure>
  </div>
  <ul class="changes">${changes}</ul>
</section>`;
}

const sections = await Promise.all(SECTIONS.map(renderSection));
const nav = SECTIONS.map((s) => `<a href="#${s.id}">${escapeHtml(s.title)}</a>`).join('\n  ');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skills redesign — before and after</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<h1>Skills redesign</h1>
<p class="lede">Same eight fixture skills in every shot. The assistant dock is open, as it is by default.</p>
<nav>
  ${nav}
</nav>
${sections.join('\n\n')}
<p class="meta">Before: <code>099cf8c</code>. Captured 2026-09-16. Detail in <code>docs/skills-redesign-plan.md</code>.</p>
</div>
</body>
</html>
`;

const out = path.join(DOCS, 'skills-redesign-comparison.html');
await writeFile(out, html, 'utf8');
console.log(`wrote ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(0)} KB)`);
