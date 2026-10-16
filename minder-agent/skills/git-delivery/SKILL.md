---
name: git-delivery
description: Use when committing, reviewing branch state, preparing a pull request, or delivering minder-agent changes
---

# Git Delivery

## Default behavior

- Inspect `git rev-parse --show-toplevel`, `git branch --show-current`,
  `git status --short`, `git remote -v`, relevant refs, and the diff before
  staging or changing branches. `minder-agent` is the Git repository; its
  parent `minder-sys` is not.
- Preserve unrelated user changes; do not reset, checkout, or delete work.
- Never create a branch, commit, push, merge, tag, create a PR, or deploy unless
  the user explicitly asks for that action.
- Keep commits local unless the user explicitly requests a push.

## Branch and PR direction

`main` is the source of truth. A sprint `release/<version>` starts from
`main`; a `feat/<name>` starts from that release branch. Feature delivery uses
separate PRs from the feature branch to `development` and to the current
release branch. Promotion from release to `main` follows approved deployment;
`v<version>` tags go on the selected release commit after approval. Do not
infer a version or switch the user's current branch merely because these
conventions exist. Never push directly to `main`, `release/*`, or
`development`.

For a local commit request, inspect the exact diff, stage only intended files
with explicit paths, and check the staged diff before committing. In a dirty
tree, a broad `git add .` can include unrelated work. If the observed branch
or release state conflicts with the requested delivery action, stop at that
action and report the mismatch.

## Before a commit

Run the relevant quality gate for the actual change. For runtime or
architecture changes, the default gate is:

```bash
npm run check
npm run lint
npm run build
npm test
git diff --check
```

Use a focused test first when the full suite is expensive. Treat passing tests
as evidence for the exact tree being committed, not an earlier worktree state.
For documentation-only edits, validate changed skills and run
`git diff --check`; a full runtime suite does not add useful evidence.

## Commit style

- Use a short imperative Conventional Commit-style message, for example:
  `refactor(runtime): simplify run coordination`
- Do not add co-author trailers.
- After committing, verify:

```bash
git status --short
git log -1 --oneline --decorate
```

Report the commit hash, branch, verification result, and whether anything was
pushed. Do not claim a PR or deployment unless it actually exists.
