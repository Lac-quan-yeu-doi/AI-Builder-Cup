---
name: plant-model
description: Use when answering questions about plant-model nodes, typed properties, hierarchy, relationships, routes, or live catalog-backed values.
namespace: plant-model
---

# Plant Model

Use the active Plant Model MCP tools for node and route facts. The application-selected site is bound automatically; do not ask the user for a site ID or substitute a different site. Keep reads focused and paginated.

## Read a node or route

- Start with `list_plant_model_nodes({query?, node_type_id?, routing_role?, offset?, limit?})` to find node IDs. Search is case-insensitive; roles are `source`, `intermediate`, `sink`, or `none`. Pages are bounded to 100 nodes.
- Use the exact ID from the result in `get_plant_model_node({node_id})` to read one node's typed properties, catalog bindings, parent/child counts, and directly connected relationships.
- For upstream, downstream, or bidirectional impact, call `traverse_plant_model_routes({node_id, direction?, depth?, limit?})`. Direction is `upstream`, `downstream`, or `both`; depth is bounded from 1 to 5 and results are bounded by limit.
- Follow pagination or truncation indicators. Do not enumerate the full graph unless the user asks for it.

The tool descriptions mention the current UI-selected node as a fallback, but the current handler requires `node_id` for get and route calls. Pass an exact ID returned by node search so the call works reliably.

## Resolve live catalog values

A property with type `catalog-scalar` is a live binding: the value stored on the node is not necessarily current. When the user asks for its current value, get the node, find the property's exact `definition_id` in its catalog binding, then call `resolve_plant_model_catalog_property({property_definition_id})`. Report the resolved value and any returned limitation; do not substitute the stored property value.

## Few-shot sequence

For “What is upstream of pump P-101?”:

1. Search with `list_plant_model_nodes({"query":"P-101"})` and take the exact matching node ID.
2. Call `traverse_plant_model_routes({"node_id":"<returned-id>","direction":"upstream","depth":1,"limit":50})`.
3. Summarize only returned nodes and relationships. If the result says it is truncated or has more pages, say so and fetch the next bounded result when needed.

For “What is the current pressure?” inspect the relevant node's typed properties and bindings first. If pressure is catalog-backed, resolve using that property's exact `definition_id` before answering.

