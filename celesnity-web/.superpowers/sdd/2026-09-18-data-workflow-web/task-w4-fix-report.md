# Web W4 verification correction report

## Corrected scope

- The new Data Workflow captures are explicitly named unapproved diagnostic artifacts. They do not claim screenshot regression coverage and contain no baseline assertion.
- The narrow editor now owns scrolling below the large-screen breakpoint. The visual test records the editor container's `scrollTop` and the document `scrollY` on either side of a real wheel event over editor chrome, asserts that only the editor scrolls, and then verifies the Trigger type control is reachable.
- The entity-level calendar regression now rejects the exact unsupported Quartz expression `0 7 * * 1#2`, while the existing `THU` alias acceptance assertion remains in place.

## Verification plan

- `npx vitest run tests/unit/app/data-workflow-editor-screen.test.tsx tests/unit/app/data-workflow-history-panel.test.tsx tests/unit/app/schedule-trigger-panel.test.tsx tests/unit/entities/data-workflow-graph.test.ts` — 4 files, 12 tests passed.
- `npx prettier --check` on the changed source, unit test, visual test, and report — passed.
- Targeted ESLint on the changed source and tests — passed.
- `npm run typecheck` — passed.
- `git diff --check` — passed.

## Visual execution status

Playwright remains unexecuted in this shared checkout. A read-only port check found active listeners on port `3000` and the visual harness health port `3101`; the previous W4 execution also encountered an `.next/standalone` lock. No process, port owner, or build artifact was stopped or removed. The two artifact-capture tests therefore remain diagnostic code awaiting an isolated, reviewed baseline run.
