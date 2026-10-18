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

## 5. Ask Minder: a notebook, not a messenger

Minder answers questions about data and plants. An answer is read, checked and built on, so the conversation reads as a notebook of exchanges rather than a chat thread.

**Home (no conversation yet)**

```
ASK MINDER · ● Connected to workspace data
What can I help you analyze?
One line of description
[ composer: scope chips, prompt, send ]
START FROM          4 starter cards in a 2×2 grid, each showing its /command
FROM THE FLOOR      Walk the floor · Capture a repair
RECENT              last three conversations
```

- Left-aligned, on the reading column, like every other page header.
- The plant features are one click from home.

**Conversation**

```
[≡ conversations] ASK MINDER / title            [scope] [timeline] [stage] [new]
──────────────────────────────────────────────────────────────────────────
How many customers are in demo.customers?           ← the question is the title
answer prose, charts, tables, follow-ups
──────────────────────────────────────────────────────────────────────────
Break this down by region                           ← next exchange
…
            ╭ composer, docked over a fade ╮
            Enter to send · Shift+Enter new line · / starters
```

- **Bar:** solid, not floating. It holds the conversation title, then the scope (database, agent) on the right. Scope sets the context for the whole conversation, so it leaves the composer.
- **Questions:** left-aligned, `text-heading-4`, with no bubble. A rule separates exchanges.
- **Composer:** docked over the transcript with a fade instead of a bordered strip. The send button turns primary once there is text.

## Not in scope

- Colours, fonts, radius and elevation stay as they are.
- Component internals in `app/_components/ui` are not touched.
