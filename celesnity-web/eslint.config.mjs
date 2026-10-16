import boundaries from 'eslint-plugin-boundaries';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/*
 * Rule 7's selectors, shared so a narrower block can extend them. A later
 * flat-config entry replaces `no-restricted-syntax` outright, so a scoped
 * override has to restate everything it still wants enforced.
 */
const paletteSelectors = [
  {
    selector:
      'Literal[value=/(?:^|[^\\w-])(?:bg|text|border|ring|divide|accent|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:$|[^\\w-])/]',
    message:
      'Raw Tailwind colour scales are not part of the palette. Use a semantic token (bg-card, text-muted-foreground, border-border) or a status scale (bg-status-warning-light). See CLAUDE.md rule 7.',
  },
  {
    selector: 'Literal[value=/(?:^|[^\w-])text-\[[0-9.]+(?:px|rem|em)\]/]',
    message:
      'Hand-written font sizes bypass the type scale. Use a step: text-display-1/2, text-heading-1/2/3, text-title, text-body-lg/md/sm, text-label, text-caption, text-micro — each carries its own line-height and tracking.',
  },
  {
    selector: 'Literal[value=/(?:^|[^\w-])rounded(?:-[a-z]+)?-\[[0-9.]+(?:px|rem)\]/]',
    message:
      'Hand-written radii bypass the radius scale. Use a step: rounded-2xs/xs/sm/md/lg/xl/2xl/3xl/4xl/full.',
  },
  {
    selector: 'Literal[value=/(?:^|[^\w-])font-serif(?:$|[^\w-])/]',
    message:
      "The skin has no serif family — font-serif falls through to Tailwind's Georgia/Times and reads as a different product. Headings are the system sans at weight 600; use a type step such as text-title.",
  },
  {
    selector: 'Literal[value=/(?:^|[^\w-])font-(?:bold|extrabold|black)(?:$|[^\w-])/]',
    message:
      'The type scale stops at 600 — the skin has no bold display weight. Use font-semibold.',
  },
  {
    selector: 'Literal[value=/#[0-9a-fA-F]{6}\\b/]',
    message:
      'No inline hex. Colour is decided in the token block in app/globals.css; a one-off tint goes through an alpha of an existing token (bg-destructive/10). See CLAUDE.md rule 7.',
  },
];

/*
 * The rest of rule 7, enforced where the sweep has already landed.
 *
 * `paletteSelectors` misses a hand-written weight, tracking, leading,
 * spacing value or breakpoint, and every stock Tailwind type step — which is
 * most of what "off-grid" means in practice. Applying these app-wide today
 * fails on ~117 sites the sweep has not reached, so the glob is the ratchet:
 * widen it as each area is swept, and fold it into `paletteSelectors` when it
 * covers `app/**`.
 */
const gridSelectors = [
  {
    selector: 'Literal[value=/(?:^|[^\\w-])font-\\[[0-9]+\\]/]',
    message:
      'Weight stops at 600 and the type steps carry their own. Use a step (text-title, text-label) or font-medium/font-semibold.',
  },
  {
    selector:
      'Literal[value=/(?:^|[^\\w-])text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)(?:$|[^\\w-])/]',
    message:
      "Tailwind's stock type steps set a size and nothing else. Use a scale step — text-display-1/2, text-heading-1/2/3, text-title, text-body-lg/md/sm, text-label, text-caption, text-micro — each of which carries its own line-height and tracking.",
  },
  {
    selector: 'Literal[value=/(?:^|[^\\w-])(?:tracking|leading)-\\[[^\\]]+\\]/]',
    message:
      'Hand-written tracking and leading are what stop a page having rhythm. Each type step already carries both.',
  },
  {
    selector:
      'Literal[value=/(?:^|[^\\w-])(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|w|h|size|min-w|min-h|max-w|max-h|top|right|bottom|left)-\\[[0-9.]+(?:px|rem)\\]/]',
    message:
      'Spacing is a 4px scale. Use a step (p-4, gap-1.5, min-h-18); a value that lands between steps is why nothing on the page lines up.',
  },
  {
    selector: 'Literal[value=/(?:^|[^\\w-])(?:min|max)-\\[[0-9]+px\\]:/]',
    message:
      'Hand-written breakpoints fragment the layout across widths nothing else uses. Use a step: sm: md: lg: xl: 2xl: (sm is 576px here, not 640).',
  },
  {
    selector: 'Literal[value=/(?:^|[^\\w-])shadow-\\[[^\\]]+\\]/]',
    message:
      'Elevation is a scale: shadow-hairline / shadow-100..400. A hand-written shadow is a second elevation system.',
  },
  {
    selector: 'Literal[value=/#[0-9a-fA-F]{3}(?![0-9a-fA-F])/]',
    message:
      'No inline hex, three-digit included. Colour is decided in the token block in app/globals.css.',
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ['app/**/*.{ts,tsx}', 'di/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'app/**' },
        { type: 'di', pattern: 'di/**' },
        { type: 'controllers', pattern: 'src/interface-adapters/controllers/**' },
        { type: 'presenters', pattern: 'src/interface-adapters/presenters/**' },
        { type: 'use-cases', pattern: 'src/application/use-cases/**' },
        { type: 'repository-interfaces', pattern: 'src/application/repositories/**' },
        { type: 'service-interfaces', pattern: 'src/application/services/**' },
        { type: 'entities', pattern: 'src/entities/**' },
        { type: 'infrastructure', pattern: 'src/infrastructure/**' },
      ],
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      ...boundaries.configs.strict.rules,
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'app' } },
              allow: {
                to: {
                  element: { types: ['app', 'di', 'controllers', 'presenters', 'entities'] },
                },
              },
            },
            {
              from: { element: { type: 'controllers' } },
              allow: { to: { element: { types: ['use-cases', 'presenters', 'entities'] } } },
            },
            {
              from: { element: { type: 'presenters' } },
              allow: { to: { element: { type: 'entities' } } },
            },
            {
              from: { element: { type: 'use-cases' } },
              allow: {
                to: {
                  element: {
                    types: ['use-cases', 'repository-interfaces', 'service-interfaces', 'entities'],
                  },
                },
              },
            },
            {
              from: { element: { type: 'repository-interfaces' } },
              allow: { to: { element: { type: 'entities' } } },
            },
            {
              from: { element: { type: 'service-interfaces' } },
              allow: { to: { element: { type: 'entities' } } },
            },
            {
              from: { element: { type: 'entities' } },
              allow: { to: { element: { type: 'entities' } } },
            },
            {
              from: { element: { type: 'infrastructure' } },
              allow: {
                to: {
                  element: {
                    types: [
                      'infrastructure',
                      'repository-interfaces',
                      'service-interfaces',
                      'entities',
                    ],
                  },
                },
              },
            },
            {
              from: { element: { type: 'di' } },
              allow: {
                to: {
                  element: {
                    types: [
                      'di',
                      'controllers',
                      'use-cases',
                      'repository-interfaces',
                      'service-interfaces',
                      'infrastructure',
                      'entities',
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'app/**/*.{js,jsx,mjs,cjs,mts,cts}',
      'di/**/*.{js,jsx,mjs,cjs,mts,cts}',
      'src/**/*.{js,jsx,mjs,cjs,mts,cts}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message: 'Architecture source files must use the .ts or .tsx extension.',
        },
      ],
    },
  },
  {
    /*
     * Rule 7, enforced rather than trusted.
     *
     * The palette drifted back to a previous skin once already because nothing
     * mechanically stopped it: a literal hex or a raw Tailwind scale in a screen
     * introduces a colour the skin does not have, and no test notices.
     *
     * `app/globals.css` is where colour is decided. `app/_components/ui/` is
     * exempt because the vendored shadcn source legitimately carries
     * `text-white` on a destructive fill and `bg-black/50` on an overlay —
     * editing those would diverge from the library.
     */
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['app/_components/ui/**', 'app/_i18n/**'],
    rules: {
      'no-restricted-syntax': ['error', ...paletteSelectors],
    },
  },
  {
    files: ['app/(workspace)/analytics/**/*.{ts,tsx}', 'app/(workspace)/charts/**/*.{ts,tsx}'],
    ignores: ['app/_i18n/**'],
    rules: {
      'no-restricted-syntax': ['error', ...paletteSelectors, ...gridSelectors],
    },
  },
  globalIgnores([
    '**/.next/**',
    '.worktrees/**',
    '.reference/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);
