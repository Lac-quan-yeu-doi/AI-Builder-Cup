# Completion and verification

- Before editing, read `README.md`, relevant guides listed by `skills/README.md`, and trace boundary → application contract → adapter/store → response/events. Search callers before changing exported contracts.
- Start with the narrowest relevant test/check. For changed TypeScript behavior, run its focused test plus `npm run check` and `npm run lint`; widen to `npm run test:architecture`, build, phase, or full suites only when risk/request warrants it. Avoid repeated broad suite runs.
- Tests must use controlled Nest configuration/factories. Never let tests load a developer `.env` or connect to a real database; phase-4 tests use only the throwaway service and `MINDER_TEST_DATABASE_URL`.
- Report unrelated baseline failures separately. Preserve unrelated working-tree changes. Do not commit, push, branch, open PRs, merge, tag, or deploy unless explicitly requested.