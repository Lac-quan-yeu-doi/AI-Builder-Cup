/**
 * Action-registry metadata (AIP-Ontology-inspired). Each mutation/query a
 * domain module exposes is declared once, with metadata about who may call
 * it and whether it's audited or gated on approval — instead of that being
 * scattered across a controller, a guard, and an MCP tool schema.
 *
 * Domain-agnostic: charts are the only caller today, but nothing here is
 * chart-specific. See `docs/2026-08-23-aip-inspired-agent-platform-brainstorm.md`.
 */

/** Who is calling an action, and under what run (if any). */
export interface ActionActor {
  readonly source: 'agent' | 'browser' | 'dev-bypass' | 'anonymous';
  readonly runId: string | null;
  /**
   * The authenticated human behind a `'browser'` call, from
   * `AuthenticatedContext.identityId` — `null` for every other source
   * (`agent`/`dev-bypass`/`anonymous` never carry a real per-user
   * identity) and for `'browser'` calls made before real auth existed.
   */
  readonly identityId: string | null;
}

/**
 * How an action is exposed as an external tool (e.g. an MCP tool). The
 * external tool name is independent of `ActionDefinition.name` — the
 * former is a stable, human-facing identifier callers already depend on
 * (e.g. `"create_chart"`); the latter is the internal registry key
 * (`"chart.create"`).
 */
export interface McpToolSchema {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/** One declared action: metadata plus the use-case call it wraps. */
export interface ActionDefinition<TInput, TOutput> {
  /** Stable, dotted identifier, e.g. `"chart.create"`. */
  readonly name: string;
  readonly permission: 'read' | 'write';
  /** Whether every call to this action is recorded via `IActionAuditLog`. */
  readonly auditRequired: boolean;
  /**
   * Whether this action must be proposed and held for human approval (AIP's
   * "Checkpoint" pattern) instead of running immediately. `runAction`
   * creates a `PendingAction` and returns it instead of running `run()`.
   */
  readonly approvalRequired: boolean;
  /**
   * Present when this action should be exposed as an external tool (e.g.
   * to `mcp-chart`). Absent means internal-only (not everything a domain
   * can do needs to be agent-callable).
   */
  readonly mcpTool?: McpToolSchema;
  run(input: TInput, actor: ActionActor): Promise<TOutput>;
}
