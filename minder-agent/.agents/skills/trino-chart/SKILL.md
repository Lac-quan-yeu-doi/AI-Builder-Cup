---
name: trino-chart
description: Use when answering questions with authorized Trino data, inspecting catalogs or tables, or creating chart previews with preview_chart.
namespace: analytics
---

# Trino and chart previews

Use Core's existing Trino MCP tools to discover and query authorized data. Use `preview_chart` when the user asks for a chart or a visual result. These tools are read-only: Trino accepts authorized `SELECT` or `TABLE` queries, and `preview_chart` creates a transient preview without saving a chart.

## Tool selection

- `list_catalogs` finds catalogs visible to this agent.
- `list_schemas({catalog})` finds schemas in a catalog.
- `list_tables({catalog, schema})` finds tables and views.
- `describe_table({catalog, schema, table})` returns columns and Trino types. Do this before writing a query against an unfamiliar table.
- `profile_table({catalog, schema, table})` summarizes categorical values and numeric ranges. Use only when actual values or ranges are needed after `describe_table`.
- `run_query({sql, catalog?, schema?})` runs a read-only `SELECT` or `TABLE` query on authorized base tables. For metadata, use the discovery tools: `SHOW`, `current_catalog()`, and `information_schema` queries are unsupported.
- `preview_chart({title, description?, query_definition, visualization_definition, parameter_values?})` validates and executes a bounded chart preview. It never saves a chart. Do not set `run_id`; it is runtime trace metadata, not authorization.

Use the catalog and schema returned by discovery, and use only columns confirmed by `describe_table`. For a chart, discover metadata as needed, then call `preview_chart` with the complete query and visualization definitions; it validates, authorizes, and executes that query. Do not run the identical query through `run_query` first. Prefer `VISUAL` definitions when the visual builder supports the operation; use `NATIVE` when the user supplied SQL or the requested operation cannot be expressed visually. Use Trino `run_query` for data-only answers or to diagnose a failed preview. Aggregate and limit report queries to the question. Preserve returned values and disclose warnings or incomplete results; never invent rows to fill gaps. Treat `ACCESS_DENIED` as an authorization boundary, `QUERY_REJECTED` as an input or SQL issue, and `ENGINE_EXECUTION_FAILED` as a Trino execution failure. Do not retry denied access by switching to another catalog.

## Few-shot patterns

**Discover, then query for a data-only answer:**

User asks for monthly order revenue. First call `list_catalogs`, then `list_schemas`, `list_tables`, and `describe_table` for the relevant table. After confirming the date and amount columns, call:

```json
{
  "sql": "SELECT date_trunc('month', created_at) AS month, SUM(amount) AS revenue FROM orders GROUP BY 1 ORDER BY 1 LIMIT 1000",
  "catalog": "iceberg",
  "schema": "sales"
}
```

Replace example identifiers only with names confirmed by discovery. If the table or columns differ, write the query from the actual metadata.

**Discover, then preview a chart:**

For a regional revenue bar chart, first discover the catalog, schema, table, and columns. Then pass the query directly to `preview_chart`; do not call `run_query` with the same query first. A simple grouped query can use this VISUAL definition:

```json
{
  "title": "Revenue by region",
  "description": "Total revenue grouped by region",
  "query_definition": {
    "schemaVersion": 1,
    "mode": "VISUAL",
    "context": {"catalog": "iceberg", "schema": "sales"},
    "parameters": [],
    "source": {"table": {"catalog": "iceberg", "schema": "sales", "table": "orders"}, "alias": "o"},
    "joins": [],
    "projections": [{"alias": "region", "expression": {"kind": "FIELD", "relation": "o", "field": "region"}}],
    "customExpressions": [],
    "filters": [],
    "aggregations": [{"alias": "revenue", "expression": {"kind": "FIELD", "relation": "o", "field": "amount"}, "function": "SUM"}],
    "breakouts": [{"kind": "FIELD", "relation": "o", "field": "region"}],
    "postAggregationFilters": [],
    "orderBy": [{"expression": {"kind": "FIELD", "relation": "o", "field": "region"}, "direction": "ASC"}],
    "limit": 1000
  },
  "visualization_definition": {
    "schemaVersion": 1,
    "type": "BAR",
    "roles": {"category": "region", "measures": ["revenue"]},
    "display": {}
  }
}
```

Use the real catalog, schema, table, and columns discovered for the request. Every role name must match a query output column or alias. A native query shape requires `schemaVersion: 1`, `mode: "NATIVE"`, `context`, `parameters`, and `sql`. A visual query also requires `source`, `joins`, `projections`, `customExpressions`, `filters`, `aggregations`, `breakouts`, `postAggregationFilters`, and `orderBy`. Use empty arrays when there are none, and `parameters: []` when no parameters are needed. For visual `FIELD` expressions, use the source alias as `relation` and the discovered column as `field`.

## Chart role reference

`visualization_definition` requires `schemaVersion: 1`, a `type`, `roles`, and `display` (use `{}` for defaults). Supported types and required roles:

- `TABLE`: `columns` (array of output names)
- `NUMBER`: `measure`
- `BAR`: `category`, `measures` (non-empty array); optional `breakout`
- `LINE` / `AREA`: `x`, `measures`; optional `series`
- `PIE`: `measure`, `breakout`
- `SCATTER`: `x`, `y`; optional `series`, `size`

If the user asks for a report, follow the `pdf-report` skill for file generation and publishing. A chart preview is not a saved chart or report artifact. Reuse its data only when the result is complete and untruncated; otherwise query complete rows through Trino before preparing the report.
