---
name: changelog-and-user-guide
description: Use after any minder-agent change a person using the Celesnity assistant can notice — what it answers, what it can do, when it asks for approval, a new tool or plugin, a changed limit — to record it in the product changelog and keep the user guide true. Both live in celesnity-web.
---

# Changelog and user guide (agent side)

## Overview

The product keeps its own record on two hidden pages of the web app,
`/_internal/changelogs` and `/_internal/user-guide`. Their sources live in
`celesnity-web`, expected as a sibling checkout of this repository:

| What                                            | Where                                                        |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Changelog, one file per month                   | `../celesnity-web/data/changelogs/<YYYY-MM>.json`            |
| Who is who (git email → display name)           | `../celesnity-web/data/changelogs/authors.json`              |
| User guide, one page per module, both languages | `../celesnity-web/docs/user-guide/{vi,en}/*.md`              |
| Full procedure, file shape, writing style       | `../celesnity-web/skills/changelog-and-user-guide/SKILL.md`  |

If `../celesnity-web` is not checked out, say so in the PR description instead
of skipping the record silently; the web PR for the same release carries it.

> A change a user can notice is not done until the changelog says what changed
> and the user guide still describes the assistant correctly.

## What counts here

Counts, so it gets an entry: the assistant answers differently; it can do
something new; it stops asking (or starts asking) for approval; it gains a
tool, plugin, skill or setting a user can feel; a limit a user can hit changes
(turns, tool calls, budget, file size); a run pauses, resumes or fails
differently; an error a user could see is fixed.

Does not count: refactors, tests, tooling, CI, Docker and Kubernetes,
dependency bumps, internal renames, logging, anything only an operator sees.

## Who is the author

The entry names the person you are working for, never the assistant, a bot or
a tool identity such as `sdd-agent`. Resolve it from the checkout, not from
the conversation:

```sh
node -e '
const email = require("node:child_process").execSync("git config user.email").toString().trim();
const roster = require("../celesnity-web/data/changelogs/authors.json").people;
const person = roster.find((p) => p.emails.includes(email));
console.log(person ? person.name : `NOT REGISTERED: ${email}`);'
```

Use the printed name exactly as `authors: ["<name>"]`. `NOT REGISTERED` means
the developer is new to the roster: add them to `authors.json` (display name,
GitHub login if they have one, every email they commit with) in the same web
PR, then use that name. Pairing partners are listed under their registered
names too.

## Procedure

1. **Decide whether it counts** (above). When in doubt, it counts.
2. **Resolve the author** (above).
3. **Changelog.** Add one entry at the top of
   `../celesnity-web/data/changelogs/<YYYY-MM>.json` for the month the change
   reaches users (create the file if the month is new; the shape is in
   `../celesnity-web/data/changelogs/README.md`). `areas: ["agent"]`, plus
   `"web"` or `"core"` when those ship together, or `"all"` for a
   cross-cutting release. `title`, `summary` and optional `details` in **both**
   `vi` and `en`, written for the user: what they can now do, what stopped
   going wrong. No tool names, event names, file names or JSON.
4. **User guide.** Update the pages the change touches, in `vi/` **and** `en/`.
   Usually `10-chat.md` (how the assistant answers, approvals, progress),
   `11-charts-in-chat.md`, `32-skills.md`, `33-plugins.md` or
   `34-automations.md`.
5. **Verify** inside `../celesnity-web`:
   `npx vitest run tests/unit/app/internal-routes.test.ts`.
6. **Deliver.** The changelog and guide edits go in the web branch and PR for
   the same release. Link that PR from this repository's PR description, and
   this PR from that one, so a reviewer sees them side by side.

## Failure modes

| Symptom                                                           | Cause                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `NOT REGISTERED: …`                                               | Developer missing from `authors.json`; add them                |
| `internal-routes` test: `who is not in data/changelogs/authors.json` | `authors` uses a spelling that is not the registered name   |
| `internal-routes` test: `is used twice`                           | Duplicate entry `id` across month files                        |
| `internal-routes` test: `outside <month>`                         | Entry `date` in the wrong month file                           |
| `internal-routes` test: `is missing for slug`                     | Guide page written in one language only                        |
| Reviewer asks "what does this mean for users?"                    | Entry written from the code's point of view; rewrite it        |
