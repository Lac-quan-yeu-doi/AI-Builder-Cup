# Charts, tables and documents in chat

Beyond text, the assistant can produce **charts**, **data tables** and **report documents** right inside the conversation. This page shows how to ask for them, read them, refine them and keep them.

## 1. Asking for a chart

Just say what you want to see. If you do not name a chart type, the assistant picks one:

- **Comparison** between groups: bar chart.
- **Trend** over time: line chart.
- **Share** of a whole: pie chart.
- **Relationship** between two measures: scatter chart.

Examples: _"Chart orders per month in iceberg.demo"_, _"Top 5 restaurants by revenue, as bars"_, _"Revenue share by sales channel"_.

For a question that needs **one number** ("what is this year's total revenue?"), the assistant answers in words with the number in bold and does not draw a chart.

## 2. The chart card in an answer

While a chart is being drawn, a **placeholder** of the same size appears; when the data arrives the chart takes its place without moving anything else. The card contains:

| Element                    | Meaning                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Title and description      | Chosen by the assistant from your question.                                                                     |
| **Chart / Table** toggle   | Switch between the chart and the rows it was drawn from.                                                        |
| **Open in the side panel** | Switches the right-hand panel to this chart. The card's border changes while this chart is the one shown there. |
| Hover over the chart       | Shows the value of each point.                                                                                  |

A card that says _"This query came back with no rows."_ means the query was valid but nothing matched. Loosen the conditions (time range, filters) and ask again.

### The side panel: one button per chart right under its title

As soon as the assistant finishes a chart, the right-hand panel **opens by itself** and shows it; nothing to click. Every chart in the conversation sits in a **row of buttons right under the panel's title**, numbered in the order they were made (1, 2, 3…); the button of the chart on show is filled in. Press a button: the panel switches to that chart **and** the conversation scrolls to the passage that holds it, so you can reread the question and the comment that came with it without hunting. The panel holds a one-sentence reading of the data, **Show query**, the row count and **Keep** to save it (section 4). The **X** on a button removes that chart from the panel: it does not reopen on its own, new charts still do. Reopening an older conversation rebuilds its row of buttons in full.

## 3. Refining a chart with a follow-up

You never start over. Ask in words, for example:

- _"Change it to a bar chart."_
- _"Count delivered orders only."_
- _"Add a total line for the three restaurants."_
- _"Group by quarter instead of month."_

The assistant makes **a new chart** in the new answer; the previous one stays above it for comparison. To go back to an earlier version, scroll up and use that card.

## 4. Saving a chart

A chart in the conversation is a **preview**: it is not in Analytics and cannot go on a dashboard until you save it.

1. Bring the chart up on the side panel (it appears by itself when drawn; or press its button right under the panel's title, or **Open in the side panel** on the card).
2. Click **Keep** at the bottom of the panel: a one-click save into your personal collection. The button then reads _Kept in_ with the collection name; click it to open the chart in Analytics.

Saving is not possible when:

- The card says _"This preview reached the analytical limit."_: the data was too large and the preview was cut. Narrow the question (add a filter, group the data) and ask again.
- The side panel says _Too large to keep_: the same situation.

On save the platform **re-runs the query** for the full data, so a saved chart always reflects the latest data each time it is opened.

## 5. Data tables

When the result is a table (a list, a top N…), the answer shows a **Table** card with the row count. Click it to open the table on the side panel, where **Show query** reveals the query that ran. A long table shows _"N of M rows"_: only part of it is displayed.

## 6. Documents and reports

When you ask for **a report worth keeping** ("write the weekly report and save it"), the assistant creates a **document** (Markdown) that can embed the charts it just drew. It appears as a **Document** card; click to read it on the side panel, where **Download PDF** is available. The document also appears in the **Documents** module.

You can also **attach a PDF** to a question (the + button → Attach a file) so the assistant reads it and answers from its content.

## 7. Sources

When the assistant relies on a saved chart or a document, the answer carries a **Sources** section. Click a source to open that exact chart or document page. Unsaved previews are never cited.
