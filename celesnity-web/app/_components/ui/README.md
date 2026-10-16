# `app/_components/ui`

The workspace design system. Two kinds of file live here, and the difference
decides how you may change one.

## Vendored

Copied from `minder-design-system/design-system/components` — shadcn/ui, style
`new-york-v4` — with their imports re-pointed from `@/design-system/*` to
`@/app/_components/ui/*`. Anything with a canonical shadcn name is vendored.

Re-vendor with:

```sh
cp ../minder-design-system/design-system/components/<name>.tsx app/_components/ui/
# then rewrite @/design-system/... to @/app/_components/ui/...
```

Editing a vendored file is allowed, but every edit is a merge conflict the next
time the library is re-vendored, so each one carries a `Celesnity addition:`
comment naming what changed and why. Today there are seven:

| File | Addition | Why |
| --- | --- | --- |
| `card.tsx` | `asChild` | Half the workspace panels are landmarks (`aside`, `section`, `main`) |
| `pagination.tsx` | `asChild` on `PaginationLink` | The list pages in place, so its controls are buttons, not anchors |
| `badge.tsx` | `info` / `success` / `warning` / `danger` variants | The palette defines one status colour; the rest ride the `status-*` scales as soft tinted pills. This is the only place the four tones are defined — `PageAlert` and both status badges route through `BadgeVariant` |
| `button.tsx` | `type="button"` by default, `destructive-ghost` variant | A bare `<button>` in a `<form>` submits it; a destructive row action should not shout in solid red |
| `dialog.tsx` | Cap height to the viewport and scroll | A long dialog otherwise runs off the bottom with no way back |
| `fields.tsx` | `dirty` chrome on the `status-warning` scale | An unsaved edit needs to be visible while `aria-invalid` stays free for real errors |
| `sonner.tsx` | `theme` pinned to `light` | `useTheme()` had no provider mounted, so it always resolved to `'system'` and toasts followed the OS into dark inside a light-only app |

`button.tsx`, `badge.tsx` and `marker.tsx` also emit `data-variant` / `data-size`
attributes. `app/globals.css` hooks the button hover skin onto those, so they are
load-bearing rather than incidental.

## Workspace compositions

Built on the primitives above, for patterns shadcn/ui does not ship. These are
ordinary project files — change them freely.

| File                    | Exports                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `fields.tsx`            | `TextField`, `PasswordField`, `TextareaField`, `SelectField`, `FieldBlock` |
| `combobox.tsx`          | `Combobox`, `MultiCombobox`                                                |
| `radio-group-field.tsx` | `RadioGroupField`                                                          |
| `search-field.tsx`      | `SearchField`                                                              |
| `password-input.tsx`    | `PasswordInput`                                                            |
| `data-table.tsx`        | `DataTable`                                                                |
| `pager.tsx`             | `Pager`                                                                    |
| `empty-state.tsx`       | `EmptyState`, `EmptyBlock`                                                 |
| `page-alert.tsx`        | `PageAlert`, `InlineError`                                                 |

## Rules

- `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge` and `cmdk` are
  imported only from this folder. `tests/unit/app/frameworks-layer.test.ts`
  fails the build otherwise.
- Icons are content, not chrome: screens import from `lucide-react` directly.
- Colours, radii and shadows come from the token block in `app/globals.css` —
  shadcn/ui's `neutral` base, the same palette `minder-design-system` ships.
  Nothing here should carry a raw hex value.
