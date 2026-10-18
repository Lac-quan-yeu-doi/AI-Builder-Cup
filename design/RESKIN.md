# Reskin for AI Builder Cup

18 Oct 2026. Branch `hungnq`.

## Decided

| | Keep | Change |
|---|---|---|
| Colour | GPT skin tokens, Minder blue accent | Nothing |
| Type | System font stack, existing type scale | Mono for data (times, values, codes), already in the skin as `--font-mono` |
| Navigation | Left rail | The rail follows context: workspace mode, or plant mode inside a plant |
| Home | Ask Minder (chat) stays the home | The overview page lives at Plant model |
| Page header | `PageBar` | One header pattern for every screen, with an eyebrow line |
| Scope | — | Whole app |

The mockups in this folder (`reskin-*.png`, "Floorwise") were the starting point. Their top nav and new palette are dropped.

## 1. Rail that follows context

**Workspace mode** is everywhere else. It keeps today's groups unchanged:

```
Home (chat)
DATA     Databases · Streaming · Plants · Analytics
TOOLS    Query · Scripts · Data Workflows · Skills · Plugins · Automations
RESOURCES Documents · Guide
```

**Plant mode** applies on `/plant-model/[siteId]/*`. The rail swaps its contents:

```
← All plants
[ Henan Richi feed line ▾ ]   plant switcher, code + revision
PLANT       Overview · Model · Dashboards
OPERATIONS  Repairs · Configure
Ask Minder about this plant
```

- The plant header's tab strip (Overview / Model / Dashboards / Configure / Repairs) goes away; the rail carries it.
- The page gets the full width back.

## 2. Plant model landing (`/plant-model`)

Chat stays the workspace home. The overview lives on the plant model page instead. Order, top to bottom:

1. **Header and counts:** plants, repair guides, guided repairs. **Create plant** opens a dialog.
2. **Two feature cards side by side:**
   - **01 · Walk-in Twin:** upload a walkthrough.
   - **02 · Repair know-how:** capture a repair, or guide one. Shows first-time fix and open why questions.
3. **Plants table:** name, code, node count, status, and a link into the plant.
4. **Recent repair guides:** title, machine, expert time.

## 3. One page header

Every screen opens with the same strip:

```
EYEBROW · CONTEXT                      [secondary] [primary]
Title
One line of description
──────────────────────────────────────────────────────────
```

- **Eyebrow:** the area and the parent object (e.g. `DATA · DATABASES`, `REPAIR GUIDE · WASHER W1`), in small caps with `tracking-wide`.
- **Title:** `text-heading-2`, one size for every screen.
- **Actions:** sit on the right edge, top-aligned with the eyebrow.
- **Rule:** a divider under the strip separates header from content.

`PageBar` becomes this pattern. The screens that hand-roll an `<h1>` (about 24, with ten different sizes) move onto it.

## 4. Data in mono

Times (`0:44–0:58`), values (`45 N·m`), codes (`PELLET_DEMO`), revisions (`r3`) and counts in tables use `font-mono tabular-nums`.

## Not in scope

- Colours, fonts, radius and elevation stay as they are.
- Component internals in `app/_components/ui` are not touched.
- Chat transcript layout is not touched.
