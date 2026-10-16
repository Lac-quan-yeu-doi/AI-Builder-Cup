# User guide sources

Rendered at `/_internal/user-guide` (and `/_internal/user-guide/<slug>`). One
Markdown file per module per language:

```text
docs/user-guide/
  _sidebar.json        menu: sections → items (slug, file, title.vi, title.en)
  vi/<file>.md         Vietnamese page
  en/<file>.md         English page, same file name
```

The page reads `_sidebar.json` for the menu, then `vi/<file>` and `en/<file>`
for the body; the reader's language toggle picks one. A slug is only valid when
**both** files exist, and the unit test `tests/unit/app/internal-routes.test.ts`
fails the build otherwise.

## Adding or changing a page

1. Write (or edit) `vi/NN-slug.md` and `en/NN-slug.md`. `NN` orders the files
   on disk; the menu order comes from `_sidebar.json`.
2. Add the item to `_sidebar.json` under the right section, with both titles.
3. Run `npx vitest run tests/unit/app/internal-routes.test.ts`.

## Writing rules

- Audience: the person who uses the screen, not the person who built it. Name
  buttons exactly as the UI labels them (bold), describe what happens, and give
  numbered steps for each flow.
- Structure every page the same way: what the module is for → the screen's
  parts (a table) → step-by-step flows → limits and common problems.
- Vietnamese is the primary text; the English file is a faithful equivalent,
  not a word-for-word translation.
- No code, file names or internal identifiers. SQL examples are fine where the
  user actually types SQL.
- When a screen changes, update the page for that module in the same change,
  and add a changelog entry (see `data/changelogs/README.md`).
