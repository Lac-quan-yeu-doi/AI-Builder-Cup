# Repository agent workflow

- `AGENTS.md` is the task router and hard constraint list. Each task starts with `README.md`; before editing, use `skills/README.md` to select and read every matching `SKILL.md`.
- `skills/README.md` is a trigger map, not a replacement for the guides. Read several guides when a change crosses boundaries; durable SSE work, for example, spans runtime, persistence, HTTP/SSE, and testing.
- Trace boundary → application contract → adapter/store → response or events. Search callers before changing exported contracts; verify graph hints against current source and tests; preserve unrelated worktree changes and public contracts.
- Keep dependencies inward: domain stays pure, application uses ports, infrastructure implements them, presentation adapts CLI/HTTP, and modules/bootstrap compose dependencies. Protect owner isolation, confined workspace paths, MCP scopes, and run lifecycle/event ordering.
- Read `skills/naming-conventions/SKILL.md` for names and paths; `skills/coding-conventions/SKILL.md` for TypeScript/Nest/errors/async; follow the closest vertical slice and architecture tests.

## Skill routing

- `codebase-orientation`: first task or unfamiliar area; `clean-architecture`: layer placement and dependency direction.
- `runtime-development`: runs, stores, rooms, approvals, SSE; `agent-loop-and-tools`: ReAct, tool dispatch, pauses, snapshots.
- `persistence-and-prisma`: Prisma, migrations, durable state, database tests; `http-sse-contracts`: routes, auth, replay, SSE.
- `security-and-isolation`: tenant scope, path confinement, MCP, secrets; `deployment-and-operations`: Docker, Kubernetes, Cloud Build, health, runtime env.
- `testing-and-verification`: tests and quality gates; `naming-conventions`: symbols, files, API/env fields, tests; `coding-conventions`: TypeScript/Nest/validation/errors/async.
- `git-delivery`: every Git or hosting action.

## Git and hosting

- Before any Git/hosting action, inspect repository root, branch, status, remotes, and relevant refs; read `skills/git-delivery/SKILL.md`.
- Do not commit, push, open PRs, create branches, tag, merge, or deploy unless explicitly requested. `main` is source of truth: release branches start at `main`, feature branches start at the current release, feature PRs target development and current release, and promotion/tags require approval.