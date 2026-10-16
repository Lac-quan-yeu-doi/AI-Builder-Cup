# Coding-agent guide — celesnity-core

Working procedures live in `skills/` ([skills/README.md](skills/README.md)).
Read the matching `SKILL.md` before editing.

## Skill routing

- When the user mentions `$changelog`, a changelog, release notes, the user
  guide, or when you have just finished any change a person using the product
  can notice, read and follow
  [skills/changelog-and-user-guide/SKILL.md](skills/changelog-and-user-guide/SKILL.md).

## Changelog and user guide (cross-repo rule)

The product's changelog and user guide live in `celesnity-web`, because that is
where people read them:

- `celesnity-web/data/changelogs/<YYYY-MM>.json` — one file per month, entries
  newest first, `vi` and `en` text written for the user.
- `celesnity-web/data/changelogs/authors.json` — the roster: who is credited,
  under which name, from which git emails.
- `celesnity-web/docs/user-guide/{vi,en}/*.md` — one page per module, listed in
  `celesnity-web/docs/user-guide/_sidebar.json`.

A change in this repository that a user can notice — a new or changed endpoint
that the web app exposes, a changed limit (preview rows, upload size), a
permission or role rule, a new connector, a migration that changes what a
screen shows, an MCP tool the assistant uses — is not done until an entry with
`areas: ["core"]` (or `"all"` for a cross-cutting release) is added there and
the affected guide page still describes the behaviour correctly. The entry is
credited to the developer you are working for, resolved from
`git config user.email` through the roster, never to an AI assistant.

Follow the skill above, then run
`npx vitest run tests/unit/app/internal-routes.test.ts` inside `celesnity-web`.
Refactors, tests, tooling, dependency bumps and internal renames are exempt.
