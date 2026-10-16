# W3 — schedule state and run history

Implemented the Data Workflow schedule/history boundary and detail panel.

- Added workflow-scoped Core API methods for schedule state, pause/resume, versions, runs, Run now, and retry acknowledgement.
- The detail screen shows Calendar, Interval, and Manual semantics; Watch Source and CDC are not displayed.
- Runs show only status, timestamps, node attempts, and execution links. Parameters, delegation, source values, and error details are not rendered.
- Retry is opt-in and requires an explicit acknowledgement that append writes might repeat. Active-run conflicts have recoverable feedback.

## Verification

- RED: `npx vitest run tests/unit/app/data-workflow-history-panel.test.tsx` failed before implementation because the panel module did not exist.
- GREEN: focused Vitest suite: 6 files, 16 tests passed.
- `npm run typecheck` passed.
- Focused ESLint passed.
- `git diff --check` passed.
- Prettier check currently reports formatting changes in the new panel and updated focused tests. No automatic formatter write was used while preserving the shared checkout.

No visual server was started in this task.

## Formatting follow-up

- Formatted only the four W3 files reported by Prettier: the history panel and its three focused test files.
- Focused W3 Vitest: 6 files, 14 tests passed.
- `npm run typecheck`, targeted ESLint, targeted Prettier check, and `git diff --check` passed.
