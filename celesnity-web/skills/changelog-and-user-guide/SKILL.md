---
name: changelog-and-user-guide
description: Use after any change a user can see or feel (new screen, new control, changed flow, fixed bug, agent behaviour) in celesnity-web, celesnity-core or celesnity-agent — to record it in the changelog, credited to the developer you are working for, and keep the user guide true
---

# Changelog and user guide

## Overview

Two hidden pages carry the product's own record of itself:

| Page                    | Source                                                            | Read by                     |
| ----------------------- | ----------------------------------------------------------------- | --------------------------- |
| `/_internal/changelogs` | `data/changelogs/<YYYY-MM>.json` + `data/changelogs/authors.json` | Release notes, QA, handover |
| `/_internal/user-guide` | `docs/user-guide/_sidebar.json` + `vi/`, `en/` Markdown           | End users after handover    |

Both live in `celesnity-web` even when the change was made in core or the
agent: the web app is where people read them. (Those repositories carry a
short skill of the same name that points here.) The rule is one sentence:

> **A change a user can notice is not done until the changelog says what
> changed and the user guide still describes the screen correctly.**

"Notice" includes a new or moved control, a changed flow, a fixed bug they
could have hit, a new assistant behaviour, a changed limit or permission. It
excludes refactors, tests, tooling, CI, dependency bumps and internal renames.

## Who is the author

Every entry is credited to the person who owns the change: the developer you
are working for, never an AI assistant, a bot or a tool identity such as
`sdd-agent`. Their name comes from the roster, `data/changelogs/authors.json`,
so the same person is spelled the same way in every entry. Resolve it from the
checkout, not from the conversation:

```sh
node -e '
const email = require("node:child_process").execSync("git config user.email").toString().trim();
const person = require("./data/changelogs/authors.json").people.find((p) => p.emails.includes(email));
console.log(person ? person.name : `NOT REGISTERED: ${email}`);'
```

Use the printed name exactly. `NOT REGISTERED` means the developer is new to
the roster: add them to `authors.json` (display name, GitHub login if they
have one, every email they commit with) in the same PR, then use that name.
Pairing partners are listed under their registered names too. The
`internal-routes` test rejects any name the roster does not know.

## Procedure

1. **Decide whether it counts.** If the person using the product would see or
   feel the difference, it counts. When in doubt, it counts.
2. **Resolve the author** (above).
3. **Changelog.** Open `data/changelogs/<YYYY-MM>.json` for the month the change
   reaches users (create the file if the month is new, copying the shape from
   `data/changelogs/README.md`). Add one entry at the top of `entries`:
   - `id`: `YYYY-MM-DD-short-slug`, unique across all files.
   - `date`: the merge or deploy day, inside the file's month.
   - `areas`: `web`, `core`, `agent`, or `all` for a cross-cutting release.
   - `kind`: `feature`, `improvement`, or `fix`.
   - `version`: the release label when known (`0.5.0`).
   - `authors`: the registered name(s) from step 2.
   - `title`, `summary`, optional `details`: **both** `vi` and `en`, written for
     the user: what they can now do, what stopped going wrong. No file names,
     component names, tool names or JSON.
4. **User guide.** Find the module's page in `docs/user-guide/_sidebar.json`
   and update **both** `docs/user-guide/vi/<file>.md` and
   `docs/user-guide/en/<file>.md`: rename controls to their new labels, add or
   remove steps, adjust limits. A brand-new module gets a new pair of files and
   a sidebar item (see `docs/user-guide/README.md`).
5. **Verify.** `npx vitest run tests/unit/app/internal-routes.test.ts`. It
   validates every changelog file (shape, month, unique ids, authors on the
   roster) and every guide slug (both language files present). Then
   `npm run build` if a route changed.
6. **Commit together.** The changelog and guide edits go in the same commit or
   PR as the change they describe, so a reviewer sees them side by side. For a
   core or agent change, that is the web PR of the same release; link the two.

## Writing style

- Plain words. "Charts appear right in the conversation", not "InlineChartPreview
  renders chart blocks inline".
- Lead with the benefit, then the mechanics. One idea per sentence.
- Vietnamese first, English as a natural equivalent; never leave one language
  behind.
- Name UI controls exactly as their labels read (bold in the guide).
- Dates in the changelog are the day users got the change, not the day the
  work started.

## Failure modes

| Symptom                                                              | Cause                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `NOT REGISTERED: …`                                                  | Developer missing from `authors.json`; add them             |
| `internal-routes` test: `who is not in data/changelogs/authors.json` | `authors` uses a spelling that is not the registered name   |
| `internal-routes` test: `is listed twice` / `belongs to two people`  | Roster has a duplicate name or email; merge the two entries |
| `internal-routes` test: `is used twice`                              | Duplicate `id` across changelog files                       |
| `internal-routes` test: `outside <month>`                            | Entry `date` in the wrong month file                        |
| `internal-routes` test: `is missing for slug`                        | Guide page written in one language only                     |
| Guide page renders but the menu lacks it                             | Item not added to `_sidebar.json`                           |
| Reviewer asks "what does this mean for users?"                       | Entry written from the code's point of view; rewrite it     |
