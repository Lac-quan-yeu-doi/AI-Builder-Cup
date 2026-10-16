# Changelog data

Rendered at `/_internal/changelogs`. One file per month, named `YYYY-MM.json`,
plus `authors.json`, the roster of people a change can be credited to. The
page reads every month file, checks it against the roster, and shows the
newest month and the newest entry first. Nothing else is edited by hand: no
index, no ordering file.

## File shape

```json
{
  "month": "2026-09",
  "entries": [
    {
      "id": "2026-09-28-chart-in-conversation",
      "date": "2026-09-28",
      "areas": ["web"],
      "kind": "feature",
      "version": "0.5.0",
      "authors": ["Nguyễn Đăng Mạnh Tú"],
      "title": { "vi": "…", "en": "…" },
      "summary": { "vi": "…", "en": "…" },
      "details": { "vi": ["…"], "en": ["…"] }
    }
  ]
}
```

| Field     | Rule                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `month`   | Must equal the file name.                                                                                                            |
| `id`      | Unique across all files. Use `YYYY-MM-DD-short-slug`.                                                                                |
| `date`    | `YYYY-MM-DD`, inside `month`. The day the change reached users (merge or deploy day).                                                |
| `areas`   | One or more of `web` (workspace app), `core` (platform/API), `agent` (assistant), `all`.                                             |
| `kind`    | `feature` (new), `improvement` (better), `fix` (repaired).                                                                           |
| `version` | Optional release label, e.g. `0.5.0`.                                                                                                |
| `authors` | One or more `name`s from `authors.json`, spelled exactly as there. Always a person, never an AI assistant, a bot or a tool identity. |
| `title`   | One line, both languages. Say what the person can now do.                                                                            |
| `summary` | Two to four sentences, both languages. Plain words; no file names, no code, no jargon.                                               |
| `details` | Optional bullet list, both languages. One concrete change per line.                                                                  |

## Who made it: `authors.json`

```json
{
  "people": [
    {
      "name": "Nguyễn Đăng Mạnh Tú",
      "github": "manhtu227",
      "emails": ["106653553+manhtu227@users.noreply.github.com"]
    }
  ]
}
```

| Field    | Rule                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| `name`   | How the person is credited on the page. Unique. Entries reference this spelling.                                |
| `github` | Optional GitHub login; the page links the name to the profile.                                                  |
| `emails` | Every email the person commits with (`git config user.email`). Unique across the roster; one email, one person. |

The roster exists so that whoever makes a change, by hand or through a coding
agent, is credited the same way every time. To find out who you are working
for, run this in the web checkout:

```sh
node -e '
const email = require("node:child_process").execSync("git config user.email").toString().trim();
const person = require("./data/changelogs/authors.json").people.find((p) => p.emails.includes(email));
console.log(person ? person.name : `NOT REGISTERED: ${email}`);'
```

`NOT REGISTERED` means a new teammate: add them to `authors.json` in the same
PR as their first entry. Someone who commits from two emails is one person
with two `emails`, not two people.

## Writing rules

- Write for the person using the product. "Charts appear right in the
  conversation", not "InlineChartPreview renders chart blocks".
- Vietnamese is the primary audience; keep the English a faithful, natural
  equivalent, not a word-for-word translation.
- One entry per user-visible change, not per commit. Internal refactors,
  test-only work and tooling do not get an entry.
- The unit test `tests/unit/app/internal-routes.test.ts` validates every file
  here, roster included; run
  `npx vitest run tests/unit/app/internal-routes.test.ts` after editing.
