# Skills redesign — screenshots

The shareable version is `docs/skills-redesign-comparison.html`, built from these
by `node scripts/build-skills-comparison.mjs`. Reasoning lives in
`docs/skills-redesign-plan.md`.

| Shot                   | Width       | State                       |
| ---------------------- | ----------- | --------------------------- |
| `01-library-*`         | 1440        | Arrival                     |
| `02-wide-*`            | 1920        | Arrival, full width         |
| `03-detail-*`          | 1920        | A skill open                |
| `04-create-*`          | 1440 / 1920 | Creating one                |
| `05-narrow-*`          | 390         | Phone                       |
| `06-search-after`      | 1920        | Filtering                   |
| `07-delete-after`      | 1920        | Delete confirmation         |
| `08-undescribed-after` | 1920        | A skill with no description |

Both sides use the same eight fixtures from `tests/visual/fixtures.ts`, with the
assistant dock open.

## Regenerating

**After:** restore `tests/visual/shots.spec.ts` from git history and run
`npx playwright test shots.spec.ts`. Pass `PLAYWRIGHT_PORT` / `PLAYWRIGHT_CORE_PORT`
if 3100/3101 are busy, and wait out any `next build` already running — Next takes
a global build lock.

**Before:** a worktree at `099cf8c` needs two things that are easy to miss.
`node_modules` must be **hardlinked** (`cp -al`), since turbopack fails to resolve
through a symlink. And `.env.local` must be copied in: it is gitignored and carries
`NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME`, without which the assistant panel throws and
every shot wide enough to mount it renders blank.
