# Analytics: charts and dashboards

The **Analytics** module (under *Data*) is the organization's library of charts and dashboards. You build charts by asking a question (no SQL) or by writing SQL, save them into collections, and combine them into dashboards with shared filters.

## 1. The library (Our analytics)

The front page lists everything that has been saved. At the top:

- The **New** button with four choices: **Question**, **SQL query**, **Dashboard**, **Collection**.
- Scopes: **Everything**, **Shared**, **Personal**, **Recent**.
- A type filter (All / Dashboards / Questions) and **Search charts and dashboards**.

Each row has **Rename**, **Move** (to another collection) and **Archive**. Charts saved from a conversation are marked **From chat**.

A **collection** is a folder. Your personal collection is visible only to you; shared collections are granted by administrators for viewing or editing.

## 2. Building a chart from a question (no SQL)

1. **New → Question**. The screen asks *How do you want to start?*; choose **New question**.
2. Work through the steps on the left:
   - **Data**: pick the source table.
   - **Join**: bring in another table if needed.
   - **Filter**: keep only the rows you want (date range, status…).
   - **Summarize**: choose the calculation (sum, count, average) and the grouping column.
   - **Sort and limit**: order the result and cap the number of rows.
3. Click **Run preview** to see the data.
4. Choose a **Chart type**: Table, Number, Bar, Line, Area, Pie, Scatter. Assign columns to the axes on the right and click **Visualize**.
5. Click **Save**: enter a title, a description and the destination collection.

## 3. Building a chart from SQL

1. **New → SQL query** (or **New SQL query** on the start screen).
2. Pick the catalog and schema and write a SELECT. **Run preview** checks the result.
3. Choose the chart type, assign columns, **Visualize**, then **Save** as above.

Queries can only **read** data; statements that write or delete are refused.

## 4. Viewing and updating a saved chart

Open a chart:

- **Chart / Data** switches between the picture and the numbers.
- **Refresh** re-runs the query for fresh data.
- **Edit** reopens the builder to change the question, filters or chart type. Save with **Save** (overwrites, creating a new version) or **Save as new** (a separate chart).
- **Version history (N)** lists every save; **Restore** returns to an older version.

A chart from an earlier release shows **Convert to canonical chart**; convert it before using it on a dashboard.

## 5. Dashboards

**Creating and editing**
1. **New → Dashboard**, name it, pick a collection.
2. In the editor, **Add** offers **Chart** (from the library), **Heading**, **Text**, **Link** and **Section** (ready-made layouts: *2 × 2 grid*, *Hero with rail*, *Four-card strip*). **Filter** adds a filter shared by the charts.
3. Drag to arrange and resize cards.
4. A dashboard can have several **tabs**: **Add tab**, **Rename tab**, **Duplicate**, **Move left / Move right**, **Delete**.
5. Click **Save**. Leaving with unsaved changes asks *Discard your changes?* with **Keep editing** / **Discard**. **Save as copy** makes a duplicate.

**Viewing**
- **Refresh dashboard** reloads every chart.
- **Enter fullscreen** for a wall display or a presentation.
- The filters at the top apply to the charts they are mapped to; **Reset** restores the defaults.
- **Edit** reopens the editor (if you have edit rights).

## 6. Suggested flow

New → Question or SQL query → Run preview → choose a chart type → Visualize → Save into a collection → New → Dashboard → Add charts and a Filter → Save → share the dashboard link with colleagues.

## 7. Notes

- Charts saved from chat (see *Charts, tables and documents in chat*) appear here marked *From chat* and can go on dashboards like any other chart.
- Viewers can open dashboards but cannot save or edit.
- Displayed data follows your data permissions; two people may see different numbers on the same dashboard if their grants differ.
