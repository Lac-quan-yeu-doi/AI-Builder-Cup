# Skills

Working procedures for `minder-agent`. Read the matching `SKILL.md` before
editing. Each guide gives starting files, a change procedure, contracts to
preserve, and a focused check. Read several when a change crosses boundaries;
for example, a durable SSE change needs runtime, persistence, HTTP/SSE, and
testing guidance.

| Skill | Read it when |
| --- | --- |
| [codebase-orientation](codebase-orientation/SKILL.md) | First task, unfamiliar module, or “where does this live?” |
| [clean-architecture](clean-architecture/SKILL.md) | Layer placement, SOLID, dependency direction, or architecture lint |
| [runtime-development](runtime-development/SKILL.md) | Agent loop, run manager, runtime store, rooms, approvals, or SSE |
| [agent-loop-and-tools](agent-loop-and-tools/SKILL.md) | ReAct loop, tool selection, dispatch, pauses, approvals, or snapshots |
| [persistence-and-prisma](persistence-and-prisma/SKILL.md) | Prisma, migrations, durable runtime, or database integration tests |
| [http-sse-contracts](http-sse-contracts/SKILL.md) | API endpoint naming, HTTP routes, authentication, replay cursors, or SSE behavior |
| [security-and-isolation](security-and-isolation/SKILL.md) | Tenant isolation, path confinement, MCP scopes, secrets, or auth |
| [deployment-and-operations](deployment-and-operations/SKILL.md) | Docker, Kubernetes, Cloud Build, health checks, or runtime env |
| [testing-and-verification](testing-and-verification/SKILL.md) | Tests, Vitest projects, type-checking, lint, build, or release gates |
| [naming-conventions](naming-conventions/SKILL.md) | Naming files, symbols, API fields, environment variables, or tests |
| [coding-conventions](coding-conventions/SKILL.md) | Writing or reviewing TypeScript, Nest, validation, errors, or async code |
| [git-delivery](git-delivery/SKILL.md) | Commits, branches, PRs, or release delivery |
| [changelog-and-user-guide](changelog-and-user-guide/SKILL.md) | After any change a user of the assistant can notice: changelog + user guide, credited to the developer (both live in `celesnity-web`) |

The repository root [AGENTS.md](../AGENTS.md) routes these procedures by trigger.
