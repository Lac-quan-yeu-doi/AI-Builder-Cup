# W3 fix — preserve unsaved editor drafts on pause/resume

The schedule-history callback now updates the persisted workflow metadata without replacing the local editor draft. A pause or resume response supplies the authoritative revision and schedule state, while unsaved graph and name edits remain in the editor for the next explicit save.

## Verification

- RED: `npx vitest run tests/unit/app/data-workflow-editor-screen.test.tsx` failed because pausing reset `Unsaved import` to `Daily import`.
- GREEN: `npx vitest run tests/unit/app/data-workflow-editor-screen.test.tsx tests/unit/app/data-workflow-history-panel.test.tsx` passed: 2 files, 8 tests.
- `npm run typecheck` passed.
- Focused ESLint passed.
- Focused Prettier check passed.
- `git diff --check` passed.
