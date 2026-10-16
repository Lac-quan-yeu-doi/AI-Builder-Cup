# SQL query workbench

The **Query** module (under *Tools*) is where you write and run SQL directly against the organization's data. Use it to check a number quickly, look at a few rows, or try a query before turning it into a chart.

## 1. The screen

| Area | Meaning |
| --- | --- |
| **Database** | The database to query. Opened from a database's screen (*Open in SQL*), it is preselected. |
| Editor | Where you write SQL, with syntax colouring. |
| **Run query** / **Cancel** | Run, or stop a running query. |
| **History** | Queries you ran earlier; click one to bring it back. |
| Results | The result grid, with a flag when the row cap was hit. |
| Statistics | *Processed rows*, *Peak memory*, and the run time. |

## 2. Running a query

1. Pick the **Database**.
2. Write a SELECT, for example:
   ```sql
   SELECT order_month, COUNT(*) AS orders
   FROM orders
   GROUP BY order_month
   ORDER BY order_month
   ```
3. Click **Run query** (or use the shortcut shown on the button).
4. Read the status, timing and columns below. Scroll sideways to see every column.

The guided tutorial **"Run your first SQL query"** under **Tutorials** walks through exactly these steps.

## 3. Limits to know

- **Read only**: statements that create, change or delete data are refused. To write data, use Pipelines or Scripts.
- A **server-side row cap**: long results are cut and flagged. Add filters or a `LIMIT` to get the part you need.
- A very long query may be stopped by the server; **Cancel** stops it early.
- You only see the tables your data permissions allow. An *access denied* error means you need a grant (see *Roles and access*).

## 4. From query to chart

Once the query is right:

- Copy it into **Analytics → New → SQL query** to draw and save it as a chart, or
- Paste it into **Home** with *"draw a chart from this query"* and let the assistant draw it.

## 5. Tips

- Name columns clearly with `AS` (for example `AS revenue`); those names become chart labels.
- Use **History** to return to a query that worked instead of retyping it.
- On a large table, try with `LIMIT 100` first.
