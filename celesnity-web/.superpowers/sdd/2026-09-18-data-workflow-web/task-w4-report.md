# Web W4 verification report

## Scope and accessibility audit

- Audited the Data Workflow list, editor, trigger panel, and schedule/history panel.
- Shared `Button`, `Input`, and native `Select` primitives already provide visible keyboard focus, labels, and error descriptions. `InlineError` announces failures as alerts; success and informational schedule feedback uses the status role.
- The editor keeps non-drag node and edge authoring through labelled controls. The W4 visual test uses keyboard focus, `Enter`, and native select keys to add a pipeline and connect it.
- The schedule/history panel now has a regression assertion that pausing automatic scheduling announces the resulting status.
- The list and narrow editor visual tests attach real Playwright screenshots for review. No baseline snapshots were created or changed because the shared harness could not start for inspection.
- Watch Source and CDC remain unavailable in this release. The trigger panel exposes only Manual, Calendar, and Interval, and describes those as the delivered scheduling triggers.

## Defect corrected

The existing schedule-trigger test exposed a validation gap: a Quartz-style `1#2` calendar expression passed even though hashed expressions are unsupported. `hasCronHashExpression` now rejects both `#` and `H` hash forms while leaving weekday aliases such as `THU` valid.

## Verification

- `npx vitest run tests/unit/app/data-workflow-editor-screen.test.tsx tests/unit/app/data-workflow-history-panel.test.tsx tests/unit/app/schedule-trigger-panel.test.tsx tests/unit/entities/data-workflow-graph.test.ts` — 4 files, 12 tests passed.
- `npm run typecheck` — passed.
- Targeted Prettier check — passed.
- Targeted ESLint — passed.

## Visual/build limitation

Playwright could not be executed in this shared checkout without disrupting another process:

1. The first run reached `next build` but failed with `EBUSY` while removing `.next/standalone`.
2. A later run found the harness Core health port `3101` already occupied. Port `3000` is also serving an existing process.

No process, port owner, or `.next` directory was stopped, removed, or changed. This prevents local screenshot comparison and full build verification for W4. The attached visual assertions are intentionally baseline-free until an isolated harness can run and the images can be inspected before snapshot approval.
